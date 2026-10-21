import Link from "@/components/NavigationLink";
import Shell from "@/components/Shell";
import SubmitButton from "@/components/SubmitButton";
import { requireUser } from "@/lib/auth";
import { activeProgram, programsFor } from "@/lib/programs";
import { PROGRAM_CATALOG, CATALOG_SOURCE, CATALOG_CHECKED_AT } from "@/lib/programCatalog";
import { selectProgram } from "../actions";
import { q, type SP } from "@/lib/page";
export default async function ProgramsPage({searchParams}:{searchParams:SP}) {
  const [user,sp] = await Promise.all([requireUser(), searchParams]);
  const [programs,active] = await Promise.all([programsFor(user.id),activeProgram(user.id)]);
  const term = (q(sp,"q") ?? "").trim().slice(0,100);
  const year = q(sp,"year") ?? "";
  const filtered = PROGRAM_CATALOG.filter(p => (!year || String(p.year) === year) && p.name.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
  const byName = new Map(programs.map(p => [p.name,p]));
  return <Shell user={user} nav="programs" crumbs={["프로그램"]}><div className="page-h"><div><span className="eyebrow">PROGRAM LIBRARY</span><h1>함께 만드는 프로그램</h1><p>프로그램을 선택하고 회의와 문서를 확인하세요.</p></div></div>
    <form action="/programs" className="search-toolbar" role="search"><label className="sr-only" htmlFor="program-q">프로그램 검색</label><input id="program-q" name="q" type="search" className="eg-input" defaultValue={term} placeholder="프로그램 이름 검색" maxLength={100}/><label className="sr-only" htmlFor="program-year">연도</label><select id="program-year" className="eg-select" name="year" defaultValue={year}><option value="">전체 연도</option>{[2026,2025,2024,2023,2022,2021,2020,2019].map(y => <option key={y} value={y}>{y}년</option>)}</select><button className="eg-btn eg-btn--ink">검색</button>{term || year ? <Link className="eg-btn eg-btn--ghost" href="/programs">초기화</Link> : null}</form>
    <div className="catalog-meta"><span>전체 {PROGRAM_CATALOG.length}개 중 {filtered.length}개</span><a href={CATALOG_SOURCE} target="_blank" rel="noreferrer">공식 WORKS ↗</a><span>목록 업데이트 {CATALOG_CHECKED_AT}</span></div>
    {filtered.length ? <div className="program-grid">{filtered.map((p,index) => { const available = byName.get(p.name);return <article className="program-card card" key={p.id}><div className={`program-art program-art--${index%4}`} aria-hidden="true"><span>{p.year}</span><strong>{p.name}</strong><i/></div><div className="card-b"><small className="muted">{p.year} · 공식 WORKS</small><h2>{p.name}</h2>{available ? <form action={selectProgram}><input type="hidden" name="programId" value={available.id}/><SubmitButton pendingLabel="프로그램 여는 중…" className="eg-btn eg-btn--ghost eg-btn--sm">{available.id === active.id ? "현재 프로그램 열기" : "프로그램 열기"} →</SubmitButton></form> : <span className="muted">업무 공간 준비 중</span>}</div></article>;})}</div> : <div className="empty card"><h3>찾는 프로그램이 없어요</h3><p>다른 이름으로 검색하거나 연도 필터를 해제해 주세요.</p><Link href="/programs" className="eg-btn eg-btn--ink">전체 프로그램 보기</Link></div>}
  </Shell>;
}
