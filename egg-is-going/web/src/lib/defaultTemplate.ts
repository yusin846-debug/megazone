import type { TemplateRules } from "./agents/types";

// 제작회의록 v3 — 프로그램 관리자가 S8에서 새 버전을 만들 수 있다
export const DEFAULT_TEMPLATE: TemplateRules = {
  name: "제작회의록",
  version: 3,
  fields: [
    { id: "overview", label: "회의 개요", source: "meta", required: true, format: "paragraph", rule: "회의 이름·일시·참석자", columns: null },
    { id: "decisions", label: "결정 사항", source: "confirmed", required: true, format: "bullets", rule: "최종안 + 변경 이력 한 줄", columns: null },
    { id: "changes", label: "아이디어 변화", source: "topic_changes", required: false, format: "bullets", rule: "무엇이 왜 바뀌었는지. 이유가 원문에 없으면 쓰지 않음", columns: null },
    { id: "actions", label: "후속 업무", source: "actions", required: true, format: "table", rule: "담당·기한이 없으면 미정", columns: ["업무", "담당", "기한", "근거"] },
    { id: "pending", label: "보류", source: "on_hold", required: false, format: "bullets", rule: "사유·재논의 시점", columns: null },
    { id: "dropped", label: "제외된 안", source: "dropped", required: false, format: "bullets", rule: "이유가 있으면 함께", columns: null },
  ],
};
