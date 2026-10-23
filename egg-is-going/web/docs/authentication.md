# 로그인 및 고객사 SSO 연결

첨부 `egg-is-going-login.zip`의 좌우 레이아웃, 아이디 저장, 비밀번호 표시, Caps Lock 안내, 테스트 계정 자동 입력을 기존 React 컴포넌트와 디자인 토큰으로 이식했습니다. HTML 내부의 클라이언트 비밀번호 비교, 가짜 대기, 가짜 비밀번호 재설정 발송, 로그인 우회는 사용하지 않습니다. 기존 3D 역할별 이미지도 재사용합니다.

## 계정과 세션

Better Auth 1.7.12 + 기존 Prisma/PostgreSQL을 사용합니다. 기존 User·Membership·프로그램·회의 데이터는 유지하며 AuthUser를 별도로 연결합니다. 공개 회원가입은 차단합니다. 매 요청에 서명된 세션 토큰과 만료·DB 세션을 검증합니다. 로그아웃은 DB 세션을 무효화합니다. 비밀번호는 라이브러리의 scrypt 해시로 저장하며 입력한 비밀번호를 브라우저 저장소에 보관하지 않습니다. 아이디 저장은 아이디만 저장하며 로그인 유지와 다릅니다.

인증 API는 DB에 공유되는 IP 요청 제한을 사용합니다. 로그인은 1분에 10회로 제한합니다. Vercel이 제공하는 x-real-ip를 사용합니다. 다른 프록시로 옮기면 해당 프록시가 덮어쓰는 신뢰할 수 있는 헤더를 설정해야 합니다.

## 공개 PoC 계정

`EGG_DEMO_LOGIN=true`일 때만 표시·세션 발급합니다. 모두 가상 인물이며 공개된 테스트 비밀번호입니다. 운영 직원 계정으로 전환하거나 실제 자료를 저장할 환경에서는 비활성화해야 합니다. `npm run auth:seed`는 정확한 가상 제작사·이름·직함에만 연결하며 기존 자격 증명을 덮어쓰지 않습니다.

| 이름 | ID | 테스트 비밀번호 |
|---|---|---|
| 이혜연 | lee@egg.test | Egg!Lee2026 |
| 오다은 | oh@egg.test | Egg!Oh2026 |
| 한지수 | han@egg.test | Egg!Han2026 |
| 박준호 | park@egg.test | Egg!Park2026 |
| 최민재 | choi@egg.test | Egg!Choi2026 |
| 윤하람 | yoon@egg.test | Egg!Yoon2026 |
| 정운영 | ops@egg.test | Egg!Ops2026 |

이혜연은 로그인 완료 시 ‘맛따라 길따라 대명이따라’로 진입합니다. 다른 계정은 본인에게 허용된 프로그램 중 기존 선택·최근 회의·기본 정렬 규칙을 유지합니다. 기존 `/demo-login?u=lee` 링크는 폼을 자동 입력하는 주소로만 이동하며 세션을 발급하지 않습니다.

## Google Workspace SSO

현재 고객사 인증 정보가 없으므로 실제 OAuth 연결은 비활성 상태입니다. 버튼은 연결되지 않았다는 안내를 표시하며 인증에 성공한 것처럼 처리하지 않습니다. Google Workspace를 사용하는 경우 다음 값을 Vercel의 비공개 환경 변수로 설정합니다.

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_WORKSPACE_DOMAIN` — 고객사가 확인한 실제 Workspace 도메인
- `BETTER_AUTH_URL=https://egg-is-going.vercel.app` (Production)

Google Cloud OAuth 승인된 리디렉션 URI: `https://egg-is-going.vercel.app/api/auth/callback/google`.

등록된 AuthUser의 이메일과 Google에서 검증한 회사 이메일이 일치해야 합니다. AuthUser.appUserId가 기존 User에 연결되어 있어야 세션을 발급합니다. 새 직원 계정과 권한을 자동 생성하지 않습니다. Workspace 도메인도 인증 결과에서 확인합니다. 조직의 인증 서비스가 Microsoft Entra/Okta/SAML이라면 해당 공급자로 연결해야 합니다. SSO 로그인은 Gmail·Calendar·Slack 자료 접근 권한을 부여하지 않습니다.

## 배포

새 인증 마이그레이션은 AuthUser/AuthSession/AuthAccount/AuthVerification/AuthRateLimit 다섯 테이블과 제약·인덱스만 추가합니다. `npx prisma migrate deploy` 후 `npm run auth:seed`, `npm run build` 순서입니다. 기존 초기 마이그레이션 이력이 없는 DB라면 먼저 이력을 확인하고 올바르게 baseline해야 하며 reset이나 force push를 실행하지 않습니다. 재배포 시 시드는 기존 비밀번호·회의 데이터를 덮어쓰지 않습니다.
