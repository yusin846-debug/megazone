import Link from "@/components/NavigationLink";
import Shell from "@/components/Shell";
import ProgramThumbnail from "@/components/ProgramThumbnail";
import IntegrationHub from "@/components/IntegrationHub";
import { Icon } from "@/components/ui";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { activeProgram } from "@/lib/programs";
import { PROGRAM_CATALOG } from "@/lib/programCatalog";
import { demoItems } from "@/lib/integrations/demo";
import { fmtKst } from "@/lib/state";

export default async function Home() {
  const user = await requireUser();
  const program = await activeProgram(user.id);
  const now = new Date();
  const [tasks, reviews, recent, upcoming] = await Promise.all([
    db.humanTask.count({ where: { status: "open", run: { meeting: { programId: program.id } } } }),
    db.reviewRequest.findMany({ where: { status: "open", documentVersion: { document: { meeting: { programId: program.id } } } }, select: { policySnapshotJson: true, currentStep: true } }),
    db.meeting.findMany({ where: { programId: program.id }, orderBy: { createdAt: "desc" }, take: 4, select: { id: true, title: true, occurredAt: true } }),
    db.meeting.findFirst({ where: { programId: program.id, occurredAt: { gte: now } }, orderBy: [{ occurredAt: "asc" }, { id: "asc" }], select: { id: true, title: true, occurredAt: true } }),
  ]);
  const mine = reviews.filter(r => { const p = JSON.parse(r.policySnapshotJson) as { userIds: string[] }[]; return p[r.currentStep]?.userIds.includes(user.id); }).length;
  const writer = user.memberships.some(m => m.programId === program.id && m.role === "writer");
  const items = demoItems(program.name, now).map(item => writer ? item : { ...item, prepareUrl: undefined });
  const demoMeeting = items.find(item => item.source === "calendar")!;
  const nextMeeting = upcoming ? {
    title: upcoming.title, time: upcoming.occurredAt, href: `/meetings/${upcoming.id}/run`, location: null,
  } : {
    title: demoMeeting.title, time: new Date(demoMeeting.time), href: demoMeeting.prepareUrl ?? "/meetings", location: demoMeeting.location,
  };
  const year = PROGRAM_CATALOG.find(p => p.name === program.name)?.year;
  const nextTime = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(nextMeeting.time);
  return <Shell user={user} nav="dashboard" crumbs={["홈"]}>
    <div className="home-editorial">
      <section className="program-hero" aria-labelledby="home-program-title">
        <div className="program-hero__copy">
          <p className="program-hero__greeting">{user.name}님,</p>
          <h1 id="home-program-title" className={program.name.length > 24 ? "is-long" : undefined}>{program.name}</h1>
          <p className="program-hero__edition">{year ? `${year} 프로그램` : "내 프로그램"}</p>
          <Link href={nextMeeting.href} className="program-hero__meeting">
            <Icon id="i-clock"/>
            <span><small>다음 회의{!upcoming ? <span className="program-hero__sample">샘플 일정</span> : null}</small><b>{nextMeeting.title}</b><span>{nextTime}{nextMeeting.location ? ` · ${nextMeeting.location}` : ""}</span></span>
            <Icon id="i-arrow"/>
          </Link>
        </div>
        <div className="program-hero__image"><ProgramThumbnail key={program.id} name={program.name} priority/></div>
      </section>
      <nav className="home-action-band" aria-label="프로그램 업무 바로가기">
        <Link href="/tasks" className="home-action-band__item"><Icon id="i-inbox"/><span>확인 요청 <b>{tasks}건</b></span><Icon id="i-arrow"/></Link>
        <Link href="/review" className="home-action-band__item"><Icon id="i-send"/><span>내 검토·결재 <b>{mine}건</b></span><Icon id="i-arrow"/></Link>
        {writer ? <Link href="/meetings/new" className="eg-btn eg-btn--ink home-action-band__new"><Icon id="i-plus"/>새 회의 등록</Link> : <Link href="/meetings" className="eg-btn eg-btn--ink home-action-band__new">회의 목록 보기<Icon id="i-arrow"/></Link>}
      </nav>
      <div className="home-editorial__columns">
        <IntegrationHub key={`${user.id}:${program.id}`} items={items} storageKey={`eg.integrations.v1.${user.id}.${program.id}`}/>
        <aside className="home-recent" aria-labelledby="home-recent-title">
          <header><h2 id="home-recent-title">최근 회의</h2><Link href="/meetings">전체 보기 <Icon id="i-arrow"/></Link></header>
          {recent.length ? recent.map(m => <Link className="home-recent__item" href={`/meetings/${m.id}/run`} key={m.id}><Icon id="i-doc"/><span><b>{m.title}</b><small>{fmtKst(m.occurredAt)}</small></span><Icon id="i-arrow"/></Link>) : <p className="home-recent__empty">아직 등록된 회의가 없습니다.</p>}
          <Link href="/programs" className="home-recent__catalog">프로그램 둘러보기 <Icon id="i-arrow"/></Link>
        </aside>
      </div>
    </div>
  </Shell>;
}
