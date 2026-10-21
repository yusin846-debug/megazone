"use client";
import EggLoader from "@/components/EggLoader";

import type { ComponentProps } from "react";
import { useFormStatus } from "react-dom";

type Props = ComponentProps<"button"> & { pendingLabel?: string };

export default function SubmitButton({ children, pendingLabel = "저장 중…", disabled, name, value, ...props }: Props) {
  const { pending, data } = useFormStatus();
  const selected = !name || data?.get(name) === String(value ?? "");
  const busy = pending && selected;
  return (
    <button {...props} type={props.type ?? "submit"} name={name} value={value}
      disabled={disabled || pending} aria-busy={busy}>
      {busy ? <><EggLoader /><span role="status">{pendingLabel}</span></> : children}
    </button>
  );
}
