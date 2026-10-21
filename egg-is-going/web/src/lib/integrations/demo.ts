// Read-only demo adapter. No OAuth tokens, MCP calls or private account content.
export type Source = "calendar" | "gmail" | "slack";
export type IntegrationItem = { id: string; source: Source; title: string; description: string; time: string; location?: string; attendees?: string; prepareUrl?: string };
export const SOURCES: { id: Source; name: string; initial: string; color: string; scope: string }[] = [
  { id: "calendar", name: "Google Calendar", initial: "31", color: "#416EB5", scope: "예정된 회의 · 읽기 전용" },
  { id: "gmail", name: "Gmail", initial: "M", color: "#B95042", scope: "회의 관련 메일 · 읽기 전용" },
  { id: "slack", name: "Slack", initial: "#", color: "#6B4475", scope: "팀 채널 업데이트 · 읽기 전용" },
];
export function demoItems(program: string, now: Date): IntegrationItem[] {
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
