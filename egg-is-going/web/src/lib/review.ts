// 상신·검토·결재 (T05→T06→T07, FR-05·07)
import { db, parse } from "./db";
import { requireRole, rolesIn } from "./auth";
import { audit } from "./orchestrator/human";

export type PolicyStep = { step: number; role: "reviewer" | "approver"; userIds: string[]; names: string[] };

export async function blockersFor(meetingId: string) {
  const openRequired = await db.humanTask.count({ where: { run: { meetingId }, status: "open", required: true } });
  const lastRun = await db.run.findFirst({ where: { meetingId }, orderBy: { createdAt: "desc" } });
  const blockers: string[] = [];
  if (openRequired) blockers.push(`필수 확인 ${openRequired}건을 먼저 처리해 주세요`);
  if (lastRun && ["queued", "running"].includes(lastRun.status)) blockers.push("AI 실행이 끝나면 상신할 수 있어요");
  if (lastRun?.status === "failed") blockers.push("AI 실행이 실패했어요. 실행 상태에서 다시 시작해 주세요");
  return blockers;
}

export async function submitForReview(docVersionId: string, actorId: string) {
  const dv = await db.documentVersion.findUniqueOrThrow({ where: { id: docVersionId }, include: { document: { include: { meeting: true } } } });
  const meeting = dv.document.meeting;
  await requireRole(actorId, meeting.programId, ["writer"]);
  if (dv.status !== "draft" && dv.status !== "changes_requested") throw new Error("초안만 상신할 수 있어요.");
  const latest = await db.documentVersion.findFirst({ where: { documentId: dv.documentId }, orderBy: { version: "desc" } });
  if (latest?.id !== dv.id) throw new Error("가장 최신 버전만 상신할 수 있어요.");
  const blockers = await blockersFor(meeting.id);
  if (blockers.length) throw new Error(blockers.join(" · "));

  const ms = await db.membership.findMany({ where: { programId: meeting.programId, role: { in: ["reviewer", "approver"] } }, include: { user: true } });
  const reviewers = ms.filter((m) => m.role === "reviewer" && m.userId !== actorId);
  const approvers = ms.filter((m) => m.role === "approver").sort((a, b) => a.user.name.localeCompare(b.user.name, "ko"));
  // 결재 순서(순차·공동)는 현업 확인 전 가정: 검토자 1명 → 결재자 순차
  const policy: PolicyStep[] = [
    ...(reviewers.length ? [{ step: 0, role: "reviewer" as const, userIds: reviewers.map((r) => r.userId), names: reviewers.map((r) => r.user.name) }] : []),
    ...approvers.map((a, i) => ({ step: (reviewers.length ? 1 : 0) + i, role: "approver" as const, userIds: [a.userId], names: [a.user.name] })),
  ];
  const req = await db.reviewRequest.create({ data: { documentVersionId: dv.id, policySnapshotJson: JSON.stringify(policy) } });
  await db.reviewAction.create({ data: { reviewRequestId: req.id, actorId, action: "submit", comment: `v${dv.version} 상신` } });
  await db.documentVersion.update({ where: { id: dv.id }, data: { status: "in_review" } });

  // 사람 작업 시간: 문서가 처음 준비된 때부터 상신까지 (자동 측정)
  const firstReady = await db.run.findFirst({ where: { meetingId: meeting.id, status: { in: ["succeeded", "waiting_for_human"] } }, orderBy: { finishedAt: "asc" } });
  if (firstReady?.finishedAt) {
    await db.metricObservation.create({ data: { meetingId: meeting.id, userId: actorId, kind: "human_work", durationSeconds: Math.round((Date.now() - firstReady.finishedAt.getTime()) / 1000), source: "auto:ready→submit" } });
  }
  await audit(actorId, "document.submit", "DocumentVersion", dv.id);
  return req;
}

export async function reviewAct(reviewRequestId: string, actorId: string, action: "comment" | "forward" | "request_changes" | "approve", comment: string | null) {
  const req = await db.reviewRequest.findUniqueOrThrow({ where: { id: reviewRequestId }, include: { documentVersion: { include: { document: { include: { meeting: true } } } }, actions: true } });
  if (req.status !== "open") throw new Error("이미 끝난 검토 요청이에요.");
  const policy = parse<PolicyStep[]>(req.policySnapshotJson, []);
  const step = policy[req.currentStep];
  const meeting = req.documentVersion.document.meeting;
  const roles = await rolesIn(actorId, meeting.programId);
  if (!step) throw new Error("결재 경로가 비어 있어요.");
  const isTurn = step.userIds.includes(actorId);
  if (action !== "comment" && !isTurn) throw new Error(`지금은 ${step.names.join("·")}님 차례예요.`);
  if (action === "approve") {
    if (step.role !== "approver") throw new Error("검토자는 승인할 수 없어요. ‘다음 단계 전달’을 써 주세요.");
    await requireRole(actorId, meeting.programId, ["approver"]);
    const blockers = await blockersFor(meeting.id);
    if (blockers.length) throw new Error(blockers.join(" · "));
  }
  if (action === "forward" && step.role !== "reviewer") throw new Error("결재자는 ‘승인’ 또는 ‘변경 요청’을 써 주세요.");
  if (!roles.length) throw new Error("이 프로그램의 구성원이 아니에요.");

  await db.reviewAction.create({ data: { reviewRequestId, actorId, action, comment } });
  if (action === "request_changes") {
    await db.reviewRequest.update({ where: { id: reviewRequestId }, data: { status: "changes_requested" } });
    await db.documentVersion.update({ where: { id: req.documentVersionId }, data: { status: "changes_requested" } });
  } else if (action === "forward" || action === "approve") {
    const next = req.currentStep + 1;
    if (next >= policy.length) {
      await db.reviewRequest.update({ where: { id: reviewRequestId }, data: { status: "approved", currentStep: next } });
      await db.documentVersion.update({ where: { id: req.documentVersionId }, data: { status: "approved" } });
      const submit = req.actions.find((a) => a.action === "submit");
      if (submit) {
        await db.metricObservation.create({ data: { meetingId: meeting.id, kind: "review_wait", durationSeconds: Math.round((Date.now() - submit.createdAt.getTime()) / 1000), source: "auto:submit→approve" } });
      }
    } else {
      await db.reviewRequest.update({ where: { id: reviewRequestId }, data: { currentStep: next } });
    }
  }
  await audit(actorId, `review.${action}`, "ReviewRequest", reviewRequestId);
}
