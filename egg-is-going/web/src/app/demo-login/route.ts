// 바깥 데모 로그인 화면(login.html)에서 넘어올 때 쓰는 주소.
// 예) /demo-login?u=lee → 샘플 팀원 이혜연으로 로그인한 뒤 홈으로 이동
// 로그인 처리는 기존 login 동작을 그대로 불러 써서, 쿠키·프로그램 선택 규칙이 /login 과 같아요.
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { login } from "../actions";

export const dynamic = "force-dynamic";

// 시드(prisma/seed.ts)의 샘플 팀원만 허용해요.
const SAMPLE_SUBJECTS = new Set(["han", "oh", "lee", "park", "choi", "yoon", "ops"]);

export async function GET(req: NextRequest) {
  const sub = req.nextUrl.searchParams.get("u") ?? "";
  const user = SAMPLE_SUBJECTS.has(sub) ? await db.user.findFirst({ where: { authSubject: sub } }) : null;
  if (!user) return NextResponse.redirect(new URL("/login", req.url));

  const form = new FormData();
  form.set("userId", user.id);
  await login(form); // 쿠키를 저장하고 "/" 로 이동해요 (redirect)
  return NextResponse.redirect(new URL("/", req.url));
}
