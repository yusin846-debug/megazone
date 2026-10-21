import Link from "next/link";
import { db, parse } from "@/lib/db";
import { canReadContent, requireUser } from "@/lib/auth";
import Shell from "@/components/Shell";
import { Flash, Icon, Team } from "@/components/ui";
import { latestTranscript } from "@/lib/state";
import { fmtMs } from "@/lib/agents/types";
import { answerTask } from "../actions";
import { ago, q, type SP } from "@/lib/page";

const KIND_LABEL: Record<string, string> = { item_status: "결정 상태", action_due: "업무 기한", action_assignee: "업무 담당", speaker: "화자", other: "기타" };

export default async function TasksPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requireUser();
  const meetingId = q(sp, "meeting");
  const show = q(sp, "show") === "answered" ? "answered" : "open";
  const tasks = await db.humanTask.findMany({
    where: { status: show, ...(meetingId ? { run: { meetingId } } : {}) },
    orderBy: show === "open" ? [{ required: "desc" }, { createdAt: "asc" }] : { answeredAt: "desc" },
    take: 50,
    include: { run: { include: { meeting: { include: { participants: true } } } } },
  });
  const selId = q(sp, "id") ?? tasks[0]?.id;
  const task = selId ? await db.humanTask.findUnique({ where: { id: selId }, include: { run: { include: { meeting: { include: { participants: true } } } } } }) : null;
  const readable = task ? await canReadContent(user.id, task.run.meeting.programId) : false;
  const tv = task && readable ? await latestTranscript(task.run.meetingId) : null;
  const evidence = task ? parse<{ segment_id: string }[]>(task.evidenceJson, []) : [];
  const segs = tv ? evidence.map((e) => tv.segments.find((s) => s.segKey === e.segment_id)).filter(Boolean) : [];
  const options = task ? parse<{ value: string; label: string }[]>(task.optionsJson, []) : [];
  const pById = new Map(task?.run.meeting.participants.map((p) => [p.id, p]) ?? []);
  const response = task?.responseJson ? parse<{ choice: string; value?: string | null }>(task.responseJson, { choice: "" }) : null;
  const responder = task?.respondedBy ? await db.user.findUnique({ where: { id: task.respondedBy } }) : null;
  const link = (extra: Record<string, string>) => `/tasks?${new URLSearchParams({ ...(meetingId ? { meeting: meetingId } : {}), ...(show === "answered" ? { show } : {}), ...extra })}`;

  return (
    <Shell user={user} nav="tasks" crumbs={["확인 요청"]}>
      <Flash error={q(sp, "error")} ok={q(sp, "ok")} />
      <div className="page-h">
        <div>
          <h1>확인 요청</h1>
          <p>AI가 추측하지 않고 넘긴 질문이에요. 필수 확인에 모두 답하면 영향받는 단계부터 이어서 실행돼요.</p>
        </div>
      </div>
      <div className="grid2" style={{ gridTemplateColumns: "minmax(0,.9fr) minmax(0,1.4fr)" }}>
        <div className="card" style={{ alignSelf: "start" }}>
          <div className="tabs">
            <Link href={`/tasks${meetingId ? `?meeting=${meetingId}` : ""}`} className={show === "open" ? "on" : ""}>대기</Link>
            <Link href={`/tasks?show=answered${meetingId ? `&meeting=${meetingId}` : ""}`} className={show === "answered" ? "on" : ""}>답한 것</Link>
            {meetingId && <Link href="/tasks">모든 회의</Link>}
          </div>
          {tasks.length === 0 && (
            <div className="empty">
              <svg><use href="#egg" /></svg>
              <h3>{show === "open" ? "기다리는 확인 요청이 없어요" : "아직 답한 요청이 없어요"}</h3>
              <p>AI가 애매한 결정을 만나면 여기로 물어봐요.</p>
            </div>
          )}
          {tasks.map((t) => (
            <Link key={t.id} href={link({ id: t.id })} className={`tq${t.id === task?.id ? " on" : ""}`}>
              <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <span className={`eg-chip ${t.required ? "eg-chip--human" : "eg-chip--plain"}`}>{t.required ? "필수" : "선택"}</span>
                <span className="eg-chip eg-chip--plain">{KIND_LABEL[t.kind] ?? t.kind}</span>
                <small style={{ marginLeft: "auto" }}>{ago(t.answeredAt ?? t.createdAt)}</small>
              </span>
              <b>{t.question}</b>
              <small>{t.run.meeting.title}</small>
            </Link>
          ))}
        </div>

        {task ? (
          <div className="card" style={{ alignSelf: "start" }}>
            <div className="card-h">
              <h2>{KIND_LABEL[task.kind] ?? task.kind} 확인</h2>
              <span className="r"><Link href={`/meetings/${task.run.meetingId}/run`} className="eg-btn eg-btn--ghost eg-btn--sm">실행 상태<Icon id="i-arrow" /></Link></span>
            </div>
            <div className="card-b">
              <p style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-.02em", margin: "0 0 4px" }}>{task.question}</p>
              <p className="mono muted" style={{ margin: "0 0 14px" }}>{task.target} · {task.run.meeting.title}</p>
              <div className="eg-label">근거 발언</div>
              {!readable && <p className="muted" style={{ fontSize: 13 }}>운영자 권한으로는 발언 내용을 볼 수 없어요.</p>}
              {readable && segs.length === 0 && <p className="muted" style={{ fontSize: 13 }}>연결된 발언이 없어요.</p>}
              <div style={{ border: "1px solid var(--line)", borderRadius: 12, marginBottom: 16, overflow: "hidden" }}>
                {segs.map((s) => {
                  const p = s!.speakerParticipantId ? pById.get(s!.speakerParticipantId) : null;
                  return (
                    <Link key={s!.id} href={`/meetings/${task.run.meetingId}/workspace#${s!.segKey}`} className={`eg-line is-evidence${s!.uncertain ? " is-uncertain" : ""}`} style={{ borderRadius: 0, color: "inherit", textDecoration: "none" }}>
                      <span className="eg-ts">{fmtMs(s!.startMs)}</span>
                      <div>
                        <div className="who">{p ? <>{p.displayName} <Team team={p.team} label={p.roleLabel} /></> : <span className="eg-missing">화자 미확인</span>}</div>
                        <div className="tx">{s!.text}</div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {task.status === "open" ? (
                <form action={answerTask} style={{ display: "grid", gap: 8 }}>
                  <input type="hidden" name="taskId" value={task.id} />
                  <div className="eg-label">응답</div>
                  {options.map((o, i) => (
                    <label key={o.value} className="opt">
                      <input type="radio" name="choice" value={o.value} defaultChecked={i === 0 && options.length === 1} required />
                      {o.label}
                    </label>
                  ))}
                  {(task.kind === "item_status" || task.kind === "action_due") && (
                    <div className="fg" style={{ margin: "6px 0 0" }}>
                      <label className="eg-label" htmlFor="value">{task.kind === "item_status" ? "확정 내용 (확정을 고를 때)" : "기한 (지정을 고를 때)"}</label>
                      <input className="eg-input" id="value" name="value" placeholder={task.kind === "item_status" ? "예) 강릉 안목해변" : "예) 2026-10-24 또는 금요일"} />
                    </div>
                  )}
                  {(task.kind === "action_assignee" || task.kind === "speaker") && (
                    <div className="fg" style={{ margin: "6px 0 0" }}>
                      <label className="eg-label" htmlFor="pid">{task.kind === "speaker" ? "실제 화자" : "담당자"}</label>
                      <select className="eg-select" id="pid" name="participantId">
                        {task.run.meeting.participants.map((p) => <option key={p.id} value={p.id}>{p.displayName} ({p.roleLabel})</option>)}
                      </select>
                    </div>
                  )}
                  <div className="callout b" style={{ marginTop: 4 }}>
                    <Icon id="i-lock" />
                    <div>답한 값은 고정돼요. 이후 실행에서 AI가 이 값을 바꾸지 않고, 같은 질문을 다시 하지 않아요.</div>
                  </div>
                  <button className="eg-btn eg-btn--primary" style={{ justifySelf: "end" }}><Icon id="i-check" />응답 고정</button>
                </form>
              ) : (
                <div className="callout g">
                  <Icon id="i-check" />
                  <div>
                    {responder?.name ?? "누군가"}님이 <b>{options.find((o) => o.value === response?.choice)?.label ?? response?.choice}</b>
                    {response?.value ? ` (${response.value})` : ""}(으)로 답했어요.
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div />
        )}
      </div>
    </Shell>
  );
}
