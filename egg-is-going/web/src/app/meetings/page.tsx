import { activeProgram } from "@/lib/programs";
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
  const program = await activeProgram(user.id);
  const term = (q(sp, "q") ?? "").trim().slice(0, 100);
  const status = q(sp, "status") ?? "";
  const writer = user.memberships.some(m => m.programId === program.id && m.role === "writer");
  const [meetings, openTasks, inReview, approved, total, running] = await Promise.all([db.meeting.findMany({
    where: { programId: program.id, ...(term ? { OR: [
      { title: { contains: term, mode: "insensitive" as const } },
      { items: { some: { title: { contains: term, mode: "insensitive" as const } } } },
      { actionItems: { some: { active: true, description: { contains: term, mode: "insensitive" as const } } } },
    ] } : {}) },
    orderBy: { occurredAt: "desc" },
    include: {
      participants: true,
      runs: { orderBy: { createdAt: "desc" }, take: 1, include: { steps: true, humanTasks: { where: { status: "open" } } } },
      documents: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } },
    },
  }),
    db.humanTask.count({ where: { status: "open", required: true, run: { meeting: { programId: program.id } } } }),
    db.documentVersion.count({ where: { status: "in_review", document: { meeting: { programId: program.id } } } }),
    db.documentVersion.count({ where: { status: "approved", document: { meeting: { programId: program.id } } } }),
    db.meeting.count({ where: { programId: program.id } }),
    db.meeting.count({ where: { programId: program.id, runs: { some: { status: { in: ["queued", "running"] } } } } }),
  ]);

  const filtered = meetings.filter(m => !status || m.runs[0]?.status === status);

  return (
    <Shell user={user} nav="home" crumbs={["회의"]} right={writer && <Link href="/meetings/new" className="eg-btn eg-btn--primary eg-btn--sm"><Icon id="i-plus" />회의 등록</Link>}>
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
        <div className="stat"><div className="l">AI 실행 중</div><div className="v">{running}<small>건</small></div><div className="c">전체 회의 {total}건</div></div>
        <div className="stat"><div className="l">검토 중</div><div className="v">{inReview}<small>건</small></div><div className="c">검토자·결재자 차례</div></div>
        <div className="stat"><div className="l">승인된 문서</div><div className="v">{approved}<small>건</small></div><div className="c">승인본은 바꿀 수 없어요</div></div>
      </div>
      <form action="/meetings" role="search" className="search-toolbar">
        <label htmlFor="meeting-q" className="sr-only">회의·결정·업무 검색</label><input id="meeting-q" className="eg-input" type="search" name="q" defaultValue={term} maxLength={100} placeholder="회의 제목·안건·업무 검색"/>
        <label htmlFor="meeting-status" className="sr-only">실행 상태</label><select id="meeting-status" className="eg-select" name="status" defaultValue={status}><option value="">전체 실행 상태</option><option value="running">실행 중</option><option value="waiting_for_human">사람 확인 대기</option><option value="succeeded">완료</option><option value="failed">실패</option><option value="cancelled">취소됨</option><option value="queued">대기</option></select>
        <button className="eg-btn eg-btn--ink">검색</button>{term || status ? <Link href="/meetings" className="eg-btn eg-btn--ghost">초기화</Link> : null}
      </form><p className="eg-help" role="status">{term ? `“${term}” 검색 · ` : ""}{filtered.length}개 회의{term ? " · 회의 제목, 안건과 업무 설명에서 찾아요" : ""}</p>
      <div className="card">
        {filtered.length === 0 ? (
          <div className="empty">
            <svg><use href="#egg" /></svg>
            <h3>{term || status ? "검색 결과가 없어요" : "아직 등록한 회의가 없어요"}</h3>
            <p>{term || status ? "다른 검색어를 입력하거나 필터를 초기화해 주세요." : "샘플 회의로 시작해 볼 수 있어요."}</p>
            {writer && <Link href="/meetings/new" className="eg-btn eg-btn--secondary"><Icon id="i-plus" />회의 등록</Link>}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="tb">
              <thead>
                <tr><th>회의</th><th>AI 단계</th><th>실행</th><th>문서</th><th>확인</th></tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
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
