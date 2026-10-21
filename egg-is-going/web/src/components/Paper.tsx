// 문서 미리보기 (docx 출력과 같은 배치 규칙). prev를 주면 이전 버전과 달라진 줄을 표시한다.
import type { ComposeOutput, TemplateRules } from "@/lib/agents/types";

const textOf = (b: { text: string | null; cells: string[] | null }) => b.text ?? (b.cells ?? []).join(" | ");

export default function Paper({
  title, sub, tpl, doc, segTime, prev,
}: { title: string; sub: string; tpl: TemplateRules; doc: ComposeOutput; segTime: Map<string, string>; prev?: ComposeOutput | null }) {
  const timeOf = (cell: string) => cell.split(/,\s*/).map((id) => segTime.get(id) ?? id).join(", ");
  const prevSet = prev ? new Set(prev.sections.flatMap((s) => s.blocks.map((b) => `${s.field_id}|${textOf(b)}`))) : null;
  const added = (fid: string, b: { text: string | null; cells: string[] | null }) => !!prevSet && !prevSet.has(`${fid}|${textOf(b)}`);
  const mark = { background: "var(--sage-50)", boxShadow: "-6px 0 0 var(--sage-50), -9px 0 0 var(--sage-500)" };
  return (
    <div className="paper">
      <div className="dt">
        <h2>{title}</h2>
        <span>{sub}</span>
      </div>
      {tpl.fields.map((f, i) => {
        const s = doc.sections.find((x) => x.field_id === f.id);
        const removed = prev?.sections.find((x) => x.field_id === f.id)?.blocks.filter((b) => !s?.blocks.some((n) => textOf(n) === textOf(b))) ?? [];
        return (
          <section key={f.id}>
            <h3>{i + 1}. {f.label}</h3>
            {!s || s.blocks.length === 0 ? (
              <p style={{ color: "#77736b" }}>{f.required ? <span className="flag">필수 항목이 비어 있어요</span> : "해당 없음"}</p>
            ) : f.format === "table" && f.columns ? (
              <table>
                <thead><tr>{f.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>
                  {s.blocks.filter((b) => b.type === "row").map((b, ri) => (
                    <tr key={ri} style={added(f.id, b) ? mark : undefined}>
                      {f.columns!.map((c, ci) => {
                        const raw = b.cells?.[ci] ?? "";
                        const v = c === "근거" ? timeOf(raw) : raw;
                        return <td key={c}>{v === "미정" ? <span className="flag">미정</span> : v}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : f.format === "paragraph" ? (
              s.blocks.map((b, bi) => <p key={bi} style={added(f.id, b) ? mark : undefined}>{b.flags.includes("changed") ? <span className="chg">{textOf(b)}</span> : textOf(b)}</p>)
            ) : (
              <ul>
                {s.blocks.map((b, bi) => (
                  <li key={bi} style={added(f.id, b) ? mark : undefined}>
                    {b.flags.includes("changed") ? <span className="chg">{textOf(b)}</span> : textOf(b)}
                  </li>
                ))}
              </ul>
            )}
            {removed.length > 0 && (
              <ul style={{ marginTop: 4 }}>
                {removed.map((b, bi) => <li key={bi} style={{ color: "#b4492f", textDecoration: "line-through" }}>{textOf(b)}</li>)}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
