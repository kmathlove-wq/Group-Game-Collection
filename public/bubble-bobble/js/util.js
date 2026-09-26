// ===== util.js =====
// BB 네임스페이스 만들기 + 게임 전체가 쓰는 상수와 도우미 함수들.
window.BB = window.BB || {};

(function (BB) {
  // --- 게임 상수 ---
  BB.CONFIG = {
    TILE: 16,          // 타일 한 칸 크기(px)
    COLS: 32,          // 가로 타일 수
    ROWS: 24,          // 세로 타일 수
    VW: 512,           // 캔버스 가로 (COLS * TILE)
    VH: 384,           // 캔버스 세로 (ROWS * TILE)
    STEP: 1 / 60,      // 물리 계산 한 스텝 시간(초)
    MAX_STEPS: 5,      // 한 프레임에 물리 스텝 최대 횟수

    // --- 물리 느낌 (M2에서 사용자가 조정 예정, 단위 px/초) ---
    GRAVITY: 900,      // 중력 가속도
    JUMP_V: 330,       // 점프 시작 속도(위로) — 발판 3칸 위까지 닿게
    JUMP_CUT: 0.5,     // 점프키를 일찍 떼면 상승 속도를 이 비율만 남김(가변 점프)
    MAX_FALL: 360,     // 최대 낙하 속도
    MOVE_SPEED: 92,    // 걷기 최고 속도
    MOVE_ACCEL: 900,   // 걷기 가속
    MOVE_FRICTION: 800 // 멈출 때 감속
  };

  // --- 도우미 함수 ---
  BB.util = {
    // 두 사각형 {x,y,w,h} 가 겹치는가?
    aabb(a, b) {
      return a.x < b.x + b.w && a.x + a.w > b.x &&
             a.y < b.y + b.h && a.y + a.h > b.y;
    },
    // 값을 lo~hi 범위 안으로 자르기
    clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); },
    // lo 이상 hi 미만 실수 난수
    rand(lo, hi) { return lo + Math.random() * (hi - lo); },
    // lo 이상 hi 이하 정수 난수
    randInt(lo, hi) { return Math.floor(lo + Math.random() * (hi - lo + 1)); },
    // 배열에서 아무거나 하나
    choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    // 화면 위/아래로 완전히 벗어나면 반대편으로 순간이동 (버블보블 특징)
    wrapY(o, vh) {
      vh = vh || BB.CONFIG.VH;
      if (o.y > vh) o.y = -o.h;
      else if (o.y + o.h < 0) o.y = vh;
    },
    // 0~1 을 왕복(0→1→0)으로 (깜빡임 등에 사용)
    pingpong(t) { t = t % 2; return t < 1 ? t : 2 - t; }
  };
})(window.BB);
