import type { Block, ComposeInput, ComposeOutput, Section } from "@/lib/agents/types";

const STATUS_KO = { proposed: "제안", confirmed: "확정", on_hold: "보류", dropped: "폐기" } as const;

// 규칙 기반 기준선: 템플릿 칸의 source 규칙대로 항목을 그대로 배치한다. (문장 다듬기 없음)
export default function composeBaseline(input: ComposeInput): ComposeOutput {
  const name = (key: string | null) => input.meeting.participants.find((p) => p.key === key)?.name ?? null;
  const topicOf = (key: string) => input.topics.find((t) => t.item_key === key);
  const placed = new Set<string>();
  const sections: Section[] = input.template.fields.map((f) => {
    const blocks: Block[] = [];
    switch (f.source) {
      case "meta": {
        const ppl = input.meeting.participants.filter((p) => p.team !== "external").map((p) => `${p.name}(${p.role_label})`).join(", ");
        blocks.push({ type: "paragraph", text: `${input.meeting.title} · ${input.meeting.occurred_at}`, cells: null, refs: [], flags: [] });
        blocks.push({ type: "paragraph", text: `참석: ${ppl}`, cells: null, refs: [], flags: [] });
        break;
      }
      case "confirmed":
        for (const d of input.decisions.filter((d) => d.status === "confirmed")) {
          const ch = topicOf(d.item_key)?.idea_changes ?? [];
          const history = ch.length > 1 ? ` (변경: ${ch.map((c) => c.to).join(" → ")})` : "";
          blocks.push({ type: "bullet", text: `${d.title}: ${d.value ?? "미정"}${history}`, cells: null, refs: [`d:${d.item_key}`], flags: ch.length > 1 ? ["changed"] : [] });
          placed.add(`d:${d.item_key}`);
        }
        break;
      case "topic_changes":
        for (const t of input.topics) {
          for (const c of t.idea_changes.filter((c) => c.from)) {
            blocks.push({ type: "bullet", text: `${t.title}: ${c.from} → ${c.to}${c.reason ? ` — ${c.reason}` : ""}`, cells: null, refs: [`t:${t.item_key}`], flags: [] });
            placed.add(`t:${t.item_key}`);
          }
        }
        break;
      case "actions":
        for (const a of input.action_items) {
          const who = name(a.assignee);
          const flags = [...(who ? [] : ["missing_assignee"]), ...(a.due_at ? [] : ["missing_due"])];
          const cols = f.columns ?? ["업무", "담당", "기한", "근거"];
          const cell = (c: string) =>
            c === "업무" ? a.description : c === "담당" ? who ?? "미정" : c === "기한" ? a.due_at ?? "미정" : c === "근거" ? a.evidence.map((e) => e.segment_id).join(", ") : "";
          blocks.push({ type: "row", text: null, cells: cols.map(cell), refs: [`a:${a.action_key}`], flags });
          placed.add(`a:${a.action_key}`);
        }
        break;
      case "on_hold":
      case "dropped":
        for (const d of input.decisions.filter((d) => d.status === f.source)) {
          const extra = [d.hold_reason, d.revisit ? `재논의: ${d.revisit}` : null].filter(Boolean).join(" · ");
          blocks.push({ type: "bullet", text: `${d.title}${extra ? ` — ${extra}` : ""}`, cells: null, refs: [`d:${d.item_key}`], flags: [] });
          placed.add(`d:${d.item_key}`);
        }
        break;
    }
    if (!blocks.length) blocks.push({ type: "paragraph", text: "해당 없음", cells: null, refs: [], flags: [] });
    return { field_id: f.id, label: f.label, blocks };
  });
  const unplaced = input.decisions
    .filter((d) => !placed.has(`d:${d.item_key}`))
    .map((d) => ({ ref: `d:${d.item_key}`, reason: `상태 ‘${STATUS_KO[d.status]}’를 넣을 칸이 템플릿에 없음` }));
  return { sections, unplaced };
}
