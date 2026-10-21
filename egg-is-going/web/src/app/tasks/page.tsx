import { activeProgram } from "@/lib/programs";
import TaskResponseForm from "@/components/TaskResponseForm";
import Link from "@/components/NavigationLink";
import { db, parse } from "@/lib/db";
import { canReadContent, requireUser } from "@/lib/auth";
import Shell from "@/components/Shell";
import { Flash, Icon } from "@/components/ui";
import { latestTranscript } from "@/lib/state";
import { fmtMs } from "@/lib/agents/types";
import { ago, q, type SP } from "@/lib/page";

const KIND_LABEL: Record<string, string> = { item_status: "결정 상태", action_due: "업무 기한", action_assignee: "업무 담당", speaker: "화자", other: "기타" };

export default async function TasksPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requireUser();
  const program = await activeProgram(user.id);
  const meetingId = q(sp, "meeting");
  const show = q(sp, "show") === "answered" ? "answered" : "open";
  const tasks = await db.humanTask.findMany({
    where: { status: show, run: { meeting: { programId: program.id, program: { memberships: { some: { userId: user.id, role: {not: "operator"} } } } }, ...(meetingId ? { meetingId } : {}) } },
    orderBy: show === "open" ? [{ required: "desc" }, { createdAt: "asc" }] : { answeredAt: "desc" },
    take: 50,
    include: { run: { include: { meeting: { include: { participants: true } } } } },
  });
  const selId = q(sp, "id") ?? tasks[0]?.id;
  const task = selId ? await db.humanTask.findFirst({ where: { id: selId, run: { meeting: { programId: program.id, program: { memberships: { some: { userId: user.id, role: {not: "operator"} } } } } } }, include: { run: { include: { meeting: { include: { participants: true } } } } } }) : null;
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
    <Shell programId={task?.run.meeting.programId} user={user} nav="tasks" crumbs={["확인 요청"]}>
      <Flash error={q(sp, "error")} ok={q(sp, "ok")} />
      <div className="page-h">
        <div>
          <h1>확인 요청</h1>
          <p>회의록에 남길 내용을 확인하세요.</p>
        </div>
      </div>
      <div className="task-workspace">
        <section className="task-inbox" aria-label="확인 요청 목록">
          <header className="task-inbox__header"><h2>받은 요청 <span>{tasks.length}</span></h2><div className="tabs">
            <Link href={`/tasks${meetingId ? `?meeting=${meetingId}` : ""}`} className={show === "open" ? "on" : ""}>대기</Link>
            <Link href={`/tasks?show=answered${meetingId ? `&meeting=${meetingId}` : ""}`} className={show === "answered" ? "on" : ""}>완료</Link>
            {meetingId && <Link href="/tasks">모든 회의</Link>}
          </div></header>
          <div className="task-inbox__scroll">
          {tasks.length === 0 && (
            <div className="empty">
              <Icon id="i-inbox"/>
              <h3>{show === "open" ? "기다리는 확인 요청이 없어요" : "아직 답한 요청이 없어요"}</h3>
              <p>확인이 필요한 내용이 생기면 이곳에 표시됩니다.</p>
            </div>
          )}
          {tasks.map((t) => (
            <Link key={t.id} href={link({ id: t.id })} aria-current={t.id === task?.id ? "true" : undefined} className={`tq${t.id === task?.id ? " on" : ""}`}>
              <span className="task-inbox__meta"><span>{KIND_LABEL[t.kind] ?? t.kind}</span>{t.required ? <span className="task-inbox__required">필수</span> : null}<time>{ago(t.answeredAt ?? t.createdAt)}</time></span>
              <b>{t.question}</b>
              <small>{t.run.meeting.title}</small>
            </Link>
          ))}
          </div>
        </section>

        {task ? (
          <section className="task-detail" aria-label="요청 상세">
            <header className="card-h task-detail__header">
              <span className="task-detail__category">{KIND_LABEL[task.kind] ?? task.kind}{task.required ? " · 필수 확인" : ""}</span>
              <span className="r"><Link href={`/meetings/${task.run.meetingId}/run`} className="task-detail__back">회의 열기<Icon id="i-arrow" /></Link></span>
            </header>
            <div className="card-b task-detail__scroll">
              <div className="task-reading">
              <p className="task-detail__meeting">{task.run.meeting.title}</p>
              <h2 className="task-detail__question">{task.question}</h2>
              <section className="task-evidence" aria-label="근거 발언">
              <h3>근거 발언</h3>
              {!readable && <p className="muted">운영자 권한으로는 발언 내용을 볼 수 없습니다.</p>}
              {readable && segs.length === 0 && <p className="muted">연결된 발언이 없습니다.</p>}
                {segs.map((s) => {
                  const p = s!.speakerParticipantId ? pById.get(s!.speakerParticipantId) : null;
                  return (
                    <Link key={s!.id} href={`/meetings/${task.run.meetingId}/workspace#${s!.segKey}`} className="task-quote">
                      <div className="task-quote__meta"><b>{p?.displayName ?? "화자 미확인"}</b>{p ? <span>{p.roleLabel}</span> : null}<span className="task-quote__time">{fmtMs(s!.startMs)} <Icon id="i-arrow"/></span></div>
                      <blockquote>{s!.text}</blockquote>
                      {s!.uncertain ? <small>발언 내용을 확인해 주세요.</small> : null}
                    </Link>
                  );
                })}
              </section>

              {task.status === "open" ? (
                <TaskResponseForm key={task.id} taskId={task.id} kind={task.kind} options={options} participants={task.run.meeting.participants.map(p => ({id:p.id, displayName:p.displayName, roleLabel:p.roleLabel}))}/>
              ) : (
                <div className="task-answer-receipt">
                  <Icon id="i-check" />
                  <div>
                    {responder?.name ?? "누군가"}님이 <b>{options.find((o) => o.value === response?.choice)?.label ?? response?.choice}</b>
                    {response?.value ? ` (${response.value})` : ""}(으)로 답했어요.
                  </div>
                </div>
              )}
              </div>
            </div>
          </section>
        ) : (
          <section className="task-detail task-detail--empty" aria-label="요청 상세"><Icon id="i-inbox"/><h2>확인할 요청을 선택해 주세요</h2><p>왼쪽 목록에서 근거와 응답 내용을 확인할 수 있어요.</p></section>
        )}
      </div>
    </Shell>
  );
}
