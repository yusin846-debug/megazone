import Link from "@/components/NavigationLink";
import Shell from "@/components/Shell";
import RoleAvatar from "@/components/RoleAvatar";
import IntegrationHub from "@/components/IntegrationHub";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { activeProgram } from "@/lib/programs";
import { demoItems } from "@/lib/integrations/demo";
import { fmtKst } from "@/lib/state";
export default async function Home() {
  const user = await requireUser();
  const program = await activeProgram(user.id);
  const [tasks, reviews, recent] = await Promise.all([
    db.humanTask.count({ where:{status:"open", run:{meeting:{programId:program.id}}} }),
    db.reviewRequest.findMany({ where:{status:"open",documentVersion:{document:{meeting:{programId:program.id}}}},select:{policySnapshotJson:true,currentStep:true} }),
    db.meeting.findMany({where:{programId:program.id},orderBy:{createdAt:"desc"},take:3,select:{id:true,title:true,occurredAt:true}}),
  ]);
  const mine = reviews.filter(r => { const p = JSON.parse(r.policySnapshotJson) as {userIds:string[]}[]; return p[r.currentStep]?.userIds.includes(user.id); }).length;
  const writer = user.memberships.some(m => m.programId === program.id && m.role === "writer");
  return <Shell user={user} nav="dashboard" crumbs={["홈"]}>
    <div className="home-greeting"><div><span className="eyebrow">YOUR PRODUCTION DESK</span><h1>{user.name}님, 반가워요.</h1><p>오늘의 제작 일정과 먼저 확인할 일을 모았어요.</p></div><RoleAvatar title={user.title} name={user.name} size={72}/></div>
    <div className="home-grid">
      <div className="stack"><div className="home-priority card"><span className="eyebrow">먼저 확인해 주세요</span><h2>{tasks + mine ? `확인할 일이 ${tasks + mine}건 있어요` : "지금은 밀린 확인이 없어요"}</h2><p>{program.name}</p><div className="priority-links"><Link href="/tasks"><b>{tasks}</b><span>확인 요청 →</span></Link><Link href="/review"><b>{mine}</b><span>내 검토·결재 →</span></Link></div></div>
      <IntegrationHub key={`${user.id}:${program.id}`} items={demoItems(program.name,new Date()).map(item => writer ? item : {...item,prepareUrl:undefined})} storageKey={`eg.integrations.v1.${user.id}.${program.id}`}/></div>
      <aside className="stack"><div className="card quick-start"><span className="eyebrow">START A MEETING</span><h2>회의가 끝났나요?</h2><p>녹취록에서 결정과 할 일을 정리해요. 모호한 판단은 사람에게 물어봐요.</p>{writer ? <Link href="/meetings/new" className="eg-btn eg-btn--primary">새 회의 등록</Link> : <Link href="/meetings" className="eg-btn eg-btn--ink">회의 목록 보기</Link>}</div>
      <div className="card"><div className="card-h"><h2>최근 회의</h2><Link className="r" href="/meetings">전체 보기</Link></div>{recent.length ? recent.map(m => <Link className="recent-meeting" href={`/meetings/${m.id}/run`} key={m.id}><b>{m.title}</b><small>{fmtKst(m.occurredAt)} →</small></Link>) : <div className="card-b muted">아직 회의가 없어요. 첫 회의를 등록해 보세요.</div>}</div>
      <Link href="/programs" className="catalog-callout"><span className="eyebrow">PROGRAM LIBRARY</span><b>어떤 프로그램과 함께할까요?</b><span>공식 WORKS에서 가져온 72개 프로그램 →</span></Link>
      <p className="eg-help">체험 공간 · 샘플 팀원과 일정</p></aside>
    </div>
  </Shell>;
}
