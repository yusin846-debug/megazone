import RoleAvatar from "@/components/RoleAvatar";
import SubmitButton from "@/components/SubmitButton";
export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { ROLE_LABEL, type Role } from "@/lib/auth";
import { login } from "../actions";
import "./login.css";

const ORDER = ["메인 작가", "서브 작가", "막내 작가", "메인 PD", "서브 PD", "막내 PD", "AI 운영 담당"];
// 역할마다 체험해 볼 일 (카드에 마우스를 올리거나 키보드로 오면 보여요)
const TRY: Record<string, string> = {
  writer: "회의 등록 · 확인 응답 · 상신",
  reviewer: "검토 후 전달",
  approver: "회의록 결재",
  program_admin: "템플릿·정책 관리",
  operator: "AI 실행 상태만 확인 (회의 내용은 볼 수 없어요)",
};
// 결재 흐름 그대로의 시연 순서: 작성 → 검토 → 결재 → 결재
const DEMO_FLOW: { title: string; step: string }[] = [
  { title: "막내 작가", step: "작성·상신" },
  { title: "서브 작가", step: "검토" },
  { title: "메인 PD", step: "1차 결재" },
  { title: "메인 작가", step: "2차 결재" },
];

type User = { id: string; name: string; title: string; memberships: { role: string }[] };

const tryText = (u: User) => [...new Set(u.memberships.map((m) => m.role))].map((r) => TRY[r]).filter(Boolean).join(" · ");

function PersonCard({ u }: { u: User }) {
  const roles = [...new Set(u.memberships.map((m) => ROLE_LABEL[m.role as Role]))].join(" · ");
  return (
    <SubmitButton pendingLabel="들어가는 중…" name="userId" value={u.id} className="lg-pick" data-try={tryText(u)}>
      <RoleAvatar title={u.title} name={u.name} size={64} />
      <span className="lg-pick__who">
        <b>{u.name}</b>
        <span>{u.title}</span>
      </span>
      <small>{roles}</small>
    </SubmitButton>
  );
}

export default async function LoginPage() {
  const users = (await db.user.findMany({ include: { memberships: true } })).sort((a, b) => ORDER.indexOf(a.title) - ORDER.indexOf(b.title));
  const teams: [string, User[]][] = [
    ["작가팀", users.filter((u) => !u.title.includes("PD") && !u.title.includes("운영"))],
    ["PD팀", users.filter((u) => u.title.includes("PD"))],
  ];
  const ops = users.filter((u) => u.title.includes("운영"));
  const flow = DEMO_FLOW.flatMap((f) => {
    const user = users.find((u) => u.title === f.title);
    return user ? [{ ...f, user }] : [];
  });

  return (
    <main className="lg">
      {/* 왼쪽: 제품이 하는 일을 화면 조각으로 보여 준다 (녹음 → 정리 → 확인 → 결재) */}
      <section className="lg-brand" aria-hidden="true">
        <span className="lg-blob lg-blob--a" />
        <span className="lg-blob lg-blob--b" />
        <span className="eg-wordmark">egg is going<i /></span>
        <div className="lg-brand-main">
          <span className="lg-over">제작회의 워크스페이스</span>
          <h1>
            회의가 끝나면,
            <br />
            <span className="hl">제작이 시작되도록.</span>
          </h1>
          <ol className="lg-flow">
            <li>녹음</li>
            <li>AI 정리</li>
            <li>사람 확인</li>
            <li>결재</li>
          </ol>
        </div>

        <div className="lg-stage">
          <article className="lg-glass lg-glass--1">
            <span className="lg-glass__meta">녹취록 · 02:40</span>
            <p><b>박준호</b> 비가 오면 야외 대기는 중단하고, 실내 대기로 전환합시다.</p>
          </article>
          <article className="lg-glass lg-glass--2">
            <span className="lg-glass__meta">AI 정리 · 결정</span>
            <p className="lg-glass__title">우천 시 실내 대기로 전환</p>
            <span className="lg-glass__row"><i className="lg-dot lg-dot--ok" />확정<em>근거 02:40</em></span>
          </article>
          <article className="lg-glass lg-glass--3">
            <span className="lg-glass__meta">확인 요청 · 필수</span>
            <p className="lg-glass__title">무전기 점검은 누가 맡나요?</p>
            <span className="lg-glass__chips"><span>담당 지정</span><span>미정으로 두기</span></span>
          </article>
          <article className="lg-glass lg-glass--4">
            <span className="lg-glass__meta">검토·결재</span>
            <p className="lg-glass__title">회의록 v2 승인됨</p>
            <span className="lg-glass__row"><i className="lg-dot lg-dot--ink" />오다은 → 박준호 → 한지수</span>
          </article>
          <span className="lg-egg lg-egg--a"><RoleAvatar title="막내 작가" size={104} /></span>
          <span className="lg-egg lg-egg--b"><RoleAvatar title="메인 PD" size={96} /></span>
        </div>
        <p className="lg-foot">가상 제작진으로 체험하는 데모 공간</p>
      </section>

      {/* 오른쪽: 팀 단위로 고르고, 발표는 시연 순서대로 */}
      <section className="lg-side">
        <div className="lg-card">
          <span className="eg-wordmark lg-mobile-mark">egg is going<i /></span>
          <h2>누구로 들어갈까요?</h2>
          <p className="lg-sub">역할마다 할 수 있는 일이 달라요.<span className="lg-sub__hover"> 카드에 올리면 해 볼 일을 알려 드려요.</span></p>

          {users.length === 0 ? (
            <div className="callout y">
              <svg className="ic"><use href="#i-help" /></svg>
              <span>
                아직 팀원이 없어요. <code>npm run setup</code> 으로 샘플 팀원을 먼저 만들어주세요.
              </span>
            </div>
          ) : (
            <form action={login} className="lg-form">
              {flow.length > 1 && (
                <div className="lg-demo">
                  <span className="lg-demo__label">시연 순서</span>
                  <ol>
                    {flow.map((f, i) => (
                      <li key={f.title}>
                        <SubmitButton pendingLabel="…" name="userId" value={f.user.id} className={`lg-demo__step${i === 0 ? " is-start" : ""}`} aria-label={`${f.step}: ${f.user.name}으로 들어가기`}>
                          <RoleAvatar title={f.user.title} name={f.user.name} size={30} />
                          <span><b>{f.user.name}</b><small>{f.step}</small></span>
                        </SubmitButton>
                      </li>
                    ))}
                  </ol>
                  <span className="lg-demo__hint"><b>여기서 시작</b> · 상신하면 다음 사람 차례예요</span>
                </div>
              )}

              {teams.map(([label, list]) => list.length ? (
                <fieldset key={label} className="lg-team">
                  <legend>{label}</legend>
                  <div className="lg-team__grid">{list.map((u) => <PersonCard key={u.id} u={u} />)}</div>
                </fieldset>
              ) : null)}

              {ops.length > 0 && (
                <fieldset className="lg-team">
                  <legend>운영</legend>
                  {ops.map((u) => (
                    <SubmitButton key={u.id} pendingLabel="들어가는 중…" name="userId" value={u.id} className="lg-ops">
                      <RoleAvatar title={u.title} name={u.name} size={40} />
                      <span className="lg-pick__who"><b>{u.name}</b><span>{u.title}</span></span>
                      <small>{tryText(u)}</small>
                    </SubmitButton>
                  ))}
                </fieldset>
              )}
            </form>
          )}

          <p className="lg-notice">실제 배포에서는 회사 계정(SSO)으로 로그인하고, 계정은 프로그램 관리자가 발급해요.</p>
        </div>
      </section>
    </main>
  );
}
