// 모든 에이전트가 쓰는 공통 실행기.
//   runAgent("decision", input) → { output, promptRef, modelRef, tokens, ms }
// 공급자: AGENT_PROVIDER=mock(규칙 기반 기준선) | anthropic(Claude)
// 출력은 언제나 schema.json 계약으로 검사한다. Claude 출력이 계약을 어기면 1회 다시 시도한다.
import type { AgentName, In, Out } from "./types";
import { apiSchema, checkContract, loadPrompt } from "./validate";
import { runBaseline } from "./providers/mock";
import { AgentCallError, callClaude } from "./providers/anthropic";

export type Provider = "mock" | "anthropic";

export type AgentResult<N extends AgentName> = {
  output: Out<N>;
  provider: Provider | "tool";
  promptRef: string;
  modelRef: string;
  tokensIn: number;
  tokensOut: number;
  ms: number;
};

export class ContractError extends Error {
  constructor(readonly agent: AgentName, readonly problems: string[]) {
    super(`${agent} 출력이 schema.json 계약을 어겼습니다: ${problems.join("; ")}`);
  }
}

export const currentProvider = (): Provider => (process.env.AGENT_PROVIDER === "anthropic" ? "anthropic" : "mock");

// A1은 MVP에서 규칙 기반 파서(도구)로 실행한다. 음성 전사는 2단계.
const TOOL_ONLY: AgentName[] = ["transcript"];

export async function runAgent<N extends AgentName>(name: N, input: In<N>, opts: { provider?: Provider } = {}): Promise<AgentResult<N>> {
  const t0 = Date.now();
  const prompt = loadPrompt(name);
  const provider = opts.provider ?? currentProvider();

  if (provider === "mock" || TOOL_ONLY.includes(name)) {
    const output = runBaseline(name, input);
    const problems = checkContract(name, output);
    if (problems.length) throw new ContractError(name, problems);
    return { output, provider: TOOL_ONLY.includes(name) ? "tool" : "mock", promptRef: `${name}@baseline`, modelRef: "rules", tokensIn: 0, tokensOut: 0, ms: Date.now() - t0 };
  }

  let retryNote: string | undefined;
  let tokensIn = 0;
  let tokensOut = 0;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const call = await callClaude({ system: prompt.text, input, schema: apiSchema(name), retryNote });
    tokensIn += call.tokensIn;
    tokensOut += call.tokensOut;
    let parsed: unknown;
    try {
      parsed = JSON.parse(call.text);
    } catch {
      retryNote = "JSON으로 파싱되지 않음";
      continue;
    }
    const problems = checkContract(name, parsed);
    if (!problems.length) {
      return { output: parsed as Out<N>, provider, promptRef: prompt.ref, modelRef: call.model, tokensIn, tokensOut, ms: Date.now() - t0 };
    }
    retryNote = problems.join("; ");
  }
  throw new ContractError(name, [retryNote ?? "알 수 없는 오류"]);
}

export { AgentCallError };
