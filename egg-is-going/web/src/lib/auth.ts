// 개발용 로그인: 쿠키에 사용자 id. (실제 배포에서는 SSO/IAM으로 교체)
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";

export async function currentUser() {
  const id = (await cookies()).get("eg_user")?.value;
  if (!id) return null;
  return db.user.findUnique({ where: { id }, include: { memberships: true } });
}

export async function requireUser() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export type Role = "writer" | "reviewer" | "approver" | "program_admin" | "operator";
export const ROLE_LABEL: Record<Role, string> = { writer: "작성자", reviewer: "검토자", approver: "결재자", program_admin: "프로그램 관리자", operator: "운영자" };

export async function rolesIn(userId: string, programId: string): Promise<Role[]> {
  const ms = await db.membership.findMany({ where: { userId, programId } });
  return ms.map((m) => m.role as Role);
}

/** 백엔드 권한 검사 (FR-08). 화면에서 버튼을 숨겨도 서버에서 한 번 더 막는다. */
export async function requireRole(userId: string, programId: string, allowed: Role[]) {
  const roles = await rolesIn(userId, programId);
  if (!roles.some((r) => allowed.includes(r))) {
    throw new Error(`권한이 없어요 (필요: ${allowed.map((r) => ROLE_LABEL[r]).join("·")})`);
  }
  return roles;
}

/** 녹음·문서 내용을 볼 수 있는지 — 운영자만 가진 사람은 내용 접근 불가 */
export async function canReadContent(userId: string, programId: string) {
  const roles = await rolesIn(userId, programId);
  return roles.some((r) => r !== "operator");
}
