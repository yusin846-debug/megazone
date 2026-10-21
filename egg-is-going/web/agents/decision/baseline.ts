import type { ActionOut, Decision, DecisionInput, DecisionOutput, HumanQuestion, ItemStatus, SegmentIn } from "@/lib/agents/types";
import contextBaseline from "../context/baseline";
import { ACTION, CONFIRM, DROP, DUE, HOLD, QUESTION, SMALL_TALK, UNSURE } from "../_baseline/signals";

// 규칙 기반 기준선: 안건별 발언 구간에서 마지막 강한 신호로 상태를 정하고, "제가 ~할게요"로 업무를 뽑는다.
export default function decisionBaseline(input: DecisionInput): DecisionOutput {
  const segs = input.segments;
  const topics = input.topics.length ? input.topics : contextBaseline({ meeting: input.meeting, segments: segs, feedback: [] }).topics;
  const idx = new Map(segs.map((s, i) => [s.segment_id, i]));
  const people = input.meeting.participants;
  const roleOf = (key: string | null) => people.find((p) => p.key === key)?.role_label ?? "";

  // 안건별 발언 구간: 첫 근거 발언부터 다음 안건 시작 전까지
  const starts = topics
    .map((t) => ({ t, at: Math.min(...t.idea_changes.flatMap((c) => c.evidence.map((e) => idx.get(e.segment_id) ?? 1e9))) }))
    .filter((x) => x.at < 1e9)
    .sort((a, b) => a.at - b.at);

  const decisions: Decision[] = [];
  const questions: HumanQuestion[] = [];
  starts.forEach(({ t, at }, k) => {
    const end = k + 1 < starts.length ? starts[k + 1].at : segs.length;
    let status: ItemStatus | null = null;
    let decider: SegmentIn | null = null;
    const ev: string[] = [];
    for (let i = at; i < end; i++) {
      const s = segs[i];
      // 불확실 구간은 상태 판단에 쓰지 않는다 (사람 확인 대상)
      if (s.uncertain || SMALL_TALK.test(s.text) || (ACTION.test(s.text) && !QUESTION.test(s.text))) continue;
      let sig: ItemStatus | null = null;
      if (DROP.test(s.text)) sig = "dropped";
      else if (HOLD.test(s.text)) sig = "on_hold";
      else if (QUESTION.test(s.text)) sig = status && status !== "proposed" ? null : "proposed";
      else if (CONFIRM.test(s.text)) sig = "confirmed";
      if (!sig) continue;
      if (sig !== "proposed" || !status) {
        if (sig !== status) {
          ev.length = 0;
          status = sig;
          decider = s; // 최종 상태가 처음 나온 발언 — 보류 사유도 여기서
        }
      }
      ev.push(s.segment_id);
    }
    if (!status || !decider) return;
    const lastValue = t.idea_changes.at(-1)?.to ?? null;
    let confidence = status === "proposed" ? 0.6 : 0.85;
    if (UNSURE.test(decider.text)) confidence = 0.6;
    if (status === "confirmed" && !/메인/.test(roleOf(decider.speaker))) confidence = 0.65;
    if (decider.uncertain) confidence = 0.5;
    const d: Decision = {
      item_key: t.item_key,
      title: t.title,
      status,
      value: status === "confirmed" ? lastValue : null,
      hold_reason: status === "on_hold" ? decider.text.replace(/[.。]$/, "") : null,
      revisit: status === "on_hold" ? (decider.text.match(/(다음 주|다음 회의|회신 오면|일정 확인)/)?.[1] ?? null) : null,
      evidence: [...new Set(ev)].slice(-3).map((segment_id) => ({ segment_id })),
      confidence,
    };
    decisions.push(d);
    if (confidence < 0.7) {
      questions.push({
        target: `d:${t.item_key}.status`,
        kind: "item_status",
        question:
          status === "on_hold" || status === "proposed"
            ? `‘${t.title}’는 확정인가요, 보류인가요?`
            : `‘${t.title}’를 ‘${d.value ?? "이 안"}’으로 확정한 게 맞나요?`,
        evidence: d.evidence,
      });
    }
  });

  // 후속 업무
  const actions: ActionOut[] = [];
  segs.forEach((s, i) => {
    if (SMALL_TALK.test(s.text) && !/부탁/.test(s.text)) return;
    const whoAsks = /누가\s*(할까요|하죠|맡을까요)/.test(s.text);
    if (!ACTION.test(s.text) && !whoAsks) return;
    // 스스로 하겠다는 말이면 말한 사람, "OO 작가가 … 부탁해요"면 지목된 사람
    let assignee: string | null = /부탁/.test(s.text) ? null : s.speaker;
    const named = people.find((p) => s.text.includes(p.name.slice(1)) && /부탁/.test(s.text));
    if (named) assignee = named.key;
    // 바로 앞 업무를 같은 사람이 받아들이는 말("네, 금요일까지 드릴게요")은 합친다
    const prev = actions.at(-1);
    if (prev && prev.assignee === s.speaker && i - (idx.get(prev.evidence.at(-1)!.segment_id) ?? -9) <= 2 && !/제가/.test(s.text)) {
      prev.evidence.push({ segment_id: s.segment_id });
      prev.due_at ??= s.text.match(DUE)?.[1] ?? null;
      return;
    }
    const desc = describe(s.text);
    actions.push({
      action_key: `a_${actions.length + 1}`,
      description: desc,
      assignee: whoAsks ? null : assignee,
      due_at: s.text.match(DUE)?.[1] ?? null,
      evidence: [{ segment_id: s.segment_id }],
    });
  });
  for (const a of actions) {
    if (!a.assignee) {
      questions.push({ target: `a:${a.action_key}.assignee`, kind: "action_assignee", question: `‘${a.description}’ 담당자를 지정할까요?`, evidence: a.evidence });
    }
  }

  // 사람이 고정한 값은 그대로
  for (const l of input.locked.items) {
    const i = decisions.findIndex((d) => d.item_key === l.item_key);
    const base: Decision = i >= 0 ? decisions[i] : { item_key: l.item_key, title: l.title, status: l.status, value: null, hold_reason: null, revisit: null, evidence: [], confidence: 1 };
    const merged = { ...base, status: l.status, value: l.value, confidence: 1 };
    if (i >= 0) decisions[i] = merged;
    else decisions.push(merged);
  }
  for (const l of input.locked.actions) {
    const i = actions.findIndex((a) => a.action_key === l.action_key);
    const base: ActionOut = i >= 0 ? actions[i] : { action_key: l.action_key, description: l.description, assignee: null, due_at: null, evidence: [] };
    const merged = { ...base, description: l.description, assignee: l.assignee, due_at: l.due_at };
    if (i >= 0) actions[i] = merged;
    else actions.push(merged);
  }
  const lockedTargets = new Set([
    ...input.locked.items.map((l) => `d:${l.item_key}.status`),
    ...input.locked.actions.flatMap((l) => [`a:${l.action_key}.assignee`, `a:${l.action_key}.due_at`]),
  ]);
  return { decisions, action_items: actions, questions_for_human: questions.filter((q) => !lockedTargets.has(q.target)) };
}

function describe(text: string) {
  let t = text.replace(/^(네|아|그럼)[,\s]*/, "").replace(/[.。?]$/, "");
  t = t.replace(/[가-힣]{2,3}\s*(작가|PD|피디)(가|님)?\s*/, "");
  const before = t.split(/\s*(제가|누가)\s*/)[0];
  const verb = /확인/.test(t) ? "확인" : /받아/.test(t) ? "받기" : /다녀/.test(t) ? "다녀오기" : /써|작성/.test(t) ? "작성" : /공유/.test(t) ? "공유" : /알아보/.test(t) ? "알아보기" : "";
  let core = before
    .replace(/(은|는|도)(\s|$)/g, " ")
    .replace(/(오늘 오후|오늘|내일|이번 주|[월화수목금토일]요일|까지|에)\s*/g, " ")
    .replace(/(부탁해요|드릴게요|공유드릴게요|알아보는 거|해 주세요)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!core) core = t.slice(0, 20);
  return verb && !core.endsWith(verb) ? `${core} ${verb}` : core;
}
