import { activeProgram } from "@/lib/programs";
import RoleAvatar from "@/components/RoleAvatar";
import SubmitButton from "@/components/SubmitButton";
import Link from "@/components/NavigationLink";
import { readdirSync } from "node:fs";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { fixtureDir, readFixture } from "@/lib/meetings";
import Shell from "@/components/Shell";
import { Flash, Icon, Team } from "@/components/ui";
import { newMeeting } from "../../actions";
import { q, type SP } from "@/lib/page";

const SAMPLE_HINT: Record<string, string> = {
  "01_opening": "기본 · 확정·업무가 깔끔한 회의",
  "02_reversal": "번복 · 아이디어가 두 번 바뀜",
  "03_noise": "잡담 · 업무처럼 들리는 농담",
  "04_hold": "보류 · 결론 없이 다음 회의로",
  "05_overlap": "겹침 · 화자가 불확실한 구간",
};

export default async function NewMeetingPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const user = await requireUser();
  const active = await activeProgram(user.id);
  const program = await db.program.findUniqueOrThrow({ where: { id: active.id }, include: { memberships: { include: { user: true } } } });
  const tvs = await db.templateVersion.findMany({ where: { template: { programId: program.id }, status: "approved" }, include: { template: true }, orderBy: { version: "desc" } });
  const staff = [...new Map(program.memberships.filter((m) => m.role !== "operator").map((m) => [m.userId, m.user])).values()];
  const keys = readdirSync(fixtureDir(), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort();
  const sampleKey = q(sp, "sample");
  const sample = sampleKey && keys.includes(sampleKey) ? readFixture(sampleKey) : null;
  const picked = new Set(sample ? sample.meta.participants : []);

  return (
    <Shell user={user} nav="home" crumbs={[["회의", "/meetings"], "회의 등록"]}>
      <Flash error={q(sp, "error")} ok={q(sp, "ok")} />
      <div className="page-h">
        <div>
          <h1>회의 등록</h1>
          <p>녹취록과 참석자를 올리면 바로 AI 실행이 시작돼요. 원본은 그대로 보관해요.</p>
        </div>
      </div>
      <div className="grid2">
        <form action={newMeeting} className="card">
          <div className="card-h"><h2>회의 정보</h2></div>
          <div className="card-b">
            <input type="hidden" name="programId" value={program.id} />
            {sampleKey && sample && <input type="hidden" name="fixtureKey" value={sampleKey} />}
            <div className="fg">
              <label className="eg-label" htmlFor="title">회의 제목</label>
              <input className="eg-input" id="title" name="title" maxLength={200} required defaultValue={sample?.meta.title ?? q(sp,"title")?.slice(0,200) ?? ""} placeholder="예) 3화 촬영지 확정 회의" />
            </div>
            <div className="fg-row">
              <div className="fg">
                <label className="eg-label" htmlFor="occurredAt">회의 일시 (한국 시간)</label>
                <input className="eg-input" id="occurredAt" name="occurredAt" type="datetime-local" required defaultValue={sample ? sample.meta.occurredAt.slice(0, 16) : (q(sp,"at") ?? "")} />
              </div>
              <div className="fg">
                <label className="eg-label" htmlFor="tv">문서 템플릿</label>
                <select className="eg-select" id="tv" name="templateVersionId">
                  {tvs.map((t) => (
                    <option key={t.id} value={t.id}>{t.template.name} v{t.version}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="fg">
              <span className="eg-label">참석자</span>
              <div className="people">
                {staff.map((u) => (
                  <label key={u.id} className="person">
                    <input type="checkbox" name="participants" value={u.id} defaultChecked={picked.has(u.name)} />
                    <RoleAvatar title={u.title} name={u.name} size={32} /><span style={{ flex: 1 }}>{u.name} <span className="muted" style={{ fontSize: 12 }}>{u.title}</span></span>
                    <Team team={/PD/.test(u.title) ? "pd" : "writer"} label={/PD/.test(u.title) ? "PD" : "작가"} />
                  </label>
                ))}
              </div>
              <label className="sr-only" htmlFor="externals">외부 참석자</label><input id="externals" className="eg-input" name="externals" placeholder="외부 참석자 (쉼표로 구분)" style={{ marginTop: 8 }} />
            </div>
            <div className="fg">
              <label className="eg-label" htmlFor="transcript">녹취록</label>
              <textarea className="eg-textarea mono" id="transcript" name="transcript" rows={14} defaultValue={sample?.transcript ?? ""} placeholder={"[00:12] 한지수: 오늘은 3화 촬영지부터 얘기할게요.\n[00:20] 박준호: 강릉 쪽이 좋겠어요."} style={{ fontSize: 12.5 }} />
              <p className="eg-help">한 줄에 <code>[mm:ss] 이름: 발언</code> 형식. 화자가 애매하면 이름 뒤에 <code>?</code>를 붙여 주세요. 텍스트 파일로 올려도 돼요.</p>
              <label className="eg-label" htmlFor="transcript-file">텍스트 파일로 올리기</label><input id="transcript-file" type="file" name="file" accept=".txt,text/plain" style={{ fontSize: 12.5 }} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <Link href="/meetings" className="eg-btn eg-btn--ghost">취소</Link>
              <SubmitButton pendingLabel="등록 중…" className="eg-btn eg-btn--primary"><Icon id="i-play" />등록하고 AI 실행</SubmitButton>
            </div>
          </div>
        </form>
        <div className="stack">
          <div className="card">
            <div className="card-h"><h2>샘플로 시작하기</h2></div>
            <div className="card-b">
              <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>샘플을 선택하면 회의 정보와 녹취록을 불러와요.</p>
              <div className="samples">
                {keys.map((k) => (
                  <Link key={k} href={`/meetings/new?sample=${k}`} className="sample" style={{ textDecoration: "none", ...(k === sampleKey ? { borderColor: "var(--ink)", background: "var(--yellow-50)" } : {}) }}>
                    <b>{readFixture(k).meta.title}</b>
                    <span className="muted">{SAMPLE_HINT[k] ?? k}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <div className="callout y">
            <Icon id="i-alert" />
            <div>체험 공간입니다. 샘플 녹취록을 사용해 주세요.</div>
          </div>
          {sample && (
            <div className="callout b">
              <Icon id="i-help" />
              <div>{sample.meta.note}</div>
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}
