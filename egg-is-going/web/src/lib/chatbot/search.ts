// 챗봇 검색: 한 프로그램의 회의 원문 전체에서 질문과 관련된 발언을 찾는다.
// 정확히 같은 말 → 비슷한 뜻(사전·AI 확장) → 받아쓰기 오류로 보이는 말(자모 유사도) 순으로 점수를 준다.
import { db } from "@/lib/db";
import { bestMatch, compact, vowelOnlyDiff } from "./hangul";
import { synonymsOf } from "./synonyms";

export type MatchKind = "exact" | "synonym" | "typo";
export type Variant = { term: string; kind: Exclude<MatchKind, "typo"> | "mistranscription" };
export type Keyword = { term: string; variants: Variant[] };

// team·role: 화자 옆 팀 표시용 (writer | pd | external, 직함). 화자를 모르면 null
export type Line = { segKey: string; startMs: number; endMs: number; speaker: string; team: string | null; role: string | null; text: string };
export type CorpusMeeting = { id: string; title: string; occurredAt: Date; linkable: boolean; audioUrl: string | null; lines: Line[] };

export type ChatHit = {
  id: string; // meetingId:segKey — 답변 근거로 가리킬 때 쓰는 키
  meetingId: string;
  meetingTitle: string;
  occurredAt: string;
  segKey: string;
  linkable: boolean; // 작업실 원문에 같은 줄 앵커가 있는지 (AI 실행 전이면 false)
  audioUrl: string | null;
  startMs: number;
  endMs: number;
  speaker: string;
  team: string | null;
  role: string | null;
  text: string;
  after: string[]; // 바로 이어지는 발언 (결론이 다음 줄에 나오는 경우가 많다)
  score: number;
  matches: { term: string; found: string; kind: MatchKind }[];
};

const STOP = new Set([
  "뭐", "뭐야", "뭐였지", "뭐였어", "무엇", "언제", "어디", "어디로", "어디서", "어떻게", "어떤", "누가", "누구", "왜", "몇",
  "얘기", "이야기", "회의", "관련", "관련된", "내용", "말", "거", "것", "건", "그", "이", "저", "우리", "전부", "모두", "다",
  "알려줘", "알려", "찾아줘", "찾아", "보여줘", "정리해줘", "있어", "있었어", "있나", "대해", "대한", "대해서", "나온", "나왔던", "했던", "했나", "좀",
  "안", "못", "되는", "되나", "됐는지", "했는지", "정했는지", "이유", "얼마", "얼마나", "어때", "어땠어", "상황", "무슨", "결론", "결과", "혹시",
]);
// 질문 끝의 서술어 (정했어?, 됐어요?, 하기로 했나 …)
const PREDICATE = /(했|됐|였|였었|하기로|되기로|하자고|한다고|했다고)(어|나|니|지|죠|요|어요|나요|습니까|냐|대|대요)?$/;
const JOSA = ["에서는", "으로는", "에서도", "이랑", "하고", "까지", "부터", "처럼", "보다", "에게", "한테", "에서", "으로", "은", "는", "이", "가", "을", "를", "에", "로", "와", "과", "도", "만", "의", "랑"];

function stripJosa(w: string) {
  for (const j of JOSA) if (w.endsWith(j) && [...w].length - [...j].length >= 2) return w.slice(0, -j.length);
  return w;
}

/** 규칙 기반 키워드 추출 + 사전 동의어 */
export function keywordsOf(question: string): Keyword[] {
  const words = question.split(/[\s,.!?~·"'“”‘’()]+/).map(w => w.trim()).filter(Boolean);
  const all = [...new Set(words.map(stripJosa).map(w => w.toLocaleLowerCase()))]
    .filter(w => !STOP.has(w) && !PREDICATE.test(w) && compact(w).length >= 1 && !/^\d+$/.test(w));
  // 한 글자 한글은 거의 모든 문장에 걸리므로 다른 단어가 있으면 뺀다
  const longer = all.filter(w => !/^[가-힣]$/.test(compact(w)));
  const terms = longer.length ? longer : all;
  return terms.map(term => ({ term, variants: synonymsOf(term).map(s => ({ term: s, kind: "synonym" as const })) }));
}

/** 같은 키워드에 AI가 제안한 비슷한 말·오타 후보를 합친다 */
export function mergeKeywords(base: Keyword[], extra: Keyword[]): Keyword[] {
  const out = new Map(base.map(k => [k.term, { term: k.term, variants: [...k.variants] }]));
  for (const k of extra) {
    const cur = out.get(k.term) ?? { term: k.term, variants: synonymsOf(k.term).map(s => ({ term: s, kind: "synonym" as const })) };
    for (const v of k.variants) if (v.term !== k.term && !cur.variants.some(x => x.term === v.term)) cur.variants.push(v);
    out.set(k.term, cur);
  }
  return [...out.values()];
}

const STAMP = /^\[(?:(\d+):)?(\d{1,3}):(\d{2})\]\s*([^:：]+)[:：]\s*(.*)$/;

/** AI 실행 전 회의는 저장된 녹취록 텍스트를 그대로 줄 단위로 나눠 쓴다 */
function parseRaw(text: string): Line[] {
  const lines: Line[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.trim().match(STAMP);
    if (!m) continue;
    const startMs = ((Number(m[1] ?? 0) * 60 + Number(m[2])) * 60 + Number(m[3])) * 1000;
    lines.push({ segKey: `line_${String(lines.length + 1).padStart(2, "0")}`, startMs, endMs: startMs + 5000, speaker: m[4].trim(), team: null, role: null, text: m[5].trim() });
  }
  lines.forEach((l, i) => { if (lines[i + 1]) l.endMs = Math.max(l.startMs + 1000, lines[i + 1].startMs); });
  return lines;
}

export async function loadCorpus(programId: string): Promise<CorpusMeeting[]> {
  const meetings = await db.meeting.findMany({
    where: { programId },
    orderBy: { occurredAt: "desc" },
    include: {
      participants: true,
      recordings: {
        orderBy: { createdAt: "desc" },
        include: { transcripts: { orderBy: [{ createdAt: "desc" }, { version: "desc" }], take: 1, include: { segments: { orderBy: { startMs: "asc" } } } } },
      },
    },
  });
  return meetings.map(m => {
    const byId = new Map(m.participants.map(p => [p.id, p]));
    const byName = new Map(m.participants.map(p => [p.displayName, p]));
    const rec = m.recordings.find(r => r.transcripts.length) ?? m.recordings[0];
    const tv = rec?.transcripts[0];
    const audio = m.recordings.find(r => r.kind === "audio" && /^(https?:\/\/|\/)/.test(r.objectKey));
    const lines: Line[] = tv
      ? tv.segments.map(s => {
          const p = s.speakerParticipantId ? byId.get(s.speakerParticipantId) : undefined;
          return { segKey: s.segKey, startMs: s.startMs, endMs: s.endMs, speaker: p?.displayName ?? "화자 미확인", team: p?.team ?? null, role: p?.roleLabel ?? null, text: s.text };
        })
      : parseRaw(rec?.contentText ?? "").map(l => ({ ...l, team: byName.get(l.speaker)?.team ?? null, role: byName.get(l.speaker)?.roleLabel ?? null }));
    return { id: m.id, title: m.title, occurredAt: m.occurredAt, linkable: !!tv, audioUrl: audio?.objectKey ?? null, lines };
  });
}

const WEIGHT = { exact: 1, synonym: 0.8, mistranscription: 0.8 } as const;
// 받아쓰기 오류로 볼지: 모음 하나만 다르면(드론↔드런, 일몰↔일물) 인정.
// 그 밖에는 두 글자 단어는 아주 비슷할 때만(장소↔장보는 탈락), 긴 단어는 조금 더 너그럽게.
function isTypo(term: string, found: string, sim: number) {
  const t = compact(term), f = compact(found);
  if (vowelOnlyDiff(t, f)) return true;
  if (t.includes(f)) return false; // "출연자"에서 "출연"만 맞은 것처럼 단어 일부만 겹친 경우
  return sim >= ([...t].length <= 2 ? 0.84 : 0.78);
}

type Cand = { value: number; term: string; found: string; kind: MatchKind };

/** 키워드마다 이 줄에서 가장 잘 맞는 표현 (한 단어가 두 키워드에 겹쳐 점수를 받지 않게 한다) */
function matchLine(keywords: Keyword[], text: string): (Cand | null)[] {
  const used = new Set<string>();
  return keywords.map(k => {
    let best: Cand | null = null;
    for (const v of [{ term: k.term, kind: "exact" as const }, ...k.variants]) {
      const short = [...compact(v.term)].length < 2;
      if (short && v.kind !== "exact") continue; // 한 글자 동의어는 아무 데나 걸린다
      const hit = bestMatch(v.term, text);
      if (!hit || used.has(hit.found)) continue;
      const w = WEIGHT[v.kind];
      let cand: Cand | null = null;
      if (hit.sim === 1) cand = { value: w, term: v.term, found: hit.found, kind: v.kind === "exact" ? "exact" : v.kind === "synonym" ? "synonym" : "typo" };
      // 사전 동의어의 오타까지 넓히면 엉뚱한 말이 걸려서, 오타 비교는 원래 단어와 AI가 준 오타 후보에만 한다
      else if (v.kind !== "synonym" && isTypo(v.term, hit.found, hit.sim)) cand = { value: w * hit.sim * 0.9, term: v.term, found: hit.found, kind: "typo" };
      if (cand && (!best || cand.value > best.value)) best = cand;
    }
    if (best) used.add(best.found);
    return best;
  });
}

export function toHit(m: CorpusMeeting, i: number, score: number, matches: ChatHit["matches"]): ChatHit {
  const l = m.lines[i];
  return {
    id: `${m.id}:${l.segKey}`, meetingId: m.id, meetingTitle: m.title, occurredAt: m.occurredAt.toISOString(),
    segKey: l.segKey, linkable: m.linkable, audioUrl: m.audioUrl, startMs: l.startMs, endMs: l.endMs,
    speaker: l.speaker, team: l.team, role: l.role, text: l.text, after: m.lines.slice(i + 1, i + 3).map(n => `${n.speaker}: ${n.text}`),
    score: Math.round(score * 100) / 100, matches,
  };
}

export function searchCorpus(corpus: CorpusMeeting[], keywords: Keyword[], limit = 12): ChatHit[] {
  if (!keywords.length) return [];
  const rows = corpus.flatMap(m => m.lines.map((l, i) => ({ m, l, i, cands: matchLine(keywords, `${l.speaker} ${l.text}`) })));
  // 여러 줄에 흔하게 나오는 단어(예: 촬영)는 덜, 드물게 나오는 단어(예: 드론)는 더 중요하게 본다.
  // 흔한 정도는 그 단어가 그대로 나온 줄 수로만 잰다 (동의어·오타까지 세면 드문 단어가 흔해 보인다)
  const idf = keywords.map((_, k) => Math.log((rows.length + 1) / (rows.filter(r => r.cands[k]?.kind === "exact").length + 0.5)));
  const maxIdf = Math.max(...idf, 1e-9);
  const hits: ChatHit[] = [];
  for (const { m, l, i, cands } of rows) {
    const score = cands.reduce((sum, c, k) => sum + (c ? c.value * (idf[k] / maxIdf) : 0), 0);
    if (score < 0.5) continue;
    hits.push(toHit(m, i, score, cands.filter((c): c is Cand => !!c).map(c => ({ term: c.term, found: c.found, kind: c.kind }))));
  }
  const top = Math.max(0, ...hits.map(h => h.score));
  return hits
    .filter(h => h.score >= top * 0.35)
    .sort((a, b) => b.score - a.score || b.occurredAt.localeCompare(a.occurredAt) || a.startMs - b.startMs)
    .slice(0, limit);
}
