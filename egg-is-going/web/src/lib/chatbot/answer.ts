// 챗봇 답변: 질문 → (AI 검색어 확장) → 원문 검색 → 답변 작성.
// AGENT_PROVIDER=mock 이면 규칙만으로, anthropic 이면 Claude가 검색어 확장과 종합 답변을 맡는다.
// Claude 호출이 실패하면 규칙 기반 결과로 돌아간다 (검색 자체는 항상 동작).
import { callClaude } from "@/lib/agents/providers/anthropic";
import { fmtMs } from "@/lib/agents/types";
import { keywordsOf, loadCorpus, mergeKeywords, searchCorpus, toHit, type ChatHit, type Keyword } from "./search";

export type ChatReply = { answer: string; hits: ChatHit[]; keywords: Keyword[]; provider: "mock" | "anthropic"; note?: string };

export const fmtMeetingDate = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

const EXPAND_SYSTEM = `너는 예능 제작회의 녹취록 검색을 돕는다. 사용자의 질문에서 검색할 핵심 단어(명사 위주, 2~5개)를 뽑고,
단어마다 녹취록에 대신 나올 수 있는 표현을 붙여라.
- synonym: 뜻이 같거나 비슷한 말 (예: 엔딩→마무리, 클로징)
- mistranscription: 음성 인식이 잘못 받아 적었을 법한 말 (예: 일몰→일물, 테라스→태라스, 드론→드런)
질문의 서술어·의문사(언제, 어떻게, 했어 등)는 핵심 단어로 넣지 마라. 단어마다 표현은 6개 이하.`;

const EXPAND_SCHEMA = {
  type: "object", additionalProperties: false, required: ["keywords"],
  properties: {
    keywords: {
      type: "array",
      items: {
        type: "object", additionalProperties: false, required: ["term", "variants"],
        properties: {
          term: { type: "string" },
          variants: {
            type: "array",
            items: { type: "object", additionalProperties: false, required: ["term", "kind"], properties: { term: { type: "string" }, kind: { type: "string", enum: ["synonym", "mistranscription"] } } },
          },
        },
      },
    },
  },
};

const ANSWER_SYSTEM = `너는 예능 제작사의 회의 기록 도우미다. 주어진 회의 원문만 근거로 한국어로 짧게 답한다.
- excerpts 는 검색어와 맞은 발언, meetings 는 그 발언이 나온 회의의 원문 전체다. 결론이 검색어 없이 뒤쪽 발언에 나오는 경우가 많으니 원문 흐름을 읽어라.
- 여러 회의에 걸친 내용이면 날짜순으로 종합하고, 결정이 바뀌었으면 가장 최근 회의 기준 결론을 먼저 말한다.
- 회의 이름과 날짜를 함께 말한다. 발췌에 없는 내용은 지어내지 말고 "회의 원문에서 찾지 못했다"고 말한다.
- 발췌 문장에 받아쓰기 오류로 보이는 단어가 있으면 그렇게 보인다고 알려 준다.
- cited_ids 에는 답변 근거가 된 발언 id(excerpts 또는 meetings.lines 의 id)를 중요한 순서로 넣는다. 3~5문장 이내.`;

const ANSWER_SCHEMA = {
  type: "object", additionalProperties: false, required: ["answer", "cited_ids"],
  properties: { answer: { type: "string" }, cited_ids: { type: "array", items: { type: "string" } } },
};

function mockAnswer(question: string, hits: ChatHit[], keywords: Keyword[]) {
  if (!keywords.length) return "검색할 단어를 찾지 못했어요. 장소, 게스트, 예산처럼 회의에서 나온 단어를 넣어 다시 물어봐 주세요.";
  if (!hits.length) return `이 프로그램 회의 원문에서 "${keywords.map(k => k.term).join(", ")}"와 관련된 내용을 찾지 못했어요.`;
  // 발언 목록은 화면의 날짜 타임라인이 보여 주므로, 답변은 핵심 한 줄 + 최근 언급만 짧게
  const top = hits[0];
  const meetings = [...new Map(hits.map(h => [h.meetingId, h])).values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const latest = meetings.at(-1)!;
  const typo = hits.some(h => h.matches.some(m => m.kind === "typo"));
  return [
    `가장 관련 깊은 발언은 ${fmtMeetingDate(top.occurredAt)} 「${top.meetingTitle}」에서 ${top.speaker}의 “${top.text}”예요.`,
    meetings.length > 1 && latest.meetingId !== top.meetingId ? `가장 최근 언급은 ${fmtMeetingDate(latest.occurredAt)} 「${latest.meetingTitle}」이에요.` : "",
    typo ? "받아쓰기가 다르게 된 표현도 함께 찾았어요. ‘비슷한 표기’ 표시를 확인해 주세요." : "",
  ].filter(Boolean).join("\n");
}

export async function answerQuestion(programId: string, question: string): Promise<ChatReply> {
  const provider = process.env.AGENT_PROVIDER === "anthropic" ? "anthropic" : "mock";
  const corpus = await loadCorpus(programId);
  let keywords = keywordsOf(question);
  let note: string | undefined;

  if (provider === "anthropic") {
    try {
      const r = await callClaude({ system: EXPAND_SYSTEM, input: { question }, schema: EXPAND_SCHEMA });
      const extra = (JSON.parse(r.text) as { keywords: Keyword[] }).keywords.map(k => ({ term: k.term.toLocaleLowerCase(), variants: k.variants }));
      // AI가 고른 핵심 단어를 우선하고, 규칙으로 뽑은 단어 중 겹치는 것의 사전 동의어는 살린다
      if (extra.length) keywords = mergeKeywords(keywords.filter(k => extra.some(e => e.term === k.term)), extra);
    } catch (e) {
      console.warn("[chatbot] 검색어 확장 실패:", (e as Error).message); // 질문·원문은 로그에 남기지 않는다
      note = "AI 연결에 실패해서 기본 사전으로 찾았어요.";
    }
  }

  const hits = searchCorpus(corpus, keywords);
  if (provider !== "anthropic" || !hits.length) return { answer: mockAnswer(question, hits, keywords), hits, keywords, provider, note };

  try {
    const excerpts = hits.map(h => ({ id: h.id, meeting: h.meetingTitle, date: fmtMeetingDate(h.occurredAt), at: fmtMs(h.startMs), speaker: h.speaker, text: h.text }));
    // 맞은 발언이 나온 회의는 원문 전체를 함께 준다 (너무 길면 앞쪽 회의부터 600줄까지)
    let budget = 600;
    const meetings = corpus.filter(m => hits.some(h => h.meetingId === m.id)).flatMap(m => {
      if (budget <= 0) return [];
      const lines = m.lines.slice(0, budget);
      budget -= lines.length;
      return [{ meeting: m.title, date: fmtMeetingDate(m.occurredAt.toISOString()), lines: lines.map(l => ({ id: `${m.id}:${l.segKey}`, at: fmtMs(l.startMs), speaker: l.speaker, text: l.text })) }];
    });
    const r = await callClaude({ system: ANSWER_SYSTEM, input: { question, excerpts, meetings }, schema: ANSWER_SCHEMA });
    const out = JSON.parse(r.text) as { answer: string; cited_ids: string[] };
    // 답변이 근거로 든 발언을 맨 앞에 — 검색으로는 안 걸렸던 결론 발언도 카드로 붙인다
    const byId = new Map(hits.map(h => [h.id, h]));
    const cited = out.cited_ids.flatMap(id => {
      if (byId.has(id)) return [byId.get(id)!];
      const m = corpus.find(c => id.startsWith(`${c.id}:`));
      const i = m ? m.lines.findIndex(l => `${m.id}:${l.segKey}` === id) : -1;
      return m && i >= 0 ? [toHit(m, i, 0, [])] : [];
    });
    const rest = hits.filter(h => !cited.some(c => c.id === h.id));
    return { answer: out.answer, hits: [...cited, ...rest].slice(0, 12), keywords, provider, note };
  } catch (e) {
    console.warn("[chatbot] 답변 작성 실패:", (e as Error).message);
    return { answer: mockAnswer(question, hits, keywords), hits, keywords, provider, note: note ?? "AI 답변 작성에 실패해서 검색 결과만 정리했어요." };
  }
}
