// docx 내려받기: 내용 열람 권한 확인 + 내보내기 감사 기록
import { readFileSync, existsSync } from "node:fs";
import { db } from "@/lib/db";
import { canReadContent, currentUser } from "@/lib/auth";
import { audit } from "@/lib/orchestrator/human";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await currentUser();
  if (!user) return new Response("로그인이 필요해요.", { status: 401 });
  const dv = await db.documentVersion.findUnique({ where: { id }, include: { document: { include: { meeting: true } } } });
  if (!dv?.artifactPath || !existsSync(dv.artifactPath)) return new Response("문서 파일이 없어요.", { status: 404 });
  if (!(await canReadContent(user.id, dv.document.meeting.programId))) return new Response("문서를 볼 권한이 없어요.", { status: 403 });
  await audit(user.id, "document.export", "DocumentVersion", dv.id);
  const name = `${dv.document.meeting.title}_회의록_v${dv.version}${dv.status === "approved" ? "_승인" : "_초안"}.docx`;
  return new Response(readFileSync(dv.artifactPath), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="meeting_v${dv.version}.docx"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
