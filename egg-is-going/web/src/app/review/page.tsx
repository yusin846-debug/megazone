import { activeProgram } from "@/lib/programs";
import Link from "@/components/NavigationLink";
import { db, parse } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import Shell from "@/components/Shell";
import { DocBadge } from "@/components/ui";
import type { PolicyStep } from "@/lib/review";
import { ago } from "@/lib/page";

export default async function ReviewListPage() {
  const user = await requireUser();
  const program = await activeProgram(user.id);
  const reqs = await db.reviewRequest.findMany({
    where: { documentVersion: { document: { meeting: { programId: program.id } } } },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { documentVersion: { include: { document: { include: { meeting: true } } } } },
  });
  const rows = reqs.map((r) => {
    const policy = parse<PolicyStep[]>(r.policySnapshotJson, []);
    const step = r.status === "open" ? policy[r.currentStep] : null;
    return { r, policy, step, mine: !!step?.userIds.includes(user.id) };
  });
  const mine = rows.filter((x) => x.mine);
  const rest = rows.filter((x) => !x.mine);
  const table = (list: typeof rows) => (
    <div style={{ overflowX: "auto" }}>
      <table className="tb">
        <thead><tr><th>회의</th><th>문서</th><th>지금 단계</th><th>상신</th></tr></thead>
        <tbody>
          {list.map(({ r, step }) => (
            <tr key={r.id}>
              <td className="tt"><Link href={`/meetings/${r.documentVersion.document.meetingId}/review`}><b>{r.documentVersion.document.meeting.title}</b></Link></td>
              <td><DocBadge status={r.status === "superseded" ? "superseded" : r.documentVersion.status} version={r.documentVersion.version} /></td>
              <td>{step ? `${step.role === "reviewer" ? "검토" : "결재"} · ${step.names.join("·")}` : <span className="muted">{r.status === "approved" ? "완료" : r.status === "changes_requested" ? "변경 요청" : "닫힘"}</span>}</td>
              <td className="muted">{ago(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return (
    <Shell user={user} nav="review" crumbs={["검토·결재"]}>
      <div className="page-h"><div><h1>검토·결재</h1><p>상신된 회의록이에요. 내 차례인 것부터 보여 드려요.</p></div></div>
      <div className="stack">
        <div className="card">
          <div className="card-h"><h2>내 차례</h2><span className="r"><span className="eg-chip eg-chip--human">{mine.length}건</span></span></div>
          {mine.length ? table(mine) : <p className="muted" style={{ padding: "14px 18px", margin: 0, fontSize: 13 }}>지금 내 차례인 문서가 없어요.</p>}
        </div>
        <div className="card">
          <div className="card-h"><h2>전체</h2></div>
          {rest.length ? table(rest) : <p className="muted" style={{ padding: "14px 18px", margin: 0, fontSize: 13 }}>다른 검토 요청이 없어요.</p>}
        </div>
      </div>
    </Shell>
  );
}
