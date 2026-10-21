"use client";
// 실행 중일 때만 2초마다 서버 화면을 새로 그린다
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function AutoRefresh({ active, ms = 2000 }: { active: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [active, ms, router]);
  return null;
}
