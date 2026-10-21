// 문서 출력 도구 (규칙 기반, 에이전트 아님)
// 문서 구성 에이전트의 sections → docx. 글꼴·자간·강조는 여기서 규칙대로 적용한다.
// + 서식 검사: 필수 칸, 담당자 명단, 기한 표기
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  AlignmentType, BorderStyle, Document, HeadingLevel, Packer, Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import type { ComposeOutput, Finding, MeetingIn, SegmentIn, TemplateRules } from "../agents/types";
import { fmtMs } from "../agents/types";

const FONT = "Noto Sans KR";

export function formatCheck(doc: ComposeOutput, tpl: TemplateRules, meeting: MeetingIn): Finding[] {
  const issues: Finding[] = [];
  const names = new Set(meeting.participants.map((p) => p.name));
  for (const f of tpl.fields) {
    const s = doc.sections.find((x) => x.field_id === f.id);
    if (!s) {
      issues.push({ type: "format", severity: f.required ? "critical" : "normal", target: `field:${f.id}`, message: `템플릿 칸 ‘${f.label}’이 문서에 없습니다.`, evidence: [], route_to: "compose" });
      continue;
    }
    if (f.required && !s.blocks.length) {
      issues.push({ type: "format", severity: "critical", target: `field:${f.id}`, message: `필수 칸 ‘${f.label}’이 비어 있습니다.`, evidence: [], route_to: "compose" });
    }
    if (f.format === "table" && f.columns) {
      const who = f.columns.indexOf("담당");
      for (const b of s.blocks.filter((b) => b.type === "row")) {
        if ((b.cells?.length ?? 0) !== f.columns.length) {
          issues.push({ type: "format", severity: "normal", target: `field:${f.id}`, message: `‘${f.label}’ 표의 칸 수가 템플릿(${f.columns.length}칸)과 다릅니다.`, evidence: [], route_to: "compose" });
        }
        const v = who >= 0 ? b.cells?.[who] : null;
        if (v && v !== "미정" && !names.has(v.replace(/\s*\(.*\)$/, ""))) {
          issues.push({ type: "format", severity: "normal", target: b.refs[0] ?? `field:${f.id}`, message: `담당 ‘${v}’가 참석자 명단에 없습니다.`, evidence: [], route_to: "compose" });
        }
      }
    }
  }
  return issues;
}

export async function renderDocx(opts: {
  outPath: string;
  program: string;
  templateLabel: string;
  docVersion: number;
  meeting: MeetingIn;
  tpl: TemplateRules;
  doc: ComposeOutput;
  segments: SegmentIn[];
}) {
  const segTime = new Map(opts.segments.map((s) => [s.segment_id, fmtMs(s.start_ms)]));
  const timeOf = (cell: string) => cell.split(/,\s*/).map((id) => segTime.get(id) ?? id).join(", ");
  const run = (text: string, o: { bold?: boolean; size?: number; color?: string; highlight?: boolean } = {}) =>
    new TextRun({ text, font: FONT, bold: o.bold, size: o.size ?? 21, color: o.color, ...(o.highlight ? { highlight: "yellow" as const } : {}) });

  const children: (Paragraph | Table)[] = [
    new Paragraph({ children: [run(`${opts.program} · ${opts.tpl.name}`, { bold: true, size: 34 })], spacing: { after: 80 } }),
    new Paragraph({
      children: [run(`${opts.templateLabel} · 초안 v${opts.docVersion} · 가상 제작사 교육 프로젝트`, { size: 17, color: "77736B" })],
      border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "1D1C18", space: 6 } },
      spacing: { after: 240 },
    }),
  ];

  opts.tpl.fields.forEach((f, i) => {
    const s = opts.doc.sections.find((x) => x.field_id === f.id);
    children.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children: [run(`${i + 1}. ${f.label}`, { bold: true, size: 25 })], spacing: { before: 240, after: 100 } }));
    if (!s) return;
    if (f.format === "table" && f.columns) {
      const rows = s.blocks.filter((b) => b.type === "row");
      if (!rows.length) {
        children.push(new Paragraph({ children: [run("해당 없음", { color: "77736B" })] }));
        return;
      }
      const head = new TableRow({
        tableHeader: true,
        children: f.columns.map((c) => new TableCell({ shading: { type: ShadingType.CLEAR, fill: "F5F2EC", color: "auto" }, children: [new Paragraph({ children: [run(c, { bold: true, size: 19 })] })] })),
      });
      const body = rows.map(
        (b) =>
          new TableRow({
            children: f.columns!.map((c, ci) => {
              const raw = b.cells?.[ci] ?? "";
              const v = c === "근거" ? timeOf(raw) : raw;
              return new TableCell({ children: [new Paragraph({ children: [run(v, { size: 19, highlight: v === "미정" })] })] });
            }),
          }),
      );
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [head, ...body] }));
      return;
    }
    for (const b of s.blocks) {
      const text = b.text ?? (b.cells ?? []).join(" · ");
      children.push(
        new Paragraph({
          bullet: b.type === "bullet" ? { level: 0 } : undefined,
          alignment: AlignmentType.LEFT,
          children: [run(text, { highlight: b.flags.includes("changed") })],
          spacing: { after: 60, line: 340 },
        }),
      );
    }
  });

  const docx = new Document({
    creator: "egg is going",
    title: `${opts.meeting.title} 회의록`,
    styles: { default: { document: { run: { font: FONT, size: 21 } } } },
    sections: [{ children }],
  });
  const buf = await Packer.toBuffer(docx);
  mkdirSync(path.dirname(opts.outPath), { recursive: true });
  writeFileSync(opts.outPath, buf);
  return buf.length;
}
