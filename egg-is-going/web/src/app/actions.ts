"use server";
// 화면에서 부르는 서버 동작. 모든 권한 검사는 여기(백엔드)에서 다시 한다. (FR-08)
import { cookies } from "next/headers";
import { loginProgramFor, programCookieKey } from "@/lib/programSelection";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { validateTemplateFields } from "@/lib/templateValidation";
import { db } from "@/lib/db";
import { requireRole, requireUser } from "@/lib/auth";
import { createMeeting } from "@/lib/meetings";
import { executor } from "@/lib/orchestrator/adapter";
import { audit, submitHumanResponse } from "@/lib/orchestrator/human";
import { STEPS, type StepKey } from "@/lib/orchestrator/steps";
import { reviewAct, submitForReview } from "@/lib/review";

const back = (path: string, msg: string, kind: "error" | "ok" = "error") => {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(msg)}`);
};
const isRedirect = (e: unknown) => typeof e === "object" && e !== null && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT");

async function guard<T>(path: string, fn: () => Promise<T>) {
  try {
    return await fn();
  } catch (e) {
    if (isRedirect(e)) throw e;
    back(path, (e as Error).message);
  }
}

// datetime-local 값(시간대 없음)은 한국 시간으로 읽는다
const kst = (v: string) => (v ? new Date(/[zZ]|[+-]\d{2}:\d{2}$/.test(v) ? v : `${v}:00+09:00`) : new Date());

export async function login(formData: FormData) {
  const id = String(formData.get("userId"));
  const user = await db.user.findUniqueOrThrow({ where: { id }, include: { memberships: { include: { program: true } } } });
  const jar = await cookies();
  const previousUser = jar.get("eg_user")?.value;
  const previousProgram = jar.get("eg_program")?.value;
  if (previousUser && previousProgram && !jar.get(programCookieKey(previousUser))) {
    jar.set(programCookieKey(previousUser), previousProgram, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 31536000 });
  }
  jar.delete("eg_program");
  const initial = loginProgramFor(user.memberships.filter(m => m.role !== "operator").map(m => m.program), user.authSubject);
  if (initial) jar.set(programCookieKey(id), initial.id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 31536000 });
  jar.set("eg_user", id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/");
}

export async function newMeeting(formData: FormData) {
  const user = await requireUser();
  const r = await guard("/meetings/new", async () => {
    const programId = String(formData.get("programId"));
    const transcript = String(formData.get("transcript") ?? "");
    const file = formData.get("file");
    if (file instanceof File && file.size > 2000000) throw new Error("텍스트 파일은 2MB 이내로 올려 주세요.");
    if (file instanceof File && file.size && !file.name.toLowerCase().endsWith(".txt")) throw new Error(".txt 파일을 선택해 주세요.");
    const text = file instanceof File && file.size ? await file.text() : transcript;
    const m = await createMeeting(user.id, {
      programId,
      title: String(formData.get("title") || "제목 없는 회의"),
      occurredAt: kst(String(formData.get("occurredAt") ?? "")),
      templateVersionId: String(formData.get("templateVersionId")),
      transcript: text,
      participantUserIds: formData.getAll("participants").map(String),
      externalNames: String(formData.get("externals") ?? "").split(",").map((s) => s.trim()),
      fixtureKey: (formData.get("fixtureKey") as string) || null,
    });
    await audit(user.id, "meeting.create", "Meeting", m.id);
    const { runId } = await executor.startRun(m.id, { reason: "회의 등록" });
    return { meetingId: m.id, runId };
  });
  redirect(`/meetings/${r!.meetingId}/run`);
}

export async function rerunFrom(formData: FormData) {
  const user = await requireUser();
  const meetingId = String(formData.get("meetingId"));
  const step = String(formData.get("step")) as StepKey;
  const path = `/meetings/${meetingId}/run`;
  await guard(path, async () => {
    if (!STEPS.includes(step)) throw new Error("알 수 없는 단계예요.");
    const m = await db.meeting.findUniqueOrThrow({ where: { id: meetingId } });
    await requireRole(user.id, m.programId, ["writer", "operator"]);
    const r = await executor.rerunSteps(meetingId, step, `사용자 재실행 (${step}부터)`);
    await audit(user.id, "run.rerun", "Run", r.runId);
    if (r.duplicate) back(path, "같은 입력으로 이미 실행한 결과가 있어서 그 실행을 보여 드려요.", "ok");
  });
  revalidatePath(path);
  redirect(path);
}

export async function cancelRun(formData: FormData) {
  const user = await requireUser();
  const runId = String(formData.get("runId"));
  const run = await db.run.findUniqueOrThrow({ where: { id: runId }, include: { meeting: true } });
  const path = `/meetings/${run.meetingId}/run`;
  await guard(path, async () => {
    await requireRole(user.id, run.meeting.programId, ["writer", "operator"]);
    await executor.cancelRun(runId, user.id);
    await audit(user.id, "run.cancel", "Run", runId);
  });
  back(path, "취소 요청을 받았어요. 진행 중인 단계가 끝나면 멈춰요.", "ok");
}

export async function answerTask(formData: FormData) {
  const user = await requireUser();
  const taskId = String(formData.get("taskId"));
  const task = await db.humanTask.findUniqueOrThrow({ where: { id: taskId }, include: { run: { include: { meeting: true } } } });
  const path = `/tasks?id=${taskId}`;
  const r = await guard(path, async () => {
    await requireRole(user.id, task.run.meeting.programId, ["writer"]);
    const choice = String(formData.get("choice") ?? "");
    if (!choice) throw new Error("응답을 골라 주세요.");
    return submitHumanResponse(taskId, { choice, value: (formData.get("value") as string) || null, participantId: (formData.get("participantId") as string) || null }, user.id);
  });
  if (r) redirect(`/meetings/${task.run.meetingId}/run?ok=${encodeURIComponent("응답을 고정하고 이어서 실행해요.")}`);
  back("/tasks", "응답을 저장했어요.", "ok");
}

export async function editItem(formData: FormData) {
  const user = await requireUser();
  const meetingId = String(formData.get("meetingId"));
  const key = String(formData.get("key"));
  const path = `/meetings/${meetingId}/workspace?item=${key}`;
  await guard(path, async () => {
    const m = await db.meeting.findUniqueOrThrow({ where: { id: meetingId } });
    await requireRole(user.id, m.programId, ["writer"]);
    const item = await db.discussionItem.findUniqueOrThrow({ where: { meetingId_key: { meetingId, key } }, include: { revisions: { orderBy: { revision: "desc" }, take: 1, include: { evidence: true } } } });
    const last = item.revisions[0];
    const status = String(formData.get("status"));
    const value = String(formData.get("value") ?? "").trim() || null;
    const content = JSON.parse(last?.contentJson ?? "{}");
    await db.itemRevision.create({
      data: {
        itemId: item.id,
        revision: (last?.revision ?? 0) + 1,
        status,
        contentJson: JSON.stringify({ ...content, value: status === "confirmed" ? value : null, confidence: 1 }),
        supersedesRevisionId: last?.id ?? null,
        createdBy: user.id,
        locked: true,
        evidence: { create: (last?.evidence ?? []).map((e) => ({ segmentId: e.segmentId, relation: e.relation })) },
      },
    });
    await audit(user.id, "item.edit", "DiscussionItem", item.id);
    // 결정을 고치면 문서 구성 이후 결과를 다시 만든다
    await executor.startRun(meetingId, { startStep: "compose", reason: `항목 정정: ${item.title}` });
  });
  back(path, "고친 값을 고정하고 문서 구성부터 다시 만들어요.", "ok");
}

export async function editAction(formData: FormData) {
  const user = await requireUser();
  const meetingId = String(formData.get("meetingId"));
  const id = String(formData.get("actionId"));
  const path = `/meetings/${meetingId}/workspace?tab=actions`;
  await guard(path, async () => {
    const m = await db.meeting.findUniqueOrThrow({ where: { id: meetingId } });
    await requireRole(user.id, m.programId, ["writer"]);
    await db.actionItem.update({
      where: { id },
      data: {
        description: String(formData.get("description")),
        assigneeParticipantId: (formData.get("assignee") as string) || null,
        dueAt: String(formData.get("dueAt") ?? "").trim() || null,
        locked: true,
      },
    });
    await audit(user.id, "action.edit", "ActionItem", id);
    await executor.startRun(meetingId, { startStep: "compose", reason: "업무 정정" });
  });
  back(path, "업무를 고정하고 문서 구성부터 다시 만들어요.", "ok");
}

export async function submitDoc(formData: FormData) {
  const user = await requireUser();
  const dvId = String(formData.get("docVersionId"));
  const meetingId = String(formData.get("meetingId"));
  await guard(`/meetings/${meetingId}/document`, () => submitForReview(dvId, user.id));
  redirect(`/meetings/${meetingId}/review?ok=${encodeURIComponent("상신했어요. 검토자에게 전달됐어요.")}`);
}

export async function actOnReview(formData: FormData) {
  const user = await requireUser();
  const reqId = String(formData.get("reviewRequestId"));
  const meetingId = String(formData.get("meetingId"));
  const action = String(formData.get("action")) as "comment" | "forward" | "request_changes" | "approve";
  const comment = String(formData.get("comment") ?? "").trim() || null;
  const path = `/meetings/${meetingId}/review`;
  await guard(path, async () => {
    if (action === "request_changes" && !comment) throw new Error("변경 요청에는 사유를 적어 주세요.");
    await reviewAct(reqId, user.id, action, comment);
  });
  const msg = { comment: "의견을 남겼어요.", forward: "다음 단계로 전달했어요.", request_changes: "변경을 요청했어요.", approve: "승인했어요." }[action];
  back(path, msg, "ok");
}

export async function newTemplateVersion(formData: FormData) {
  const user = await requireUser();
  const templateId = String(formData.get("templateId"));
  await guard("/templates", async () => {
    const t = await db.template.findUniqueOrThrow({ where: { id: templateId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    await requireRole(user.id, t.programId, ["program_admin"]);
    const raw = String(formData.get("rules"));
    const parsed = JSON.parse(raw) as { fields?: unknown[] };
    const fields = validateTemplateFields(parsed.fields);
    const v = await db.templateVersion.create({ data: { templateId, version: (t.versions[0]?.version ?? 0) + 1, rulesJson: JSON.stringify({ fields }), outputFormat: "docx", status: "approved" } });
    await audit(user.id, "template.version", "TemplateVersion", v.id);
  });
  back("/templates", "새 템플릿 버전을 승인했어요. 새로 등록하는 회의부터 쓰여요.", "ok");
}

export async function applyTemplate(formData: FormData) {
  const user = await requireUser();
  const meetingId = String(formData.get("meetingId"));
  const tvId = String(formData.get("templateVersionId"));
  await guard("/templates", async () => {
    const m = await db.meeting.findUniqueOrThrow({ where: { id: meetingId } });
    await requireRole(user.id, m.programId, ["writer", "program_admin"]);
    const template = await db.templateVersion.findFirst({ where: { id: tvId, status: "approved", template: { programId: m.programId } } });
    if (!template) throw new Error("이 프로그램의 승인된 양식을 선택해 주세요.");
    const approved = await db.documentVersion.findFirst({ where: { document: { meetingId }, status: "approved" } });
    if (approved) throw new Error("승인된 회의록에는 다른 양식을 적용할 수 없어요.");
    await db.meeting.update({ where: { id: meetingId }, data: { templateVersionId: tvId } });
    // 배치 규칙이 바뀌므로 문서 구성 → 출력 → 검증만 다시
    await executor.startRun(meetingId, { startStep: "compose", reason: "템플릿 변경" });
  });
  redirect(`/meetings/${meetingId}/run`);
}

export async function logDiary(formData: FormData) {
  const user = await requireUser();
  const meetingId = String(formData.get("meetingId"));
  const minutes = Number(formData.get("minutes"));
  await guard("/metrics", async () => {
    if (!(minutes > 0 && minutes < 24 * 60)) throw new Error("분 단위로 0보다 큰 값을 넣어 주세요.");
    await db.metricObservation.create({ data: { meetingId, userId: user.id, kind: String(formData.get("kind") || "human_work"), durationSeconds: Math.round(minutes * 60), source: "diary" } });
  });
  back("/metrics", "업무일지 시간을 기록했어요.", "ok");
}

export async function selectProgram(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("programId") ?? "");
  const member = await db.membership.findFirst({ where: { userId: user.id, programId: id } });
  if (!member) throw new Error("참여 중인 프로그램을 골라 주세요.");
  const jar = await cookies();
  jar.set(programCookieKey(user.id), id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 31536000 });
  jar.delete("eg_program");
  redirect("/");
}
