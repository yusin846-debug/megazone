import { activeProgram } from "@/lib/programs";
import SubmitButton from "@/components/SubmitButton";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import Shell from "@/components/Shell";
import { Flash, Icon } from "@/components/ui";
import { logDiary } from "../actions";
import { fmtDur, q, type SP } from "@/lib/page";

// PoC 성공 기준: 회의 끝 → 승인까지 사람이 직접 쓰는 시간을 기존(수기) 대비 줄였는가
export default async function MetricsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requireUser();
  const program = await activeProgram(user.id);
  const meetings = await db.meeting.findMany({ where: { programId: program.id }, orderBy: { occurredAt: "desc" }, include: { metrics: true } });
  const rows = meetings.map((m) => {
    const sum = (k: string) => m.metrics.filter((x) => x.kind === k).reduce((a, b) => a + b.durationSeconds, 0);
    return { m, ai: sum("ai_wait"), human: sum("human_work"), review: sum("review_wait"), baseline: sum("baseline_manual"), diary: m.metrics.filter((x) => x.source === "diary").length };
  });
  const tasks = await db.humanTask.groupBy({ by: ["status"], where: { run: { meeting: { programId: program.id } } }, _count: true });
  const reruns = await db.stepRun.count({ where: { attempt: { gt: 1 }, run: { meeting: { programId: program.id } } } });
  const totalSteps = await db.stepRun.count({ where: { run: { meeting: { programId: program.id } } } });
  const measured = rows.filter((r) => r.human > 0);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0);
  const avgHuman = avg(measured.map((r) => r.human));
  const withBase = rows.filter((r) => r.baseline > 0 && r.human > 0);
  const saved = withBase.length ? Math.round((1 - avg(withBase.map((r) => r.human)) / avg(withBase.map((r) => r.baseline))) * 100) : null;
  const max = Math.max(1, ...rows.map((r) => Math.max(r.ai + r.human + r.review, r.baseline)));
  const answered = tasks.find((t) => t.status === "answered")?._count ?? 0;
  const open = tasks.find((t) => t.status === "open")?._count ?? 0;

  return (
    <Shell user={user} nav="metric" crumbs={["업무 시간"]}>
      <Flash error={q(sp, "error")} ok={q(sp, "ok")} />
      <div className="page-h">
        <div>
          <h1>업무 시간</h1>
          <p>회의록 작성과 검토에 걸린 시간을 확인하세요.</p>
        </div>
      </div>
      <div className="stats">
        <div className="stat hot"><div className="l">사람 작업 시간 (평균)</div><div className="v">{measured.length ? fmtDur(avgHuman) : "-"}</div><div className="c">문서 준비 → 상신, {measured.length}건</div></div>
        <div className="stat"><div className="l">기존 수기 대비</div><div className="v">{saved === null ? "-" : `${saved > 0 ? "−" : "+"}${Math.abs(saved)}`}<small>{saved === null ? "" : "%"}</small></div><div className="c">{withBase.length ? `기존 시간을 적은 ${withBase.length}건 기준` : "업무일지에 기존 시간을 적어 주세요"}</div></div>
        <div className="stat"><div className="l">사람 확인</div><div className="v">{answered}<small>/ {answered + open}건</small></div><div className="c">AI가 추측하지 않고 물어본 수</div></div>
        <div className="stat"><div className="l">자동 재실행</div><div className="v">{reruns}<small>/ {totalSteps}단계</small></div><div className="c">검증 → 해당 단계만 다시</div></div>
      </div>
      <div className="grid2">
        <div className="card" style={{ alignSelf: "start" }}>
          <div className="card-h"><h2>회의별 시간</h2></div>
          <div className="card-b">
            <div className="keyrow">
              <span><i className="s-a" />AI 대기</span>
              <span><i className="s-h" />사람 작업</span>
              <span><i className="s-r" />검토 대기</span>
              <span><i style={{ background: "var(--beige-200)", outline: "1px dashed var(--line-strong)" }} />기존 수기 시간</span>
            </div>
            <div className="bars">
              {rows.length === 0 && <p className="muted" style={{ fontSize: 13, margin: 0 }}>아직 측정한 회의가 없어요.</p>}
              {rows.map(({ m, ai, human, review, baseline }) => (
                <div key={m.id} className="bar-row">
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={m.title}>{m.title}</span>
                  <div style={{ display: "grid", gap: 3 }}>
                    <div className="stackbar">
                      <i className="s-a" style={{ width: `${(ai / max) * 100}%` }} title={`AI 대기 ${fmtDur(ai)}`} />
                      <i className="s-h" style={{ width: `${(human / max) * 100}%` }} title={`사람 작업 ${fmtDur(human)}`} />
                      <i className="s-r" style={{ width: `${(review / max) * 100}%` }} title={`검토 대기 ${fmtDur(review)}`} />
                    </div>
                    {baseline > 0 && <div className="stackbar" style={{ height: 6 }}><i style={{ width: `${(baseline / max) * 100}%`, background: "var(--line-strong)" }} /></div>}
                  </div>
                  <span className="mono" style={{ textAlign: "right" }}>{fmtDur(ai + human + review)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="stack">
          <form action={logDiary} className="card">
            <div className="card-h"><h2>업무일지 기록</h2></div>
            <div className="card-b" style={{ display: "grid", gap: 8 }}>
              <select className="eg-select" name="meetingId" required>
                {rows.map(({ m }) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
              <div className="fg-row" style={{ gap: 8 }}>
                <select className="eg-select" name="kind">
                  <option value="human_work">이 도구로 작업한 시간</option>
                  <option value="baseline_manual">기존 방식(수기)이었다면 걸렸을 시간</option>
                </select>
                <input className="eg-input" name="minutes" type="number" min={1} max={1439} placeholder="분" required />
              </div>
              <SubmitButton pendingLabel="기록 중…" className="eg-btn eg-btn--ink eg-btn--sm" style={{ justifySelf: "end" }}><Icon id="i-clock" />기록</SubmitButton>
            </div>
          </form>
          <div className="callout b">
            <Icon id="i-help" />
            <div>
              자동 측정: AI 대기(실행 시작 → 끝), 사람 작업(문서 준비 → 상신), 검토 대기(상신 → 승인). 회의 중 시간이나 화면 밖에서 한 일은 업무일지로 채워요.
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
