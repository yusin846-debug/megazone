export const STEPS = ["transcript", "context", "decision", "compose", "render", "verify"] as const;
export type StepKey = (typeof STEPS)[number];

export const STEP_LABEL: Record<StepKey, string> = {
  transcript: "전사·화자",
  context: "제작 맥락",
  decision: "결정·업무",
  compose: "문서 구성",
  render: "문서 출력",
  verify: "검증",
};

export const RUN_STATUS_LABEL: Record<string, string> = {
  queued: "대기",
  running: "실행 중",
  waiting_for_human: "사람 확인 대기",
  succeeded: "완료",
  failed: "실패",
  cancelled: "취소됨",
};
