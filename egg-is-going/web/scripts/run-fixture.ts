// 가상 회의 하나를 화면 없이 끝까지 돌려 본다.
//   npm run run:fixture 01_opening            회의 등록 → 실행 → 결과 출력
//   npm run run:fixture 01_opening -- --answer 필수 확인에 기본값으로 답하고 이어서 실행
import "./lib/env";
import { db } from "@/lib/db";
import { createMeeting, readFixture } from "@/lib/meetings";
import { executor } from "@/lib/orchestrator/adapter";
import { submitHumanResponse } from "@/lib/orchestrator/human";
import { STEP_LABEL, type StepKey } from "@/lib/orchestrator/steps";

const key = process.argv[2] ?? "01_opening";
const answer = process.argv.includes("--answer");

async function waitRun(runId: string) {
  for (;;) {
    const r = await db.run.findUniqueOrThrow({ where: { id: runId } });
    if (!["queued", "running"].includes(r.status)) return r;
    await new Promise((res) => setTimeout(res, 200));
  }
}

async function report(runId: string) {
  const r = await waitRun(runId);
  const steps = await db.stepRun.findMany({ where: { runId }, orderBy: { startedAt: "asc" }, include: { findings: true } });
  console.log(`\n실행 ${runId.slice(0, 8)} · ${r.status}${r.error ? ` · ${r.error}` : ""} · 시작 단계 ${r.startStep}`);
  for (const s of steps) {
    console.log(`  ${s.status === "succeeded" ? "✓" : "✗"} ${STEP_LABEL[s.stepKey as StepKey]} #${s.attempt}  ${s.note ?? s.error ?? ""}`);
    for (const f of s.findings) console.log(`      - [${f.type}/${f.severity}→${f.routeTo}] ${f.message} (${f.resolution ?? ""})`);
  }
  const tasks = await db.humanTask.findMany({ where: { runId, status: "open" } });
  for (const t of tasks) console.log(`  ? ${t.required ? "[필수]" : "[선택]"} ${t.question}  (${t.target})`);
  return { r, tasks };
}

(async () => {
  const lee = await db.user.findFirstOrThrow({ where: { name: "이혜연" } });
  const program = await db.program.findFirstOrThrow();
  const tv = await db.templateVersion.findFirstOrThrow({ where: { template: { programId: program.id }, status: "approved" }, orderBy: { version: "desc" } });
  const fx = readFixture(key);
  const users = await db.user.findMany({ where: { name: { in: fx.meta.participants } } });
  const m = await createMeeting(lee.id, {
    programId: program.id, title: fx.meta.title, occurredAt: new Date(fx.meta.occurredAt), templateVersionId: tv.id,
    transcript: fx.transcript, participantUserIds: users.map((u) => u.id), externalNames: [], fixtureKey: key,
  });
  console.log(`회의 등록: ${m.title} (${m.id.slice(0, 8)}) · provider=${process.env.AGENT_PROVIDER ?? "mock"}`);
  const { runId } = await executor.startRun(m.id, { reason: "CLI" });
  let { tasks } = await report(runId);

  if (answer) {
    for (const t of tasks.filter((x) => x.required)) {
      const choice = t.kind === "item_status" ? "on_hold" : t.kind === "speaker" ? "set" : "ack";
      const res = await submitHumanResponse(t.id, { choice, participantId: null }, lee.id);
      console.log(`\n→ 응답: ${t.question} = ${choice}`);
      if (res) ({ tasks } = await report(res.runId));
    }
  }
  const dv = await db.documentVersion.findFirst({ where: { document: { meetingId: m.id } }, orderBy: { version: "desc" } });
  if (dv) {
    const doc = JSON.parse(dv.contentJson) as { sections: { label: string; blocks: { text: string | null; cells: string[] | null }[] }[] };
    console.log(`\n문서 v${dv.version} (${dv.status}) ${dv.artifactPath ?? ""}`);
    for (const s of doc.sections) {
      console.log(`  ■ ${s.label}`);
      for (const b of s.blocks) console.log(`    - ${b.text ?? b.cells?.join(" | ")}`);
    }
  }
  await db.$disconnect();
})();
