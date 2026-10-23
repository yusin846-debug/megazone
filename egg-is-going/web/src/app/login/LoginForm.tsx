"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import RoleAvatar from "@/components/RoleAvatar";
import EggLoader from "@/components/EggLoader";
import { authClient } from "@/lib/authClient";
import { DEMO_ACCOUNTS, demoAccountFor } from "@/lib/demoAccounts";
import { logout } from "../actions";

type Props = { demoEnabled: boolean; ssoEnabled: boolean; initialSample?: string; ssoError: boolean; signedInName?: string };

function Eye({ visible }: { visible: boolean }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />{visible && <path d="m3 3 18 18" />}</svg>;
}

export default function LoginForm({ demoEnabled, ssoEnabled, initialSample, ssoError, signedInName }: Props) {
  const sample = demoEnabled ? demoAccountFor(initialSample ?? "") : undefined;
  const [email, setEmail] = useState<string>(sample?.email ?? "");
  const [password, setPassword] = useState<string>(sample?.password ?? "");
  const [visible, setVisible] = useState(false);
  const [rememberId, setRememberId] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [pending, setPending] = useState<"password" | "sso" | null>(null);
  const [error, setError] = useState(ssoError ? "회사 계정에 연결하지 못했어요. 계정 권한을 확인하거나 다시 시도해 주세요." : "");
  const [help, setHelp] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("eg.savedId");
      if (saved) { if (!sample) setEmail(saved); setRememberId(true); }
    } catch { /* Storage can be blocked by browser privacy settings. */ }
  }, [sample]);

  function selectSample(subject: string) {
    const account = demoAccountFor(subject);
    if (!demoEnabled || !account || pending) return;
    setEmail(account.email); setPassword(account.password); setError(""); setVisible(false);
    submitRef.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const normalized = email.trim().toLowerCase();
    if (!normalized) { setError("아이디를 입력해 주세요."); emailRef.current?.focus(); return; }
    if (!password) { setError("비밀번호를 입력해 주세요."); passwordRef.current?.focus(); return; }
    setError(""); setPending("password");
    try {
      const result = await authClient.signIn.email({ email: normalized, password, rememberMe: false });
      if (result.error) {
        console.warn("Sign-in rejected", { status: result.error.status, code: result.error.code });
        setError(result.error.status === 429 ? "로그인 시도가 많아요. 잠시 후 다시 시도해 주세요." : result.error.status >= 500 ? "로그인 연결에 문제가 있어요. 잠시 후 다시 시도해 주세요." : "아이디 또는 비밀번호를 확인해 주세요.");
        setPending(null); passwordRef.current?.focus(); return;
      }
      try { if (rememberId) localStorage.setItem("eg.savedId", normalized); else localStorage.removeItem("eg.savedId"); } catch { /* Login still works without storage. */ }
      window.location.assign("/auth/complete");
    } catch { setError("연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요."); setPending(null); }
  }

  async function sso() {
    if (pending) return;
    setError("");
    if (!ssoEnabled) { setError("회사 계정 로그인이 아직 연결되지 않았어요. 아이디와 비밀번호로 로그인해 주세요."); return; }
    setPending("sso");
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: "/auth/complete", errorCallbackURL: "/login?error=sso" });
      if (result.error) { setError("회사 계정에 연결하지 못했어요. 다시 시도해 주세요."); setPending(null); }
    } catch { setError("연결이 원활하지 않아요. 잠시 후 다시 시도해 주세요."); setPending(null); }
  }
  const checkCaps = (event: KeyboardEvent<HTMLInputElement>) => setCapsLock(event.getModifierState("CapsLock"));

  return <>
    {signedInName && <div className="lg-session"><span><b>{signedInName}</b>님으로 로그인 중</span><a href="/">홈으로</a><form action={logout}><button type="submit">로그아웃</button></form></div>}
    <form onSubmit={submit} className="lg-form" aria-label="아이디 로그인" aria-busy={pending === "password"}>
      <div className="lg-field"><label htmlFor="login-id">아이디</label><input ref={emailRef} id="login-id" name="email" type="email" autoComplete="username" placeholder="이메일 주소를 입력해 주세요" value={email} onChange={e => { setEmail(e.target.value); setError(""); }} disabled={!!pending} required maxLength={254} /></div>
      <div className="lg-field"><label htmlFor="login-password">비밀번호</label><div className="lg-password"><input ref={passwordRef} id="login-password" name="password" type={visible ? "text" : "password"} autoComplete="current-password" placeholder="비밀번호를 입력해 주세요" value={password} onChange={e => { setPassword(e.target.value); setError(""); }} onKeyUp={checkCaps} onKeyDown={checkCaps} onBlur={() => setCapsLock(false)} disabled={!!pending} required maxLength={128} /><button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "비밀번호 숨기기" : "비밀번호 보기"} aria-pressed={visible} disabled={!!pending}><Eye visible={visible} /></button></div>{capsLock && <small className="lg-caps" role="status">Caps Lock이 켜져 있어요.</small>}</div>
      <div className="lg-options"><label><input type="checkbox" checked={rememberId} onChange={e => { setRememberId(e.target.checked); if (!e.target.checked) { try { localStorage.removeItem("eg.savedId"); } catch { /* optional storage */ } } }} disabled={!!pending} />아이디 저장</label><button type="button" onClick={() => setHelp(!help)} aria-expanded={help}>계정 · 비밀번호 도움</button></div>
      {help && <p className="lg-help">계정 발급이나 비밀번호 변경은 프로그램 관리자에게 요청해 주세요.</p>}
      <div className="lg-error" role="alert" aria-live="polite">{error}</div>
      <button ref={submitRef} type="submit" className="lg-submit" disabled={!!pending}>{pending === "password" ? <><EggLoader />로그인 중…</> : <>로그인<span aria-hidden="true">→</span></>}</button>
    </form>
    <div className="lg-divider">또는</div>
    <button type="button" className="lg-sso" onClick={sso} disabled={!!pending}>{pending === "sso" ? <EggLoader /> : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 7h2m2 0h2M9 11h2m2 0h2m-4 10v-5h2v5" /></svg>}{pending === "sso" ? "회사 계정으로 연결 중…" : "회사 계정으로 로그인"}</button>
    {demoEnabled && <section className="lg-samples" aria-label="테스트 계정"><div className="lg-samples__heading"><b>테스트 계정</b><small>선택하면 로그인 정보가 입력돼요.</small></div><div className="lg-samples__grid">{DEMO_ACCOUNTS.map(account => <button key={account.subject} type="button" disabled={!!pending} onClick={() => selectSample(account.subject)} className={email === account.email ? "selected" : ""} aria-pressed={email === account.email} title={`${account.email} · ${account.title}`}><RoleAvatar name={account.name} title={account.title} size={30} /><span><b>{account.name}</b><small>{account.title}</small></span></button>)}</div><p className="lg-sample-credentials">{DEMO_ACCOUNTS.some(account => account.email === email) ? <><code>{email}</code><span>비밀번호 <code>{DEMO_ACCOUNTS.find(account => account.email === email)?.password}</code></span></> : "역할별로 제작회의 흐름을 둘러보세요."}</p></section>}
  </>;
}
