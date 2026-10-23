// 챗봇 검색용 한글 비교: 음절을 자모로 풀어 편집 거리를 재면
// 받아쓰기 오류("일물"↔"일몰", "태라스"↔"테라스")도 비슷한 단어로 잡힌다.
const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
const JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ";
const JONG = ["", ..."ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ"];

export function toJamo(s: string) {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0) - 0xac00;
    if (c < 0 || c > 11171) { out += ch; continue; }
    out += CHO[Math.floor(c / 588)] + JUNG[Math.floor((c % 588) / 28)] + JONG[c % 28];
  }
  return out;
}

/** 검색 비교용 정규화: 소문자, 공백·문장부호 제거 */
export const compact = (s: string) => s.toLocaleLowerCase().replace(/[\s.,!?~…·'"“”‘’()\[\]{}:;\-]/g, "");

function editDistance(a: string, b: string) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** 같은 길이 두 단어가 한 음절의 모음만 다른지 (음성 인식이 가장 자주 틀리는 형태: 드론↔드런, 테라스↔태라스) */
export function vowelOnlyDiff(a: string, b: string) {
  const x = [...a], y = [...b];
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) {
    if (x[i] === y[i]) continue;
    const ca = x[i].charCodeAt(0) - 0xac00, cb = y[i].charCodeAt(0) - 0xac00;
    if (ca < 0 || ca > 11171 || cb < 0 || cb > 11171) return false;
    if (Math.floor(ca / 588) !== Math.floor(cb / 588) || ca % 28 !== cb % 28) return false;
    diff++;
  }
  return diff === 1;
}

/** 0~1. 자모 단위 편집 거리 기반 유사도 */
export function similarity(a: string, b: string) {
  const ja = toJamo(a), jb = toJamo(b);
  const len = Math.max(ja.length, jb.length);
  return len ? 1 - editDistance(ja, jb) / len : 0;
}

export type Hit = { sim: number; found: string };

/**
 * text 안에서 term과 가장 비슷한 부분을 찾는다.
 * 정확히 포함되면 1, 아니면 비슷한 길이의 구간을 훑어 자모 유사도가 가장 높은 곳.
 */
export function bestMatch(term: string, text: string): Hit | null {
  const t = compact(term);
  if (!t) return null;
  const raw = [...text];
  // 원문 위치를 유지한 채 비교용 글자만 모은다 (하이라이트용)
  const keep: { ch: string; i: number }[] = [];
  raw.forEach((ch, i) => { const c = compact(ch); if (c) keep.push({ ch: c, i }); });
  const flat = keep.map(k => k.ch).join("");
  const at = flat.indexOf(t);
  const slice = (s: number, e: number) => raw.slice(keep[s].i, keep[e - 1].i + 1).join("");
  if (at >= 0) return { sim: 1, found: slice(at, at + [...t].length) };
  const n = [...t].length;
  // 한 글자짜리는 오타 비교가 무의미하다 (거의 모든 글자와 비슷해짐)
  if (n < 2 || keep.length < 2) return null;
  let best: Hit | null = null;
  for (const w of [n - 1, n, n + 1]) {
    if (w < 2 || w > keep.length) continue;
    for (let s = 0; s + w <= keep.length; s++) {
      const sim = similarity(t, keep.slice(s, s + w).map(k => k.ch).join(""));
      if (!best || sim > best.sim) best = { sim, found: slice(s, s + w) };
    }
  }
  return best;
}
