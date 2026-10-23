// 챗봇 제안 질문 검사 (DB 없이): 준비한 질문이 PoC 회의 원문에서 실제로 답을 내는지
import { test } from "node:test";
import assert from "node:assert/strict";
import { POC_MEETINGS, POC_PROGRAM } from "../src/lib/poc/daemyeong";
import { answerable, PREPARED } from "../src/lib/chatbot/prepared";
import { keywordsOf, searchCorpus, type CorpusMeeting } from "../src/lib/chatbot/search";

const NAME: Record<string, string> = { han: "한지수", oh: "오다은", lee: "이혜연", park: "박준호", choi: "최민재", yoon: "윤하람" };
const corpus: CorpusMeeting[] = POC_MEETINGS.filter((m) => m.lines.length).map((m, mi) => ({
  id: m.key, title: m.title, occurredAt: new Date(Date.UTC(2026, 9, 15 + mi)), linkable: true, audioUrl: null,
  lines: m.lines.map((l, i) => ({ segKey: `seg_${i + 1}`, startMs: i * 40000, endMs: i * 40000 + 30000, speaker: NAME[l.who] ?? l.who, team: null, role: null, text: l.text })),
}));

test("PoC 프로그램의 준비 질문은 모두 답이 나온다", () => {
  const list = PREPARED[POC_PROGRAM];
  assert.ok(list.length >= 3);
  for (const q of list) assert.ok(answerable(corpus, q), `답이 준비되지 않은 질문: ${q}`);
});

test("준비 질문의 1순위 발언이 질문 내용과 맞는다", () => {
  const expect: Record<string, RegExp> = {
    "우천 시 대기 어떻게 하기로 했어?": /우천|비가 오면/,
    "야외 대기 테이블 설치 확정됐어?": /대기 테이블/,
    "식재료 발주 누가 해?": /발주/,
    "무전기 담당 누구야?": /무전기/,
  };
  for (const [q, re] of Object.entries(expect)) assert.match(searchCorpus(corpus, keywordsOf(q))[0].text, re, q);
});

test("질문 끝 서술어(하기로 했어)는 검색어로 남지 않는다", () => {
  assert.deepEqual(keywordsOf("우천 시 대기 어떻게 하기로 했어?").map((k) => k.term), ["우천", "대기"]);
  const hits = searchCorpus(corpus, keywordsOf("트레커 인터뷰 어떻게 하기로 했어?"));
  assert.ok(hits.every((h) => !h.matches.some((m) => m.found === "하고")), "'하고'가 비슷한 표기로 묶이면 안 된다");
});

test("원문에 없는 내용은 제안하지 않는다", () => {
  assert.equal(answerable(corpus, "엔딩 장소 어디로 정했어?"), false);
});
