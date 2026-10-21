import type { Finding, VerifyInput, VerifyOutput } from "@/lib/agents/types";
import { ACTION, isAgenda, CONFIRM, DROP, HOLD, SMALL_TALK } from "../_baseline/signals";

// 규칙 기반 기준선: 항목↔문서 대조, 근거 존재 확인, 원문의 결정 신호 중 아무 데도 안 쓰인 발언 찾기.
export default function verifyBaseline(input: VerifyInput): VerifyOutput {
  const findings: Finding[] = [];
  const confirmed = new Set(input.human_confirmed);
  const segIds = new Set(input.segments.map((s) => s.segment_id));
  const docRefs = new Set(input.document.sections.flatMap((s) => s.blocks.flatMap((b) => b.refs)));
  const itemKeys = new Set(input.decisions.map((d) => d.item_key));
  const actionKeys = new Set(input.action_items.map((a) => a.action_key));
  const topicKeys = new Set(input.topics.map((t) => t.item_key));

  for (const d of input.decisions) {
    if (d.status !== "proposed" && !docRefs.has(`d:${d.item_key}`)) {
      findings.push({ type: "missing", severity: "critical", target: `d:${d.item_key}`, message: `‘${d.title}’(${d.status})가 문서에 없습니다.`, evidence: d.evidence, route_to: "compose" });
    }
    const bad = d.evidence.filter((e) => !segIds.has(e.segment_id));
    if (bad.length) findings.push({ type: "conflict", severity: "normal", target: `d:${d.item_key}.evidence`, message: `‘${d.title}’의 근거 발언이 원문에 없습니다.`, evidence: [], route_to: "decision" });
    if (!d.evidence.length && !confirmed.has(`d:${d.item_key}.status`)) {
      findings.push({ type: "unclear", severity: "normal", target: `d:${d.item_key}.evidence`, message: `‘${d.title}’에 연결된 근거 발언이 없습니다.`, evidence: [], route_to: "human" });
    }
    if (d.confidence < 0.7 && !confirmed.has(`d:${d.item_key}.status`)) {
      findings.push({ type: "unclear", severity: "critical", target: `d:${d.item_key}.status`, message: `‘${d.title}’의 상태를 원문만으로 판단하기 어렵습니다.`, evidence: d.evidence, route_to: "human" });
    }
    for (const e of d.evidence) {
      const s = input.segments.find((x) => x.segment_id === e.segment_id);
      if (s?.uncertain && !confirmed.has(`seg:${s.segment_id}.speaker`)) {
        findings.push({ type: "unclear", severity: "critical", target: `seg:${s.segment_id}.speaker`, message: `‘${d.title}’의 근거 발언(${s.segment_id})은 화자가 불확실합니다.`, evidence: [e], route_to: "human" });
      }
    }
  }
  for (const a of input.action_items) {
    if (!docRefs.has(`a:${a.action_key}`)) {
      findings.push({ type: "missing", severity: "normal", target: `a:${a.action_key}`, message: `업무 ‘${a.description}’가 문서에 없습니다.`, evidence: a.evidence, route_to: "compose" });
    }
    if (!a.due_at && !confirmed.has(`a:${a.action_key}.due_at`)) {
      findings.push({ type: "unclear", severity: "normal", target: `a:${a.action_key}.due_at`, message: `업무 ‘${a.description}’의 기한이 원문에 없습니다.`, evidence: a.evidence, route_to: "human" });
    }
  }
  for (const ref of docRefs) {
    const [kind, key] = ref.split(":");
    const known = kind === "d" ? itemKeys.has(key) : kind === "a" ? actionKeys.has(key) : kind === "t" ? topicKeys.has(key) : false;
    if (!known) findings.push({ type: "added", severity: "critical", target: ref, message: `문서의 ‘${ref}’ 항목은 앞 단계 결과에 없습니다.`, evidence: [], route_to: "compose" });
  }

  // 원문에 결정 신호가 있는데 어떤 판단에도 쓰이지 않은 발언
  const cited = new Set([
    ...input.decisions.flatMap((d) => d.evidence.map((e) => e.segment_id)),
    ...input.action_items.flatMap((a) => a.evidence.map((e) => e.segment_id)),
    ...input.topics.flatMap((t) => t.idea_changes.flatMap((c) => c.evidence.map((e) => e.segment_id))),
  ]);
  for (const s of input.segments) {
    if (cited.has(s.segment_id) || SMALL_TALK.test(s.text) || ACTION.test(s.text) || isAgenda(s.text) || s.uncertain) continue;
    if (DROP.test(s.text) || HOLD.test(s.text) || (CONFIRM.test(s.text) && !/^네[,.]?\s*$/.test(s.text))) {
      findings.push({ type: "missing", severity: "critical", target: `seg:${s.segment_id}`, message: `${s.segment_id} “${s.text.slice(0, 40)}”에 결정 신호가 있지만 어떤 항목에도 반영되지 않았습니다.`, evidence: [{ segment_id: s.segment_id }], route_to: "decision" });
    }
  }

  findings.push(...input.format_issues);
  const verdict = findings.some((f) => f.route_to !== "human") ? "needs_fix" : findings.length ? "needs_human" : "pass";
  return { verdict, findings };
}
