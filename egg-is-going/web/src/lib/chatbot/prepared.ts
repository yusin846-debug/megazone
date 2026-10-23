// 챗봇이 먼저 제안하는 질문. 프로그램별로 준비해 두고, 화면에 띄우기 전에 실제 회의 원문에서 답이 나오는지 다시 확인한다.
import { POC_PROGRAM } from "@/lib/poc/daemyeong";
import { keywordsOf, searchCorpus, type CorpusMeeting } from "./search";

export const PREPARED: Record<string, string[]> = {
  [POC_PROGRAM]: [
    "우천 시 대기 어떻게 하기로 했어?",
    "야외 대기 테이블 설치 확정됐어?",
    "식재료 발주 누가 해?",
    "무전기 담당 누구야?",
    "동의서 취합 기한 언제야?",
    "티저 첫 장면 어떻게 정했어?",
  ],
  "달걀 한 판 여행기": ["엔딩 장소 어디로 정했어?", "게스트 섭외 어떻게 됐어?", "예산 얘기 나온 거 다 찾아줘"],
};

/** 질문 단어가 그대로 들어간 발언이 1순위로 나오면 답이 준비된 질문으로 본다 (비슷한 표기·뜻만으로 걸린 결과는 제외) */
export function answerable(corpus: CorpusMeeting[], question: string) {
  const keywords = keywordsOf(question);
  if (!keywords.length) return false;
  const top = searchCorpus(corpus, keywords)[0];
  const exact = top?.matches.filter((m) => m.kind === "exact").length ?? 0;
  return exact >= Math.max(1, Math.ceil(keywords.length / 2));
}
