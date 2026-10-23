"use client";
// AI 챗봇 (S10 · 시안 B 날짜 흐름 시트): 어느 화면에서든 오른쪽 아래 버튼으로 열고,
// 지금 프로그램의 회의 원문 전체에서 찾은 발언을 회의 날짜순 타임라인으로 보여 준다.
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname } from "next/navigation";
import Link from "@/components/NavigationLink";
import EggLoader from "@/components/EggLoader";
import { Icon, Missing } from "@/components/ui";
import "./chatbot.css";

type Match = { term: string; found: string; kind: "exact" | "synonym" | "typo" };
type Hit = {
  id: string; meetingId: string; meetingTitle: string; occurredAt: string; segKey: string; linkable: boolean;
  audioUrl: string | null; startMs: number; endMs: number; speaker: string; team: string | null; role: string | null;
  text: string; after: string[]; matches: Match[];
};
type Program = { id: string; name: string };
type Msg =
  | { role: "user"; text: string }
  | { role: "bot"; text: string; hits: Hit[]; note?: string }
  | { role: "error"; text: string };

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short" }).format(new Date(iso));
const fmtClock = (iso: string) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
/** 회의 시작 시각 + 녹음 위치 = 그 발언의 실제 시각 (짧은 회의에서도 구분되게 초까지) */
const fmtSaidAt = (iso: string, offsetMs: number) =>
  new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(new Date(iso).getTime() + offsetMs));
const fmtPos = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** 결과를 회의별로 묶어 회의 날짜순(오래된 것 → 최근)으로, 회의 안에서는 발언 시각순으로 */
function byMeeting(hits: Hit[]) {
  const groups = new Map<string, Hit[]>();
  for (const h of hits) groups.set(h.meetingId, [...(groups.get(h.meetingId) ?? []), h]);
  return [...groups.values()]
    .map(g => g.sort((a, b) => a.startMs - b.startMs))
    .sort((a, b) => a[0].occurredAt.localeCompare(b[0].occurredAt));
}

/** 정확히 같은 말은 표시 없이, 비슷한 뜻·비슷한 표기만 메타 줄에 글로 적는다 (칩·색만으로 구분하지 않기) */
function MatchNotes({ matches }: { matches: Match[] }) {
  return <>{matches.filter(m => m.kind !== "exact").map((m, i) => (
    <span key={i} className="cb-note"
      title={m.kind === "typo" ? `받아쓰기가 ‘${m.term}’를 ‘${m.found}’로 적은 것 같아요` : `‘${m.term}’와 뜻이 비슷한 말이에요`}>
      {m.kind === "typo" ? "비슷한 표기" : "비슷한 뜻"} ‘{m.found}’
    </span>
  ))}</>;
}

export default function ChatbotWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [available, setAvailable] = useState(false);
  const [program, setProgram] = useState<Program | null>(null);
  const [readable, setReadable] = useState(true);
  const [suggestions, setSuggestions] = useState<{ programId: string; list: string[] } | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const launcher = useRef<HTMLButtonElement>(null);
  const hidden = pathname === "/login";

  // Keep the launcher above action bars, including bars that wrap on narrow screens.
  useEffect(() => {
    if (hidden || !available || open) return;
    let frame = 0;
    let obstacle: Element | null = null;
    const measure = () => {
      frame = 0;
      const next = document.querySelector("[data-chatbot-obstacle]");
      if (next !== obstacle) {
        if (obstacle) resize.unobserve(obstacle);
        obstacle = next;
        if (obstacle) resize.observe(obstacle);
      }
      const bounds = obstacle?.getBoundingClientRect();
      const height = bounds && bounds.bottom > 0 && bounds.top < window.innerHeight
        ? Math.max(0, window.innerHeight - bounds.top) : 0;
      launcher.current?.style.setProperty("--cb-obstacle-height", `${height}px`);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure); };
    const resize = new ResizeObserver(schedule);
    const mutations = new MutationObserver(schedule);
    // Route content can stream in after the pathname has already changed.
    mutations.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    measure();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      mutations.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [hidden, available, open, pathname]);

  const refresh = useCallback(async () => {
    const r = await fetch("/api/chatbot", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) { setAvailable(false); return; }
    const d = (await r.json()) as { program: Program; readable: boolean };
    setAvailable(true);
    setReadable(d.readable);
    // 프로그램을 바꾸면 다른 프로그램 대화가 섞이지 않게 새로 시작한다
    setProgram(prev => { if (prev && prev.id !== d.program.id) setMsgs([]); return d.program; });
  }, []);

  useEffect(() => { if (!hidden) void refresh(); }, [hidden, pathname, refresh]);
  useEffect(() => { if (open) { void refresh(); field.current?.focus(); } }, [open, refresh]);
  // 제안 질문은 서버가 이 프로그램 원문에서 답이 나오는지 확인한 것만 받는다. 패널을 열 때 프로그램마다 한 번
  useEffect(() => {
    if (!open || !program || !readable || suggestions?.programId === program.id) return;
    let alive = true;
    void fetch("/api/chatbot?suggest=1", { cache: "no-store" })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { program: Program; suggestions?: string[] } | null) => { if (alive && d?.program.id === program.id) setSuggestions({ programId: program.id, list: d.suggestions ?? [] }); })
      .catch(() => {});
    return () => { alive = false; };
  }, [open, program, readable, suggestions]);
  const suggested = suggestions?.programId === program?.id ? suggestions?.list ?? [] : [];
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  useEffect(() => () => stop(), []);

  function stop() {
    audio.current?.pause();
    audio.current = null;
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setPlaying(null);
  }

  function close() { stop(); setOpen(false); }

  function play(h: Hit) {
    if (playing === h.id) { stop(); return; }
    stop();
    setPlaying(h.id);
    if (h.audioUrl) {
      // 녹음 파일이 있으면 해당 구간만 재생
      const a = new Audio(h.audioUrl);
      audio.current = a;
      a.currentTime = h.startMs / 1000;
      a.ontimeupdate = () => { if (a.currentTime * 1000 >= h.endMs) stop(); };
      a.onended = stop;
      a.onerror = stop;
      void a.play().catch(stop);
      return;
    }
    // 지금은 텍스트 녹취록만 저장돼 있어서 브라우저 음성으로 그 발언을 읽어 준다
    if (!("speechSynthesis" in window)) { setPlaying(null); return; }
    const u = new SpeechSynthesisUtterance(`${h.speaker}. ${h.text}`);
    u.lang = "ko-KR";
    u.onend = () => setPlaying(null);
    u.onerror = () => setPlaying(null);
    window.speechSynthesis.speak(u);
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput("");
    setMsgs(m => [...m, { role: "user", text: q }]);
    setBusy(true);
    try {
      const r = await fetch("/api/chatbot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: q }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "답을 가져오지 못했어요.");
      if (d.program) setProgram(d.program);
      setMsgs(m => [...m, { role: "bot", text: d.answer, hits: d.hits, note: d.note }]);
    } catch (e) {
      setMsgs(m => [...m, { role: "error", text: (e as Error).message || "잠시 후 다시 시도해 주세요." }]);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) { e.preventDefault(); void ask(input); }

  if (hidden || !available) return null;

  return (
    <>
      {!open && (
        <button ref={launcher} type="button" className="cb-fab" aria-expanded={false} aria-controls="cb-sheet" onClick={() => setOpen(true)}>
          <Icon id="i-search" />AI 챗봇
        </button>
      )}
      {open && (
        <aside id="cb-sheet" className="cb-sheet" role="dialog" aria-label="AI 챗봇 · 회의 원문 검색">
          <header className="cb-head">
            <h2>회의 원문 검색</h2>
            <span className="cb-scope" title={program ? `${program.name}에 올라온 회의만 검색해요` : undefined}><Icon id="i-lock" /><span>{program ? program.name : "확인 중…"}</span>{program && <em>에서만</em>}</span>
            <span className="cb-sp" />
            {msgs.length > 0 && <button type="button" className="cb-icon" aria-label="대화 지우기" title="대화 지우기" onClick={() => { stop(); setMsgs([]); }}><Icon id="i-refresh" /></button>}
            <button type="button" className="cb-icon" aria-label="챗봇 닫기" onClick={close}><Icon id="i-x" /></button>
          </header>

          <div className="cb-body" ref={list} aria-live="polite">
            {!readable && <p className="cb-error">운영자 권한으로는 회의 내용을 검색할 수 없어요.</p>}
            {readable && msgs.length === 0 && (
              <div className="cb-empty">
                <span className="cb-empty__over">회의 원문에서 찾기</span>
                <p>다른 날 회의에서 나온 얘기도 한 번에 찾아 드려요.<br />받아쓰기가 조금 틀린 표현이나 뜻이 비슷한 말까지 함께 찾아요.</p>
                {suggested.length > 0 && (
                  <div className="cb-suggest" aria-label="이 프로그램에서 바로 답할 수 있는 질문">
                    {suggested.map(s => <button key={s} type="button" onClick={() => void ask(s)}>{s}</button>)}
                  </div>
                )}
              </div>
            )}
            {msgs.map((m, i) => {
              if (m.role === "user") return <p key={i} className="cb-q">{m.text}</p>;
              if (m.role === "error") return <p key={i} className="cb-error">{m.text}</p>;
              const groups = byMeeting(m.hits);
              const first = m.hits[0]?.id; // 가장 관련 깊은 발언 하나만 근거 바로 표시
              return (
                <section key={i} className="cb-turn">
                  <div className="cb-answer">
                    {m.hits.length > 0 && <span className="cb-answer__meta">회의 {groups.length}개 · 발언 {m.hits.length}곳</span>}
                    <p>{m.text}</p>
                    {m.note && <small>{m.note}</small>}
                  </div>
                  {groups.length > 0 && (
                    <ol className="cb-tl">
                      {groups.map((g, gi) => (
                        <li key={g[0].meetingId} className={`cb-day${gi === groups.length - 1 && groups.length > 1 ? " is-latest" : ""}`}>
                          <h3>
                            {fmtDay(g[0].occurredAt)}
                            <span>{g[0].meetingTitle} · {fmtClock(g[0].occurredAt)}{gi === groups.length - 1 && groups.length > 1 ? " · 가장 최근" : ""}</span>
                          </h3>
                          {g.map(h => (
                            <article key={h.id} className={`cb-quote${h.id === first ? " is-best" : ""}`}>
                              <div className="cb-quote__meta">
                                {h.team ? <><b>{h.speaker}</b><span>{h.role}</span></> : <Missing>{h.speaker === "?" ? "화자 미확인" : h.speaker}</Missing>}
                                {h.id === first && <span className="cb-best">가장 가까운 발언</span>}
                                <MatchNotes matches={h.matches} />
                                <span className="cb-quote__end">
                                  <button type="button" className={`cb-play${playing === h.id ? " is-on" : ""}`} onClick={() => play(h)}
                                    aria-label={playing === h.id ? "듣기 멈춤" : `${h.speaker} 발언 듣기`}
                                    title={h.audioUrl ? "녹음에서 이 부분 듣기" : "녹음 파일이 없어 이 발언을 음성으로 읽어 드려요"}>
                                    <Icon id={playing === h.id ? "i-x" : "i-play"} />
                                  </button>
                                  <Link href={`/meetings/${h.meetingId}/workspace${h.linkable ? `#${h.segKey}` : ""}`} className="cb-ts" data-clock={`${fmtSaidAt(h.occurredAt, h.startMs)} 발언 · 원문 보기`}
                                    aria-label={`${fmtSaidAt(h.occurredAt, h.startMs)} 발언, 녹음 ${fmtPos(h.startMs)}. 원문에서 보기`} onClick={stop}>{fmtPos(h.startMs)}<Icon id="i-arrow" /></Link>
                                </span>
                              </div>
                              <blockquote>{h.text}</blockquote>
                              {h.after[0] && <p className="cb-after"><span>이어서</span>{h.after[0]}</p>}
                            </article>
                          ))}
                        </li>
                      ))}
                    </ol>
                  )}
                </section>
              );
            })}
            {busy && <p className="cb-busy"><EggLoader />회의 원문을 찾는 중…</p>}
          </div>

          <form className="cb-foot" onSubmit={submit}>
            <label htmlFor="cb-input" className="sr-only">회의 내용 질문</label>
            <div className="cb-field">
              <input id="cb-input" ref={field} maxLength={300} value={input} disabled={!readable}
                placeholder="회의에서 나온 내용을 물어보세요" onChange={e => setInput(e.target.value)} />
              <button type="submit" className="cb-send" aria-label="질문하기" title="질문하기" disabled={busy || !input.trim() || !readable}><Icon id="i-send" /></button>
            </div>
          </form>
        </aside>
      )}
    </>
  );
}
