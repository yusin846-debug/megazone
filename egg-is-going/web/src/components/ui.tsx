import type { ReactNode } from "react";

export const Icon = ({ id, size }: { id: string; size?: number }) => (
  <svg className="ic" style={size ? { width: size, height: size } : undefined} aria-hidden>
    <use href={`#${id}`} />
  </svg>
);

const RUN: Record<string, [string, string]> = {
  queued: ["wait", "대기"],
  running: ["run", "실행 중"],
  waiting_for_human: ["human", "사람 확인 대기"],
  succeeded: ["pass", "완료"],
  failed: ["fail", "실패"],
  cancelled: ["cancel", "취소됨"],
};
export const RunChip = ({ status, cancelRequested }: { status: string; cancelRequested?: boolean }) => {
  if (cancelRequested && status === "running") return <span className="eg-chip eg-chip--cancel">취소 요청 받음</span>;
  const [cls, label] = RUN[status] ?? ["wait", status];
  return <span className={`eg-chip eg-chip--${cls}`}>{label}</span>;
};

const DOC: Record<string, [string, string]> = {
  draft: ["draft", "초안"],
  in_review: ["review", "검토 중"],
  changes_requested: ["changes", "변경 요청"],
  approved: ["approved", "승인됨"],
  superseded: ["superseded", "새 버전으로 대체"],
};
export const DocBadge = ({ status, version }: { status: string; version?: number }) => {
  const [cls, label] = DOC[status] ?? ["draft", status];
  return (
    <span className={`eg-badge eg-badge--${cls}`}>
      {status === "approved" && <Icon id="i-lock" />}
      {label}
      {version ? ` v${version}` : ""}
    </span>
  );
};

const ITEM: Record<string, [string, string]> = {
  proposed: ["proposed", "제안"],
  confirmed: ["confirmed", "확정"],
  on_hold: ["hold", "보류"],
  dropped: ["dropped", "폐기"],
  unknown: ["proposed", "미분류"],
};
export const ItemTag = ({ status }: { status: string }) => {
  const [cls, label] = ITEM[status] ?? ["proposed", status];
  return <span className={`eg-item eg-item--${cls}`}>{label}</span>;
};

export const Team = ({ team, label }: { team: string; label: string }) =>
  team === "external" ? <span className="eg-chip eg-chip--plain">{label}</span> : <span className={`eg-team eg-team--${team === "pd" ? "pd" : "writer"}`}>{label}</span>;

export const Missing = ({ children = "미정" }: { children?: ReactNode }) => <span className="eg-missing">{children}</span>;

export function Flash({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  return (
    <div className={`callout ${error ? "r" : "g"} flash`}>
      <Icon id={error ? "i-alert" : "i-check"} />
      <div>{error ?? ok}</div>
    </div>
  );
}

export const STEP_ICON: Record<string, string> = {
  transcript: "i-wave",
  context: "i-bulb",
  decision: "i-checks",
  compose: "i-doc",
  render: "i-layers",
  verify: "i-search",
};
