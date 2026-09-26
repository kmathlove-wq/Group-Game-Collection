// ===== bubble.js =====
// 거품 규칙(민결이 설계):
//   1) 방울1  : 주인공이 본 방향으로 화면 가로의 1/3보다 좀 더 날아감
//   2) 방울2  : 그 뒤 위로 떠오름 (옆으로 살랑)
//   3) 방울3  : 천장에 거의 닿으면 방울3으로 바뀌며 터짐
// 적은 "방울1 상태"에 닿았을 때만 잡힌다. (잡는 처리는 main.js)
// 특수 거품(물·번개·불)은 터질 때 BB.effects 에 효과를 남겨 적을 즉사시킨다.
(function (BB) {
  var C = BB.CONFIG;

  var SHOOT_SPEED = 240;
  var SHOOT_DIST = C.VW * 0.38;
  var RISE_SPEED = 34;
  var CEILING_MARGIN = 6;
  var LIFETIME = 10.0;
  var POP_TIME = 0.16;

  BB.Bubble = function (x, y, dir, kind) {
    this.w = 16;
    this.h = 16;
    this.x = x - this.w / 2;
    this.y = y - this.h / 2;
    this.dir = dir < 0 ? -1 : 1;
    this.kind = kind || 'normal';
    this.state = 'shoot';           // 'shoot'(방울1) | 'rise'(방울2) | 'pop'(방울3)
    this.age = 0;
    this.stateT = 0;
    this.traveled = 0;
    this.drift = (Math.random() < 0.5 ? -1 : 1) * 10;
    this.rangeMul = 1;             // 노란 사탕
    this.riseMul = 1;             // 파란 사탕
    this.dead = false;
  };

  BB.Bubble.prototype.box = function () {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  };

  BB.Bubble.prototype.canStandOn = function () {
    return this.kind === 'normal' && this.state === 'rise';
  };

  BB.Bubble.prototype.pop = function () {
    if (this.state === 'pop') return;
    this.state = 'pop';
    this.stateT = 0;
    if (BB.sfx) BB.sfx.play('pop');
    if (this.kind !== 'normal' && BB.effects) {
      BB.effects.push(new BB.Effect(this.kind, this.x + this.w / 2, this.y + this.h / 2));
    }
  };

  BB.Bubble.prototype.update = function (dt, level) {
    this.age += dt;
    this.stateT += dt;

    if (this.state === 'shoot') {
      var step = this.dir * SHOOT_SPEED * dt;
      this.x += step;
      this.traveled += Math.abs(step);
      if (this.x <= 0 || this.x + this.w >= C.VW) {
        this.x = BB.util.clamp(this.x, 0, C.VW - this.w);
        this.state = 'rise'; this.stateT = 0;
      }
      if (this.traveled >= SHOOT_DIST * this.rangeMul) { this.state = 'rise'; this.stateT = 0; }

    } else if (this.state === 'rise') {
      this.y -= RISE_SPEED * this.riseMul * dt;
      this.x += this.drift * dt;
      if (this.x <= 0 || this.x + this.w >= C.VW) {
        this.x = BB.util.clamp(this.x, 0, C.VW - this.w);
        this.drift = -this.drift;
      }
      var head = { x: this.x + 2, y: this.y - CEILING_MARGIN, w: this.w - 4, h: CEILING_MARGIN + 2 };
      if (this.y <= CEILING_MARGIN || (level && level.overlapsSolid(head))) this.pop();
      if (this.age >= LIFETIME) this.pop();

    } else if (this.state === 'pop') {
      if (this.stateT >= POP_TIME) this.dead = true;
    }
  };

  BB.Bubble.prototype.draw = function (ctx) {
    var name = this.state === 'shoot' ? '방울1'
             : this.state === 'rise'  ? '방울2'
             : '방울3';
    var img = BB.assets.images[name];
    if (img) {
      ctx.drawImage(img, this.x - 2, this.y - 2, this.w + 4, this.h + 4);
    } else {
      ctx.strokeStyle = '#8ef';
      ctx.beginPath();
      ctx.arc(this.x + this.w / 2, this.y + this.h / 2, this.w / 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (this.kind !== 'normal' && this.state !== 'pop') {
      ctx.fillStyle = this.kind === 'water' ? 'rgba(60,150,255,0.4)'
                    : this.kind === 'lightning' ? 'rgba(255,230,80,0.45)'
                    : 'rgba(255,90,40,0.45)';
      ctx.beginPath();
      ctx.arc(this.x + this.w / 2, this.y + this.h / 2, this.w / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  // ===== BB.Effect ===== 특수 거품이 터진 자리의 효과 (적 즉사)
  BB.Effect = function (kind, x, y) {
    this.kind = kind;
    this.x = x; this.y = y;
    this.t = 0;
    this.life = kind === 'water' ? 1.1 : kind === 'lightning' ? 0.5 : 0.7;
    this.dead = false;
  };
  BB.Effect.prototype.hitBox = function () {
    if (this.kind === 'water') {
      return { x: this.x - 8, y: this.y, w: 16, h: 240 };          // 아래로 주르륵
    } else if (this.kind === 'lightning') {
      return { x: 0, y: this.y - 6, w: C.VW, h: 12 };               // 가로 일직선
    }
    return { x: this.x - 14, y: this.y - 40, w: 28, h: 80 };        // 불기둥
  };
  BB.Effect.prototype.update = function (dt) {
    this.t += dt;
    if (this.kind === 'water') this.y += 260 * dt;                  // 물은 아래로 흐름
    if (this.t >= this.life) this.dead = true;
  };
  BB.Effect.prototype.draw = function (ctx) {
    var a = 1 - this.t / this.life;
    ctx.save();
    ctx.globalAlpha = a;
    if (this.kind === 'water') {
      ctx.fillStyle = '#5ab0ff';
      ctx.fillRect(this.x - 6, this.y, 12, 30);
    } else if (this.kind === 'lightning') {
      ctx.strokeStyle = '#fff36b';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (var x = 0; x < C.VW; x += 16) {
        ctx.lineTo(x, this.y + (Math.random() - 0.5) * 8);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = '#ff7a2a';
      ctx.fillRect(this.x - 8, this.y - 34, 16, 68);
      ctx.fillStyle = '#ffd23f';
      ctx.fillRect(this.x - 4, this.y - 30, 8, 60);
    }
    ctx.restore();
  };
})(window.BB);
