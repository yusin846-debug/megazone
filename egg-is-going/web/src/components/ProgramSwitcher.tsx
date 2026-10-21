"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { selectProgram } from "@/app/actions";
import { PROGRAM_CATALOG } from "@/lib/programCatalog";
import ProgramThumbnail from "./ProgramThumbnail";
import SubmitButton from "./SubmitButton";
import { Icon } from "./ui";
const YEARS = [...new Set(PROGRAM_CATALOG.map(p => p.year))];
const CATALOG = new Map(PROGRAM_CATALOG.map((p, i) => [p.name, { ...p, order: i }]));
type Program = { id: string; name: string };
export default function ProgramSwitcher({ programs, activeId, homeLink }: { programs: Program[]; activeId: string; homeLink: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [year, setYear] = useState("");
  const active = programs.find(p => p.id === activeId)!;
  function position() {
    const rect = anchor.current?.getBoundingClientRect();
    const box = dialog.current;
    if (!rect || !box) return;
    const compact = window.innerWidth <= 1000;
    const left = compact ? 16 : rect.right + 16;
    const top = compact ? 20 : Math.max(16, Math.min(rect.top, window.innerHeight - 350));
    box.style.width = `${Math.min(980, window.innerWidth - left - 16)}px`;
    box.style.left = `${left}px`;
    box.style.top = `${top}px`;
    box.style.maxHeight = `${window.innerHeight - top - 20}px`;
  }
  function show() {
    setQuery("");
    setYear(String(CATALOG.get(active.name)?.year ?? ""));
    dialog.current?.showModal(); position(); setOpen(true); search.current?.focus();
  }
  function close() { dialog.current?.close(); setOpen(false); }
  useEffect(() => { dialog.current?.close(); setOpen(false); }, [activeId]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", position);
    return () => window.removeEventListener("resize", position);
  }, [open]);
  const filtered = programs.filter(p => (!year || String(CATALOG.get(p.name)?.year) === year) && p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => (CATALOG.get(a.name)?.order ?? Infinity) - (CATALOG.get(b.name)?.order ?? Infinity) || a.name.localeCompare(b.name, "ko"));
  return <>
    <div className={`prog program-anchor${open ? " is-open" : ""}`}>
      <button type="button" ref={anchor} className="program-anchor__button" aria-label={`${active.name} · 프로그램 변경`} aria-haspopup="dialog" aria-expanded={open} aria-controls="program-picker" onClick={show}>
        <ProgramThumbnail key={active.name} name={active.name}/>
        <span className="program-anchor__caption"><small>내 프로그램 <span aria-hidden="true">▾</span></small><b>{active.name}</b></span>
        <span className="program-anchor__change" aria-hidden="true">↗</span>
      </button>
    </div>
    {homeLink}
    <dialog ref={dialog} id="program-picker" className="program-picker" aria-labelledby="program-picker-title" onCancel={() => setOpen(false)} onClose={() => { setOpen(false); anchor.current?.focus(); }} onClick={e => {
      if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) close(); }
    }}>
      <div className="program-picker__surface">
        <header className="program-picker__header"><div><small>OUR PROGRAMS</small><h2 id="program-picker-title">함께 만드는 프로그램<span>.</span></h2></div><button type="button" className="program-picker__close" aria-label="프로그램 선택 닫기" onClick={close}><Icon id="i-x"/></button></header>
        <div className="program-picker__layout">
          <aside className="program-picker__rail" aria-label="프로그램 필터">
            <label className="program-picker__search"><Icon id="i-search"/><input ref={search} type="search" aria-label="프로그램 이름 검색" placeholder="프로그램 검색" value={query} maxLength={100} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if(e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } }}/></label>
            <div className="program-picker__year-label">연도</div>
            <div className="program-picker__years" role="group" aria-label="프로그램 연도">
              {["", ...YEARS.map(String)].map(y => <button key={y} type="button" aria-pressed={year === y} onClick={() => setYear(y)}>{y || "전체"}<span>{programs.filter(p => !y || String(CATALOG.get(p.name)?.year) === y).length}</span></button>)}
            </div>
            <p className="program-picker__remember"><Icon id="i-check"/>마지막 선택으로 다시 열려요</p>
          </aside>
          <section className="program-picker__content" aria-label="프로그램 목록">
            <div className="program-picker__count"><span role="status">{year || "전체"} · {filtered.length}개 프로그램</span>{query ? <button type="button" onClick={() => { setQuery(""); search.current?.focus(); }}>검색 지우기</button> : null}</div>
            <div className="program-picker__results">{filtered.length ? <div className="program-picker__grid">{filtered.map(p => <form action={selectProgram} key={p.id} onSubmit={e => { if (p.id === activeId) { e.preventDefault(); close(); } }}>
              <input type="hidden" name="programId" value={p.id}/>
              <SubmitButton className={`program-choice${p.id === activeId ? " is-current" : ""}`} pendingLabel="프로그램 여는 중…" aria-label={`${p.name} 프로그램 열기`}>
                <ProgramThumbnail name={p.name}/><span className="program-choice__shade"/>
                <span className="program-choice__text"><small>{CATALOG.get(p.name)?.year ?? "샘플 프로그램"}</small><b>{p.name}</b><span className="program-choice__enter">{p.id === activeId ? "현재 프로그램 ✓" : "업무 공간 열기 ↗"}</span></span>
              </SubmitButton>
            </form>)}</div> : <div className="empty"><h3>찾는 프로그램이 없어요</h3><p>이름이나 연도를 바꿔 다시 찾아보세요.</p><button type="button" className="eg-btn eg-btn--ghost" onClick={() => { setQuery(""); setYear(""); }}>전체 프로그램 보기</button></div>}</div>
          </section>
        </div>
      </div>
    </dialog>
  </>;
}
