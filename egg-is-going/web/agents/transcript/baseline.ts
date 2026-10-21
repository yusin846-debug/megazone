import type { TranscriptInput, TranscriptOutput, SegmentIn } from "@/lib/agents/types";

// `[mm:ss] 이름: 발언` 녹취록 파서. (MVP의 A1 실행기)
export default function transcriptBaseline(input: TranscriptInput): TranscriptOutput {
  const byName = new Map(input.meeting.participants.map((p) => [p.name, p.key]));
  const lines = input.raw_text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: { ms: number; name: string; text: string }[] = [];
  for (const line of lines) {
    const m = line.match(/^\[(?:(\d+):)?(\d{1,3}):(\d{2})\]\s*([^:：]+?)\s*[:：]\s*(.*)$/);
    if (!m) continue;
    const [, h, mm, ss, name, text] = m;
    rows.push({ ms: ((Number(h ?? 0) * 60 + Number(mm)) * 60 + Number(ss)) * 1000, name: name.trim(), text: text.trim() });
  }
  rows.sort((a, b) => a.ms - b.ms);

  const unmatched = new Set<string>();
  const spans: TranscriptOutput["uncertain_spans"] = [];
  const segments: SegmentIn[] = rows.map((r, i) => {
    const end = i + 1 < rows.length ? Math.max(rows[i + 1].ms, r.ms + 500) : r.ms + 5000;
    const key = byName.get(r.name) ?? null;
    if (!key && r.name !== "?") unmatched.add(r.name);
    const overlap = /\(겹침\)/.test(r.text);
    const uncertain = !key || overlap;
    if (uncertain) {
      spans.push({
        start_ms: r.ms,
        end_ms: end,
        reason: overlap ? "발화 겹침으로 화자·내용 불확실" : r.name === "?" ? "화자를 알 수 없음" : `참석자 명단에 없는 화자: ${r.name}`,
      });
    }
    return {
      segment_id: `seg_${String(i + 1).padStart(2, "0")}`,
      start_ms: r.ms,
      end_ms: end,
      speaker: key,
      text: r.text,
      uncertain,
    };
  });
  return { segments, uncertain_spans: spans, unmatched_speakers: [...unmatched] };
}
