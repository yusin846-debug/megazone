import RoleAvatar from "@/components/RoleAvatar";
import SubmitButton from "@/components/SubmitButton";
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
            체험할 팀원을 선택해 주세요.
          </p>
        </div>
        <form action={login} className="card-b" style={{ display: "grid", gap: 8, padding: "16px 28px 28px" }}>
          {users.map((u) => (
            <SubmitButton pendingLabel="로그인 중…" key={u.id} name="userId" value={u.id} className="person" style={{ fontFamily: "inherit", textAlign: "left" }}>
              <RoleAvatar title={u.title} name={u.name} />
              <span style={{ flex: 1 }}>
                <b>{u.name}</b> <span className="muted" style={{ fontSize: 12.5 }}>{u.title}</span>
                <br />
                <small className="muted">{[...new Set(u.memberships.map((m) => ROLE_LABEL[m.role as Role]))].join(" · ")}</small>
              </span>
              {u.title.includes("운영") ? <Team team="external" label="운영" /> : <Team team={/PD/.test(u.title) ? "pd" : "writer"} label={/PD/.test(u.title) ? "PD" : "작가"} />}
            </SubmitButton>
          ))}
        </form>
        <p className="muted" style={{ fontSize: 11.5, padding: "0 28px 20px", margin: 0 }}>체험 공간 · 샘플 팀원</p>
      </div>
    </main>
  );
}
