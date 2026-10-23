/** Public, fictional PoC accounts. Never use these credentials for employee accounts. */
export const DEMO_ACCOUNTS = [
  { subject: "lee", email: "lee@egg.test", password: "Egg!Lee2026", name: "이혜연", title: "막내 작가" },
  { subject: "oh", email: "oh@egg.test", password: "Egg!Oh2026", name: "오다은", title: "서브 작가" },
  { subject: "han", email: "han@egg.test", password: "Egg!Han2026", name: "한지수", title: "메인 작가" },
  { subject: "park", email: "park@egg.test", password: "Egg!Park2026", name: "박준호", title: "메인 PD" },
  { subject: "choi", email: "choi@egg.test", password: "Egg!Choi2026", name: "최민재", title: "서브 PD" },
  { subject: "yoon", email: "yoon@egg.test", password: "Egg!Yoon2026", name: "윤하람", title: "막내 PD" },
  { subject: "ops", email: "ops@egg.test", password: "Egg!Ops2026", name: "정운영", title: "AI 운영 담당" },
] as const;

export function demoAccountFor(subject: string) {
  return DEMO_ACCOUNTS.find(account => account.subject === subject);
}
