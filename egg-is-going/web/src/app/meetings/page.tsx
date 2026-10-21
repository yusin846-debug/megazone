import Link from "@/components/NavigationLink";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import Shell from "@/components/Shell";
import AutoRefresh from "@/components/AutoRefresh";
import { DocBadge, Flash, Icon, RunChip } from "@/components/ui";
import { STEPS } from "@/lib/orchestrator/steps";
import { fmtKst } from "@/lib/state";
import { q, type SP } from "@/lib/page";

export default async function MeetingsPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requireUser();
  const [meetings, openTasks, inReview, approved] = await Promise.all([db.meeting.findMany({
    orderBy: { occurredAt: "desc" },
    include: {
      participants: true,
      runs: { orderBy: { createdAt: "desc" }, take: 1, include: { steps: true, humanTasks: { where: { status: "open" } } } },
      documents: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } },
    },
  }),
    db.humanTask.count({ where: { status: "open", required: true } }),
    db.documentVersion.count({ where: { status: "in_review" } }),
    db.documentVersion.count({ where: { status: "approved" } }),
  ]);
  const running = meetings.filter((m) => ["queued", "running"].includes(m.runs[0]?.status ?? "")).length;

  return (
    <Shell user={user} nav="home" crumbs={["회의"]} right={<Link href="/meetings/new" className="eg-btn eg-btn--primary eg-btn--sm"><Icon id="i-plus" />회의 등록</Link>}>
      <AutoRefresh active={running > 0} />
      <Flash error={q(sp, "error")} ok={q(sp, "ok")} />
      <div className="page-h">
        <div>
          <h1>제작회의</h1>
          <p>녹취록을 올리면 AI가 결정·업무를 정리하고, 애매한 건 사람에게 물어봐요.</p>
        </div>
      </div>
      <div className="stats">
        <div className={`stat${openTasks ? " hot" : ""}`}><div className="l">필수 확인 대기</div><div className="v">{openTasks}<small>건</small></div><div className="c">답하면 이어서 실행돼요</div></div>
        <div className="stat"><div className="l">AI 실행 중</div><div className="v">{running}<small>건</small></div><div className="c">전체 회의 {meetings.length}건</div></div>
        <div className="stat"><div className="l">검토 중</div><div className="v">{inReview}<small>건</small></div><div className="c">검토자·결재자 차례</div></div>
        <div className="stat"><div className="l">승인된 문서</div><div className="v">{approved}<small>건</small></div><div className="c">승인본은 바꿀 수 없어요</div></div>
      </div>
      <div className="card">
        {meetings.length === 0 ? (
          <div className="empty">
            <svg><use href="#egg" /></svg>
            <h3>아직 등록한 회의가 없어요</h3>
            <p>가상 회의 샘플로 바로 시작해 볼 수 있어요.</p>
            <Link href="/meetings/new" className="eg-btn eg-btn--primary"><Icon id="i-plus" />회의 등록</Link>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tb">
              <thead>
                <tr><th>회의</th><th>AI 단계</th><th>실행</th><th>문서</th><th>확인</th></tr>
              </thead>
              <tbody>
                {meetings.map((m) => {
                  const run = m.runs[0];
                  const dv = m.documents[0]?.versions[0];
                  const done = new Set(run?.steps.filter((s) => s.status === "succeeded").map((s) => s.stepKey));
                  const cur = run?.steps.filter((s) => s.status === "running").map((s) => s.stepKey);
                  const failed = run?.steps.filter((s) => s.status === "failed").map((s) => s.stepKey);
                  const startIdx = run ? STEPS.indexOf(run.startStep as (typeof STEPS)[number]) : 0;
                  return (
                    <tr key={m.id}>
                      <td className="tt">
                        <Link href={`/meetings/${m.id}/${run?.status === "waiting_for_human" ? "run" : dv ? "document" : "run"}`}>
                          <b>{m.title}</b>
                        </Link>
                        <small>{fmtKst(m.occurredAt)} · 참석 {m.participants.length}명</small>
                      </td>
                      <td>
                        <div className="dots" title="전사 → 맥락 → 결정 → 구성 → 출력 → 검증">
                          {STEPS.map((s, i) => (
                            <i key={s} className={failed?.includes(s) ? "f" : cur?.includes(s) ? "run" : done.has(s) || (run && i < startIdx) ? "ok" : run?.status === "waiting_for_human" && s === "verify" ? "h" : ""} />
                          ))}
                        </div>
                      </td>
                      <td>{run ? <RunChip status={run.status} cancelRequested={run.cancelRequested} /> : <span className="muted">-</span>}</td>
                      <td>{dv ? <DocBadge status={dv.status} version={dv.version} /> : <span className="muted">-</span>}</td>
                      <td>
                        {run?.humanTasks.length ? (
                          <Link href={`/tasks?meeting=${m.id}`} className="eg-chip eg-chip--human">{run.humanTasks.length}건</Link>
                        ) : (
                          <span className="muted">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Shell>
  );
}
