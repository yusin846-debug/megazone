"use client";
import EggLoader from "@/components/EggLoader";

import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";

// 이전 조회가 끝난 뒤에만 다음 조회를 예약해 느린 연결에서 요청이 쌓이지 않게 한다.
export default function AutoRefresh({ active, ms = 2500 }: { active: boolean; ms?: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!active || pending) return;
    const timer = setTimeout(() => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    }, ms);
    const onVisible = () => {
      if (document.visibilityState === "visible") startTransition(() => router.refresh());
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, ms, pending, router]);
  return active ? <div className="live-update" role="status"><EggLoader />{pending ? "실행 상태 업데이트 중…" : "처리 중 · 상태가 자동으로 업데이트돼요"}</div> : null;
}
