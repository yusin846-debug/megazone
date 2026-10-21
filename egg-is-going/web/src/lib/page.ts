// 화면 공용: 쿼리 읽기, 회의 접근 확인
import { notFound } from "next/navigation";
import { db } from "./db";
import { rolesIn } from "./auth";

export type SP = Promise<Record<string, string | string[] | undefined>>;
export type IdParams = Promise<{ id: string }>;

export const q = (sp: Record<string, string | string[] | undefined>, k: string) => {
  const v = sp[k];
  return Array.isArray(v) ? v[0] : v;
};

/** 회의 + 내 역할. 운영자만 가진 사람은 내용 화면을 못 본다 (실행 상태는 볼 수 있음) */
export async function meetingFor(id: string, userId: string, opts: { content?: boolean } = {}) {
  const meeting = await db.meeting.findUnique({ where: { id }, include: { program: true, participants: true } });
  if (!meeting) notFound();
  const roles = await rolesIn(userId, meeting.programId);
  const readable = roles.some(r => r !== "operator");
  if (opts.content && !readable) throw new Error("운영자 권한으로는 회의 내용을 볼 수 없어요. 실행 상태만 볼 수 있어요.");
  return { meeting, roles, readable };
}

export const fmtDur = (sec: number) => {
  if (sec < 60) return `${sec}초`;
  const m = Math.round(sec / 60);
  return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간 ${m % 60}분`;
};

export const ago = (d: Date) => {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  return `${Math.floor(s / 86400)}일 전`;
};
