// 에이전트 테스트 러너
//   npm run agent:test                 모든 에이전트
//   npm run agent:test decision        한 에이전트
//   npm run agent:test decision 02     이름에 02가 들어간 테스트만
//   AGENT_PROVIDER=anthropic npm run agent:test decision   Claude로 실행 (API 키 필요)
import "./lib/env";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AgentName } from "@/lib/agents/types";
import { currentProvider, runAgent } from "@/lib/agents/runAgent";
import { DEFAULT_TEMPLATE } from "./lib/fixtures";

type Check = { type: string; label?: string; critical?: boolean; [k: string]: unknown };
const AGENTS: AgentName[] = ["transcript", "context", "decision", "compose", "verify"];
const [only, filter] = process.argv.slice(2);
const agents = only ? AGENTS.filter((a) => a === only) : AGENTS;
if (only && !agents.length) {
  console.error(`알 수 없는 에이전트: ${only} (${AGENTS.join(", ")})`);
  process.exit(2);
}

const G = "\x1b[32m", R = "\x1b[31m", D = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";

function at(obj: unknown, p: string, parentWhere?: Where): unknown[] {
  // "topics[].idea_changes" — [] 뒤는 각 원소에서 다시 꺼낸다. parentWhere는 바깥 배열 원소를 거른다.
  const parts = p.split(".");
  let cur: unknown[] = [obj];
  parts.forEach((part, i) => {
    const many = part.endsWith("[]");
    const key = many ? part.slice(0, -2) : part;
    let next = cur.map((o) => (o as Record<string, unknown>)?.[key]);
    if (many) {
      let flat = next.flatMap((v) => (Array.isArray(v) ? v : []));
      if (parentWhere && i === 0) flat = flat.filter((o) => matches(o, parentWhere));
      next = flat;
    }
    cur = next;
  });
  return cur.flatMap((v) => (Array.isArray(v) ? v : [v]));
}

type Where = Record<string, unknown>;
function fieldOk(v: unknown, want: unknown): boolean {
  if (want === null) return v === null || v === undefined;
  if (Array.isArray(want)) return want.some((w) => fieldOk(v, w));
  if (typeof want === "object" && want && "eq" in want) return v === (want as { eq: unknown }).eq;
  if (v === null || v === undefined) return false;
  const hay = Array.isArray(v) ? v.join(" ") : String(v);
  return hay.toLowerCase().includes(String(want).toLowerCase());
}
const matches = (o: unknown, where: Where) => !!o && Object.entries(where).every(([k, w]) => fieldOk((o as Record<string, unknown>)[k], w));

function evaluate(c: Check, input: Record<string, unknown>, output: Record<string, unknown>): [boolean, string] {
  switch (c.type) {
    case "count": {
      const n = at(output, c.path as string).length;
      const ok = n >= ((c.min as number) ?? 0) && n <= ((c.max as number) ?? Infinity);
      return [ok, `${n}개`];
    }
    case "find": {
      const list = at(output, c.path as string, c.parentWhere as Where | undefined);
      return [list.some((o) => matches(o, c.where as Where)), ""];
    }
    case "none": {
      const hit = at(output, c.path as string).find((o) => matches(o, c.where as Where));
      return [!hit, hit ? JSON.stringify(hit).slice(0, 80) : ""];
    }
    case "in":
      return [(c.values as unknown[]).includes(output[c.path as string]), String(output[c.path as string])];
    case "evidence_valid": {
      const ids = new Set(((input.segments as { segment_id: string }[]) ?? []).map((s) => s.segment_id));
      const bad: string[] = [];
      JSON.stringify(output, (k, v) => {
        if (k === "segment_id" && !ids.has(v)) bad.push(v);
        return v;
      });
      return [!bad.length, bad.slice(0, 3).join(", ")];
    }
    case "refs_cover": {
      const refs = new Set(at(output, "sections[].blocks").flatMap((b) => ((b as { refs: string[] }).refs ?? [])));
      const miss = (c.refs as string[]).filter((r) => !refs.has(r));
      return [!miss.length, miss.join(", ")];
    }
    case "no_unknown_refs": {
      const known = new Set<string>([
        ...((input.decisions as { item_key: string }[]) ?? []).map((d) => `d:${d.item_key}`),
        ...((input.action_items as { action_key: string }[]) ?? []).map((a) => `a:${a.action_key}`),
        ...((input.topics as { item_key: string }[]) ?? []).map((t) => `t:${t.item_key}`),
      ]);
      const bad = at(output, "sections[].blocks").flatMap((b) => ((b as { refs: string[] }).refs ?? []).filter((r) => !known.has(r)));
      return [!bad.length, bad.join(", ")];
    }
    case "sections_match_template": {
      const fields = ((input.template as typeof DEFAULT_TEMPLATE) ?? DEFAULT_TEMPLATE).fields.map((f) => f.id);
      const got = ((output.sections as { field_id: string }[]) ?? []).map((s) => s.field_id);
      return [JSON.stringify(fields) === JSON.stringify(got), got.join(",")];
    }
  }
  return [false, `알 수 없는 검사 ${c.type}`];
}

(async () => {
  console.log(`${B}에이전트 테스트${X} ${D}provider=${currentProvider()}${X}\n`);
  let pass = 0, fail = 0, critFail = 0;
  for (const agent of agents) {
    const dir = path.join(process.cwd(), "agents", agent, "examples");
    const names = readdirSync(dir).filter((f) => f.endsWith(".input.json")).map((f) => f.replace(".input.json", "")).filter((n) => !filter || n.includes(filter)).sort();
    console.log(`${B}${agent}${X}`);
    for (const name of names) {
      const input = JSON.parse(readFileSync(path.join(dir, `${name}.input.json`), "utf8"));
      const spec = JSON.parse(readFileSync(path.join(dir, `${name}.check.json`), "utf8")) as { note?: string; checks: Check[] };
      try {
        const r = await runAgent(agent, input);
        const results = spec.checks.map((c) => ({ c, r: evaluate(c, input, r.output as Record<string, unknown>) }));
        const bad = results.filter((x) => !x.r[0]);
        const ok = !bad.length;
        ok ? pass++ : fail++;
        critFail += bad.filter((x) => x.c.critical).length;
        console.log(`  ${ok ? G + "✓" : R + "✗"}${X} ${name.padEnd(18)} ${D}${results.length - bad.length}/${results.length} 통과 · ${r.promptRef} · 토큰 ${r.tokensIn + r.tokensOut} · ${(r.ms / 1000).toFixed(1)}초${X}`);
        for (const b of bad) console.log(`      ${R}✗${X} ${b.c.label ?? b.c.type}${b.r[1] ? ` ${D}(${b.r[1]})${X}` : ""}`);
      } catch (e) {
        fail++;
        console.log(`  ${R}✗ ${name}${X} 실행 오류: ${(e as Error).message}`);
      }
    }
  }
  console.log(`\n${B}결과${X} 통과 ${G}${pass}${X} · 실패 ${fail ? R : G}${fail}${X}${critFail ? ` · ${R}중대 결정 누락 ${critFail}건${X}` : ""}`);
  process.exit(fail ? 1 : 0);
})();
