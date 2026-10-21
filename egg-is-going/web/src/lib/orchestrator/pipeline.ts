// 오케스트레이터 — 회의 하나의 AI 실행(Run)을 단계별로 진행한다.
//   전사 → 맥락 → 결정·업무 → 문서 구성 → 문서 출력(규칙) → 검증 → 분기
// 분기 (02_Swimlane_ToBe):
//   통과                → 실행 완료 (문서는 여전히 초안, 자동 승인 없음)
//   누락·모순           → 원인 단계부터 다시 (단계당 자동 MAX_AUTO_RETRY회)
//   불명확·한도 도달    → 사람 확인 요청, 실행은 waiting_for_human
import { createHash } from "node:crypto";
import path from "node:path";
import { db } from "../db";
import { runAgent, ContractError, AgentCallError } from "../agents/runAgent";
import type { ComposeOutput, ContextOutput, DecisionOutput, Finding, HumanQuestion, RouteTo, TranscriptOutput, VerifyOutput } from "../agents/types";
import {
  actionsOut, decisionsAndTopics, emptyContent, humanConfirmed, latestTranscript, lockedState, meetingIn, participantsOf, segmentsIn, templateRules,
  type ItemContent,
} from "../state";
import { formatCheck, renderDocx } from "../render/docx";
import { STEPS, type StepKey } from "./steps";

const MAX_AUTO_RETRY = Number(process.env.MAX_AUTO_RETRY ?? 2);
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
export const artifactDir = () => path.join(process.cwd(), "data", "artifacts");

class Cancelled extends Error {}

type Ctx = {
  runId: string;
  meetingId: string;
  attempts: Partial<Record<StepKey, number>>;
  feedback: Finding[];
  questions: HumanQuestion[];
  formatIssues: Finding[];
  context?: ContextOutput;
  compose?: ComposeOutput;
};

export async function executeRun(runId: string): Promise<void> {
  const run = await db.run.findUniqueOrThrow({ where: { id: runId } });
  if (run.status !== "queued") return;
  await db.run.update({ where: { id: runId }, data: { status: "running" } });
  // 이전 실행의 열린 확인 요청은 닫는다 — 이번 실행에서 아직 필요하면 다시 만든다
  await db.humanTask.updateMany({ where: { run: { meetingId: run.meetingId }, runId: { not: runId }, status: "open" }, data: { status: "cancelled" } });

  const ctx: Ctx = { runId, meetingId: run.meetingId, attempts: {}, feedback: [], questions: [], formatIssues: [] };
  let from = STEPS.indexOf(run.startStep as StepKey);
  if (from < 0) from = 0;
  try {
    for (;;) {
      let rerunFrom: StepKey | null = null;
      for (let i = from; i < STEPS.length; i++) {
        const step = STEPS[i];
        await checkCancel(runId);
        const out = await runStep(ctx, step);
        if (step === "verify") rerunFrom = await branch(ctx, out as VerifyOutput, out ? (await lastStepRunId(runId, "verify")) : "");
      }
      if (!rerunFrom) break;
      from = STEPS.indexOf(rerunFrom);
    }
    const required = await db.humanTask.count({ where: { runId, status: "open", required: true } });
    await finish(runId, required ? "waiting_for_human" : "succeeded");
  } catch (e) {
    if (e instanceof Cancelled) {
      await finish(runId, "cancelled");
      return;
    }
    const msg = e instanceof ContractError || e instanceof AgentCallError ? e.message : `${(e as Error).message}`;
    await db.run.update({ where: { id: runId }, data: { status: "failed", error: msg, finishedAt: new Date() } });
    console.error(`[run ${runId}] failed:`, e);
  }
}

async function finish(runId: string, status: string) {
  const steps = await db.stepRun.findMany({ where: { runId } });
  const aiSeconds = Math.round(steps.reduce((s, x) => s + ((x.endedAt?.getTime() ?? Date.now()) - x.startedAt.getTime()), 0) / 1000);
  const run = await db.run.update({ where: { id: runId }, data: { status, finishedAt: new Date() } });
  await db.metricObservation.create({ data: { meetingId: run.meetingId, kind: "ai_wait", durationSeconds: aiSeconds, source: `run:${runId}` } });
}

async function checkCancel(runId: string) {
  const r = await db.run.findUniqueOrThrow({ where: { id: runId }, select: { cancelRequested: true } });
  if (r.cancelRequested) throw new Cancelled();
}

async function lastStepRunId(runId: string, step: StepKey) {
  const s = await db.stepRun.findFirst({ where: { runId, stepKey: step }, orderBy: { attempt: "desc" } });
  return s?.id ?? "";
}

async function runStep(ctx: Ctx, step: StepKey) {
  const attempt = (ctx.attempts[step] ?? 0) + 1;
  ctx.attempts[step] = attempt;
  const sr = await db.stepRun.create({ data: { runId: ctx.runId, stepKey: step, attempt, inputHash: "", status: "running" } });
  const done = async (data: { inputHash: string; promptRef?: string; modelRef?: string; tokensIn?: number; tokensOut?: number; note?: string }, output: unknown) => {
    await db.artifact.create({ data: { stepRunId: sr.id, type: "agent_output", contentJson: JSON.stringify(output), hash: hash(output), schemaVersion: "v1" } });
    await db.stepRun.update({ where: { id: sr.id }, data: { ...data, status: "succeeded", endedAt: new Date() } });
  };
  try {
    switch (step) {
      case "transcript": {
        const tv = await latestTranscript(ctx.meetingId);
        const rec = await db.recording.findFirstOrThrow({ where: { meetingId: ctx.meetingId }, orderBy: { createdAt: "desc" } });
        if (rec.kind !== "text") throw new Error("음성 전사는 2단계 기능입니다. 녹취록(텍스트)을 올려 주세요.");
        const { readFileSync } = await import("node:fs");
        const raw = rec.contentText ?? readFileSync(rec.objectKey, "utf8");
        const meeting = await meetingIn(ctx.meetingId);
        const input = { meeting, raw_text: raw };
        const r = await runAgent("transcript", input);
        await saveTranscript(ctx.meetingId, rec.id, r.output, tv ? tv.version + 1 : 1);
        await done({ inputHash: hash(input), promptRef: r.promptRef, modelRef: r.modelRef, note: `발언 ${r.output.segments.length}개 · 불확실 ${r.output.uncertain_spans.length}` }, r.output);
        return r.output;
      }
      case "context": {
        const input = { meeting: await meetingIn(ctx.meetingId), segments: await segmentsIn(ctx.meetingId), feedback: ctx.feedback.filter((f) => f.route_to === "context") };
        const r = await runAgent("context", input);
        ctx.context = r.output;
        const changes = r.output.topics.reduce((s, t) => s + t.idea_changes.filter((c) => c.from).length, 0);
        await done({ inputHash: hash(input), promptRef: r.promptRef, modelRef: r.modelRef, tokensIn: r.tokensIn, tokensOut: r.tokensOut, note: `안건 ${r.output.topics.length} · 변경 이력 ${changes}` }, r.output);
        return r.output;
      }
      case "decision": {
        const topics = ctx.context?.topics ?? (await decisionsAndTopics(ctx.meetingId)).topics;
        const input = {
          meeting: await meetingIn(ctx.meetingId),
          segments: await segmentsIn(ctx.meetingId),
          topics,
          locked: await lockedState(ctx.meetingId),
          feedback: ctx.feedback.filter((f) => f.route_to === "decision"),
        };
        const r = await runAgent("decision", input);
        await saveDecisions(ctx, r.output, topics);
        ctx.questions = r.output.questions_for_human;
        const c = (s: string) => r.output.decisions.filter((d) => d.status === s).length;
        await done(
          { inputHash: hash(input), promptRef: r.promptRef, modelRef: r.modelRef, tokensIn: r.tokensIn, tokensOut: r.tokensOut, note: `확정 ${c("confirmed")} · 보류 ${c("on_hold")} · 폐기 ${c("dropped")} · 업무 ${r.output.action_items.length}` },
          r.output,
        );
        return r.output;
      }
      case "compose": {
        const m = await db.meeting.findUniqueOrThrow({ where: { id: ctx.meetingId } });
        const { decisions, topics } = await decisionsAndTopics(ctx.meetingId);
        const input = {
          meeting: await meetingIn(ctx.meetingId),
          template: await templateRules(m.templateVersionId),
          topics,
          decisions,
          action_items: await actionsOut(ctx.meetingId),
          feedback: ctx.feedback.filter((f) => f.route_to === "compose"),
        };
        const r = await runAgent("compose", input);
        ctx.compose = r.output;
        await saveDocument(ctx, m.templateVersionId, r.output);
        await done({ inputHash: hash(input), promptRef: r.promptRef, modelRef: r.modelRef, tokensIn: r.tokensIn, tokensOut: r.tokensOut, note: `${input.template.name} v${input.template.version}` }, r.output);
        return r.output;
      }
      case "render": {
        const dv = await db.documentVersion.findFirstOrThrow({ where: { document: { meetingId: ctx.meetingId }, runId: ctx.runId }, orderBy: { version: "desc" }, include: { templateVersion: { include: { template: { include: { program: true } } } } } });
        const meeting = await meetingIn(ctx.meetingId);
        const tpl = await templateRules(dv.templateVersionId);
        const doc = JSON.parse(dv.contentJson) as ComposeOutput;
        const issues = formatCheck(doc, tpl, meeting);
        ctx.formatIssues = issues;
        const outPath = `db:document:${dv.id}`;
        const bytes = await renderDocx({ program: meeting.program, templateLabel: `${tpl.name} v${tpl.version}`, docVersion: dv.version, meeting, tpl, doc, segments: await segmentsIn(ctx.meetingId) });
        await db.documentVersion.update({ where: { id: dv.id }, data: { artifactPath: outPath, artifactBytes: new Uint8Array(bytes) } });
        await db.artifact.create({ data: { stepRunId: sr.id, type: "docx", objectKey: outPath, hash: createHash("sha256").update(bytes).digest("hex"), schemaVersion: "docx" } });
        await done({ inputHash: hash(doc), modelRef: "rules", note: `docx · 서식 검사 ${issues.length ? `문제 ${issues.length}` : "통과"}` }, { format_issues: issues });
        return issues;
      }
      case "verify": {
        const { decisions, topics } = await decisionsAndTopics(ctx.meetingId);
        const dv = await db.documentVersion.findFirstOrThrow({ where: { document: { meetingId: ctx.meetingId } }, orderBy: { version: "desc" } });
        const input = {
          meeting: await meetingIn(ctx.meetingId),
          segments: await segmentsIn(ctx.meetingId),
          topics,
          decisions,
          action_items: await actionsOut(ctx.meetingId),
          document: JSON.parse(dv.contentJson) as ComposeOutput,
          human_confirmed: await humanConfirmed(ctx.meetingId),
          format_issues: ctx.formatIssues,
        };
        const r = await runAgent("verify", input);
        for (const f of r.output.findings) {
          await db.validationFinding.create({
            data: { stepRunId: sr.id, type: f.type, severity: f.severity, target: f.target, message: f.message, evidenceJson: JSON.stringify(f.evidence), routeTo: f.route_to },
          });
        }
        const human = r.output.findings.filter((f) => f.route_to === "human").length;
        await done({ inputHash: hash(input), promptRef: r.promptRef, modelRef: r.modelRef, tokensIn: r.tokensIn, tokensOut: r.tokensOut, note: `${r.output.verdict} · 문제 ${r.output.findings.length - human} · 확인 ${human}` }, r.output);
        return r.output;
      }
    }
  } catch (e) {
    await db.stepRun.update({ where: { id: sr.id }, data: { status: "failed", error: (e as Error).message, endedAt: new Date() } });
    throw e;
  }
}

/** 검증 결과로 다음 행동을 정한다. 다시 돌릴 단계가 있으면 그 단계를 돌려준다. */
async function branch(ctx: Ctx, v: VerifyOutput, verifyStepRunId: string): Promise<StepKey | null> {
  const findings = await db.validationFinding.findMany({ where: { stepRunId: verifyStepRunId } });
  const fix = v.findings.filter((f) => f.route_to !== "human");
  if (fix.length) {
    const order: RouteTo[] = ["context", "decision", "compose"];
    const target = order.find((s) => fix.some((f) => f.route_to === s)) as StepKey | undefined;
    if (target && (ctx.attempts[target] ?? 0) < MAX_AUTO_RETRY) {
      ctx.feedback = fix;
      await db.validationFinding.updateMany({ where: { id: { in: findings.filter((f) => f.routeTo !== "human").map((f) => f.id) } }, data: { resolution: "auto_rerun" } });
      return target;
    }
  }
  // 자동 수정 한도 도달 → 남은 수정 거리도 사람에게
  const toHuman: (Finding & { required: boolean; kind: string })[] = [
    ...fix.map((f) => ({ ...f, required: f.severity === "critical", kind: "other" })),
    ...v.findings.filter((f) => f.route_to === "human").map((f) => ({ ...f, required: requiredFor(f), kind: kindFor(f.target) })),
  ];
  // 결정 에이전트의 질문도 확인 요청으로 (같은 target이면 하나만)
  for (const q of ctx.questions) {
    if (!toHuman.some((t) => t.target === q.target)) {
      toHuman.push({ type: "unclear", severity: q.kind === "item_status" ? "critical" : "normal", target: q.target, message: q.question, evidence: q.evidence, route_to: "human", required: q.kind === "item_status", kind: q.kind });
    }
  }
  const confirmed = new Set(await humanConfirmed(ctx.meetingId));
  const seen = new Set<string>();
  for (const t of toHuman) {
    if (confirmed.has(t.target) || seen.has(t.target)) continue;
    seen.add(t.target);
    const question = ctx.questions.find((q) => q.target === t.target)?.question ?? questionFor(t);
    await db.humanTask.create({
      data: {
        runId: ctx.runId,
        stepRunId: verifyStepRunId || null,
        kind: t.kind,
        target: t.target,
        question,
        evidenceJson: JSON.stringify(t.evidence),
        optionsJson: JSON.stringify(optionsFor(t.kind)),
        required: t.required,
      },
    });
  }
  await db.validationFinding.updateMany({ where: { stepRunId: verifyStepRunId, resolution: null }, data: { resolution: "human_task" } });
  return null;
}

const kindFor = (target: string) =>
  target.endsWith(".status") ? "item_status" : target.endsWith(".due_at") ? "action_due" : target.endsWith(".assignee") ? "action_assignee" : target.startsWith("seg:") ? "speaker" : "other";
const requiredFor = (f: Finding) => {
  const k = kindFor(f.target);
  return k === "item_status" || k === "speaker" || (k === "other" && f.severity === "critical");
};
const questionFor = (f: Finding) => {
  const k = kindFor(f.target);
  if (k === "speaker") return `${f.target.replace("seg:", "").replace(".speaker", "")} 구간의 화자가 누구인가요?`;
  if (k === "action_due") return f.message.replace("원문에 없습니다.", "원문에 없어요. 지정할까요?");
  if (k === "other") return `검증 에이전트가 자동으로 고치지 못했어요: ${f.message}`;
  return f.message;
};
const optionsFor = (kind: string) =>
  kind === "item_status"
    ? [{ value: "confirmed", label: "확정" }, { value: "on_hold", label: "보류" }, { value: "dropped", label: "폐기" }, { value: "removed", label: "회의에서 다루지 않음 (항목 삭제)" }]
    : kind === "action_due"
      ? [{ value: "set", label: "기한 지정" }, { value: "keep_null", label: "미정으로 두기" }]
      : kind === "action_assignee"
        ? [{ value: "set", label: "담당 지정" }, { value: "keep_null", label: "미정으로 두기" }]
        : kind === "speaker"
          ? [{ value: "set", label: "화자 지정" }]
          : [{ value: "ack", label: "확인했어요 (문서에서 직접 고칠게요)" }];

// ───────── 원장에 쓰기 ─────────

async function saveTranscript(meetingId: string, recordingId: string, out: TranscriptOutput, version: number) {
  const { toId } = await participantsOf(meetingId);
  const prev = await db.transcriptVersion.findFirst({ where: { recordingId }, orderBy: { version: "desc" } });
  await db.transcriptVersion.create({
    data: {
      recordingId,
      version,
      parentId: prev?.id ?? null,
      createdBy: "agent:transcript",
      note: prev ? "다시 전사" : "원본",
      segments: {
        createMany: { data: out.segments.map((s) => ({ segKey: s.segment_id, speakerParticipantId: s.speaker ? toId.get(s.speaker) ?? null : null, startMs: s.start_ms, endMs: s.end_ms, text: s.text, uncertain: s.uncertain })) },
      },
    },
  });
}

async function saveDecisions(ctx: Ctx, out: DecisionOutput, topics: ContextOutput["topics"]) {
  const meetingId = ctx.meetingId;
  const tv = await latestTranscript(meetingId);
  const segId = new Map(tv?.segments.map((s) => [s.segKey, s.id]) ?? []);
  const { toId } = await participantsOf(meetingId);
  const seen = new Set<string>();

  const upsertRevision = async (key: string, title: string, status: string, content: ItemContent, evidence: string[]) => {
    const item = await db.discussionItem.upsert({ where: { meetingId_key: { meetingId, key } }, create: { meetingId, key, type: "topic", title }, update: { title } });
    const last = await db.itemRevision.findFirst({ where: { itemId: item.id }, orderBy: { revision: "desc" } });
    if (last?.locked) return; // 사람이 고정한 값은 건드리지 않는다
    await db.itemRevision.create({
      data: {
        itemId: item.id,
        revision: (last?.revision ?? 0) + 1,
        status,
        contentJson: JSON.stringify(content),
        supersedesRevisionId: last?.id ?? null,
        createdBy: "agent:decision",
        runId: ctx.runId,
        evidence: { create: [...new Set(evidence)].filter((e) => segId.has(e)).map((e) => ({ segmentId: segId.get(e)! })) },
      },
    });
  };

  for (const d of out.decisions) {
    const t = topics.find((x) => x.item_key === d.item_key);
    seen.add(d.item_key);
    await upsertRevision(
      d.item_key,
      d.title || t?.title || d.item_key,
      d.status,
      { value: d.value, hold_reason: d.hold_reason, revisit: d.revisit, confidence: d.confidence, intent: t?.intent ?? null, idea_changes: t?.idea_changes ?? [] },
      d.evidence.map((e) => e.segment_id),
    );
  }
  for (const t of topics.filter((t) => !seen.has(t.item_key))) {
    seen.add(t.item_key);
    await upsertRevision(t.item_key, t.title, "unknown", { ...emptyContent(), intent: t.intent, idea_changes: t.idea_changes }, t.idea_changes.flatMap((c) => c.evidence.map((e) => e.segment_id)));
  }
  // 이번 결과에 없는 예전 항목은 숨긴다 (이력은 남음)
  const items = await db.discussionItem.findMany({ where: { meetingId }, include: { revisions: { orderBy: { revision: "desc" }, take: 1 } } });
  for (const it of items) {
    const last = it.revisions[0];
    if (!seen.has(it.key) && last && !last.locked && last.status !== "removed") {
      await db.itemRevision.create({ data: { itemId: it.id, revision: last.revision + 1, status: "removed", contentJson: last.contentJson, supersedesRevisionId: last.id, createdBy: "agent:decision", runId: ctx.runId } });
    }
  }

  // 업무: 고정된 것은 두고, 나머지는 이번 결과로 교체
  const locked = await db.actionItem.findMany({ where: { meetingId, active: true, locked: true } });
  await db.actionItem.updateMany({ where: { meetingId, active: true, locked: false }, data: { active: false } });
  for (const a of out.action_items) {
    if (locked.some((l) => l.key === a.action_key)) continue;
    await db.actionItem.create({
      data: {
        meetingId,
        key: a.action_key,
        description: a.description,
        assigneeParticipantId: a.assignee ? toId.get(a.assignee) ?? null : null,
        dueAt: a.due_at,
        evidenceJson: JSON.stringify(a.evidence),
        runId: ctx.runId,
      },
    });
  }
}

async function saveDocument(ctx: Ctx, templateVersionId: string, out: ComposeOutput) {
  const doc = (await db.document.findFirst({ where: { meetingId: ctx.meetingId } })) ?? (await db.document.create({ data: { meetingId: ctx.meetingId } }));
  const last = await db.documentVersion.findFirst({ where: { documentId: doc.id }, orderBy: { version: "desc" } });
  await db.documentVersion.create({
    data: { documentId: doc.id, version: (last?.version ?? 0) + 1, templateVersionId, contentJson: JSON.stringify(out), status: "draft", createdBy: "agent:compose", runId: ctx.runId },
  });
  // 검토 중이던 이전 버전의 요청은 superseded (FR-05)
  await db.reviewRequest.updateMany({ where: { documentVersion: { documentId: doc.id }, status: "open" }, data: { status: "superseded" } });
}
