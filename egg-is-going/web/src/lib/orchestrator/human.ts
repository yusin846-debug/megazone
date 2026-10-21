// 사람 확인 응답 (FR-07). 응답한 값은 고정(lock)하고, 영향받는 단계부터 새 하위 실행을 만든다.
import { db, parse } from "../db";
import { executor } from "./adapter";
import { latestTranscript, participantsOf } from "../state";
import type { StepKey } from "./steps";

export type HumanResponse = { choice: string; value?: string | null; participantId?: string | null };

export async function submitHumanResponse(taskId: string, res: HumanResponse, actorId: string) {
  const task = await db.humanTask.findUniqueOrThrow({ where: { id: taskId }, include: { run: true } });
  if (task.status !== "open") throw new Error("이미 처리된 확인 요청이에요.");
  const meetingId = task.run.meetingId;
  let affects: StepKey = "compose";

  if (task.kind === "item_status") {
    const key = task.target.replace(/^d:/, "").replace(/\.status$/, "");
    const item = await db.discussionItem.findUnique({ where: { meetingId_key: { meetingId, key } }, include: { revisions: { orderBy: { revision: "desc" }, take: 1, include: { evidence: true } } } });
    if (item) {
      const last = item.revisions[0];
      const content = parse<Record<string, unknown>>(last?.contentJson, {});
      await db.itemRevision.create({
        data: {
          itemId: item.id,
          revision: (last?.revision ?? 0) + 1,
          status: res.choice,
          contentJson: JSON.stringify({ ...content, value: res.choice === "confirmed" ? res.value ?? content.value ?? null : null, confidence: 1 }),
          supersedesRevisionId: last?.id ?? null,
          createdBy: actorId,
          locked: true,
          evidence: { create: (last?.evidence ?? []).map((e) => ({ segmentId: e.segmentId, relation: e.relation })) },
        },
      });
    }
  } else if (task.kind === "action_due" || task.kind === "action_assignee") {
    const key = task.target.replace(/^a:/, "").replace(/\.(due_at|assignee)$/, "");
    const a = await db.actionItem.findFirst({ where: { meetingId, key, active: true } });
    if (a) {
      const data =
        task.kind === "action_due"
          ? { dueAt: res.choice === "set" ? res.value ?? null : null }
          : { assigneeParticipantId: res.choice === "set" ? res.participantId ?? null : null };
      await db.actionItem.update({ where: { id: a.id }, data: { ...data, locked: true } });
    }
  } else if (task.kind === "speaker") {
    // 전사 정정은 새 TranscriptVersion으로 (원본은 그대로)
    const segKey = task.target.replace(/^seg:/, "").replace(/\.speaker$/, "");
    const tv = await latestTranscript(meetingId);
    if (tv) {
      await db.transcriptVersion.create({
        data: {
          recordingId: tv.recordingId,
          version: tv.version + 1,
          parentId: tv.id,
          createdBy: actorId,
          note: `${segKey} 화자 지정`,
          segments: {
            create: tv.segments.map((s) => ({
              segKey: s.segKey, startMs: s.startMs, endMs: s.endMs, text: s.text,
              speakerParticipantId: s.segKey === segKey ? res.participantId ?? null : s.speakerParticipantId,
              uncertain: s.segKey === segKey ? false : s.uncertain,
            })),
          },
        },
      });
      affects = "context";
    }
  }

  await db.humanTask.update({ where: { id: taskId }, data: { status: "answered", responseJson: JSON.stringify(res), respondedBy: actorId, answeredAt: new Date() } });
  await audit(actorId, "human_task.answer", "HumanTask", taskId);

  // 필수 확인이 더 남아 있지 않으면 이어서 진행
  const remaining = await db.humanTask.count({ where: { runId: task.runId, status: "open", required: true } });
  if (!remaining) {
    const answeredNow = await db.humanTask.findMany({ where: { runId: task.runId, status: "answered" } });
    const from: StepKey = answeredNow.some((t) => t.kind === "speaker") ? "context" : affects;
    return executor.startRun(meetingId, { startStep: from, parentRunId: task.runId, reason: "사람 확인 응답 반영" });
  }
  return null;
}

export async function audit(actorId: string, action: string, targetType: string, targetId: string) {
  const u = await db.user.findUnique({ where: { id: actorId } });
  if (!u) return;
  await db.auditEvent.create({ data: { organizationId: u.organizationId, actorId, action, targetType, targetId } });
}

export { participantsOf };
