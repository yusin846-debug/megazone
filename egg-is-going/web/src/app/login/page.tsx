import RoleAvatar from "@/components/RoleAvatar";
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
          <h1>회의가 끝나면,<br /><span>제작이 시작되도록.</span></h1>
          <p className="lg-lead">함께 나눈 이야기가 다음 촬영의 시작이 됩니다.<br />회의의 기록부터 확인과 결재까지, 한곳에서.</p>
        </div>
        <div className="lg-crew" aria-hidden="true"><span className="lg-crew__orbit" /><RoleAvatar title="막내 작가" size={150} /><RoleAvatar title="메인 PD" size={140} /></div>
        <p className="lg-foot">우리의 다음 장면을 만드는 곳.</p>
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
