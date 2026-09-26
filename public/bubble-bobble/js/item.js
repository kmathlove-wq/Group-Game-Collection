// ===== item.js =====
// 과일 · 파워업 · EXTEND 글자. (M4~M7에서 클래스 추가, 지금은 점수표만)
(function (BB) {
  // 한 연쇄로 터진 적 수 → 과일 등급 점수
  var FRUIT_TABLE = [
    { tier: 1, name: '사탕',       score: 100 },
    { tier: 2, name: '바나나',     score: 300 },
    { tier: 3, name: '복숭아',     score: 500 },
    { tier: 4, name: '햄버거',     score: 700 },
    { tier: 5, name: '아이스크림', score: 1000 },
    { tier: 6, name: '다이아몬드', score: 3000 }
  ];
  BB.FRUIT_TABLE = FRUIT_TABLE;

  // 터진 적 수(1부터) → 점수
  BB.fruitTierScore = function (count) {
    var idx = BB.util.clamp(count, 1, FRUIT_TABLE.length) - 1;
    return FRUIT_TABLE[idx].score;
  };
  // 터진 적 수 → 등급(1~6)
  BB.fruitTier = function (count) {
    return BB.util.clamp(count, 1, FRUIT_TABLE.length);
  };

  var C = BB.CONFIG;
  var FRUIT_COLORS = ['#ff5a5a', '#ffe14d', '#ffb347', '#c98a5b', '#fff1c9', '#7dfdfd'];

  // ===== BB.Fruit =====
  // tier 1~6. 몇 초 뒤 사라짐. 주우면 점수.
  BB.Fruit = function (x, y, tier) {
    this.w = 12; this.h = 12;
    this.x = x; this.y = y;
    this.tier = BB.util.clamp(tier, 1, 6);
    this.score = FRUIT_TABLE[this.tier - 1].score;
    this.name = FRUIT_TABLE[this.tier - 1].name;
    this.vy = -40; this.vx = BB.util.rand(-20, 20);
    this.life = 6.0;
    this.onGround = false;
    this.dead = false;
  };
  BB.Fruit.prototype.box = function () {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  };
  BB.Fruit.prototype.update = function (dt, level) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    if (!this.onGround) {
      this.vy += C.GRAVITY * dt;
      if (this.vy > C.MAX_FALL) this.vy = C.MAX_FALL;
      var prevBottom = this.y + this.h;
      this.x += this.vx * dt;
      this.x = BB.util.clamp(this.x, 2, C.VW - this.w - 2);
      this.y += this.vy * dt;
      if (this.vy >= 0 && level) {
        var landY = level.landingY(this.box(), prevBottom);
        if (landY !== null) { this.y = landY - this.h; this.vy = 0; this.vx = 0; this.onGround = true; }
      }
      BB.util.wrapY(this, C.VH);
    }
  };
  BB.Fruit.prototype.draw = function (ctx) {
    // 사라지기 직전엔 깜빡
    if (this.life < 1.5 && (Math.floor(this.life * 8) % 2) === 0) return;
    var cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    ctx.fillStyle = FRUIT_COLORS[this.tier - 1];
    ctx.beginPath();
    ctx.arc(cx, cy, this.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#3a7d2c';
    ctx.fillRect(cx - 1, this.y - 2, 2, 4); // 꼭지
    if (this.tier >= 6) { // 다이아몬드 반짝
      ctx.strokeStyle = '#fff';
      ctx.strokeRect(this.x + 2, this.y + 2, this.w - 4, this.h - 4);
    }
  };

  // ===== BB.PowerUp =====
  // kind: 'shoe'|'candyYellow'|'candyRed'|'candyBlue'|'umbrella'|'potion'|'ring'
  var POWER = {
    shoe:        { color: '#3aa0ff', label: '👟', score: 1000 },
    candyYellow: { color: '#ffe14d', label: '🍬', score: 1000 },
    candyRed:    { color: '#ff5a5a', label: '🍭', score: 1000 },
    candyBlue:   { color: '#7dd0ff', label: '🫧', score: 1000 },
    umbrella:    { color: '#ff8ad0', label: '☂', score: 2000 },
    potion:      { color: '#b96bff', label: '🧪', score: 500 },
    ring:        { color: '#ffd23f', label: '💍', score: 3000 }
  };
  BB.POWER_KINDS = Object.keys(POWER);

  BB.PowerUp = function (x, y, kind) {
    this.w = 13; this.h = 13;
    this.x = x; this.y = y;
    this.kind = POWER[kind] ? kind : 'shoe';
    this.info = POWER[this.kind];
    this.vy = -60; this.vx = BB.util.rand(-25, 25);
    this.life = 9.0;
    this.onGround = false;
    this.dead = false;
  };
  BB.PowerUp.prototype.box = function () { return { x: this.x, y: this.y, w: this.w, h: this.h }; };
  BB.PowerUp.prototype.update = function (dt, level) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.vy += C.GRAVITY * dt;
    if (this.vy > C.MAX_FALL) this.vy = C.MAX_FALL;
    var prevBottom = this.y + this.h;
    this.x += this.vx * dt;
    this.x = BB.util.clamp(this.x, 2, C.VW - this.w - 2);
    if (this.onGround) this.vx *= 0.9;
    this.y += this.vy * dt;
    if (this.vy >= 0 && level) {
      var landY = level.landingY(this.box(), prevBottom);
      if (landY !== null) { this.y = landY - this.h; this.vy = 0; this.onGround = true; }
    }
    BB.util.wrapY(this, C.VH);
  };
  BB.PowerUp.prototype.draw = function (ctx) {
    if (this.life < 2 && (Math.floor(this.life * 8) % 2) === 0) return;
    ctx.fillStyle = this.info.color;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.fillRect(this.x, this.y, this.w, this.h);
    ctx.strokeRect(this.x + 0.5, this.y + 0.5, this.w - 1, this.h - 1);
    ctx.font = '9px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.info.label, this.x + this.w / 2, this.y + this.h / 2 + 0.5);
  };

  // ===== BB.ExtendLetter =====  ch: 0..5 (E X T E N D)
  var EXTEND = ['E', 'X', 'T', 'E', 'N', 'D'];
  BB.ExtendLetter = function (x, y, idx) {
    this.w = 14; this.h = 14;
    this.x = x; this.y = y;
    this.idx = idx;
    this.ch = EXTEND[idx];
    this.vy = -30 - Math.random() * 20;
    this.drift = BB.util.rand(-14, 14);
    this.life = 10;
    this.dead = false;
  };
  BB.ExtendLetter.prototype.box = function () { return { x: this.x, y: this.y, w: this.w, h: this.h }; };
  BB.ExtendLetter.prototype.update = function (dt, level) {
    this.life -= dt;
    if (this.life <= 0) { this.dead = true; return; }
    this.y += this.vy * dt;
    this.x += this.drift * dt;
    if (this.x <= 2 || this.x + this.w >= C.VW - 2) this.drift = -this.drift;
    // 발판 아랫면에 막히면 그 밑에서 떠다님
    if (level) {
      var head = { x: this.x + 2, y: this.y, w: this.w - 4, h: 3 };
      if (this.y <= 4 || level.overlapsSolid(head)) { this.vy = Math.max(this.vy, -6); this.vy += 20 * dt; }
    }
    BB.util.wrapY(this, C.VH);
  };
  BB.ExtendLetter.prototype.draw = function (ctx) {
    if (this.life < 2 && (Math.floor(this.life * 8) % 2) === 0) return;
    var cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    ctx.fillStyle = 'rgba(255,120,200,0.35)';
    ctx.beginPath(); ctx.arc(cx, cy, this.w / 2 + 1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px "Segoe UI", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(this.ch, cx, cy + 0.5);
  };
})(window.BB);
