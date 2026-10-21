import SubmitButton from "@/components/SubmitButton";
import Link from "@/components/NavigationLink";
import { db, parse } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import Shell, { MeetingTabs } from "@/components/Shell";
import NoContent from "@/components/NoContent";
import Paper from "@/components/Paper";
import { DocBadge, Flash, Icon } from "@/components/ui";
import { latestDocumentVersion, latestTranscript, templateRules } from "@/lib/state";
import { blockersFor } from "@/lib/review";
import { fmtMs, type ComposeOutput } from "@/lib/agents/types";
import { STEP_LABEL, type StepKey } from "@/lib/orchestrator/steps";
import { submitDoc } from "../../../actions";
import { meetingFor, q, type IdParams, type SP } from "@/lib/page";

export default async function DocumentPage({ params, searchParams }: { params: IdParams; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const { meeting, roles, readable } = await meetingFor(id, user.id);
  const crumbs: (string | [string, string])[] = [["회의", "/meetings"], [meeting.title, `/meetings/${id}/run`], "문서"];
  if (!readable) return <Shell user={user} nav="home" crumbs={crumbs}><MeetingTabs id={id} on="document" /><NoContent /></Shell>;

  const latest = await latestDocumentVersion(id);
  const versions = await db.documentVersion.findMany({ where: { document: { meetingId: id } }, orderBy: { version: "desc" }, select: { id: true, version: true, status: true, createdAt: true } });
  const vParam = Number(q(sp, "v"));
  const dv = vParam && vParam !== latest?.version ? await db.documentVersion.findFirst({ where: { document: { meetingId: id }, version: vParam }, include: { templateVersion: { include: { template: true } } } }) : latest;
  const tv = await latestTranscript(id);
  const segTime = new Map(tv?.segments.map((s) => [s.segKey, fmtMs(s.startMs)]) ?? []);
  const tpl = dv ? await templateRules(dv.templateVersionId) : null;
  const doc = dv ? parse<ComposeOutput>(dv.contentJson, { sections: [], unplaced: [] }) : null;

  const lastRun = await db.run.findFirst({ where: { meetingId: id }, orderBy: { createdAt: "desc" } });
  const verify = lastRun ? await db.stepRun.findFirst({ where: { runId: lastRun.id, stepKey: "verify" }, orderBy: { attempt: "desc" }, include: { findings: true } }) : null;
  const blockers = await blockersFor(id);
  const isLatest = dv?.id === latest?.id;
  const canSubmit = roles.includes("writer") && isLatest && (dv?.status === "draft" || dv?.status === "changes_requested");
  const openReq = latest?.reviewRequests.find((r) => r.status === "open");

  return (
    <Shell
      user={user}
      nav="home"
      crumbs={crumbs}
      right={dv && <DocBadge status={dv.status} version={dv.version} />}
      footer={
        dv && isLatest ? (
          <div className="reviewbar">
            <div className="msg">
              {dv.status === "approved" ? (
                <><Icon id="i-lock" />승인된 문서는 바꿀 수 없어요. 고치려면 새 버전을 만들어요.</>
              ) : dv.status === "in_review" ? (
                <><Icon id="i-send" />검토 중이에요. <Link href={`/meetings/${id}/review`}>검토·결재 보기</Link></>
              ) : blockers.length ? (
                <><Icon id="i-alert" />{blockers.join(" · ")}</>
              ) : (
                <><Icon id="i-check" />상신할 수 있어요. 상신 후에는 검토자 → 결재자 순서로 진행돼요.</>
              )}
            </div>
            <span className="sp" />
            {dv.artifactPath && <a className="eg-btn eg-btn--secondary eg-btn--sm" href={`/api/docx/${dv.id}`}><Icon id="i-doc" />docx 내려받기</a>}
            {canSubmit && (
              <form action={submitDoc}>
                <input type="hidden" name="docVersionId" value={dv.id} />
                <input type="hidden" name="meetingId" value={id} />
                <SubmitButton pendingLabel="상신 중…" className="eg-btn eg-btn--primary eg-btn--sm" disabled={blockers.length > 0}><Icon id="i-send" />상신</SubmitButton>
              </form>
            )}
          </div>
        ) : null
      }
    >
      <Flash error={q(sp, "error")} ok={q(sp, "ok")} />
      <MeetingTabs id={id} on="document" />
      {!dv || !tpl || !doc ? (
        <div className="card">
          <div className="empty">
            <svg><use href="#egg" /></svg>
            <h3>아직 문서가 없어요</h3>
            <p>AI 실행이 문서 구성 단계까지 끝나면 초안이 생겨요.</p>
            <Link href={`/meetings/${id}/run`} className="eg-btn eg-btn--secondary">실행 상태 보기</Link>
          </div>
        </div>
      ) : (
        <div className="grid2">
          <div style={{ minWidth: 0, overflowX: "auto" }}>
            {!isLatest && <div className="callout y flash"><Icon id="i-clock" /><div>예전 버전(v{dv.version})을 보고 있어요. <Link href={`/meetings/${id}/document`}>최신 버전으로</Link></div></div>}
            <Paper
              title={`${meeting.title} 회의록`}
              sub={`${tpl.name} v${tpl.version} · 문서 v${dv.version}`}
              tpl={tpl}
              doc={doc}
              segTime={segTime}
            />
          </div>
          <div className="stack">
            <div className="card">
              <div className="card-h"><h2>검증 결과</h2><span className="r muted" style={{ fontSize: 12 }}>{lastRun ? `${STEP_LABEL[lastRun.startStep as StepKey]}부터 실행` : ""}</span></div>
              <div className="card-b" style={{ paddingTop: 4, paddingBottom: 4 }}>
                {!verify?.findings.length ? (
                  <ul className="vlist"><li><span className="vdot ok"><Icon id="i-check" /></span><div><b>문제 없음</b><small>근거·누락·서식 검사를 통과했어요</small></div><span /></li></ul>
                ) : (
                  <ul className="vlist">
                    {verify.findings.map((f) => (
                      <li key={f.id}>
                        <span className={`vdot ${f.routeTo === "human" ? "qq" : f.resolution === "auto_rerun" ? "ok" : "fix"}`}><Icon id={f.routeTo === "human" ? "i-help" : f.resolution === "auto_rerun" ? "i-refresh" : "i-alert"} /></span>
                        <div><b>{f.message}</b><small className="mono">{f.type} · {f.target}</small></div>
                        <span className="muted" style={{ fontSize: 11.5 }}>{f.resolution === "auto_rerun" ? "자동 수정" : f.resolution === "human_task" ? "확인 요청" : ""}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            {doc.unplaced.length > 0 && (
              <div className="callout y"><Icon id="i-alert" /><div><b>템플릿에 못 넣은 내용</b>{doc.unplaced.map((u) => <div key={u.ref} className="mono">{u.ref} · {u.reason}</div>)}</div></div>
            )}
            {openReq && <div className="callout b"><Icon id="i-send" /><div>검토 요청이 열려 있어요. <Link href={`/meetings/${id}/review`}>검토·결재로</Link></div></div>}
            <div className="card">
              <div className="card-h"><h2>버전</h2></div>
              <div className="card-b" style={{ paddingTop: 6, paddingBottom: 6 }}>
                <ul className="log">
                  {versions.map((v) => (
                    <li key={v.id}>
                      <span className="t">v{v.version}</span>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <Link href={`/meetings/${id}/document?v=${v.version}`} style={{ color: "inherit", fontWeight: v.id === dv.id ? 700 : 500 }}>{v.createdAt.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" }).slice(5, 16)}</Link>
                        <DocBadge status={v.status} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="eg-help">노란 형광펜은 회의 중 바뀐 아이디어, 테두리는 미정 값이에요. 내용을 고치려면 작업실에서 항목을 고치세요. 고친 값은 고정되고 문서가 새 버전으로 다시 만들어져요.</p>
          </div>
        </div>
      )}
    </Shell>
  );
}
