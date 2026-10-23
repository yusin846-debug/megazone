import { NextResponse, type NextRequest } from "next/server";
import { demoAccountFor } from "@/lib/demoAccounts";

// Legacy links can preselect a sample, but must never create a session on GET.
export async function GET(request: NextRequest) {
  const sample = process.env.EGG_DEMO_LOGIN === "true" && demoAccountFor(request.nextUrl.searchParams.get("u") ?? "");
  const destination = new URL("/login", request.url);
  if (sample) destination.searchParams.set("sample", sample.subject);
  return NextResponse.redirect(destination);
}
