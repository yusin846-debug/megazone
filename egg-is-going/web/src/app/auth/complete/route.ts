import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { loginProgramFor, programCookieKey } from "@/lib/programSelection";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const user = await requireUser();
  const programs = await db.program.findMany({ where: { memberships: { some: { userId: user.id, role: { not: "operator" } } } } });
  const initial = loginProgramFor(programs, user.authSubject);
  const jar = await cookies();
  jar.delete("eg_user");
  jar.delete("eg_program");
  if (initial) jar.set(programCookieKey(user.id), initial.id, { httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/", maxAge: 31536000 });
  return NextResponse.redirect(new URL("/", request.url));
}
