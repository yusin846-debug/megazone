import TemplateFieldsEditor from "@/components/TemplateFieldsEditor";
import { activeProgram } from "@/lib/programs";
import SubmitButton from "@/components/SubmitButton";
import { db, parse } from "@/lib/db";
import { requireUser, rolesIn, ROLE_LABEL, type Role } from "@/lib/auth";
import Shell from "@/components/Shell";
import { Flash, Icon } from "@/components/ui";
import type { TemplateRules } from "@/lib/agents/types";
import { applyTemplate, newTemplateVersion } from "../actions";
import { q, type SP } from "@/lib/page";

const SOURCE_LABEL: Record<string, string> = { meta: "회의 정보", confirmed: "확정 결정", topic_changes: "아이디어 변경", actions: "업무", on_hold: "보류", dropped: "폐기" };
const FORMAT_LABEL: Record<string, string> = { paragraph: "문단", bullets: "목록", table: "표" };

export default async function TemplatesPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requireUser();
  const active = await activeProgram(user.id);
  const program = await db.program.findUniqueOrThrow({ where: { id: active.id }, include: { memberships: { include: { user: true } } } });
  const roles = await rolesIn(user.id, program.id);
  const templates = await db.template.findMany({ where: { programId: program.id }, include: { versions: { orderBy: { version: "desc" } } } });
  const meetings = await db.meeting.findMany({ where: { programId: program.id }, orderBy: { occurredAt: "desc" }, include: { documents: { include: { versions: { orderBy: { version: "desc" }, take: 1 } } } } });
  const isAdmin = roles.includes("program_admin");
  const byRole = (r: Role) => program.memberships.filter((m) => m.role === r).map((m) => m.user.name).sort((a, b) => a.localeCompare(b, "ko"));

  return (
    <Shell user={user} nav="tpl" crumbs={["템플릿·정책"]}>
      <Flash error={q(sp, "error")} ok={q(sp, "ok")} />
      <div className="page-h">
        <div>
          <h1>템플릿·정책</h1>
          <p>회의록 양식과 검토·결재 담당자를 관리하세요.</p>
        </div>
      </div>
      {templates.map((t) => {
        const latest = t.versions[0];
        const rules = parse<Pick<TemplateRules, "fields">>(latest?.rulesJson, { fields: [] });
        return (
          <div key={t.id} className="grid2" style={{ marginBottom: 16 }}>
            <div className="card" style={{ alignSelf: "start" }}>
              <div className="card-h">
                <h2>{t.name} v{latest?.version}</h2>
                <span className="r">{t.versions.map((v) => <span key={v.id} className={`eg-chip ${v.id === latest?.id ? "eg-chip--pass" : "eg-chip--plain"}`}>v{v.version}</span>)}</span>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table className="tb">
                  <thead><tr><th>#</th><th>항목</th><th>가져올 내용</th><th>형식</th><th>규칙</th></tr></thead>
                  <tbody>
                    {rules.fields.map((f, i) => (
                      <tr key={f.id}>
                        <td className="muted">{i + 1}</td>
                        <td className="tt"><b>{f.label}{f.required && <span style={{ color: "var(--tomato-500)" }}> *</span>}</b></td>
                        <td>{SOURCE_LABEL[f.source] ?? f.source}</td>
                        <td>{FORMAT_LABEL[f.format] ?? f.format}{f.columns ? <small className="muted" style={{ display: "block" }}>{f.columns.join(" / ")}</small> : null}</td>
                        <td className="muted" style={{ fontSize: 12.5 }}>{f.rule}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="stack">
              {isAdmin ? (
                <form action={newTemplateVersion} className="card">
                  <div className="card-h"><h2>양식 수정</h2></div>
                  <div className="card-b">
                    <input type="hidden" name="templateId" value={t.id} />
                    <TemplateFieldsEditor initial={rules.fields} />
                    <SubmitButton pendingLabel="승인 중…" className="eg-btn eg-btn--ink eg-btn--sm"><Icon id="i-plus" />v{(latest?.version ?? 0) + 1}로 승인</SubmitButton>
                  </div>
                </form>
              ) : (
                <div className="callout b"><Icon id="i-lock" /><div>템플릿 수정은 프로그램 관리자({byRole("program_admin").join(", ")})만 할 수 있어요.</div></div>
              )}
              <form action={applyTemplate} className="card">
                <div className="card-h"><h2>회의에 다른 버전 적용</h2></div>
                <div className="card-b" style={{ display: "grid", gap: 8 }}>
                  <select className="eg-select" name="meetingId" required>
                    {meetings.filter((m) => m.documents[0]?.versions[0]?.status !== "approved").map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                  </select>
                  <select aria-label="적용할 양식 버전" className="eg-select" name="templateVersionId">
                    {t.versions.map((v) => <option key={v.id} value={v.id}>{t.name} v{v.version}</option>)}
                  </select>
                  <p className="eg-help" style={{ margin: 0 }}>선택한 회의에 새 양식을 적용해요. 승인본은 변경할 수 없어요.</p>
                  <SubmitButton disabled={!meetings.some(m => m.documents[0]?.versions[0]?.status !== "approved")} pendingLabel="적용 중…" className="eg-btn eg-btn--secondary eg-btn--sm" style={{ justifySelf: "end" }}><Icon id="i-refresh" />적용하고 다시 만들기</SubmitButton>
                </div>
              </form>
            </div>
          </div>
        );
      })}
      <div className="card">
        <div className="card-h"><h2>결재 정책</h2><span className="r"><span className="eg-chip eg-chip--plain">기본 경로</span></span></div>
        <div className="card-b">
          <div className="policy" style={{ marginBottom: 12 }}>
            <span className="pp done">작성 · {byRole("writer").length}명</span>
            <span className="ar">→</span>
            <span className="pp">검토 · {byRole("reviewer").join("·")}</span>
            {byRole("approver").map((n) => (
              <span key={n} style={{ display: "contents" }}><span className="ar">→</span><span className="pp">결재 · {n}</span></span>
            ))}
          </div>
          <dl className="meta-grid">
            {(["writer", "reviewer", "approver", "program_admin", "operator"] as Role[]).map((r) => (
              <span key={r} style={{ display: "contents" }}><dt>{ROLE_LABEL[r]}</dt><dd style={{ fontFamily: "inherit" }}>{byRole(r).join(", ")}</dd></span>
            ))}
          </dl>
          <p className="eg-help" style={{ marginBottom: 0 }}>진행 중인 결재는 상신 당시의 담당자가 처리해요.</p>
        </div>
      </div>
    </Shell>
  );
}
