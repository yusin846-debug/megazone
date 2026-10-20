# egg is going — 화면 기획 · 디자인 시스템 · 에이전트 가이드

가상 제작사 대상 교육 프로젝트(바이브 코딩 팀플). 실제 기업·AIR Studio 확정 API와 무관.

| 파일 | 내용 |
|---|---|
| `screens.html` | 화면 기획 9개 (S1 회의 목록 ~ S9 PoC 측정). To-Be T01–T07, PRD FR-01–10, ERD 기준 |
| `design-system.html` | 디자인 시스템 v0.1 (색·타이포·간격·아이콘·컴포넌트·문구·개발) |
| `agent-guide.html` | 팀원용 에이전트 제작 가이드 (A1–A5 카드, 프롬프트 시작본, 테스트·완료 기준) |
| `tokens.css` | 디자인 토큰 + 기본 컴포넌트. Next.js `globals.css`에서 `@import` |
| `src/` | 위 HTML의 원본. 수정 후 `python3 egg-is-going/build.py` 로 다시 만들기 |

기준 문서: 제안서(Revised, 13장), 01_Swimlane_AsIs, 02_Swimlane_ToBe, 03_PRD, 04_ERD, 05_AIR_Integration (v0.1, 2026-10-20)

글꼴: Outfit(영문·숫자) · Noto Sans KR(한글) · JetBrains Mono(타임스탬프) — Google Fonts
