# egg is going — 제작회의 워크스페이스 (개발판)

가상 예능 제작사의 제작회의 녹취록을 AI 에이전트 5개가 나눠서 정리하고, 애매한 건 사람에게 물어본 뒤, 회의록(docx)을 검토·결재까지 이어 주는 웹앱입니다.
가상 제작사 대상 교육 프로젝트이며 실제 기업·인물과 무관합니다. **실제 회의 녹음·실명은 올리지 마세요.**

## 1. 처음 실행 (5분)

```bash
cd egg-is-going/web
npm install
cp .env.example .env # 전용 PostgreSQL 연결 주소 설정 (실제 값은 커밋하지 않기)
npm run sync:tokens
npm run db:migrate   # 새 전용 DB에만 실행
npm run db:seed      # 가상 제작진 7명·템플릿 시드
npm run dev          # http://localhost:3000
```

로그인 화면에서 사람을 고르면 그 역할로 들어갑니다 (개발용 로그인).

| 사람 | 역할 | 해 볼 일 |
|---|---|---|
| 이혜연 (막내 작가) | 작성자 | 회의 등록 → 확인 요청 답하기 → 상신 |
| 오다은 (서브 작가) | 작성자·검토자 | 검토 후 다음 단계 전달 |
| 박준호 (메인 PD) | 결재자·프로그램 관리자 | 1차 결재, 템플릿 새 버전 |
| 한지수 (메인 작가) | 작성자·결재자 | 2차 결재 |
| 정운영 (AI 운영 담당) | 운영자 | 실행 상태만 보임 (내용 열람 불가) |

## 2. AI 모드

`.env`의 `AGENT_PROVIDER`로 고릅니다.

- `mock` (기본): API 키 없이 `agents/<이름>/baseline.ts` 규칙 기반 기준선으로 돌아갑니다. 화면·흐름 개발용.
- `anthropic`: Claude API를 부릅니다. `ANTHROPIC_API_KEY`를 `.env`에만 넣고 **절대 커밋하지 마세요** (`.env`는 gitignore).

전사(A1)와 문서 출력(docx)은 항상 규칙 도구입니다.

## 3. 팀원별 에이전트 작업

자세한 방법은 `../agent-guide.html`을 보세요. 여러분이 여는 파일은 세 개뿐입니다.

```
agents/<이름>/prompt.md     지시문 (가장 많이 고침)
agents/<이름>/schema.json   출력 계약 (팀 합의 없이 바꾸지 않기)
agents/<이름>/examples/     테스트 (*.input.json + *.check.json, hand_ 로 시작하면 자동 생성이 덮어쓰지 않음)
```

```bash
npm run agent:test                    # 모든 에이전트
npm run agent:test decision           # 한 에이전트
npm run agent:test decision 02        # 한 테스트만
AGENT_PROVIDER=anthropic npm run agent:test decision   # 실제 모델로
npm run agent:examples                # fixtures 정답지에서 예제 다시 만들기
npm run run:fixture 01_opening -- --answer             # 화면 없이 처음부터 끝까지
```

현재 mock 기준선 결과: 17 통과 / 2 실패 (02 번복 이유 "일몰" 추출, 05 겹침 구간의 폐기 판단). 프롬프트 기반 에이전트가 넘어서야 할 기준입니다.

## 4. 구조

```
agents/                  에이전트별 prompt·schema·baseline·examples (+ _baseline 공용 신호 규칙)
fixtures/meetings/       가상 회의 5개 (녹취록·참석자·정답지)
prisma/                  ERD를 옮긴 스키마(PostgreSQL) + 시드
src/lib/agents/          runAgent (호출·계약 검사·1회 재시도), provider(mock/anthropic)
src/lib/orchestrator/    파이프라인(전사→맥락→결정→구성→출력→검증 → 통과/자동 수정/사람 확인), 실행 어댑터
src/lib/render/docx.ts   서식 검사 + docx 출력
src/app/                 화면 S1~S9 + 서버 동작(actions.ts) + docx 내려받기 API
```

| 화면 | 경로 |
|---|---|
| S1 회의 목록 | `/meetings` |
| S2 회의 등록 (가상 샘플 선택) | `/meetings/new` |
| S3 AI 실행 상태 · 단계별 재실행 | `/meetings/[id]/run` |
| S4 작업실 (녹취록 근거 강조 · 직접 고치기) | `/meetings/[id]/workspace` |
| S5 확인 요청 | `/tasks` |
| S6 문서 미리보기 · 상신 | `/meetings/[id]/document` |
| S7 검토·결재 (버전 비교 · 기록) | `/meetings/[id]/review`, `/review` |
| S8 템플릿·정책 | `/templates` |
| S9 PoC 측정 | `/metrics` |

### 지키는 규칙

- 실행 상태(대기/실행 중/사람 확인 대기/완료/실패/취소)와 문서 상태(초안/검토 중/변경 요청/승인)는 따로 관리합니다.
- 사람이 고치거나 답한 값은 **고정(locked)** 되어 AI가 다시 바꾸지 않고, 같은 질문을 다시 하지 않습니다.
- 녹취록 정정은 새 버전으로 남기고 맥락 단계부터, 항목 정정은 문서 구성부터 다시 돌립니다.
- 같은 입력의 실행은 다시 돌리지 않습니다 (실패·취소는 예외).
- 필수 확인이 남아 있으면 상신·승인이 막히고, 승인본은 바꿀 수 없습니다.
- 권한은 화면이 아니라 서버(`requireRole`)에서 검사합니다.

## 5. 아직 안 한 것

- AIR Studio 실행 어댑터 (실제 API 확인 후 `ExecutionAdapter` 구현만 교체)
- 음성 파일 전사 (지금은 텍스트 녹취록만)
- SSO 로그인, 알림(슬랙)
- 결재 순서(순차/공동)는 현업 확인 전 가정입니다.

DB를 처음 상태로 되돌리려면 `npm run db:reset` (개발 DB 전용).


## 6. Vercel 배포 준비

- Vercel 프로젝트: `egg-is-going`, Root Directory: `egg-is-going/web`.
- 빌드 명령: `npm run vercel-build`. Node.js 24.
- 전용 PostgreSQL을 연결하고 `DATABASE_URL`을 배포 환경에 설정해야 합니다. 기존 다른 제품의 DB를 재사용하거나 초기화하지 않습니다.
- DB 연결 후 마이그레이션과 시드를 한 번 실행합니다. 빌드마다 DB를 초기화하지 않습니다.
- 녹취록은 Recording.contentText, DOCX는 DocumentVersion.artifactBytes에 저장하여 인스턴스 교체·재배포 후에도 보존합니다. 텍스트 녹취록 중심 MVP이며 큰 음성 파일은 별도 오브젝트 저장소로 확장합니다.
- 실행을 요청 내에서 await하여 응답 후 작업이 중단되는 문제를 방지합니다. 현재 최대 300초이며, 긴 LLM 실행·장애 후 자동 재개는 별도 durable worker/AIR Studio 어댑터가 필요합니다.
- API 키를 연결하지 않으면 `mock` 기준선 모드입니다. 실제 LLM 품질 검증을 의미하지 않습니다.
- 개발용 역할 선택 로그인은 유지했습니다. 현재 Vercel Deployment Protection을 유지하고, 사내 실사용 전에 SSO를 구현해야 합니다.

검증 상태: mock 테스트는 기존 기준선과 동일하게 17 통과·2 실패(번복 이유, 겹침 구간 폐기 판단). DB 연결 전에는 PostgreSQL 실행·재배포 후 보존 검증을 완료할 수 없습니다.
