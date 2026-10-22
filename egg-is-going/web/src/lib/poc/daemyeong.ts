// Curated fictional production records for the PoC, not actual broadcast records.
import type { ItemStatus } from "../agents/types";

export const POC_PROGRAM = "맛따라 길따라 대명이따라";
export const POC_VERSION = "daemyeong-v1";
export const POC_LOGIN_SUBJECT = "lee";
export type PocDecision = { key: string; title: string; status: ItemStatus; value: string | null; evidence: number[]; reason?: string; change?: { from: string; reason: string } };
export type PocAction = { key: string; description: string; who: string | null; dueDay: number | null; evidence: number[] };
export type PocQuestion = { kind: "item_status" | "action_due" | "action_assignee"; target: string; question: string; evidence: number[] };
export type PocMeeting = {
  key: string; title: string; day: number; time: string;
  state: "approved" | "in_review" | "waiting" | "draft" | "scheduled";
  lines: { who: string; text: string }[];
  decisions: PocDecision[]; actions: PocAction[]; questions?: PocQuestion[];
};

/** Date offsets are calendar days in Seoul, independent of the machine timezone. */
export function pocDate(anchor: string, offset: number, time = "10:00") {
  const day = new Date(`${anchor}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || Number.isNaN(day.getTime()) || day.toISOString().slice(0, 10) !== anchor) throw new Error("기준일은 YYYY-MM-DD 형식이어야 합니다.");
  day.setUTCDate(day.getUTCDate() + offset);
  return new Date(`${day.toISOString().slice(0, 10)}T${time}:00+09:00`);
}
export const kstDay = (now: Date) => new Date(now.getTime() + 9 * 3600000).toISOString().slice(0, 10);

export const POC_MEETINGS: PocMeeting[] = [
  {
    key: "format", title: "해파랑 상회 콘셉트·오프닝 구성 회의", day: -7, time: "14:00", state: "approved",
    lines: [
      { who: "han", text: "오프닝은 출연진이 해파랑길을 걷다가 상회에 들어오는 안으로 먼저 잡아볼게요." },
      { who: "park", text: "걷는 장면보다 상회 문을 여는 순간부터 시작합시다. 손님을 맞는 식당이라는 콘셉트가 먼저 보여야 해요." },
      { who: "han", text: "좋아요. 해파랑 상회 문을 열고 세 사람이 영업을 준비하는 장면으로 오프닝을 확정하겠습니다." },
      { who: "oh", text: "메뉴는 지역 식재료로 만든 한 끼로 제안하고, 구체적인 품목은 테스트 후 정하겠습니다." },
      { who: "park", text: "드론으로 해안도로를 길게 따라가는 안은 빼죠. 상회와 손님에게 집중하겠습니다." },
      { who: "lee", text: "제가 오프닝 구성안과 필요한 소품 목록을 정리하겠습니다. 다음 구성 회의 전날까지 공유할게요." },
    ],
    decisions: [
      { key: "t_opening", title: "상회 오픈 오프닝", status: "confirmed", value: "상회 문을 열고 세 출연자가 영업을 준비하는 장면으로 시작한다.", evidence: [1, 2, 3], change: { from: "해파랑길을 걷다가 상회에 도착", reason: "손님을 맞는 식당 콘셉트를 먼저 보여주기 위해" } },
      { key: "t_menu", title: "지역 식재료 메뉴", status: "on_hold", value: null, evidence: [4], reason: "구체적인 메뉴는 테스트 후 결정" },
      { key: "t_drone", title: "해안도로 드론 오프닝", status: "dropped", value: null, evidence: [5], reason: "상회와 손님에게 집중" },
    ],
    actions: [{ key: "a_opening", description: "오프닝 구성안·상회 소품 목록 정리", who: "lee", dueDay: -4, evidence: [6] }],
  },
  {
    key: "safety", title: "해파랑 상회 사전답사·안전 동선 회의", day: -3, time: "11:00", state: "in_review",
    lines: [
      { who: "choi", text: "상회 앞 트레커 통행로가 좁습니다. 카메라와 대기 줄이 길을 막지 않도록 구역을 나눠야 합니다." },
      { who: "park", text: "출입구 오른쪽은 촬영 구역, 왼쪽은 손님 대기 구역으로 나누고 가운데 보행 통로를 계속 비워두는 것으로 확정하죠." },
      { who: "yoon", text: "제가 동선 안내도를 수정하고 안내 표지 위치도 표시해서 내일까지 공유하겠습니다." },
      { who: "oh", text: "우천 시에는 야외 대기를 멈추고 실내 입장 인원을 조절하는 안이 필요해요." },
      { who: "park", text: "맞아요. 비가 오면 야외 대기는 중단하고, 현장 안전 담당 확인 후 실내 대기로 전환합시다. 보행 통로는 그대로 확보하고요." },
      { who: "lee", text: "우천 대응과 통행로 확보 기준을 회의록에 보완해서 다시 상신하겠습니다." },
    ],
    decisions: [
      { key: "t_route", title: "손님·촬영 동선 분리", status: "confirmed", value: "출입구 오른쪽은 촬영, 왼쪽은 대기 구역으로 나누고 중앙 보행 통로를 확보한다.", evidence: [1, 2] },
      { key: "t_rain", title: "우천 시 대기 운영", status: "confirmed", value: "우천 시 야외 대기를 중단하고 안전 담당 확인 후 실내 대기로 전환한다.", evidence: [4, 5, 6] },
    ],
    actions: [{ key: "a_route", description: "동선 안내도·안내 표지 위치 수정", who: "yoon", dueDay: -2, evidence: [3] }],
  },
  {
    key: "menu", title: "상회 메뉴 테스트·식재료 수급 회의", day: -2, time: "15:00", state: "approved",
    lines: [
      { who: "han", text: "트레커가 잠깐 쉬면서 먹을 수 있도록 따뜻한 국물 메뉴와 주먹밥 조합을 테스트했습니다." },
      { who: "park", text: "국물 한 가지와 주먹밥 두 가지 조합으로 준비합시다. 매운 양념은 별도로 제공하는 것으로 확정할게요." },
      { who: "oh", text: "알레르기 표시용으로 사용 식재료와 대체 가능한 재료를 제가 정리해서 내일까지 공유하겠습니다." },
      { who: "choi", text: "촬영 당일 쓸 식재료는 제가 수급하겠습니다. 전날 오후까지 발주 수량과 보관 조건을 확인하겠습니다." },
      { who: "park", text: "추가 디저트는 준비 동선이 복잡해지니 이번에는 제외하죠." },
    ],
    decisions: [
      { key: "t_set", title: "상회 기본 한 끼 구성", status: "confirmed", value: "따뜻한 국물 한 가지와 주먹밥 두 가지를 준비하고, 매운 양념은 별도로 제공한다.", evidence: [1, 2] },
      { key: "t_dessert", title: "추가 디저트 제공", status: "dropped", value: null, evidence: [5], reason: "주방 준비 동선이 복잡해져 이번 촬영에서 제외" },
    ],
    actions: [
      { key: "a_allergy", description: "식재료·알레르기 표시 및 대체 재료 목록 정리", who: "oh", dueDay: -1, evidence: [3] },
      { key: "a_supply", description: "식재료 발주 수량·보관 조건 확인", who: "choi", dueDay: 1, evidence: [4] },
    ],
  },
  {
    key: "shoot", title: "첫 영업 촬영 준비·섭외 점검 회의", day: -1, time: "16:00", state: "waiting",
    lines: [
      { who: "han", text: "첫 손님이 들어오기 전 출연진의 메뉴 준비와 역할 분담부터 담는 구성으로 가겠습니다." },
      { who: "park", text: "좋아요. 영업 준비 장면부터 촬영하는 것은 확정하고, 트레커 인터뷰는 식사 후 동의하신 분만 진행합시다." },
      { who: "choi", text: "상회 바깥에 대기 테이블을 두는 안은 현장 협의가 아직 끝나지 않았습니다. 이번에 쓰는 것으로 결정한 건지 다시 확인이 필요합니다." },
      { who: "lee", text: "섭외 동의서 최신 양식은 제가 취합하겠습니다. 공유 기한은 아직 전달받지 못했습니다." },
      { who: "yoon", text: "휴대용 무전기 수량과 예비 배터리도 확인해야 합니다. 이 건 담당은 아직 정하지 않았어요." },
      { who: "park", text: "야외 대기 테이블, 동의서 기한, 무전기 담당은 확인 후 회의록을 확정합시다. 내일 제작팀에서 다시 점검하죠." },
    ],
    decisions: [
      { key: "t_shoot_order", title: "첫 영업 촬영 순서", status: "confirmed", value: "영업 준비와 역할 분담부터 촬영하고, 식사 후 동의한 손님만 인터뷰한다.", evidence: [1, 2] },
      { key: "t_outdoor", title: "야외 대기 테이블 설치", status: "proposed", value: null, evidence: [3, 6], reason: "현장 협의 및 최종 결정 여부 확인 필요" },
    ],
    actions: [
      { key: "a_consent", description: "트레커 출연·촬영 동의서 최신 양식 취합", who: "lee", dueDay: null, evidence: [4, 6] },
      { key: "a_radio", description: "무전기 수량·예비 배터리 점검", who: null, dueDay: 0, evidence: [5, 6] },
    ],
    questions: [
      { kind: "item_status", target: "d:t_outdoor.status", question: "야외 대기 테이블 설치는 확정됐나요, 현장 협의 후 보류인가요?", evidence: [3, 6] },
      { kind: "action_due", target: "a:a_consent.due_at", question: "트레커 촬영 동의서 최신 양식은 언제까지 취합하나요?", evidence: [4, 6] },
      { kind: "action_assignee", target: "a:a_radio.assignee", question: "무전기 수량과 예비 배터리 점검은 누가 맡나요?", evidence: [5, 6] },
    ],
  },
  {
    key: "edit", title: "상회 티저·첫 영업 편집 방향 회의", day: 0, time: "09:30", state: "draft",
    lines: [
      { who: "han", text: "티저는 세 사람이 손님을 기다리는 장면에서 시작하면 어떨까요?" },
      { who: "park", text: "메뉴 준비 중 서로 역할을 나누는 장면을 먼저 보여주고, 첫 손님을 맞는 표정으로 마무리합시다. 그 순서로 확정하죠." },
      { who: "oh", text: "제가 티저 구성안을 내일 오후까지 정리하겠습니다." },
      { who: "choi", text: "실제 손님 얼굴이 나오는 컷은 동의 여부를 먼저 대조하겠습니다. 제가 내일 오전까지 체크리스트를 만들게요." },
      { who: "park", text: "메뉴가 결정되기 전 테스트 장면은 본편에 넣을지 아직 보류하고, 러프컷을 보고 다시 판단하죠." },
    ],
    decisions: [
      { key: "t_teaser", title: "티저 장면 구성", status: "confirmed", value: "메뉴 준비와 역할 분담으로 시작해 첫 손님을 맞는 표정으로 마무리한다.", evidence: [1, 2], change: { from: "손님을 기다리는 장면으로 시작", reason: "제작진이 최종 장면 순서를 변경" } },
      { key: "t_test_cut", title: "메뉴 테스트 장면 본편 반영", status: "on_hold", value: null, evidence: [5], reason: "러프컷 확인 후 재논의" },
    ],
    actions: [
      { key: "a_teaser", description: "티저 구성안 정리", who: "oh", dueDay: 1, evidence: [3] },
      { key: "a_rights", description: "손님 출연 동의·사용 가능 컷 체크리스트 작성", who: "choi", dueDay: 1, evidence: [4] },
    ],
  },
  { key: "next-production", title: "첫 영업 촬영 D-1 최종 제작 점검", day: 1, time: "10:00", state: "scheduled", lines: [], decisions: [], actions: [] },
  { key: "next-preview", title: "상회 티저 러프컷 시사·구성 회의", day: 2, time: "14:00", state: "scheduled", lines: [], decisions: [], actions: [] },
];
