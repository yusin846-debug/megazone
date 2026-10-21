// 디버그: 가상 회의 하나로 기준선 결과를 출력  npx tsx scripts/debug-agent.ts 01_opening decision
import contextBaseline from "@agents/context/baseline";
import decisionBaseline from "@agents/decision/baseline";
import { loadFixture, meetingIn, segmentsOf } from "./lib/fixtures";
const [key = "01_opening", agent = "decision"] = process.argv.slice(2);
const f = loadFixture(key); const meeting = meetingIn(f); const segments = segmentsOf(f);
const topics = contextBaseline({ meeting, segments, feedback: [] }).topics;
if (agent === "context") console.log(JSON.stringify(topics, null, 1));
else console.log(JSON.stringify(decisionBaseline({ meeting, segments, topics: [], locked: { items: [], actions: [] }, feedback: [] }), null, 1));
