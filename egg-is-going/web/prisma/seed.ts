// 초기 데이터: 가상 제작사 · 프로그램 1개 · 템플릿 1종 (MVP: 1·1·1)
import { PrismaClient } from "@prisma/client";
import { DEFAULT_TEMPLATE } from "../src/lib/defaultTemplate";

const db = new PrismaClient();

const PEOPLE = [
  { sub: "han", name: "한지수", title: "메인 작가", roles: ["writer", "approver"] },
  { sub: "oh", name: "오다은", title: "서브 작가", roles: ["writer", "reviewer"] },
  { sub: "lee", name: "이혜연", title: "막내 작가", roles: ["writer"] },
  { sub: "park", name: "박준호", title: "메인 PD", roles: ["approver", "program_admin"] },
  { sub: "choi", name: "최민재", title: "서브 PD", roles: ["writer"] },
  { sub: "yoon", name: "윤하람", title: "막내 PD", roles: ["writer"] },
  { sub: "ops", name: "정운영", title: "AI 운영 담당", roles: ["operator"] },
];

async function main() {
  if (await db.organization.count()) {
    console.log("이미 초기 데이터가 있어요. 다시 만들려면 npm run db:reset");
    return;
  }
  const org = await db.organization.create({ data: { name: "에그이즈고잉 (가상 제작사)" } });
  const program = await db.program.create({ data: { organizationId: org.id, name: "달걀 한 판 여행기" } });
  for (const p of PEOPLE) {
    const u = await db.user.create({ data: { organizationId: org.id, authSubject: p.sub, name: p.name, title: p.title } });
    for (const role of p.roles) await db.membership.create({ data: { programId: program.id, userId: u.id, role } });
  }
  const tpl = await db.template.create({ data: { programId: program.id, name: DEFAULT_TEMPLATE.name } });
  await db.templateVersion.create({ data: { templateId: tpl.id, version: DEFAULT_TEMPLATE.version, rulesJson: JSON.stringify({ fields: DEFAULT_TEMPLATE.fields }), outputFormat: "docx", status: "approved" } });
  console.log("초기 데이터 완료: 프로그램 ‘달걀 한 판 여행기’, 사용자 7명, 제작회의록 v3");
}

main().finally(() => db.$disconnect());
