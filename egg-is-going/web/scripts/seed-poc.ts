// Append-only PoC setup: deterministic IDs, one transaction per meeting, no resets.
// npm run poc:seed                 preview the plan (no DB connection)
// npm run poc:seed -- --apply      create missing demo records
// npm run poc:seed -- --check      inspect the stored scenario without changing it
import "./lib/env";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { POC_MEETINGS, POC_PROGRAM, POC_VERSION, kstDay, pocDate } from "../src/lib/poc/daemyeong";
import { pocDocument } from "../src/lib/poc/documents";
import { DEFAULT_TEMPLATE } from "../src/lib/defaultTemplate";
import type { ComposeOutput, MeetingIn, SegmentIn } from "../src/lib/agents/types";
import { formatCheck, renderDocx } from "../src/lib/render/docx";
import { STEPS } from "../src/lib/orchestrator/steps";
import { checkContract } from "../src/lib/agents/validate";

const db = new PrismaClient();
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const idFor = (scope: string, part: string) => {
  const h = hash(`${POC_VERSION}:${scope}:${part}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const json = JSON.stringify;
const dateArg = process.argv.find(a => a.startsWith("--date="))?.slice(7);
const anchor = dateArg ?? kstDay(new Date());
const refs = (numbers: number[]) => numbers.map(n => ({ segment_id: `seg_${String(n).padStart(2, "0")}` }));

async function main() {
  pocDate(anchor, 0); // Validate before any DB access.
  if (!process.argv.includes("--apply") && !process.argv.includes("--check")) {
    console.log(json({ program: POC_PROGRAM, anchor, meetings: POC_MEETINGS.map(m => ({ title: m.title, at: pocDate(anchor, m.day, m.time).toISOString(), state: m.state })), openQuestions: 3, writes: false }));
    return;
  }
  const candidates = await db.user.findMany({ where: { authSubject: "lee", name: "이혜연" } });
  if (candidates.length !== 1) throw new Error("이혜연 데모 계정이 하나인 초기 시드가 필요합니다. 먼저 db:seed를 실행하세요.");
  const lee = candidates[0];
  const people = await db.user.findMany({ where: { organizationId: lee.organizationId, authSubject: { in: ["han", "oh", "lee", "park", "choi", "yoon"] } } });
  if (people.length !== 6) throw new Error("같은 데모 조직에 제작팀 6명이 있어야 합니다.");
  const names = new Map(people.map(p => [p.authSubject, p.name]));
  const scope = lee.organizationId;
  let program = await db.program.findFirst({ where: { organizationId: scope, name: POC_PROGRAM } });
  if (!program && process.argv.includes("--check")) throw new Error("PoC 프로그램이 아직 없습니다.");
  if (!program) {
    const base = await db.program.findFirstOrThrow({ where: { organizationId: scope, name: "달걀 한 판 여행기" }, include: { memberships: true } });
    program = await db.program.create({ data: { id: idFor(scope, "program"), organizationId: scope, name: POC_PROGRAM, memberships: { create: base.memberships.map(m => ({ userId: m.userId, role: m.role })) }, templates: { create: { name: DEFAULT_TEMPLATE.name, versions: { create: { version: DEFAULT_TEMPLATE.version, rulesJson: json({ fields: DEFAULT_TEMPLATE.fields }), status: "approved" } } } } } });
  }
  const programId = program.id;
  const recorded = POC_MEETINGS.filter(m => m.state !== "scheduled");
  const ids = recorded.map(m => idFor(scope, `meeting:${m.key}`));
  if (process.argv.includes("--check")) {
    const meetings = await db.meeting.findMany({ where: { id: { in: ids }, programId }, include: { recordings: { include: { transcripts: { include: { segments: true } } } }, runs: { include: { humanTasks: true, steps: true } }, documents: { include: { versions: { select: { version: true, status: true, artifactPath: true, artifactBytes: true } } } } } });
    console.log(json({ program: program.name, meetings: meetings.map(m => ({ title: m.title, at: m.occurredAt, runs: m.runs.map(r => r.status), openQuestions: m.runs.flatMap(r => r.humanTasks).filter(t => t.status === "open").length, documents: m.documents.flatMap(d => d.versions).map(v => ({ version: v.version, status: v.status, bytes: v.artifactBytes?.length ?? 0 })) })), writes: false }));
    if (meetings.length !== recorded.length) throw new Error("PoC 회의 일부가 없습니다.");
    for (const m of meetings) {
      const seededRun = m.runs.find(r => r.id === idFor(scope, `run:${m.fixtureKey!.split(":")[1]}`));
      if (!seededRun || seededRun.steps.length !== STEPS.length || !m.recordings.some(r => r.transcripts.some(t => t.segments.length))) throw new Error(`실행·근거 연결 누락: ${m.title}`);
      if (!m.documents.flatMap(d => d.versions).every(v => v.artifactBytes && v.artifactBytes.length > 3000)) throw new Error(`문서 파일 누락: ${m.title}`);
    }
    return;
  }
  const memberships = await db.membership.findMany({ where: { programId, userId: { in: people.map(p => p.id) }, role: { not: "operator" } }, select: { userId: true } });
  if (new Set(memberships.map(m => m.userId)).size !== 6) throw new Error("PoC 프로그램 제작팀 권한을 확인하세요.");
  const tv = await db.templateVersion.findFirstOrThrow({ where: { template: { programId }, status: "approved", version: DEFAULT_TEMPLATE.version }, include: { template: true } });
  if (json(JSON.parse(tv.rulesJson).fields) !== json(DEFAULT_TEMPLATE.fields)) throw new Error("PoC에 필요한 제작회의록 v3 양식과 다릅니다.");
  const wf = await db.workflowVersion.upsert({ where: { name_version: { name: "meeting-doc", version: "0.4" } }, update: {}, create: { name: "meeting-doc", version: "0.4", definitionRef: "src/lib/orchestrator/pipeline.ts" } });
  const reviewers = await db.membership.findMany({ where: { programId, role: "reviewer", userId: { not: lee.id } }, include: { user: true } });
  const approvers = (await db.membership.findMany({ where: { programId, role: "approver" }, include: { user: true } })).sort((a, b) => a.user.name.localeCompare(b.user.name, "ko"));
  if (!reviewers.length || !approvers.length) throw new Error("검토자와 결재자가 필요합니다.");
  const policy = [{ step: 0, role: "reviewer", userIds: reviewers.map(m => m.userId), names: reviewers.map(m => m.user.name) }, ...approvers.map((m, i) => ({ step: i + 1, role: "approver", userIds: [m.userId], names: [m.user.name] }))];
  let created = 0;
  for (const def of recorded) {
    const mid = idFor(scope, `meeting:${def.key}`);
    if (await db.meeting.findUnique({ where: { id: mid } })) { console.log(`유지: ${def.title}`); continue; }
    const occurredAt = pocDate(anchor, def.day, def.time);
    const start = new Date(occurredAt.getTime() + 30 * 60000);
    const runId = idFor(scope, `run:${def.key}`);
    const participantId = (sub: string) => idFor(scope, `${def.key}:participant:${sub}`);
    const participantList = [...people].sort((a, b) => a.name.localeCompare(b.name, "ko")).map((p, i) => ({ key: `p${i + 1}`, name: p.name, role_label: p.title, team: /PD/.test(p.title) ? "pd" as const : "writer" as const }));
    const meeting: MeetingIn = { title: def.title, occurred_at: occurredAt.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(0, 16), participants: participantList };
    const segments: SegmentIn[] = def.lines.map((l, i) => ({ segment_id: `seg_${String(i + 1).padStart(2, "0")}`, start_ms: i * 40000, end_ms: i * 40000 + 35000, speaker: participantList.find(p => p.name === names.get(l.who))!.key, text: l.text, uncertain: false }));
    const doc = def.state === "scheduled" ? null : pocDocument(def, anchor, meeting, segments, names);
    if (doc && formatCheck(doc, DEFAULT_TEMPLATE, meeting).length) throw new Error(`양식 검증 실패: ${def.title}`);
    const versions: { number: number; doc: ComposeOutput; bytes: Buffer }[] = [];
    if (doc) {
      if (def.state === "in_review") {
        const previous = structuredClone(doc);
        previous.sections.find(s => s.field_id === "decisions")!.blocks = previous.sections.find(s => s.field_id === "decisions")!.blocks.filter(b => !b.refs.includes("d:t_rain"));
        versions.push({ number: 1, doc: previous, bytes: await renderDocx({ program: POC_PROGRAM, templateLabel: "제작회의록 v3", docVersion: 1, meeting, tpl: DEFAULT_TEMPLATE, doc: previous, segments }) });
      }
      const number = versions.length + 1;
      versions.push({ number, doc, bytes: await renderDocx({ program: POC_PROGRAM, templateLabel: "제작회의록 v3", docVersion: number, meeting, tpl: DEFAULT_TEMPLATE, doc, segments }) });
    }
    await db.$transaction(async tx => {
      // Recheck inside the transaction. Duplicate IDs also protect concurrent invocations.
      if (await tx.meeting.findUnique({ where: { id: mid } })) return;
      await tx.meeting.create({ data: { id: mid, programId, title: def.title, occurredAt, createdById: lee.id, templateVersionId: tv.id, fixtureKey: `${POC_VERSION}:${def.key}`, createdAt: def.state === "scheduled" ? pocDate(anchor, -1, "09:00") : new Date(occurredAt.getTime() - 3600000), participants: { create: people.map(p => ({ id: participantId(p.authSubject), userId: p.id, displayName: p.name, roleLabel: p.title, team: /PD/.test(p.title) ? "pd" : "writer" })) } } });
      if (def.state === "scheduled") return;
      const raw = def.lines.map((l, i) => `[${String(Math.floor(i * 40 / 60)).padStart(2, "0")}:${String(i * 40 % 60).padStart(2, "0")}] ${names.get(l.who)}: ${l.text}`).join("\n");
      const recordingId = idFor(scope, `recording:${def.key}`);
      const transcriptId = idFor(scope, `transcript:${def.key}`);
      await tx.recording.create({ data: { id: recordingId, meetingId: mid, kind: "text", objectKey: `db:recording:${mid}`, contentText: raw, hash: hash(raw), durationMs: segments.at(-1)!.end_ms, createdAt: start } });
      await tx.transcriptVersion.create({ data: { id: transcriptId, recordingId, version: 1, createdBy: "poc:curated", createdAt: start, note: "PoC 가상 회의", segments: { create: segments.map((s, i) => ({ id: idFor(scope, `${def.key}:${s.segment_id}`), segKey: s.segment_id, speakerParticipantId: participantId(def.lines[i].who), startMs: s.start_ms, endMs: s.end_ms, text: s.text })) } } });
      await tx.run.create({ data: { id: runId, meetingId: mid, workflowVersionId: wf.id, startStep: "transcript", inputManifestJson: json({ workflow: "meeting-doc@0.4", provider: "mock", source: "curated-poc", seedVersion: POC_VERSION, anchor, transcriptVersion: 1, transcriptVersionId: transcriptId, templateVersionId: tv.id, reason: "PoC 가상 제작회의" }), idempotencyKey: `${POC_VERSION}:${scope}:${def.key}`, status: def.state === "waiting" ? "waiting_for_human" : "succeeded", provider: "mock", createdAt: start, finishedAt: new Date(start.getTime() + 18000) } });
      for (const d of def.decisions) {
        const itemId = idFor(scope, `${def.key}:item:${d.key}`);
        await tx.discussionItem.create({ data: { id: itemId, meetingId: mid, key: d.key, type: "topic", title: d.title } });
        let previousId: string | undefined;
        if (d.change) {
          previousId = idFor(scope, `${def.key}:${d.key}:r1`);
          await tx.itemRevision.create({ data: { id: previousId, itemId, revision: 1, status: "proposed", contentJson: json({ value: d.change.from, confidence: 0.8, intent: null, idea_changes: [], hold_reason: null, revisit: null }), createdBy: "poc:curated", runId, createdAt: start } });
        }
        await tx.itemRevision.create({ data: { id: idFor(scope, `${def.key}:${d.key}:latest`), itemId, revision: previousId ? 2 : 1, supersedesRevisionId: previousId, status: d.status, contentJson: json({ value: d.value, hold_reason: d.reason ?? null, revisit: d.status === "on_hold" || d.status === "proposed" ? "다음 구성 회의" : null, confidence: d.status === "proposed" ? 0.55 : 0.98, intent: d.title, idea_changes: d.change ? [{ from: d.change.from, to: d.value, reason: d.change.reason, evidence: refs(d.evidence) }] : [] }), createdBy: "poc:curated", runId, createdAt: new Date(start.getTime() + 4000), evidence: { create: d.evidence.map(n => ({ segmentId: idFor(scope, `${def.key}:seg_${String(n).padStart(2, "0")}`) })) } } });
      }
      for (const a of def.actions) await tx.actionItem.create({ data: { id: idFor(scope, `${def.key}:action:${a.key}`), meetingId: mid, key: a.key, description: a.description, assigneeParticipantId: a.who ? participantId(a.who) : null, dueAt: a.dueDay === null ? null : pocDate(anchor, a.dueDay).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }), evidenceJson: json(refs(a.evidence)), runId } });
      const docId = idFor(scope, `document:${def.key}`);
      await tx.document.create({ data: { id: docId, meetingId: mid } });
      for (const v of versions) {
        const dvId = idFor(scope, `${def.key}:dv:${v.number}`);
        await tx.documentVersion.create({ data: { id: dvId, documentId: docId, version: v.number, templateVersionId: tv.id, contentJson: json(v.doc), artifactBytes: new Uint8Array(v.bytes), artifactPath: `db:document:${dvId}`, status: def.state === "approved" ? "approved" : def.state === "in_review" ? (v.number === 1 ? "changes_requested" : "in_review") : "draft", createdBy: "poc:curated", runId, createdAt: new Date(start.getTime() + (v.number === 1 ? 120000 : 1500000)) } });
        if (def.state !== "approved" && def.state !== "in_review") continue;
        const previous = def.state === "in_review" && v.number === 1;
        const rid = idFor(scope, `${def.key}:review:${v.number}`);
        const submitted = new Date(start.getTime() + (v.number === 1 ? 300000 : 1800000));
        const actions = [{ actorId: lee.id, action: "submit", comment: `v${v.number} 상신${v.number > 1 ? " · 우천 대응과 보행 통로 기준 보완" : ""}`, createdAt: submitted }];
        if (previous) actions.push({ actorId: reviewers[0].userId, action: "request_changes", comment: "우천 시 대기 전환 기준과 보행 통로 확보 내용을 결정 사항에 보완해 주세요.", createdAt: new Date(submitted.getTime() + 600000) });
        else {
          actions.push({ actorId: reviewers[0].userId, action: "forward", comment: "구성·담당·기한과 원문 근거를 확인했습니다.", createdAt: new Date(submitted.getTime() + 600000) });
          if (def.state === "approved") approvers.forEach((m, i) => actions.push({ actorId: m.userId, action: "approve", comment: i === approvers.length - 1 ? "이 내용으로 준비해 주세요. 승인합니다." : "촬영 준비 기준 확인했습니다.", createdAt: new Date(submitted.getTime() + (i + 2) * 600000) }));
        }
        await tx.reviewRequest.create({ data: { id: rid, documentVersionId: dvId, policySnapshotJson: json(policy), currentStep: previous ? 0 : def.state === "approved" ? policy.length : 1, status: previous ? "changes_requested" : def.state === "approved" ? "approved" : "open", createdAt: submitted, actions: { create: actions } } });
      }
      const notes: Record<string, string> = { transcript: `발언 ${segments.length}개 · 불확실 0`, context: `안건 ${def.decisions.length} · 변경 이력 ${def.decisions.filter(d => d.change).length}`, decision: `확정 ${def.decisions.filter(d => d.status === "confirmed").length} · 업무 ${def.actions.length}`, compose: "제작회의록 v3", render: "docx · 서식 검사 통과", verify: def.questions?.length ? `확인 ${def.questions.length}건` : "검증 통과" };
      const findings = (def.questions ?? []).map(q => ({ type: "unclear", severity: "critical", target: q.target, message: q.question, evidence: refs(q.evidence), route_to: "human" }));
      for (const [i, stepKey] of STEPS.entries()) {
        const sid = idFor(scope, `${def.key}:step:${stepKey}`);
        const output = stepKey === "transcript" ? { segments, uncertain_spans: [], unmatched_speakers: [] } : stepKey === "context" ? { topics: def.decisions.map(d => ({ item_key: d.key, title: d.title, intent: d.title, idea_changes: d.change ? [{ from: d.change.from, to: d.value, reason: d.change.reason, evidence: refs(d.evidence) }] : [] })) } : stepKey === "decision" ? { decisions: def.decisions.map(d => ({ item_key: d.key, title: d.title, status: d.status, value: d.value, hold_reason: d.reason ?? null, revisit: null, evidence: refs(d.evidence), confidence: d.status === "proposed" ? 0.55 : 0.98 })), action_items: def.actions.map(a => ({ action_key: a.key, description: a.description, assignee: a.who ? participantList.find(p => p.name === names.get(a.who!))!.key : null, due_at: a.dueDay === null ? null : pocDate(anchor, a.dueDay).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }), evidence: refs(a.evidence) })), questions_for_human: (def.questions ?? []).map(q => ({ ...q, evidence: refs(q.evidence) })) } : stepKey === "compose" ? doc : stepKey === "render" ? { format_issues: [] } : { verdict: findings.length ? "needs_human" : "pass", findings };
        if (stepKey !== "render") {
          const problems = checkContract(stepKey, output);
          if (problems.length) throw new Error(`${def.title} ${stepKey}: ${problems.join("; ")}`);
        }
        await tx.stepRun.create({ data: { id: sid, runId, stepKey, attempt: 1, status: "succeeded", inputHash: hash(`${def.key}:${stepKey}`), modelRef: "poc:curated", promptRef: "poc:curated", note: notes[stepKey], startedAt: new Date(start.getTime() + i * 3000), endedAt: new Date(start.getTime() + (i + 1) * 3000), artifacts: { create: { type: "agent_output", contentJson: json(output), hash: hash(json(output)), schemaVersion: "v1", createdAt: new Date(start.getTime() + (i + 1) * 3000) } } } });
        if (stepKey === "verify") for (const q of def.questions ?? []) {
          await tx.validationFinding.create({ data: { stepRunId: sid, type: "unclear", severity: "critical", target: q.target, message: q.question, evidenceJson: json(refs(q.evidence)), routeTo: "human", resolution: "human_task" } });
          const options = q.kind === "item_status" ? [{ value: "confirmed", label: "확정" }, { value: "on_hold", label: "보류" }, { value: "dropped", label: "제외" }] : [{ value: "set", label: q.kind === "action_due" ? "기한 지정" : "담당 지정" }, { value: "unknown", label: "미정으로 남기기" }];
          await tx.humanTask.create({ data: { id: idFor(scope, `${def.key}:task:${q.target}`), runId, stepRunId: sid, assigneeId: lee.id, kind: q.kind, target: q.target, question: q.question, evidenceJson: json(refs(q.evidence)), optionsJson: json(options), required: true, createdAt: new Date(start.getTime() + 18000) } });
        }
      }
      await tx.auditEvent.create({ data: { organizationId: scope, actorId: lee.id, action: "poc.seed", targetType: "Meeting", targetId: mid, occurredAt: start } });
    }, { maxWait: 10000, timeout: 60000 });
    created++;
    console.log(`추가: ${def.title} · ${def.state}`);
  }
  console.log(json({ program: POC_PROGRAM, anchor, created, preserved: recorded.length - created, calendarSamples: 2, scope: "PoC records only", provider: "curated samples; no model calls" }));
}

main().catch(e => { console.error(e instanceof Error ? e.message : "PoC 준비 실패"); process.exitCode = 1; }).finally(() => db.$disconnect());
