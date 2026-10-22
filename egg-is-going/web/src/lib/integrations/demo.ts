// Read-only demo adapter. No OAuth tokens, MCP calls or private account content.
import { POC_MEETINGS, POC_PROGRAM, kstDay, pocDate } from "../poc/daemyeong";
export type Source = "calendar" | "gmail" | "slack";
export type IntegrationItem = { id: string; source: Source; title: string; description: string; time: string; location?: string; attendees?: string; prepareUrl?: string };
export const SOURCES: { id: Source; name: string; initial: string; color: string; scope: string }[] = [
  { id: "calendar", name: "Google Calendar", initial: "31", color: "#416EB5", scope: "예정된 회의 · 읽기 전용" },
  { id: "gmail", name: "Gmail", initial: "M", color: "#B95042", scope: "회의 관련 메일 · 읽기 전용" },
  { id: "slack", name: "Slack", initial: "#", color: "#6B4475", scope: "팀 채널 업데이트 · 읽기 전용" },
];
export function demoItems(program: string, now: Date): IntegrationItem[] {
  if (program === POC_PROGRAM) {
    const anchor = kstDay(now);
    return [
      ...POC_MEETINGS.filter(m => m.state === "scheduled").map(m => {
        const at = pocDate(anchor, m.day, m.time);
        const local = new Date(at.getTime() + 9 * 3600000).toISOString().slice(0, 16);
        return { id: `poc-${m.key}`, source: "calendar" as const, title: m.title, description: m.key === "next-production" ? "야외 대기 테이블 협의 결과, 트레커 동의서, 무전기·예비 배터리를 최종 점검합니다. 메뉴 수급과 우천 대응 기준도 함께 확인합니다." : "티저 구성안과 러프컷을 보며 오프닝 순서, 손님 출연 동의, 메뉴 테스트 장면의 본편 반영 여부를 검토합니다.", time: at.toISOString(), location: m.key === "next-production" ? "제작 1회의실 · 60분" : "편집실 · 45분", attendees: "한지수 · 오다은 · 이혜연 · 박준호 · 최민재 · 윤하람", prepareUrl: `/meetings/new?${new URLSearchParams({ title: m.title, at: local })}` };
      }),
      { id: "poc-mail-menu", source: "gmail", title: "[해파랑 상회] 메뉴·알레르기 표시 자료 공유", description: "오다은 → 제작팀\n국물 1종·주먹밥 2종 기준으로 식재료와 알레르기 표시 자료를 정리했습니다. 매운 양념은 별도로 제공하며, 촬영 전 대체 재료와 보관 조건을 함께 확인해 주세요.", time: pocDate(anchor, 0, "09:10").toISOString() },
      { id: "poc-slack-check", source: "slack", title: "#대명이따라-제작 · 첫 영업 촬영 전 확인", description: "최민재 · 서브 PD\n식재료 발주 수량은 확인 중입니다. 야외 대기 테이블은 현장 협의 결과를 받아 공유하겠습니다. 동의서 취합 기한과 무전기 담당도 확인 요청에 남겨두었으니 제작 점검 전에 확인 부탁드립니다.", time: pocDate(anchor, 0, "09:25").toISOString() },
      { id: "poc-mail-safety", source: "gmail", title: "[검토 완료] 동선·우천 대응 보완본 v2", description: "오다은 → 이혜연·박준호\n중앙 보행 통로 확보와 우천 시 야외 대기 중단 기준을 확인했습니다. 보완된 회의록 v2를 다음 결재 단계로 전달했습니다.", time: pocDate(anchor, -2, "10:20").toISOString() },
    ];
  }
  const day = new Date(now.getTime() + 9*3600000).toISOString().slice(0,10);
  const tomorrow = new Date(new Date(`${day}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0,10);
  const meeting = (time: string, title: string) => `/meetings/new?${new URLSearchParams({ title, at: `${tomorrow}T${time}` })}`;
  return [
    { id:"cal-1", source:"calendar", title:`${program} · 구성 회의`, description:"오프닝 구성, 촬영 후보지와 사전 확인 사항을 함께 검토해요.", time:`${tomorrow}T10:00:00+09:00`, location:"제작 1회의실 · 60분", attendees:"한지수 · 이혜연 · 박준호 외 3명", prepareUrl:meeting("10:00",`${program} 구성 회의`) },
    { id:"cal-2", source:"calendar", title:`${program} · 제작 진행 점검`, description:"섭외 진행 상황과 담당자별 준비 사항을 공유해요.", time:`${tomorrow}T14:00:00+09:00`, location:"온라인 · 30분", attendees:"오다은 · 최민재 · 윤하람", prepareUrl:meeting("14:00",`${program} 제작 진행 점검`) },
    { id:"mail-1", source:"gmail", title:"[회의 준비] 구성안 검토 요청", description:`오다은 → 제작팀\n${program} 구성 회의 전에 안건과 보류 항목을 확인해 주세요.`, time:now.toISOString() },
    { id:"slack-1", source:"slack", title:"#제작팀 · 회의 전 확인할 것", description:"최민재 · 서브 PD\n촬영 후보지 확인 사항을 구성 회의에서 공유할게요.", time:now.toISOString() },
  ];
}
