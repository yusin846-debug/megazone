import type { TemplateField } from "./agents/types";
const sources = new Set(["meta","confirmed","topic_changes","actions","on_hold","dropped"]);
const formats = new Set(["paragraph","bullets","table"]);
export function validateTemplateFields(value: unknown): TemplateField[] {
  if (!Array.isArray(value) || !value.length || value.length > 30) throw new Error("양식 항목은 1~30개로 구성해 주세요.");
  const ids = new Set<string>();
  for (const f of value) {
    if (!f || typeof f !== "object" || typeof f.id !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(f.id) || ids.has(f.id)) throw new Error("양식 항목 이름을 확인해 주세요.");
    ids.add(f.id);
    if (typeof f.label !== "string" || !f.label.trim() || f.label.length > 60 || typeof f.rule !== "string" || !f.rule.trim() || f.rule.length > 500) throw new Error("항목 이름과 작성 기준을 입력해 주세요.");
    if (!sources.has(f.source) || !formats.has(f.format) || typeof f.required !== "boolean") throw new Error("항목의 내용과 표시 방식을 확인해 주세요.");
    if (f.format === "table" && (!Array.isArray(f.columns) || !f.columns.length || f.columns.length > 10 || f.columns.some((c:unknown) => typeof c !== "string" || !c.trim() || c.length > 40) || new Set(f.columns).size !== f.columns.length)) throw new Error("표 열 이름을 중복 없이 입력해 주세요.");
    if (f.format !== "table" && f.columns !== null) throw new Error("표가 아닌 항목에는 열 이름을 지정할 수 없어요.");
  }
  return value as TemplateField[];
}
