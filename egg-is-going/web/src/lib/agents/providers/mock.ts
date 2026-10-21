// mock 공급자 = 각 에이전트 폴더의 baseline.ts (규칙 기반 기준선). API 키 없이 전체 흐름을 돌린다.
import type { AgentName, In, Out } from "../types";
import transcript from "@agents/transcript/baseline";
import context from "@agents/context/baseline";
import decision from "@agents/decision/baseline";
import compose from "@agents/compose/baseline";
import verify from "@agents/verify/baseline";

const baselines: { [N in AgentName]: (input: In<N>) => Out<N> } = { transcript, context, decision, compose, verify };

export function runBaseline<N extends AgentName>(name: N, input: In<N>): Out<N> {
  return baselines[name](input);
}
