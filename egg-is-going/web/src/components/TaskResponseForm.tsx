"use client";
import { useState } from "react";
import { answerTask } from "@/app/actions";
import SubmitButton from "./SubmitButton";

type Props = {
  taskId: string;
  kind: string;
  options: { value: string; label: string }[];
  participants: { id: string; displayName: string; roleLabel: string }[];
};
export default function TaskResponseForm({ taskId, kind, options, participants }: Props) {
  const [choice, setChoice] = useState(options.length === 1 ? options[0].value : "");
  const showValue = (kind === "action_due" && choice === "set") || (kind === "item_status" && choice === "confirmed");
  const showPerson = (kind === "action_assignee" || kind === "speaker") && choice === "set";
  return <form action={answerTask} className="task-response">
    <input type="hidden" name="taskId" value={taskId}/>
    <fieldset className="task-response__choices"><legend>답변</legend>
      {options.map(o => <label key={o.value} className="task-response__option">
        <input type="radio" name="choice" value={o.value} checked={choice === o.value} onChange={() => setChoice(o.value)} required/>
        <span>{o.label}</span>
      </label>)}
    </fieldset>
    {showValue ? <div className="task-response__field">
      <label htmlFor="task-response-value">{kind === "action_due" ? "기한" : "확정 내용"}</label>
      <input className="eg-input" id="task-response-value" name="value" key={choice} required={kind === "action_due"} placeholder={kind === "action_due" ? "날짜 또는 요일 입력" : "확정된 내용을 입력하세요"}/>
      {kind === "action_due" ? <small>예: 2026-10-24, 이번 주 금요일</small> : null}
    </div> : null}
    {showPerson ? <div className="task-response__field">
      <label htmlFor="task-response-person">{kind === "speaker" ? "화자" : "담당자"}</label>
      <select className="eg-select" id="task-response-person" name="participantId" required defaultValue="">
        <option value="" disabled>참석자 선택</option>
        {participants.map(p => <option key={p.id} value={p.id}>{p.displayName} · {p.roleLabel}</option>)}
      </select>
    </div> : null}
    <footer className="task-response__footer">
      <p>이 답변은 회의록에 반영됩니다.</p>
      <SubmitButton pendingLabel="저장 중…" className="eg-btn eg-btn--ink" disabled={!choice}>답변 저장</SubmitButton>
    </footer>
  </form>;
}
