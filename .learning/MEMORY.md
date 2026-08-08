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
  그리도록 바꾸면 난이도 변경 없이 시각만 바뀐다.
