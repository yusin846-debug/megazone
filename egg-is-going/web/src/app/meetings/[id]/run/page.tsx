import SubmitButton from "@/components/SubmitButton";
import Link from "@/components/NavigationLink";
import { db, parse } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import Shell, { MeetingTabs } from "@/components/Shell";
import AutoRefresh from "@/components/AutoRefresh";
import { Flash, Icon, RunChip, STEP_ICON } from "@/components/ui";
import { STEPS, STEP_LABEL, type StepKey } from "@/lib/orchestrator/steps";
import { cancelRun, rerunFrom } from "../../../actions";
import { ago, fmtDur, meetingFor, q, type IdParams, type SP } from "@/lib/page";

const TOOL: StepKey[] = ["transcript", "render"];

export default async function RunPage({ params, searchParams }: { params: IdParams; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const { meeting, roles, readable } = await meetingFor(id, user.id);
  const runs = await db.run.findMany({ where: { meetingId: id }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, startStep: true, createdAt: true, cancelRequested: true, inputManifestJson: true } });
  const runId = q(sp, "run") ?? runs[0]?.id;
  const run = runId
    ? await db.run.findFirst({
        where: { id: runId, meetingId: id },
        include: { steps: { orderBy: [{ startedAt: "asc" }, { attempt: "asc" }], include: { findings: true, artifacts: { select: { type: true, contentJson: true } } } }, humanTasks: { orderBy: { createdAt: "asc" } } },
      })
    : null;
  const active = !!run && ["queued", "running"].includes(run.status);
  const canRun = roles.includes("writer") || roles.includes("operator");
  const manifest = parse<Record<string, unknown>>(run?.inputManifestJson, {});
  const startIdx = run ? STEPS.indexOf(run.startStep as StepKey) : 0;

  const lastOf = (k: StepKey) => run?.steps.filter((s) => s.stepKey === k).at(-1);
  const verify = lastOf("verify");
  const verdict = parse<{ verdict?: string }>(verify?.artifacts.find((a) => a.type === "agent_output")?.contentJson, {}).verdict;
  const openTasks = run?.humanTasks.filter((t) => t.status === "open") ?? [];
  const autoReruns = run?.steps.filter((s) => s.attempt > 1).length ?? 0;
  const elapsed = run ? Math.round(((run.finishedAt ?? new Date()).getTime() - run.createdAt.getTime()) / 1000) : 0;

  return (
    <Shell
      programId={meeting.programId}
      user={user}
      nav="home"
      crumbs={[["회의", "/meetings"], meeting.title]}
      right={run && <RunChip status={run.status} cancelRequested={run.cancelRequested} />}
    >
      <AutoRefresh active={active} />
      <Flash error={q(sp, "error")} ok={q(sp, "ok")} />
      <MeetingTabs id={id} on="run" />
      <div className="page-h">
        <div>
          <h1>AI 실행 상태</h1>
          <p>
            {run ? (
              <>
                {STEP_LABEL[run.startStep as StepKey]}부터 시작 · {fmtDur(elapsed)} · 자동 재실행 {autoReruns}회 · {String(manifest.provider ?? run.provider) === "mock" ? "샘플 분석" : "AI 분석"}
              </>
            ) : (
              "아직 실행한 적이 없어요."
            )}
          </p>
        </div>
        <div className="act">
          {active && canRun && (
            <form action={cancelRun}>
              <input type="hidden" name="runId" value={run!.id} />
              <SubmitButton pendingLabel="취소 요청 중…" className="eg-btn eg-btn--ghost eg-btn--sm" disabled={run!.cancelRequested}><Icon id="i-x" />실행 취소</SubmitButton>
            </form>
          )}
          {!active && canRun && (
            <form action={rerunFrom}>
              <input type="hidden" name="meetingId" value={id} />
              <input type="hidden" name="step" value="transcript" />
              <SubmitButton pendingLabel="실행 준비 중…" className="eg-btn eg-btn--secondary eg-btn--sm"><Icon id="i-refresh" />처음부터 다시</SubmitButton>
            </form>
          )}
        </div>
      </div>

      {run?.error && (
        <div className="callout r flash"><Icon id="i-alert" /><div><b>회의록 정리가 멈췄어요.</b> 문제가 생긴 단계부터 다시 실행해 주세요. {roles.includes("operator") && <details className="raw"><summary>진단 정보</summary><pre>{run.error}</pre></details>}</div></div>
      )}

      <div className="board">
        {STEPS.map((k, i) => {
          const s = lastOf(k);
          const attempts = run?.steps.filter((x) => x.stepKey === k).length ?? 0;
          const reused = run && i < startIdx;
          const human = k === "verify" && run?.status === "waiting_for_human";
          const cls = s?.status === "running" ? "is-run" : s?.status === "failed" ? "is-fail" : human ? "is-human" : s?.status === "succeeded" || reused ? "is-pass" : "";
          return (
            <div key={k} className={`eg-step ${cls}${TOOL.includes(k) ? " is-tool" : ""}`}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="eg-step__icon"><Icon id={STEP_ICON[k]} /></span>
                {attempts > 1 && <span className="eg-chip eg-chip--fix" title="자동 재실행">#{attempts}</span>}
              </div>
              <div>
                <div className="eg-step__name">{STEP_LABEL[k]}</div>
                <div className="eg-step__meta">
                  {reused ? "이전 실행 결과 사용" : s ? s.status === "failed" ? "문제가 생겼어요. 다시 실행해 주세요." : s.status === "running" ? "정리 중…" : s.status === "succeeded" ? (human ? `확인 질문 ${openTasks.length}건` : k === "verify" ? (verdict === "pass" ? "검증 통과" : "검증 결과 확인") : s.note?.replace(/^docx · /, "") ?? "완료") : "대기" : active ? "대기" : "-"}
                  {TOOL.includes(k) && <><br /><span className="muted">{k === "transcript" ? "녹취록 읽기" : "문서 파일 만들기"}</span></>}
                </div>
              </div>
              {!active && canRun && run && (
                <form action={rerunFrom}>
                  <input type="hidden" name="meetingId" value={id} />
                  <input type="hidden" name="step" value={k} />
                  <SubmitButton pendingLabel="실행 준비 중…" className="eg-btn eg-btn--ghost eg-btn--sm" style={{ width: "100%" }} title={`${STEP_LABEL[k]}부터 다시 실행`}><Icon id="i-refresh" />여기부터</SubmitButton>
                </form>
              )}
            </div>
          );
        })}
      </div>

      <div className="branch">
        <div className={`br${verdict === "pass" && run?.status === "succeeded" ? " on ok" : ""}`}>
          <b><Icon id="i-check" />통과</b>
          {run?.status === "succeeded" ? "초안을 확인하고 상신해 주세요." : "초안 검토 대기"}
        </div>
        <div className={`br${autoReruns > 0 ? " on" : ""}`}>
          <b><Icon id="i-refresh" />자동 수정</b>
          {autoReruns ? `문제를 발견해 ${autoReruns}회 다시 정리했어요.` : "다시 정리한 항목이 없어요."}
        </div>
        <div className={`br${openTasks.length ? " on" : ""}`}>
          <b><Icon id="i-help" />사람 확인</b>
          {openTasks.length ? `확인 요청 ${openTasks.length}건 (필수 ${openTasks.filter((t) => t.required).length})` : "확인할 질문이 없어요."}
        </div>
      </div>

      <div className="grid2" style={{ marginTop: 16 }}>
        <div className="stack">
          {readable && openTasks.length > 0 && (
            <div className="card">
              <div className="card-h"><h2>확인 요청</h2><span className="r"><Link href={`/tasks?meeting=${id}`} className="eg-btn eg-btn--ghost eg-btn--sm">모두 보기</Link></span></div>
              {openTasks.map((t) => (
                <Link key={t.id} href={`/tasks?id=${t.id}`} className="tq">
                  <span className={`eg-chip ${t.required ? "eg-chip--human" : "eg-chip--plain"}`}>{t.required ? "필수" : "선택"}</span>
                  <b>{t.question}</b>

                </Link>
              ))}
            </div>
          )}
          <div className="card">
            <div className="card-h"><h2>실행 기록</h2></div>
            <div className="card-b">
              {run?.steps.length ? (
                <ul className="log">
                  {run.steps.map((s) => (
                    <li key={s.id}>
                      <span className="t">{s.startedAt.toLocaleTimeString("sv-SE", { timeZone: "Asia/Seoul" })}</span>
                      <div>
                        <b>{STEP_LABEL[s.stepKey as StepKey]}</b>
                        {s.attempt > 1 && <span className="muted"> · 재실행 #{s.attempt}</span>}
                        <span className="muted"> · {s.status === "succeeded" ? "완료" : s.status === "failed" ? "실패" : "진행 중"}</span>
                        {roles.includes("operator") && (s.note || s.error) && <details className="raw"><summary>진단 정보</summary><pre>{s.error ?? s.note}</pre></details>}
                        {(readable ? s.findings : []).map((f) => (
                          <div key={f.id} style={{ fontSize: 12, marginTop: 4 }}>
                            <span className={`eg-chip ${f.routeTo === "human" ? "eg-chip--human" : "eg-chip--fix"}`} style={{ height: 20 }}>{f.routeTo === "human" ? "사람" : `→ ${STEP_LABEL[f.routeTo as StepKey] ?? f.routeTo}`}</span>{" "}
                            {f.message}
                          </div>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted" style={{ margin: 0, fontSize: 13 }}>{active ? "곧 시작해요…" : "기록이 없어요."}</p>
              )}
            </div>
          </div>
        </div>
        <div className="stack">
          <div className="card">
            <div className="card-h"><h2>분석 정보</h2></div>
            <div className="card-b">
              <details className="raw"><summary>실행 상세 정보</summary><dl className="meta-grid">
                {Object.entries(manifest).map(([k, v]) => (
                  <span key={k} style={{ display: "contents" }}><dt>{k}</dt><dd>{String(v ?? "-")}</dd></span>
                ))}
              </dl></details>
            </div>
          </div>
          <div className="card">
            <div className="card-h"><h2>실행 이력</h2></div>
            <div className="card-b" style={{ paddingTop: 6, paddingBottom: 6 }}>
              <ul className="log">
                {runs.map((r) => (
                  <li key={r.id}>
                    <span className="t">{ago(r.createdAt)}</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <Link href={`/meetings/${id}/run?run=${r.id}`} style={{ fontWeight: r.id === run?.id ? 700 : 500, color: "inherit" }}>
                        {STEP_LABEL[r.startStep as StepKey]}부터
                      </Link>
                      <RunChip status={r.status} cancelRequested={r.cancelRequested} />
                      <span className="muted" style={{ fontSize: 12 }}>{String(parse<{ reason?: string }>(r.inputManifestJson, {}).reason ?? "")}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}
