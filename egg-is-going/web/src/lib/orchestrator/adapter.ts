// 실행 어댑터 (05_AIR_Integration 의 계약). 화면은 이 인터페이스만 호출한다.
//   DevExecutionAdapter: 지금 쓰는 개발용 실행기 (같은 프로세스에서 실행)
//   AirStudioAdapter:    AIR Studio 연결용 자리. 실제 API는 확인 후 구현한다.
import { after } from "next/server";
import { createHash } from "node:crypto";
import { db } from "../db";
import { currentProvider } from "../agents/runAgent";
import { latestTranscript, lockedState } from "../state";
import { executeRun } from "./pipeline";
import type { StepKey } from "./steps";

export interface ExecutionAdapter {
  startRun(meetingId: string, opts: { startStep?: StepKey; parentRunId?: string | null; reason: string }): Promise<{ runId: string; duplicate: boolean }>;
  getRun(runId: string): Promise<{ status: string; error: string | null } | null>;
  cancelRun(runId: string, actorId: string): Promise<void>;
  rerunSteps(meetingId: string, fromStep: StepKey, reason: string): Promise<{ runId: string; duplicate: boolean }>;
}

const WORKFLOW = { name: "meeting-doc", version: "0.4" };

class DevExecutionAdapter implements ExecutionAdapter {
  async startRun(meetingId: string, opts: { startStep?: StepKey; parentRunId?: string | null; reason: string }) {
    const [meeting, tv, answered, locked] = await Promise.all([
      db.meeting.findUniqueOrThrow({ where: { id: meetingId } }),
      latestTranscript(meetingId),
      db.humanTask.count({ where: { run: { meetingId }, status: "answered" } }),
      lockedState(meetingId),
    ]);
    const startStep: StepKey = opts.startStep ?? (tv ? "context" : "transcript");
    const manifest = {
      workflow: `${WORKFLOW.name}@${WORKFLOW.version}`,
      provider: currentProvider(),
      transcriptVersion: tv?.version ?? 0,
      transcriptVersionId: tv?.id ?? null,
      templateVersionId: meeting.templateVersionId,
      startStep,
      locked: createHash("sha256").update(JSON.stringify(locked)).digest("hex").slice(0, 12),
      answers: answered,
    };
    let key = createHash("sha256").update(meetingId + JSON.stringify(manifest)).digest("hex");
    const existing = await db.run.findUnique({ where: { idempotencyKey: key } });
    if (existing && !["failed", "cancelled"].includes(existing.status)) return { runId: existing.id, duplicate: true };
    if (existing) key = `${key}:${Date.now()}`; // 실패·취소된 같은 입력은 다시 시도 허용
    const wf = await db.workflowVersion.upsert({ where: { name_version: WORKFLOW }, create: { ...WORKFLOW, definitionRef: "src/lib/orchestrator/pipeline.ts" }, update: {} });
    const run = await db.run.create({
      data: { meetingId, workflowVersionId: wf.id, parentRunId: opts.parentRunId ?? null, startStep, inputManifestJson: JSON.stringify({ ...manifest, reason: opts.reason }), idempotencyKey: key, provider: manifest.provider },
    });
    // Vercel은 응답 직후 실행을 이어가도록 수명주기를 보장한다 (최대 300초).
    // CLI fixture 실행은 요청 컨텍스트가 없으므로 완료까지 기다린다.
    if (process.env.VERCEL) after(() => executeRun(run.id));
    else await executeRun(run.id);
    return { runId: run.id, duplicate: false };
  }
  async getRun(runId: string) {
    return db.run.findUnique({ where: { id: runId }, select: { status: true, error: true } });
  }
  async cancelRun(runId: string, actorId: string) {
    const r = await db.run.update({ where: { id: runId }, data: { cancelRequested: true } });
    if (r.status === "queued" || r.status === "waiting_for_human") await db.run.update({ where: { id: runId }, data: { status: "cancelled", finishedAt: new Date() } });
    void actorId;
  }
  async rerunSteps(meetingId: string, fromStep: StepKey, reason: string) {
    const last = await db.run.findFirst({ where: { meetingId }, orderBy: { createdAt: "desc" } });
    return this.startRun(meetingId, { startStep: fromStep, parentRunId: last?.id ?? null, reason });
  }
}

export const executor: ExecutionAdapter = new DevExecutionAdapter();
