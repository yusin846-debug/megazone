// AI 챗봇 API: 지금 선택한 프로그램의 회의 원문 안에서만 검색한다.
// 운영자 역할만 가진 사람은 회의 내용을 볼 수 없으므로 검색도 막는다.
// 조회 기록(FR-08·FR-14a): 질문 1건당 AuditEvent 1행. 질문·답변·원문은 남기지 않는다.
import { canReadContent, currentUser } from "@/lib/auth";
import { audit } from "@/lib/orchestrator/human";
import { activeProgram } from "@/lib/programs";
import { answerQuestion } from "@/lib/chatbot/answer";
import { suggestionsFor } from "@/lib/chatbot/suggestions";

async function scope() {
  const user = await currentUser();
  if (!user) return { error: Response.json({ error: "로그인이 필요해요." }, { status: 401 }) };
  const program = await activeProgram(user.id).catch(() => null);
  if (!program) return { error: Response.json({ error: "참여 중인 프로그램이 없어요." }, { status: 404 }) };
  const readable = await canReadContent(user.id, program.id);
  return { user, program, readable };
}

// ?suggest=1 일 때만 제안 질문을 만든다 (원문 전체를 읽으므로 화면 이동마다 부르지 않는다)
export async function GET(req: Request) {
  const s = await scope();
  if (s.error) return s.error;
  const wantSuggest = new URL(req.url).searchParams.get("suggest") === "1";
  const suggestions = wantSuggest && s.readable ? await suggestionsFor(s.program) : undefined;
  return Response.json({ program: s.program, readable: s.readable, suggestions });
}

export async function POST(req: Request) {
  const s = await scope();
  if (s.error) return s.error;
  if (!s.readable) {
    await audit(s.user.id, "chatbot.search_denied", "Program", s.program.id);
    return Response.json({ error: "운영자 권한으로는 회의 내용을 검색할 수 없어요." }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as { question?: unknown };
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return Response.json({ error: "질문을 입력해 주세요." }, { status: 400 });
  if (question.length > 300) return Response.json({ error: "질문은 300자 이내로 써 주세요." }, { status: 400 });
  await audit(s.user.id, "chatbot.search", "Program", s.program.id);
  const reply = await answerQuestion(s.program.id, question);
  return Response.json({ program: s.program, ...reply });
}
