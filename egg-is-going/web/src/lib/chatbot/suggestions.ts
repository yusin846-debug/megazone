import { db } from "@/lib/db";
import { answerable, PREPARED } from "./prepared";
import { keywordsOf, loadCorpus } from "./search";

/** 준비한 질문 → 최근 안건 제목으로 만든 질문 순으로, 실제로 답이 나오는 것만 */
export async function suggestionsFor(program: { id: string; name: string }, limit = 3) {
  const corpus = await loadCorpus(program.id);
  if (!corpus.some((m) => m.lines.length)) return [];
  const items = await db.discussionItem.findMany({
    where: { meeting: { programId: program.id } },
    orderBy: { meeting: { occurredAt: "desc" } },
    select: { title: true },
    take: 12,
  });
  const candidates = [...new Set([...(PREPARED[program.name] ?? []), ...items.map((i) => `${i.title} 어떻게 됐어?`)])];
  // 같은 검색어로 끝나는 질문(엔딩 장소 어디로 정했어? / 엔딩 장소 어떻게 됐어?)은 하나만
  const seen = new Set<string>();
  const out: string[] = [];
  for (const q of candidates) {
    const key = keywordsOf(q).map((k) => k.term).sort().join("|");
    if (out.length >= limit || seen.has(key) || !answerable(corpus, q)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}
