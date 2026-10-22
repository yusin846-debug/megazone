import type { ComposeOutput, MeetingIn, SegmentIn } from "../agents/types";
import { DEFAULT_TEMPLATE } from "../defaultTemplate";
import { pocDate, type PocMeeting } from "./daemyeong";

export function pocDocument(def: PocMeeting, anchor: string, meeting: MeetingIn, segments: SegmentIn[], names: Map<string, string>): ComposeOutput {
  const ref = (n: number) => segments[n - 1].segment_id;
  const bullet = (text: string, refs: string[], flags: string[] = []) => ({ type: "bullet" as const, text, cells: null, refs, flags });
  const fields: Record<string, ComposeOutput["sections"][number]["blocks"]> = {
    overview: [{ type: "paragraph", text: `${meeting.title} · ${meeting.occurred_at} · ${meeting.participants.map(p => p.name).join(" · ")}`, cells: null, refs: [], flags: [] }],
    decisions: def.decisions.filter(d => d.status === "confirmed").map(d => bullet(`${d.title}: ${d.value}`, [`d:${d.key}`])),
    changes: def.decisions.filter(d => d.change).map(d => bullet(`${d.title}: ${d.change!.from} → ${d.value} (${d.change!.reason})`, [`t:${d.key}`], ["changed"])),
    actions: def.actions.map(a => ({ type: "row", text: null, cells: [a.description, a.who ? names.get(a.who)! : "미정", a.dueDay === null ? "미정" : pocDate(anchor, a.dueDay).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }), a.evidence.map(ref).join(", ")], refs: [`a:${a.key}`], flags: [...(a.who ? [] : ["missing_assignee"]), ...(a.dueDay === null ? ["missing_due"] : [])] })),
    pending: def.decisions.filter(d => d.status === "on_hold" || d.status === "proposed").map(d => bullet(`${d.title}: ${d.reason ?? "확인 후 재논의"}`, [`d:${d.key}`])),
    dropped: def.decisions.filter(d => d.status === "dropped").map(d => bullet(`${d.title}: ${d.reason}`, [`d:${d.key}`])),
  };
  return { sections: DEFAULT_TEMPLATE.fields.map(f => ({ field_id: f.id, label: f.label, blocks: fields[f.id] ?? [] })), unplaced: [] };
}
