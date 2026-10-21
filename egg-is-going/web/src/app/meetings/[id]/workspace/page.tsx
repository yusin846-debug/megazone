import Link from "next/link";
import { db, parse } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import Shell, { MeetingTabs } from "@/components/Shell";
import NoContent from "@/components/NoContent";
import { Flash, Icon, ItemTag, Missing, Team } from "@/components/ui";
import { currentItems, latestTranscript } from "@/lib/state";
import { fmtMs } from "@/lib/agents/types";
import { editAction, editItem } from "../../../actions";
import { meetingFor, q, type IdParams, type SP } from "@/lib/page";

export default async function WorkspacePage({ params, searchParams }: { params: IdParams; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const { meeting, roles, readable } = await meetingFor(id, user.id);
  const tab = q(sp, "tab") === "actions" ? "actions" : "items";
  const sel = q(sp, "item");
  const canEdit = roles.includes("writer");
  const crumbs: (string | [string, string])[] = [["회의", "/meetings"], [meeting.title, `/meetings/${id}/run`], "작업실"];
  if (!readable) return <Shell user={user} nav="home" crumbs={crumbs}><MeetingTabs id={id} on="workspace" /><NoContent /></Shell>;

  const tv = await latestTranscript(id);
  const items = (await currentItems(id)).sort((a, b) => a.item.key.localeCompare(b.item.key));
  const actions = await db.actionItem.findMany({ where: { meetingId: id, active: true }, orderBy: { key: "asc" }, include: { assignee: true } });
  const pById = new Map(meeting.participants.map((p) => [p.id, p]));
  const segByKey = new Map(tv?.segments.map((s) => [s.segKey, s]) ?? []);
  const selected = items.find((x) => x.item.key === sel);
  const actionEvidence = (j: string) => parse<{ segment_id: string }[]>(j, []).map((e) => e.segment_id);
  const evid = new Set<string>(
    selected ? selected.rev!.evidence.map((e) => e.segment.segKey).concat(selected.content.idea_changes.flatMap((c) => c.evidence.map((e) => e.segment_id))) : [],
  );
  const counts = { items: items.length, actions: actions.length };

  return (
    <Shell user={user} nav="home" crumbs={crumbs} right={tv && <span className="muted" style={{ fontSize: 12.5 }}>녹취록 v{tv.version}{tv.note ? ` · ${tv.note}` : ""}</span>}>
      <Flash error={q(sp, "error")} ok={q(sp, "ok")} />
      <MeetingTabs id={id} on="workspace" />
      <div className="grid2e">
        <div className="card" style={{ alignSelf: "start" }}>
          <div className="card-h">
            <h2>녹취록</h2>
            <span className="r muted" style={{ fontSize: 12 }}>
              {selected ? <>근거 {evid.size}곳 강조 · <Link href={`/meetings/${id}/workspace`}>해제</Link></> : "항목을 고르면 근거 발언이 강조돼요"}
            </span>
          </div>
          <div style={{ padding: "8px 4px", maxHeight: "calc(100vh - 240px)", overflowY: "auto" }}>
            {!tv && <p className="muted" style={{ padding: 14, fontSize: 13 }}>아직 전사 결과가 없어요.</p>}
            {tv?.segments.map((s) => {
              const p = s.speakerParticipantId ? pById.get(s.speakerParticipantId) : null;
              return (
                <div key={s.id} id={s.segKey} className={`eg-line${evid.has(s.segKey) ? " is-evidence" : ""}${s.uncertain ? " is-uncertain" : ""}`}>
                  <span className="eg-ts">{fmtMs(s.startMs)}</span>
                  <div>
                    <div className="who">
                      {p ? <>{p.displayName} <Team team={p.team} label={p.roleLabel} /></> : <Missing>화자 미확인</Missing>}
                      {s.uncertain && <span className="eg-unverified">불확실</span>}
                    </div>
                    <div className="tx">{s.text}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="card" style={{ alignSelf: "start" }}>
          <div className="tabs">
            <Link href={`/meetings/${id}/workspace`} className={tab === "items" ? "on" : ""}>안건·결정<b>{counts.items}</b></Link>
            <Link href={`/meetings/${id}/workspace?tab=actions`} className={tab === "actions" ? "on" : ""}>업무<b>{counts.actions}</b></Link>
          </div>
          {tab === "items" && (
            <div>
              {items.length === 0 && <p className="muted" style={{ padding: 16, fontSize: 13 }}>AI 실행이 끝나면 안건이 여기 정리돼요.</p>}
              {items.map(({ item, rev, content }) => {
                const on = item.key === sel;
                return (
                  <div key={item.id} className={`item${on ? " on" : ""}`}>
                    <div className="item-h">
                      <ItemTag status={rev!.status} />
                      <Link href={`/meetings/${id}/workspace?item=${item.key}#${rev!.evidence[0]?.segment.segKey ?? ""}`}>{item.title}</Link>
                      <span className="r">
                        <span className="mono muted">{item.key}</span>
                        {rev!.locked && <span className="eg-chip eg-chip--done" title="사람이 고정한 값 — AI가 바꾸지 않아요"><Icon id="i-lock" />고정</span>}
                      </span>
                    </div>
                    <dl className="eg-kv">
                      <dt>결정</dt>
                      <dd>{rev!.status === "confirmed" ? content.value ?? <Missing /> : rev!.status === "on_hold" ? <>보류{content.hold_reason ? ` · ${content.hold_reason}` : ""}</> : rev!.status === "dropped" ? "폐기" : "아직 정해지지 않음"}</dd>
                    </dl>
                    {content.revisit && <dl className="eg-kv"><dt>다시 볼 때</dt><dd>{content.revisit}</dd></dl>}
                    <dl className="eg-kv">
                      <dt>근거</dt>
                      <dd>
                        {rev!.evidence.map((e) => (
                          <a key={e.id} href={`/meetings/${id}/workspace?item=${item.key}#${e.segment.segKey}`} className="eg-tsbtn">{fmtMs(e.segment.startMs)}</a>
                        ))}
                        {!rev!.locked && <span className="muted" style={{ fontSize: 12, fontWeight: 500 }}>확신도 {Math.round(content.confidence * 100)}%</span>}
                      </dd>
                    </dl>
                    {on && content.idea_changes.length > 0 && (
                      <div style={{ marginTop: 10 }}>
                        <div className="eg-label">아이디어 변경 이력</div>
                        <ul className="hist">
                          {content.idea_changes.map((c, i) => (
                            <li key={i} className={i === content.idea_changes.length - 1 ? "final" : ""}>
                              {c.from && <><s>{c.from}</s> → </>}
                              {c.to}
                              <span className="why">
                                {c.reason ?? "이유 언급 없음"} · {c.evidence.map((e) => (segByKey.get(e.segment_id) ? fmtMs(segByKey.get(e.segment_id)!.startMs) : e.segment_id)).join(", ")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {on && canEdit && (
                      <form action={editItem} style={{ marginTop: 12, display: "grid", gap: 8, padding: 12, border: "1px dashed var(--line-strong)", borderRadius: 12 }}>
                        <input type="hidden" name="meetingId" value={id} />
                        <input type="hidden" name="key" value={item.key} />
                        <div className="eg-label" style={{ margin: 0 }}><Icon id="i-pencil" /> 직접 고치기 — 고친 값은 고정돼서 AI가 다시 바꾸지 않아요</div>
                        <div className="fg-row" style={{ gap: 8 }}>
                          <select className="eg-select" name="status" defaultValue={rev!.status === "unknown" ? "proposed" : rev!.status}>
                            <option value="confirmed">확정</option>
                            <option value="on_hold">보류</option>
                            <option value="dropped">폐기</option>
                            <option value="proposed">제안</option>
                          </select>
                          <input className="eg-input" name="value" defaultValue={content.value ?? ""} placeholder="확정 내용 (확정일 때)" />
                        </div>
                        <button className="eg-btn eg-btn--ink eg-btn--sm" style={{ justifySelf: "end" }}>고정하고 문서 다시 만들기</button>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {tab === "actions" && (
            <div>
              {actions.length === 0 && <p className="muted" style={{ padding: 16, fontSize: 13 }}>정리된 업무가 없어요.</p>}
              {actions.map((a) => (
                <div key={a.id} className="item">
                  <div className="item-h">
                    <b style={{ fontSize: 14.5 }}>{a.description}</b>
                    <span className="r">{a.locked && <span className="eg-chip eg-chip--done"><Icon id="i-lock" />고정</span>}</span>
                  </div>
                  <dl className="eg-kv"><dt>담당</dt><dd>{a.assignee ? a.assignee.displayName : <Missing />}</dd></dl>
                  <dl className="eg-kv"><dt>기한</dt><dd>{a.dueAt ?? <Missing />}</dd></dl>
                  <dl className="eg-kv">
                    <dt>근거</dt>
                    <dd>
                      {actionEvidence(a.evidenceJson).map((k) => (
                        <a key={k} href={`#${k}`} className="eg-tsbtn">{segByKey.get(k) ? fmtMs(segByKey.get(k)!.startMs) : k}</a>
                      ))}
                    </dd>
                  </dl>
                  {canEdit && (
                    <details style={{ marginTop: 8 }}>
                      <summary className="muted" style={{ cursor: "pointer", fontSize: 12.5 }}>직접 고치기</summary>
                      <form action={editAction} style={{ display: "grid", gap: 8, marginTop: 8 }}>
                        <input type="hidden" name="meetingId" value={id} />
                        <input type="hidden" name="actionId" value={a.id} />
                        <input className="eg-input" name="description" defaultValue={a.description} required />
                        <div className="fg-row" style={{ gap: 8 }}>
                          <select className="eg-select" name="assignee" defaultValue={a.assigneeParticipantId ?? ""}>
                            <option value="">담당 미정</option>
                            {meeting.participants.map((p) => <option key={p.id} value={p.id}>{p.displayName} ({p.roleLabel})</option>)}
                          </select>
                          <input className="eg-input" name="dueAt" defaultValue={a.dueAt ?? ""} placeholder="기한 (비우면 미정)" />
                        </div>
                        <button className="eg-btn eg-btn--ink eg-btn--sm" style={{ justifySelf: "end" }}>고정하고 문서 다시 만들기</button>
                      </form>
                    </details>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
