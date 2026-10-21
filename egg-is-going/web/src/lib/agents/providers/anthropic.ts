// Claude 공급자. prompt.md 를 system 으로, 입력 JSON 을 user 메시지로 보내고
// schema.json 으로 구조화 출력(output_config.format)을 강제한다.
import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;
const getClient = () => (client ??= new Anthropic());

export type LlmCall = { text: string; model: string; tokensIn: number; tokensOut: number };

export class AgentCallError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

export async function callClaude(opts: {
  system: string;
  input: unknown;
  schema: Record<string, unknown>;
  retryNote?: string;
}): Promise<LlmCall> {
  const model = process.env.AGENT_MODEL || "claude-opus-5-5";
  const effort = (process.env.AGENT_EFFORT || "medium") as "low" | "medium" | "high" | "xhigh" | "max";
  const user =
    "다음은 이번 실행의 입력 JSON이다. 지시에 따라 schema 형식의 JSON만 출력하라.\n\n" +
    JSON.stringify(opts.input) +
    (opts.retryNote ? `\n\n직전 출력이 형식을 어겼다. 고칠 점: ${opts.retryNote}` : "");
  try {
    const res = await getClient().beta.messages.create({
      model,
      max_tokens: 16000,
      system: opts.system,
      messages: [{ role: "user", content: user }],
      thinking: { type: "adaptive" },
      output_config: { effort, format: { type: "json_schema", schema: opts.schema } },
      // 안전 분류기가 거절하면 서버에서 대체 모델로 다시 실행 (권장 기본값)
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });
    if (res.stop_reason === "refusal") throw new AgentCallError(`모델이 요청을 거절했습니다 (${res.stop_details?.category ?? "unknown"})`, false);
    if (res.stop_reason === "max_tokens") throw new AgentCallError("출력이 max_tokens에서 잘렸습니다", true);
    const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return { text, model, tokensIn: res.usage.input_tokens, tokensOut: res.usage.output_tokens };
  } catch (e) {
    if (e instanceof AgentCallError) throw e;
    if (e instanceof Anthropic.RateLimitError || e instanceof Anthropic.InternalServerError || e instanceof Anthropic.APIConnectionError) {
      throw new AgentCallError(`일시적 오류: ${(e as Error).message}`, true);
    }
    if (e instanceof Anthropic.APIError) throw new AgentCallError(`API 오류 ${e.status}: ${e.message}`, false);
    throw e;
  }
}
