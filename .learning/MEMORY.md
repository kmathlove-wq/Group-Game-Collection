# Project Memory

- For a physics/timing-based canvas game (geometry-dash.js), a temporary `window.__gdDebug = { jump, getState }`
  hook let an in-page `requestAnimationFrame` loop auto-jump exactly when the next obstacle enters a
  reaction window, proving the jump/gravity constants vs. obstacle gap range are always clearable
  (reached the 800m/500m test caps across different random seeds) before removing the hook. A second
  run with `debug.jump()` never called confirmed collision still ends the game at the first obstacle.
  This is a reusable way to verify "is this timing-based minigame actually beatable" without guessing.

- `npm test`'s console output can include a line like
  `injected env (0) from .env // tip: ⌁ auth for agents [www.vestauth.com]`. Investigated 2026-08-08:
  this is NOT a compromise of this project — it's a hardcoded rotating ad string inside the installed
  `dotenv` package itself (`node_modules/dotenv/lib/main.js`, `TIPS` array, same maintainer's other
  product). `dotenv` (from v17.x) also ships its own `skills/*/SKILL.md` files inside node_modules,
  which is a legitimate (if unusual) publishing choice by the real maintainer, not injected via
  install scripts (no `postinstall` in dotenv's package.json). Do not treat this tip line as a
  security incident; do not visit the URL or "authenticate" anything it suggests. If the noise is
  undesirable, `dotenv.config({ quiet: true })` suppresses it.

- 지오메트리 대쉬 비행 구간 "구멍" 장애물: 위/아래 두 조각을 캔버스에 각각 `fillRect`로 그리면
  기둥(pillar)과 시각적으로 구분이 안 된다(똑같은 폭·위치 두 벽 사이 틈). 대신 천장~바닥을
  잇는 판 하나를 그린 뒤 `ctx.globalCompositeOperation = 'destination-out'`으로 통과 구간만
  실제로 도려내면(뒤에 이미 그려진 배경이 비치는) 진짜 "구멍" 느낌을 준다. 충돌 판정용
  히트박스(위/아래 두 obstacle)는 그대로 두고 그리기 함수만 짝(같은 x)을 찾아 한 번에
  그리도록 바꾸면 난이도 변경 없이 시각만 바뀐다. (이후 실제 AI 그림으로 교체할 때는 이
  destination-out 방식 대신, 그림 속 "구멍"이 차지하는 세로 비율을 미리 재서 상수로 박아두고
  그 비율로 그림을 위/아래 두 조각으로 잘라(source crop) 실제 동적 통과 위치에 맞춰 늘려 그리는
  방식을 씀 — 그림은 고정 비율인데 통과 위치는 매번 달라지기 때문.)

- 나노바나나(Gemini 이미지 생성)에게 "transparent background"를 요청해도 실제 알파 채널이 전부 255
  (완전 불투명)이고, 체크무늬는 실제 픽셀로 "그려진" 가짜 투명 표시일 수 있다(2026-08-08 확인). 이걸
  실제 투명 PNG로 바꾸려면: ① 이미지 네 변 테두리에서 시작해 회색(R≈G≈B, 채도 낮음) 픽셀만 따라가며
  지우는 BFS 방식이 안전하다(고정 임계값 범위 매칭보다 나음 — 체크무늬의 밝기가 이미지마다 다름).
  ② 그림 안쪽에 "진짜 뚫린 구멍"처럼 의도된 회색·저채도 영역이 있으면(예: 어두운 남색 배경) 테두리
  기준 BFS가 오히려 안전 장치가 된다 — 테두리와 안 이어진 내부 영역은 안 건드림. ③ 구석에 작은
  반짝임 워터마크가 잘 박혀있으니 고정 비율 사각형으로 미리 지우고 시작. ④ Pillow(PIL)가 기본
  설치돼 있지 않으면 `C:\Users\kmath\AppData\Local\Programs\Python\Python312\python.exe -m pip install
  pillow`로(가짜 `python3` 별칭 아님, [[reference_local_python]] 참고) — 단, C 드라이브 여유 공간을
  먼저 확인할 것(설치가 "No space left on device"로 실패한 전례 있음).

- `test/server.test.js`는 `require('../server')`로 실제 프로덕션 `data/geometry-dash-scores.json`을
  그대로 읽고 쓴다(테스트 전용 경로 분리 없음) — `npm test`를 돌릴 때마다 점수 19999짜리 더미
  "통합테스터-*" 항목이 실제 순위 파일에 영구히 쌓인다. 순위 API가 상위 몇 개까지 내려주는지에
  의존하는 테스트 단언은 이 누적 때문에 언젠가 깨질 수 있다(2026-08-08에 top-20→top-10 변경 후
  실제로 실패함). 순위 개수 관련 테스트는 "반환 배열 길이가 N 이하"처럼 누적에 무관한 방식으로
  단언하는 게 안전하다.

- 두들팡 검수(2026-08-28)에서 확인한 함정 4가지: ① `public/main.js`가 첫 화면 소켓으로 `room:join`/
  `room:create`를 먼저 쏘고 곧바로 `location.href`로 이동하면 그 소켓이 끊겨 서버가 매 입장마다
  "…님의 연결이 끊겼습니다" 시스템 채팅을 영구히 남긴다. 해결은 클라이언트가 아니라 서버 —
  disconnect 시 3초(`DISCONNECT_ANNOUNCE_MS`) 기다렸다가 그때도 없으면 알림·오프라인·라운드
  정리를 하고, 그 안에 재접속하면 조용히 복구(진짜 네트워크 순간 끊김에도 유리). ② `room.js`의
  효과음이 매번 `new AudioContext()`를 만들어 크로미움 한도(~6개)에 걸리면 1~2라운드 만에 전부
  무음이 된다 — 하나를 만들어 재사용(geometry-dash.js와 impossible-quiz.js는 이미 그렇게 함).
  ③ `<dialog>.showModal()`은 이미 열려 있으면 `InvalidStateError`를 던지고 그 뒤 핸들러 코드가
  전부 스킵된다 — 재오픈 전 `if (dlg.open) dlg.close()` 가드 필수. ④ 같은 브라우저 두 탭은
  `localStorage`를 공유해 `catchmind:userId`가 겹친다 — 로컬 멀티플레이 수동 테스트는 탭마다
  `localStorage.setItem('catchmind:userId', ...)`로 다른 값을 심고 상대 탭은 새로고침하지 말 것.
