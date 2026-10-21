import SubmitButton from "@/components/SubmitButton";
import Link from "@/components/NavigationLink";
import { db, parse } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import Shell, { MeetingTabs } from "@/components/Shell";
import NoContent from "@/components/NoContent";
import Paper from "@/components/Paper";
import { DocBadge, Flash, Icon } from "@/components/ui";
import { latestDocumentVersion, latestTranscript, templateRules } from "@/lib/state";
import { blockersFor, type PolicyStep } from "@/lib/review";
import { fmtMs, type ComposeOutput } from "@/lib/agents/types";
import { actOnReview } from "../../../actions";
import { ago, meetingFor, q, type IdParams, type SP } from "@/lib/page";

const ACTION_LABEL: Record<string, string> = { submit: "상신", comment: "의견", forward: "다음 단계 전달", request_changes: "변경 요청", approve: "승인" };

export default async function ReviewPage({ params, searchParams }: { params: IdParams; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const { meeting, readable } = await meetingFor(id, user.id);
  const crumbs: (string | [string, string])[] = [["회의", "/meetings"], [meeting.title, `/meetings/${id}/run`], "검토·결재"];
  if (!readable) return <Shell user={user} nav="review" crumbs={crumbs}><MeetingTabs id={id} on="review" /><NoContent /></Shell>;

  const dv = await latestDocumentVersion(id);
  const req = dv?.reviewRequests[0] ?? null;
  const prev = dv ? await db.documentVersion.findFirst({ where: { documentId: dv.documentId, version: { lt: dv.version }, status: { not: "draft" } }, orderBy: { version: "desc" } })
    ?? await db.documentVersion.findFirst({ where: { documentId: dv.documentId, version: { lt: dv.version } }, orderBy: { version: "desc" } }) : null;
  const tv = await latestTranscript(id);
  const segTime = new Map(tv?.segments.map((s) => [s.segKey, fmtMs(s.startMs)]) ?? []);
  const tpl = dv ? await templateRules(dv.templateVersionId) : null;
  const doc = dv ? parse<ComposeOutput>(dv.contentJson, { sections: [], unplaced: [] }) : null;
  const prevDoc = prev ? parse<ComposeOutput>(prev.contentJson, { sections: [], unplaced: [] }) : null;
  const policy = req ? parse<PolicyStep[]>(req.policySnapshotJson, []) : [];
  const step = req && req.status === "open" ? policy[req.currentStep] : null;
  const myTurn = !!step && step.userIds.includes(user.id);
  const blockers = await blockersFor(id);
  const actors = new Map((await db.user.findMany({ where: { id: { in: req?.actions.map((a) => a.actorId) ?? [] } } })).map((u) => [u.id, u]));
  // 이전 검토 요청(변경 요청으로 끝난 것 포함)의 의견도 함께 보여 준다
  const history = dv ? await db.reviewAction.findMany({ where: { reviewRequest: { documentVersion: { documentId: dv.documentId } } }, orderBy: { createdAt: "asc" }, include: { reviewRequest: { include: { documentVersion: { select: { version: true } } } } } }) : [];
  for (const a of history) if (!actors.has(a.actorId)) { const u = await db.user.findUnique({ where: { id: a.actorId } }); if (u) actors.set(u.id, u); }

  return (
    <Shell user={user} nav="review" crumbs={crumbs} right={dv && <DocBadge status={dv.status} version={dv.version} />}>
      <Flash error={q(sp, "error")} ok={q(sp, "ok")} />
      <MeetingTabs id={id} on="review" />
      {!dv || !tpl || !doc ? (
        <div className="card"><div className="empty"><svg><use href="#egg" /></svg><h3>검토할 문서가 없어요</h3><p>문서 초안이 생기면 상신할 수 있어요.</p></div></div>
      ) : !req ? (
        <div className="card">
          <div className="empty">
            <svg><use href="#egg" /></svg>
            <h3>아직 상신하지 않았어요</h3>
            <p>문서 탭에서 초안을 확인하고 상신해 주세요.</p>
            <Link href={`/meetings/${id}/document`} className="eg-btn eg-btn--primary"><Icon id="i-doc" />문서 보기</Link>
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-b" style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
              <b style={{ fontSize: 13 }}>결재 경로</b>
              <div className="policy">
                <span className="pp done"><Icon id="i-check" />상신</span>
                {policy.map((p, i) => {
                  const done = req.currentStep > i || req.status === "approved";
                  const cur = req.status === "open" && req.currentStep === i;
                  return (
                    <span key={i} style={{ display: "contents" }}>
                      <span className="ar">→</span>
                      <span className={`pp${done ? " done" : cur ? " cur" : ""}`}>{done && <Icon id="i-check" />}{p.role === "reviewer" ? "검토" : "결재"} · {p.names.join("·")}</span>
                    </span>
                  );
                })}
              </div>
              <span style={{ marginLeft: "auto", fontSize: 12.5 }} className="muted">
                {req.status === "open" ? (myTurn ? "지금 내 차례예요" : `${step?.names.join("·")}님 차례`) : req.status === "approved" ? "승인 완료" : req.status === "changes_requested" ? "변경 요청됨 · 고친 뒤 다시 상신해요" : "새 버전이 나와서 닫혔어요"}
              </span>
            </div>
          </div>
          <div className="grid2">
            <div style={{ minWidth: 0, overflowX: "auto" }}>
              {prev && (
                <div className="keyrow">
                  <span><i style={{ background: "var(--sage-500)" }} />v{prev.version} 대비 새로 생긴 줄</span>
                  <span><i style={{ background: "var(--tomato-500)" }} />빠진 줄</span>
                </div>
              )}
              <Paper title={`${meeting.title} 회의록`} sub={`${tpl.name} v${tpl.version} · 문서 v${dv.version}${prev ? ` (v${prev.version}과 비교)` : ""}`} tpl={tpl} doc={doc} segTime={segTime} prev={prevDoc} />
            </div>
            <div className="stack">
              {req.status === "open" && (
                <form action={actOnReview} className="card">
                  <div className="card-h"><h2>{myTurn ? (step?.role === "reviewer" ? "검토하기" : "결재하기") : "의견 남기기"}</h2></div>
                  <div className="card-b" style={{ display: "grid", gap: 10 }}>
                    <input type="hidden" name="reviewRequestId" value={req.id} />
                    <input type="hidden" name="meetingId" value={id} />
                    <textarea className="eg-textarea" name="comment" rows={3} placeholder="의견 (변경 요청에는 꼭 적어 주세요)" />
                    {myTurn && step?.role === "approver" && blockers.length > 0 && <div className="callout r"><Icon id="i-alert" /><div>{blockers.join(" · ")}</div></div>}
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      <SubmitButton pendingLabel="의견 저장 중…" name="action" value="comment" className="eg-btn eg-btn--ghost eg-btn--sm">의견만</SubmitButton>
                      {myTurn && <SubmitButton pendingLabel="요청 중…" name="action" value="request_changes" className="eg-btn eg-btn--danger eg-btn--sm">변경 요청</SubmitButton>}
                      {myTurn && step?.role === "reviewer" && <SubmitButton pendingLabel="전달 중…" name="action" value="forward" className="eg-btn eg-btn--ink eg-btn--sm"><Icon id="i-arrow" />다음 단계 전달</SubmitButton>}
                      {myTurn && step?.role === "approver" && <SubmitButton pendingLabel="승인 중…" name="action" value="approve" className="eg-btn eg-btn--primary eg-btn--sm" disabled={blockers.length > 0}><Icon id="i-check" />승인</SubmitButton>}
                    </div>
                  </div>
                </form>
              )}
              {req.status === "approved" && (
                <div className="callout g"><Icon id="i-lock" /><div><b>승인됐어요.</b> 승인본은 바꿀 수 없어요. {dv.artifactPath && <a href={`/api/docx/${dv.id}`}>docx 내려받기</a>}</div></div>
              )}
              {req.status === "changes_requested" && (
                <div className="callout y"><Icon id="i-pencil" /><div>변경 요청을 받았어요. <Link href={`/meetings/${id}/workspace`}>작업실</Link>에서 고치면 새 버전이 만들어지고, 다시 상신할 수 있어요.</div></div>
              )}
              <div className="card">
                <div className="card-h"><h2>검토 기록</h2><span className="r muted" style={{ fontSize: 12 }}>지울 수 없는 기록</span></div>
                <div className="card-b" style={{ paddingTop: 4, paddingBottom: 4 }}>
                  <ul className="thread">
                    {history.map((a) => {
                      const u = actors.get(a.actorId);
                      return (
                        <li key={a.id}>
                          <span className="av">{u?.name.slice(-2) ?? "?"}</span>
                          <div>
                            <b>{u?.name ?? "알 수 없음"}</b> <span className={`eg-chip ${a.action === "approve" ? "eg-chip--pass" : a.action === "request_changes" ? "eg-chip--fail" : "eg-chip--plain"}`} style={{ height: 20 }}>{ACTION_LABEL[a.action] ?? a.action}</span>{" "}
                            <small>v{a.reviewRequest.documentVersion.version} · {ago(a.createdAt)}</small>
                            {a.comment && <div style={{ marginTop: 2 }}>{a.comment}</div>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </Shell>
  );
}
