// ===== level.js =====
// 글자 지도 → 발판 사각형 목록 + 주인공/적 위치로 변환.
// 그리고 발판 그리기 + 충돌 도우미를 담은 BB.Level 클래스.
(function (BB) {
  var T = BB.CONFIG.TILE;

  // 글자 → 적 타입
  var ENEMY_CHARS = {
    '1': 'walker',   // 통통이
    '2': 'hopper',   // 콩콩이 (많이 뜀)
    '3': 'flyer',    // 날개몬 (발판 무시하고 날아옴)
    'E': 'walker'
  };

  // def = { time, theme, map:[string] }
  // 반환 = { solids:[{x,y,w,h}], playerStart:{x,y}, enemySpawns:[{type,x,y}], time, theme }
  BB.parseLevel = function (def) {
    var map = def.map;
    var solids = [];
    var playerStart = { x: T, y: T };
    var enemySpawns = [];

    for (var row = 0; row < map.length; row++) {
      var line = map[row];
      var runStart = -1; // 연속된 '#' 시작 열

      for (var col = 0; col <= line.length; col++) {
        var ch = line[col];

        if (ch === '#') {
          if (runStart < 0) runStart = col;
        } else {
          // '#' 구간이 끝나면 사각형 하나로 병합
          if (runStart >= 0) {
            solids.push({
              x: runStart * T,
              y: row * T,
              w: (col - runStart) * T,
              h: T
            });
            runStart = -1;
          }
          if (ch === 'P') {
            playerStart = { x: col * T, y: row * T };
          } else if (ENEMY_CHARS[ch]) {
            enemySpawns.push({ type: ENEMY_CHARS[ch], x: col * T, y: row * T });
          }
        }
      }
    }

    return {
      solids: solids,
      playerStart: playerStart,
      enemySpawns: enemySpawns,
      time: def.time || 30,
      theme: def.theme || 'pink'
    };
  };

  // --- 발판 색 테마 (M8에서 확장) ---
  BB.THEMES = {
    pink:  { fill: '#ff3fae', edge: '#ffa9dd' },
    sky:   { fill: '#3fb7ff', edge: '#a9e2ff' },
    lime:  { fill: '#5fd83f', edge: '#c3f2a9' },
    gold:  { fill: '#ffc23f', edge: '#ffe6a9' },
    grape: { fill: '#a24bff', edge: '#d9b0ff' }
  };

  // ===== BB.Level =====
  BB.Level = function (def) {
    var parsed = BB.parseLevel(def);
    this.solids = parsed.solids;
    this.playerStart = parsed.playerStart;
    this.enemySpawns = parsed.enemySpawns;
    this.time = parsed.time;
    this.timeLeft = parsed.time;
    this.theme = BB.THEMES[parsed.theme] ? parsed.theme : 'pink';
    this._stripePhase = 0;
  };

  BB.Level.prototype.update = function (dt) {
    this.timeLeft = Math.max(0, this.timeLeft - dt);
  };

  // 위에서 내려오는 box(발밑 y = footY) 가 이 프레임에 어떤 발판 위에 착지하는가?
  // prevBottom = 지난 프레임의 box 아래쪽 y. 반환: 착지할 발판의 윗면 y 또는 null.
  BB.Level.prototype.landingY = function (box, prevBottom) {
    var bottom = box.y + box.h;
    var best = null;
    for (var i = 0; i < this.solids.length; i++) {
      var s = this.solids[i];
      // 가로로 겹치고
      if (box.x + box.w <= s.x || box.x >= s.x + s.w) continue;
      // 지난 프레임엔 발판 위(또는 걸침)였고, 이번 프레임에 발판을 뚫고 내려감 → 착지
      if (prevBottom <= s.y + 1 && bottom >= s.y) {
        if (best === null || s.y < best) best = s.y;
      }
    }
    return best;
  };

  // box 가 어떤 발판과도 겹치는가 (천장/막힘 판정용, 아래→위 통과는 여기서 안 봄)
  BB.Level.prototype.overlapsSolid = function (box) {
    for (var i = 0; i < this.solids.length; i++) {
      if (BB.util.aabb(box, this.solids[i])) return this.solids[i];
    }
    return null;
  };

  BB.Level.prototype.draw = function (ctx) {
    var th = BB.THEMES[this.theme];
    for (var i = 0; i < this.solids.length; i++) {
      var s = this.solids[i];
      ctx.fillStyle = th.fill;
      ctx.fillRect(s.x, s.y, s.w, s.h);
      // 사탕줄무늬 느낌: 밝은 대각선
      ctx.strokeStyle = th.edge;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (var x = -s.h; x < s.w; x += 6) {
        ctx.moveTo(s.x + x, s.y + s.h);
        ctx.lineTo(s.x + x + s.h, s.y);
      }
      ctx.save();
      ctx.rect(s.x, s.y, s.w, s.h);
      ctx.clip();
      ctx.stroke();
      ctx.restore();
      // 윗면 밝은 선
      ctx.fillStyle = th.edge;
      ctx.fillRect(s.x, s.y, s.w, 2);
    }
  };
})(window.BB);
