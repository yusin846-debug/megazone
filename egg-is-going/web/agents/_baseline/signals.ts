// 규칙 기반 기준선(baseline)이 쓰는 "말의 신호" 사전.
// AI 없이도 앱 전체가 돌아가게 하는 용도이자, LLM 에이전트와 비교할 출발점이다.
// 에이전트 제작 가이드 04장의 판단 기준 표와 같은 내용.

export const QUESTION = /(어때요|어떨까요|할까요|좋겠어요|좋을까요|\?)/;
export const DROP = /(빼죠|빼는 걸로|안 하는 걸로|제외|하지 말죠)/;
export const HOLD = /(다음 주|다음에|다음 회의|다시 보죠|다시 얘기|나중에|확인하고|확인해서|보고 정|일정 확인|회신 오면)/;
export const CONFIRM = /(정리합시다|정리할게요|확정|(으로|로)\s*(가죠|가요|하죠|돌리죠|가되|정해요)|그걸로|좋아요|네 좋아요)/;
export const REASON = /(비 소식|비 예보|우천|때문|안 맞|안 된대요|리스크|예산|시간상|소음)/;
export const ACTION = /(제가\s.*(할게요|볼게요|올게요|드릴게요|다녀올게요|써 볼게요|받아 올게요)|부탁해요|드릴게요|공유드릴게요)/;
export const SMALL_TALK = /(커피|회식|고깃집|주차|점심|밥)/;
export const DUE = /(오늘 오후|오늘|내일|모레|이번 주 [월화수목금토일]요일|[월화수목금토일]요일|\d{1,2}월 \d{1,2}일|\d{1,2}일)/;
export const UNSURE = /(일단|아마|글쎄)/;
const AGENDA_RE = /(부터 정리할게요|얘기해 봅시다|얘기합시다|공유해 주세요)/;
/** 안건을 여는 말("오프닝부터 정리할게요", "미션 구성 얘기해요") — 결정이 아니다 */
export const isAgenda = (text: string) => AGENDA_RE.test(text) || (/얘기해요/.test(text) && !HOLD.test(text));

const STOP = new Set(["그럼", "그리고", "아", "근데", "음", "네", "그건", "그", "저", "제가", "다들", "일단", "그날", "다시"]);
const VERBISH_END = /(니까|면|고|서|게|죠|요|데|는데)$/;
const FILLER = /^(그럼|다시|네|아니|그날|좋아요|음)[,\s]*/;

/** "오프닝은 야외에서…" → "오프닝", "드론 촬영은" → "드론 촬영" */
export function topicNoun(text: string): string | null {
  const m =
    text.match(/(?:^|[\s,.])((?:[가-힣A-Za-z0-9]+\s)?[가-힣A-Za-z0-9]+?)(은|는|도)(?=\s)/) ??
    text.match(/(?:^|[\s,.])((?:[가-힣A-Za-z0-9]+\s)?[가-힣A-Za-z0-9]+?)\s*(얘기|이야기|부터)/);
  if (!m) return null;
  const words = m[1].replace(/^\d+회차\s*/, "").split(/\s+/).filter((w) => w && !STOP.has(w) && !/^\d+회차$/.test(w));
  if (!words.length) return null;
  const last = words[words.length - 1];
  // "찍는", "빼는", "얘기하는" 같은 동사 꾸밈말은 주어가 아니다
  if (m[2] === "는" && (last.length === 1 || /[하되찍빼보가오있없않나]$/.test(last))) return null;
  const noun = words.join(" ");
  if (/^(그것|이것|그|이|저|제|그쪽|그건|이건)$/.test(noun)) return null;
  return noun;
}

/** "실내로 돌리죠" → "실내", "스튜디오에서 …" → "스튜디오", "바닷가 오후 네 시로 확정" → "바닷가 오후 네 시" */
export function ideaValue(text: string): string | null {
  const a = text.match(/([가-힣A-Za-z0-9]+(?:\s[가-힣A-Za-z0-9]+?){0,3}?)(?:으로|로)\s*(?:가죠|가요|돌리죠|정리|확정|하죠|가되)/);
  if (a && !/(^|\s)(걸|것|거|그걸|그것)$/.test(a[1].trim())) return clean(a[1]);
  const b = text.match(/([가-힣A-Za-z0-9]+)에서\s/);
  if (b) return clean(b[1]);
  const c = text.match(/([가-힣A-Za-z0-9]+(?:\s[가-힣A-Za-z0-9]+){0,2})\s*어때요/);
  if (c) return clean(c[1]);
  return null;
}

function clean(s: string) {
  let words = s.trim().split(/\s+/);
  // 마지막 활용형 단어(크니까, 우천이면…)까지 버린다: "우천이면 리스크 크니까 실내" → "실내"
  const lastVerb = words.map((w) => VERBISH_END.test(w)).lastIndexOf(true);
  if (lastVerb >= 0 && lastVerb < words.length - 1) words = words.slice(lastVerb + 1);
  let out = words.join(" ");
  while (FILLER.test(out)) out = out.replace(FILLER, "");
  return out.replace(/(은|는)$/, "").trim() || s;
}

export const slug = (s: string, i: number) => {
  const map: Record<string, string> = {
    오프닝: "opening", 드론: "drone", 게스트: "guest", 멘트: "ment", 엔딩: "ending", 자막: "subtitle",
    썸네일: "thumbnail", 섭외: "casting", 날짜: "date", 미션: "mission", 예산: "budget", 맛집: "restaurant",
    BGM: "bgm", 장소: "location", 폰트: "font", 촬영: "shoot",
  };
  const parts = s.split(/\s+/).map((w) => Object.entries(map).find(([k]) => w.includes(k))?.[1]).filter(Boolean);
  return parts.length ? parts.join("_") : `item${i}`;
};
