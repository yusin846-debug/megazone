import { currentUser } from "@/lib/auth";
import { ssoConfigured } from "@/lib/authServer";
import LoginForm from "./LoginForm";
import "./login.css";

export const dynamic = "force-dynamic";
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ sample?: string; error?: string }> }) {
  const [params, user] = await Promise.all([searchParams, currentUser()]);
  return (
    <main className="lg">
      <section className="lg-brand" aria-label="egg is going">
        <span className="eg-wordmark">egg is going<i /></span>
        <div className="lg-brand-main">
          <span className="lg-over">제작회의 워크스페이스</span>
          <h1>회의의 이야기를,<br />다음 장면으로<span className="lg-period">.</span></h1>
          <p className="lg-lead">녹취부터 회의록 확인·결재까지.</p>
        </div>
        <div className="lg-art" aria-hidden="true">
          <img src="/brand/login-studio-v3.webp" width={1800} height={1225} alt="" fetchPriority="high" decoding="async" />
        </div>
      </section>
      <section className="lg-side" aria-label="로그인">
        <div className="lg-card">
          <span className="eg-wordmark lg-mobile-mark">egg is going<i /></span>
          <h2>다시 만나 반가워요.</h2>
          <p className="lg-sub">계정으로 로그인하고, 오늘의 제작을 이어가세요.</p>
          <LoginForm demoEnabled={process.env.EGG_DEMO_LOGIN === "true"} ssoEnabled={ssoConfigured()} initialSample={params.sample} ssoError={Boolean(params.error)} signedInName={user?.name} />
        </div>
      </section>
    </main>
  );
}
