import RoleAvatar from "./RoleAvatar";
import ProgramSwitcher from "./ProgramSwitcher";
import { activeProgram, programsFor } from "@/lib/programs";
import Link from "@/components/NavigationLink";
import type { ReactNode } from "react";
import { db } from "@/lib/db";
import { ROLE_LABEL, type Role } from "@/lib/auth";
import { Icon } from "./ui";

type User = { id: string; name: string; title: string; memberships: { role: string }[] };

export default async function Shell({
  user, nav, crumbs, right, children, footer, programId,
}: { user: User; programId?: string; nav: "dashboard" | "programs" | "home" | "tasks" | "review" | "tpl" | "metric"; crumbs: (string | [string, string])[]; right?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  const [defaultProgram, programs] = await Promise.all([activeProgram(user.id), programsFor(user.id)]);
  const program = programs.find(p => p.id === programId) ?? defaultProgram;
  const visible = { programId: program.id };
  const [openTasks, reviews] = await Promise.all([
    db.humanTask.count({ where: { status: "open", run: { meeting: visible } } }),
    db.reviewRequest.findMany({ where: { status: "open", documentVersion: { document: { meeting: visible } } }, select: { policySnapshotJson: true, currentStep: true } }),
  ]);
  const myReviews = reviews.filter((r) => {
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
        <Link href="/" className="brand">
          <span className="eg-wordmark" style={{ fontSize: 19 }}>egg is going<i /></span>
        </Link>
        <ProgramSwitcher programs={programs} activeId={program.id} homeLink={item("dashboard", "/", "i-home", "홈")} />
        {item("home", "/meetings", "i-home", "회의")}
        {item("tasks", "/tasks", "i-inbox", "확인 요청", openTasks)}
        {item("review", "/review", "i-send", "검토·결재", myReviews)}
        <div className="grp">관리</div>
        {item("tpl", "/templates", "i-template", "템플릿·정책")}
        {item("metric", "/metrics", "i-clock", "업무 시간")}
        <Link href="/login" className="me" title="사용자 바꾸기">
          <RoleAvatar title={user.title} name={user.name} />
          <div><b>{user.name}</b><small>{user.title} · {roles}</small></div>
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
          <form action="/meetings" className="global-search" role="search"><label className="sr-only" htmlFor="global-q">회의·결정 검색</label><input id="global-q" name="q" type="search" placeholder="회의·결정 검색" maxLength={100}/><button aria-label="회의·결정 검색"><Icon id="i-search" /></button></form>
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
