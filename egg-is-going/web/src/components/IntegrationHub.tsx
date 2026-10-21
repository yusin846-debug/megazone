"use client";
import { useEffect, useState } from "react";
import Link from "./NavigationLink";
import EggLoader from "./EggLoader";
import { SOURCES, type Source, type IntegrationItem } from "@/lib/integrations/demo";
const INITIAL: Source[] = ["calendar", "gmail", "slack"];
export default function IntegrationHub({ items, storageKey }: { items: IntegrationItem[]; storageKey: string }) {
  const [connected, setConnected] = useState<Source[]>(INITIAL);
  const [filter, setFilter] = useState<Source | "all">("all");
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("샘플 데이터가 준비됐어요.");
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? "null");
      if (Array.isArray(saved)) setConnected(saved.filter((s): s is Source => INITIAL.includes(s)));
    } catch { /* Demo remains usable when browser storage is unavailable. */ }
  }, [storageKey]);
  function toggle(source: Source) {
    const next = connected.includes(source) ? connected.filter(s => s !== source) : [...connected, source];
    setConnected(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* Session only. */ }
    setNotice(`${SOURCES.find(s => s.id === source)!.name} 샘플 ${next.includes(source) ? "표시를 켰어요" : "표시를 껐어요"}.`);
  }
  async function sync() {
    setSyncing(true);
    try {
      // Same adapter boundary that a future authenticated, server-side MCP bridge can fill.
      await Promise.resolve();
      setNotice(`샘플 확인 완료 · ${new Intl.DateTimeFormat("ko-KR", { timeZone:"Asia/Seoul", hour:"2-digit", minute:"2-digit", second:"2-digit" }).format(new Date())} KST`);
    } finally { setSyncing(false); }
  }
  const visible = items.filter(i => connected.includes(i.source) && (filter === "all" || i.source === filter));
  return <section className="integration-hub" aria-label="연결된 업무 도구 데모">
    <div className="section-title"><div><span className="eyebrow">CONNECTED WORKSPACE</span><h2>일정과 소식을 한곳에서</h2></div><span className="eg-chip eg-chip--plain">샘플 데이터</span></div>
    <p className="eg-help">샘플 일정과 메시지입니다. 실제 계정은 연결되지 않았어요.</p>
    <div className="integration-sources">{SOURCES.map(s => <div className="integration-source" key={s.id}>
      <span className="source-icon" style={{ color:s.color }}>{s.initial}</span><div><b>{s.name}</b><small>{s.scope}</small><span className="source-state">{connected.includes(s.id) ? "● 샘플 표시 중" : "○ 표시 꺼짐"}</span></div>
      <button className="eg-btn eg-btn--ghost eg-btn--sm" onClick={() => toggle(s.id)} aria-pressed={connected.includes(s.id)} aria-label={`${s.name} 샘플 ${connected.includes(s.id) ? "표시 끄기" : "표시 켜기"}`}>{connected.includes(s.id) ? "표시 끄기" : "샘플 표시"}</button>
    </div>)}</div>
    <div className="card">
      <div className="feed-toolbar"><div className="feed-filters" role="group" aria-label="소식 필터">{(["all", ...INITIAL] as const).map(s => <button key={s} className={filter === s ? "on" : ""} aria-pressed={filter === s} onClick={() => setFilter(s)}>{s === "all" ? "전체" : s === "calendar" ? "예정된 회의" : s === "gmail" ? "메일" : "Slack"}</button>)}</div><button className="eg-btn eg-btn--ghost eg-btn--sm" onClick={sync} disabled={syncing || connected.length === 0}>{syncing ? <EggLoader /> : null}샘플 새로고침</button></div>
      <p className="sync-notice" role="status">{notice}</p>
      {visible.length === 0 ? <div className="empty"><h3>표시할 소식이 없어요</h3><p>위에서 샘플 표시를 켜거나 다른 필터를 골라 주세요.</p></div> : visible.map(item => {
        const source = SOURCES.find(s => s.id === item.source)!;
        return <details className="feed-item" key={item.id}><summary><span className="source-icon" style={{color:source.color}}>{source.initial}</span><span className="feed-summary"><small>{source.name}</small><b>{item.title}</b><span>{new Intl.DateTimeFormat("ko-KR", {timeZone:"Asia/Seoul",month:"long",day:"numeric",weekday:"short",hour:"2-digit",minute:"2-digit"}).format(new Date(item.time))} KST{item.location ? ` · ${item.location}` : ""}</span></span><span className="detail-hint">자세히</span></summary><div className="feed-detail"><p>{item.description}</p>{item.attendees ? <p className="muted">참석 예정 · {item.attendees}</p> : null}{item.prepareUrl ? <Link href={item.prepareUrl} className="eg-btn eg-btn--ink eg-btn--sm">이 일정으로 회의 준비</Link> : null}</div></details>;
      })}
    </div>
  </section>;
}
