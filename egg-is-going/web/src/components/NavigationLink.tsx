"use client";
import EggLoader from "@/components/EggLoader";

import NextLink, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

function PendingIndicator() {
  const { pending } = useLinkStatus();
  return pending ? <span className="link-pending" role="status"><EggLoader /><span className="sr-only">화면 불러오는 중</span></span> : null;
}

export default function NavigationLink({ children, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink {...props}>{children}<PendingIndicator /></NextLink>;
}
