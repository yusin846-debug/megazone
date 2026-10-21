import Link from "next/link";
import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { ROLE_LABEL, type Role } from "@/lib/auth";
import { Icon } from "./ui";

type User = { id: string; name: string; title: string; memberships: { role: string }[] };

export default async function Shell({
  user, nav, crumbs, right, children, footer,
}: { user: User; nav: "home" | "tasks" | "review" | "tpl" | "metric"; crumbs: (string | [string, string])[]; right?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const program = await db.program.findFirst();
  const openTasks = await db.humanTask.count({ where: { status: "open" } });
  const myReviews = (await db.reviewRequest.findMany({ where: { status: "open" } })).filter((r) => {
    const p = JSON.parse(r.policySnapshotJson) as { userIds: string[] }[];
    return p[r.currentStep]?.userIds.includes(user.id);
  }).length;
  const roles = [...new Set(user.memberships.map((m) => ROLE_LABEL[m.role as Role]))].join(" · ");
  const item = (k: typeof nav, href: string, icon: string, label: string, cnt?: number) => (
    <Link href={href} className={`navx${nav === k ? " on" : ""}`}>
      <Icon id={icon} />
      {label}
      {cnt ? <span className="cnt">{cnt}</span> : null}
    </Link>
  );
  return (
    <div className="app">
      <aside className="side">
        <Link href="/meetings" className="brand">
          <span className="eg-wordmark" style={{ fontSize: 19 }}>egg is going<i /></span>
        </Link>
        <div className="prog"><small>프로그램</small><b>{program?.name}</b></div>
        {item("home", "/meetings", "i-home", "회의")}
        {item("tasks", "/tasks", "i-inbox", "확인 요청", openTasks)}
        {item("review", "/review", "i-send", "검토·결재", myReviews)}
        <div className="grp">관리</div>
        {item("tpl", "/templates", "i-template", "템플릿·정책")}
        {item("metric", "/metrics", "i-clock", "PoC 측정")}
        <Link href="/login" className="me" title="사용자 바꾸기">
          <svg><use href="#egg" /></svg>
          <div><b>{user.name}</b><small>{roles || user.title}</small></div>
        </Link>
      </aside>
      <div className="main">
        <div className="bar">
          <div className="crumb">
            {crumbs.map((c, i) => (
              <span key={i} style={{ display: "contents" }}>
                {i > 0 && <span>/</span>}
                {Array.isArray(c) ? <Link href={c[1]}>{c[0]}</Link> : i === crumbs.length - 1 ? <b>{c}</b> : <span>{c}</span>}
              </span>
            ))}
          </div>
          <span className="sp" />
          {right}
        </div>
        <div className="body">{children}</div>
        {footer}
      </div>
    </div>
  );
}

export function MeetingTabs({ id, on }: { id: string; on: "run" | "workspace" | "document" | "review" }) {
  const t = (k: typeof on, label: string) => (
    <Link href={`/meetings/${id}/${k}`} className={on === k ? "on" : ""}>{label}</Link>
  );
  return (
    <div className="tabs" style={{ border: "1px solid var(--line)", borderRadius: 14, background: "var(--paper)", marginBottom: 16, display: "inline-flex" }}>
      {t("run", "실행 상태")}
      {t("workspace", "작업실")}
      {t("document", "문서")}
      {t("review", "검토·결재")}
    </div>
  );
}
