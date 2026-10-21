// 회의 등록 (T01·T02, FR-01): 권한 검증 → 회의·참석자·녹취록·템플릿 버전 기록
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { db } from "./db";
import { requireRole } from "./auth";

export const uploadDir = () => path.join(process.cwd(), "data", "uploads");
export const fixtureDir = () => path.join(process.cwd(), "fixtures", "meetings");

export type NewMeeting = {
  programId: string;
  title: string;
  occurredAt: Date;
  templateVersionId: string;
  transcript: string;
  participantUserIds: string[];
  externalNames: string[];
  fixtureKey?: string | null;
};

export function validateTranscript(text: string) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const ok = lines.filter((l) => /^\[(?:\d+:)?\d{1,3}:\d{2}\]\s*[^:：]+[:：]/.test(l.trim()));
  if (!lines.length) return "녹취록이 비어 있어요.";
  if (ok.length < lines.length * 0.6) return "녹취록 형식이 달라요. 한 줄에 `[mm:ss] 이름: 발언` 형식으로 써 주세요.";
  return null;
}

export async function createMeeting(actorId: string, m: NewMeeting) {
  await requireRole(actorId, m.programId, ["writer"]);
  if (!m.title.trim() || m.title.length > 200) throw new Error("회의 제목을 200자 이내로 입력해 주세요.");
  if (Number.isNaN(m.occurredAt.getTime())) throw new Error("회의 일시를 확인해 주세요.");
  if (m.transcript.length > 500000) throw new Error("녹취록은 50만 자 이내로 올려 주세요.");
  const err = validateTranscript(m.transcript);
  if (err) throw new Error(err);
  const tv = await db.templateVersion.findUniqueOrThrow({ where: { id: m.templateVersionId }, include: { template: true } });
  if (tv.template.programId !== m.programId || tv.status !== "approved") throw new Error("이 프로그램의 승인된 템플릿 버전이 아니에요.");

  const users = await db.user.findMany({ where: { id: { in: m.participantUserIds }, memberships: { some: { programId: m.programId, role: { not: "operator" } } } } });
  if (users.length !== new Set(m.participantUserIds).size) throw new Error("프로그램에 참여 중인 참석자를 골라 주세요.");
  if (!users.length && !m.externalNames.some(n => n.trim())) throw new Error("참석자를 한 명 이상 선택해 주세요.");
  const lastStamp = m.transcript.trim().split(/\r?\n/).at(-1)?.match(/^\[(?:(\d+):)?(\d{1,3}):(\d{2})\]/);
  const durationMs = lastStamp ? ((Number(lastStamp[1] ?? 0) * 60 + Number(lastStamp[2])) * 60 + Number(lastStamp[3]) + 5) * 1000 : 0;
  const meeting = await db.meeting.create({
    data: {
      programId: m.programId,
      title: m.title,
      occurredAt: m.occurredAt,
      createdById: actorId,
      templateVersionId: m.templateVersionId,
      fixtureKey: m.fixtureKey ?? null,
      participants: {
        create: [
          ...users.map((u) => ({ userId: u.id, displayName: u.name, roleLabel: u.title, team: /PD/.test(u.title) ? "pd" : "writer" })),
          ...m.externalNames.filter(Boolean).map((n) => ({ displayName: n, roleLabel: "외부 참석자", team: "external" })),
        ],
      },
    },
  });
  const objectKey = `db:recording:${meeting.id}`;
  await db.recording.create({
    data: { meetingId: meeting.id, kind: "text", objectKey, contentText: m.transcript, hash: createHash("sha256").update(m.transcript).digest("hex"), durationMs },
  });
  return meeting;
}

export function readFixture(key: string) {
  const dir = path.join(fixtureDir(), key);
  return {
    meta: JSON.parse(readFileSync(path.join(dir, "meeting.json"), "utf8")) as { title: string; occurredAt: string; participants: string[]; note: string },
    transcript: readFileSync(path.join(dir, "transcript.txt"), "utf8"),
  };
}
