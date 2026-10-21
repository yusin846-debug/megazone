export const dynamic = "force-dynamic";

import { db } from "@/lib/db";
import { ROLE_LABEL, type Role } from "@/lib/auth";
import { login } from "../actions";
import { Team } from "@/components/ui";

export default async function LoginPage() {
  const ORDER = ["메인 작가", "서브 작가", "막내 작가", "메인 PD", "서브 PD", "막내 PD", "AI 운영 담당"];
  const users = (await db.user.findMany({ include: { memberships: true } })).sort((a, b) => ORDER.indexOf(a.title) - ORDER.indexOf(b.title));
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <div className="card" style={{ width: "min(560px,100%)" }}>
        <div className="card-b" style={{ padding: "28px 28px 8px" }}>
          <span className="eg-wordmark" style={{ fontSize: 26 }}>egg is going<i /></span>
          <h1 style={{ fontSize: 20, margin: "18px 0 4px", letterSpacing: "-.03em" }}>누구로 들어갈까요?</h1>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
            개발용 로그인이에요. 역할에 따라 할 수 있는 일이 달라져요. 실제 배포에서는 회사 계정(SSO)으로 바뀌어요.
          </p>
        </div>
        <form action={login} className="card-b" style={{ display: "grid", gap: 8, padding: "16px 28px 28px" }}>
          {users.map((u) => (
            <button key={u.id} name="userId" value={u.id} className="person" style={{ fontFamily: "inherit", textAlign: "left" }}>
              <svg style={{ width: 24, height: 28, flex: "none" }}><use href="#egg" /></svg>
              <span style={{ flex: 1 }}>
                <b>{u.name}</b> <span className="muted" style={{ fontSize: 12.5 }}>{u.title}</span>
                <br />
                <small className="muted">{[...new Set(u.memberships.map((m) => ROLE_LABEL[m.role as Role]))].join(" · ")}</small>
              </span>
              {u.title.includes("운영") ? <Team team="external" label="운영" /> : <Team team={/PD/.test(u.title) ? "pd" : "writer"} label={/PD/.test(u.title) ? "PD" : "작가"} />}
            </button>
          ))}
        </form>
        <p className="muted" style={{ fontSize: 11.5, padding: "0 28px 20px", margin: 0 }}>가상 제작사 대상 교육 프로젝트 · 실제 기업·인물과 무관</p>
      </div>
    </main>
  );
}
