"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { selectProgram } from "@/app/actions";
import { PROGRAM_CATALOG } from "@/lib/programCatalog";
import ProgramThumbnail from "./ProgramThumbnail";
import SubmitButton from "./SubmitButton";
import { Icon } from "./ui";
const YEARS = [...new Set(PROGRAM_CATALOG.map(p=>p.year))];
const YEAR_BY_NAME = new Map(PROGRAM_CATALOG.map(p=>[p.name,p.year]));
type Program = {id:string;name:string};
export default function ProgramSwitcher({programs,activeId,homeLink}: {programs:Program[];activeId:string;homeLink:ReactNode}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const anchor = useRef<HTMLButtonElement>(null);
  const origin = useRef<HTMLButtonElement | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const [open,setOpen] = useState(false);
  const [query,setQuery] = useState("");
  const [year,setYear] = useState("");
  const active = programs.find(p=>p.id === activeId)!;
  function position() {
    const rect = anchor.current?.getBoundingClientRect();
    const box = dialog.current;
    if (!rect || !box) return;
    const mobile = window.innerWidth < 760;
    const width = Math.min(720,window.innerWidth - (mobile ? 24 : rect.right + 32));
    box.style.width = `${width}px`;
    box.style.left = `${mobile ? 12 : rect.right + 16}px`;
    box.style.top = `${mobile ? 16 : Math.max(12,Math.min(rect.top,window.innerHeight - 300))}px`;
    box.style.maxHeight = `${mobile ? window.innerHeight - 32 : window.innerHeight - Math.max(12,rect.top) - 16}px`;
  }
  function show(button:HTMLButtonElement) {
    origin.current = button;
    setQuery("");setYear("");
    dialog.current?.showModal();position();setOpen(true);search.current?.focus();
  }
  useEffect(()=>{ dialog.current?.close();setOpen(false); },[activeId]);
  useEffect(()=>{
    if (!open) return;
    window.addEventListener("resize",position);
    return ()=>window.removeEventListener("resize",position);
  },[open]);
  function close() { dialog.current?.close(); }
  const filtered = programs.filter(p=>(!year || String(YEAR_BY_NAME.get(p.name))===year) && p.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>(b.id===activeId ? 1 : 0)-(a.id===activeId ? 1 : 0) || (YEAR_BY_NAME.get(b.name)??0)-(YEAR_BY_NAME.get(a.name)??0) || a.name.localeCompare(b.name,"ko"));
  return <>
    <div className={`prog program-anchor${open ? " is-open" : ""}`}><span className="program-anchor__label">프로그램</span><button type="button" ref={anchor} className="program-anchor__button" aria-haspopup="dialog" aria-expanded={open} aria-controls="program-picker" onClick={e=>show(e.currentTarget)}><ProgramThumbnail name={active.name}/><span>{active.name}</span><span className="program-chevron" aria-hidden="true">›</span></button></div>
    {homeLink}
    <button type="button" className={`navx program-nav${open ? " on" : ""}`} aria-haspopup="dialog" aria-expanded={open} aria-controls="program-picker" onClick={e=>show(e.currentTarget)}><Icon id="i-template"/>프로그램<span className="program-chevron" aria-hidden="true">›</span></button>
    <dialog ref={dialog} id="program-picker" className="program-picker" aria-labelledby="program-picker-title" onCancel={()=>setOpen(false)} onClose={()=>{setOpen(false);origin.current?.focus();}} onClick={e=>{if(e.target === e.currentTarget){ const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}}}>
      <div className="program-picker__surface"><header className="program-picker__header"><div><small>PROGRAMS</small><h2 id="program-picker-title">프로그램 선택</h2></div><button type="button" className="program-picker__close" aria-label="프로그램 선택 닫기" onClick={close}><Icon id="i-x"/></button></header>
      <div className="program-picker__filters"><div className="program-picker__search"><Icon id="i-search"/><input ref={search} type="search" aria-label="프로그램 이름 검색" placeholder="프로그램 이름으로 찾아보세요" value={query} maxLength={100} onChange={e=>setQuery(e.target.value)}/></div><select aria-label="프로그램 연도" className="eg-select" value={year} onChange={e=>setYear(e.target.value)}><option value="">전체 연도</option>{YEARS.map(y=><option key={y} value={y}>{y}년</option>)}</select></div>
      <p className="program-picker__count" role="status">{filtered.length}개 프로그램{query || year ? <button type="button" onClick={()=>{setQuery("");setYear("");search.current?.focus();}}>초기화</button> : null}</p>
      <div className="program-picker__results">{filtered.length ? <div className="program-picker__grid">{filtered.map(p=><form action={selectProgram} key={p.id} onSubmit={e=>{if(p.id===activeId){e.preventDefault();close();}}}><input type="hidden" name="programId" value={p.id}/><SubmitButton className={`program-choice${p.id===activeId ? " is-current" : ""}`} pendingLabel="프로그램 여는 중…" aria-label={`${p.name} 프로그램 열기`}><ProgramThumbnail name={p.name}/><span className="program-choice__text"><b>{p.name}</b><small>{YEAR_BY_NAME.get(p.name) ?? "샘플 프로그램"}{p.id===activeId ? " · 현재 선택" : ""}</small></span>{p.id===activeId ? <span className="program-choice__check" aria-hidden="true">✓</span> : null}</SubmitButton></form>)}</div> : <div className="empty"><h3>찾는 프로그램이 없어요</h3><p>다른 이름으로 검색하거나 연도를 바꿔 주세요.</p><button type="button" className="eg-btn eg-btn--ghost" onClick={()=>{setQuery("");setYear("");}}>전체 프로그램 보기</button></div>}</div>
      <footer className="program-picker__footer">프로그램을 선택하면 해당 업무 공간으로 이동해요.</footer></div>
    </dialog>
  </>;
}
