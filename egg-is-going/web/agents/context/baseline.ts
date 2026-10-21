import type { ContextInput, ContextOutput, Topic } from "@/lib/agents/types";
import { ACTION, isAgenda, CONFIRM, QUESTION, REASON, SMALL_TALK, HOLD, DROP, ideaValue, slug, topicNoun } from "../_baseline/signals";

// 규칙 기반 기준선: "~은/는" 주어로 안건을 나누고, 제안·정리 발언의 값으로 변화를 만든다.
export default function contextBaseline(input: ContextInput): ContextOutput {
  const topics: Topic[] = [];
  let cur: Topic | null = null;
  let lastReason: { text: string; id: string } | null = null;
  const used = new Set<string>();

  input.segments.forEach((s, i) => {
    if (SMALL_TALK.test(s.text)) return;
    const noun = topicNoun(s.text);
    const isAction = ACTION.test(s.text) && !QUESTION.test(s.text);
    const isIdea = QUESTION.test(s.text) || CONFIRM.test(s.text) || HOLD.test(s.text) || DROP.test(s.text);

    if (noun && !s.uncertain && !isAction && (isIdea || isAgenda(s.text))) {
      const existing = topics.find((t) => t.title === noun);
      if (existing !== cur) lastReason = null;
      if (existing) cur = existing;
      else {
        let key = `t_${slug(noun, topics.length + 1)}`;
        while (used.has(key)) key += "_2";
        used.add(key);
        cur = { item_key: key, title: noun, intent: null, idea_changes: [] };
        lastReason = null;
        topics.push(cur);
      }
    }
    if (REASON.test(s.text) && !CONFIRM.test(s.text)) {
      lastReason = { text: s.text.replace(/[.。]$/, ""), id: s.segment_id };
    }
    if (!cur || isAction || isAgenda(s.text)) return;

    const value = (QUESTION.test(s.text) || CONFIRM.test(s.text)) && !DROP.test(s.text) ? ideaValue(s.text) : null;
    if (value) {
      const last = cur.idea_changes.at(-1);
      const prev = last?.to ?? null;
      if (last && prev === cur.title && cur.idea_changes.length === 1) {
        // 안건 제목으로 임시로 넣어 둔 첫 항목을 실제 첫 제안으로 바꾼다
        last.to = value;
        last.evidence.push({ segment_id: s.segment_id });
      } else if (last && prev && value.includes(prev) && value !== prev) {
        // 같은 안을 더 구체적으로 말한 것: "바닷가" → "바닷가 오후 네 시"
        last.to = value;
        last.evidence.push({ segment_id: s.segment_id });
      } else if (prev && prev.includes(value)) {
        last!.evidence.push({ segment_id: s.segment_id });
      } else if (prev !== value) {
        const ev = [{ segment_id: s.segment_id }];
        const reasonSeg = lastReason as { text: string; id: string } | null;
        const withReason = prev !== null && reasonSeg !== null;
        if (withReason) ev.unshift({ segment_id: reasonSeg!.id });
        cur.idea_changes.push({ from: prev, to: value, reason: withReason ? reasonSeg!.text : null, evidence: ev });
        lastReason = null;
      }
    } else if (cur.idea_changes.length === 0) {
      // 값은 못 뽑았지만 안건이 시작된 발언은 근거로 남긴다
      cur.idea_changes.push({ from: null, to: cur.title, reason: null, evidence: [{ segment_id: s.segment_id }] });
    }
    void i;
  });
  return { topics };
}
