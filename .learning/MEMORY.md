# Project Memory

- For a physics/timing-based canvas game (geometry-dash.js), a temporary `window.__gdDebug = { jump, getState }`
  hook let an in-page `requestAnimationFrame` loop auto-jump exactly when the next obstacle enters a
  reaction window, proving the jump/gravity constants vs. obstacle gap range are always clearable
  (reached the 800m/500m test caps across different random seeds) before removing the hook. A second
  run with `debug.jump()` never called confirmed collision still ends the game at the first obstacle.
  This is a reusable way to verify "is this timing-based minigame actually beatable" without guessing.
