import Ajv2020 from "ajv/dist/2020";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { AgentName } from "./types";

const ajv = new Ajv2020({ allErrors: true, strict: false });
const cache = new Map<AgentName, { schema: object; validate: ReturnType<typeof ajv.compile> }>();

export const agentsDir = () => path.join(process.cwd(), "agents");

export function loadSchema(name: AgentName) {
  let hit = cache.get(name);
  if (!hit) {
    const schema = JSON.parse(readFileSync(path.join(agentsDir(), name, "schema.json"), "utf8"));
    hit = { schema, validate: ajv.compile(schema) };
    cache.set(name, hit);
  }
  return hit;
}

/** 출력이 schema.json 계약을 지키는지. 어긴 곳을 사람이 읽을 수 있는 문장으로 돌려준다. */
export function checkContract(name: AgentName, output: unknown): string[] {
  const { validate } = loadSchema(name);
  if (validate(output)) return [];
  return (validate.errors ?? []).slice(0, 8).map((e) => `${e.instancePath || "(root)"} ${e.message}`);
}

/** API에 보낼 스키마: $schema·title 같은 메타 키를 뺀다 */
export function apiSchema(name: AgentName): Record<string, unknown> {
  const { $schema, title, ...rest } = loadSchema(name).schema as Record<string, unknown>;
  void $schema; void title;
  return rest;
}

export function loadPrompt(name: AgentName) {
  const text = readFileSync(path.join(agentsDir(), name, "prompt.md"), "utf8");
  const version = text.match(/<!--\s*version:\s*(\d+)\s*-->/)?.[1] ?? "0";
  return { text, version, ref: `${name}@${version}` };
}
