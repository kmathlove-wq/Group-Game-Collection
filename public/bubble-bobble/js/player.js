// ===== player.js =====
// 주인공(버블룬): 좌우 이동, 가변 점프, 중력, 한쪽 통행 발판, 화면 위아래 래핑.
(function (BB) {
  var C = BB.CONFIG;

  BB.Player = function (x, y) {
    this.w = 11;
    this.h = 13;
    this.x = x + (C.TILE - this.w) / 2;
    this.y = y + (C.TILE - this.h);
    this.vx = 0;
    this.vy = 0;
    this.facing = 'R';        // 'L' / 'R'
    this.onGround = false;
    this.coyote = 0;          // 발판에서 떨어진 뒤 점프 허용 시간
    this.jumpHeld = false;    // 가변 점프용
    this.jumpGrace = 0;       // 이 시간 동안은 점프 컷 안 함 (짧게 눌러도 뜀)
    this.blowT = 0;           // 거품 뿜는 순간 포즈 표시 시간
    this.bubbleCooldown = 0;  // 다음 거품까지 남은 시간
    this.invuln = 1.5;        // 부활 직후 무적 시간

    // M7에서 아이템으로 바뀜
    this.stats = { speed: 1, bubbleRange: 1, bubbleCooldown: 1, bubbleRise: 1 };
  };

  BB.Player.prototype.box = function () {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  };

  BB.Player.prototype.update = function (dt, level) {
    var left = BB.input.held('left');
    var right = BB.input.held('right');

    // --- 좌우 ---
    var dir = (right ? 1 : 0) - (left ? 1 : 0);
    if (dir !== 0) {
      this.vx += dir * C.MOVE_ACCEL * dt;
      this.facing = dir > 0 ? 'R' : 'L';
    } else {
      // 마찰
      var f = C.MOVE_FRICTION * dt;
      if (Math.abs(this.vx) <= f) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * f;
    }
    var maxS = C.MOVE_SPEED * this.stats.speed;
    this.vx = BB.util.clamp(this.vx, -maxS, maxS);

    // --- 점프 ---
    if (this.onGround) this.coyote = 0.1;
    else this.coyote -= dt;
    if (this.jumpGrace > 0) this.jumpGrace -= dt;

    if (BB.input.pressed('jump') && this.coyote > 0) {
      this.vy = -C.JUMP_V;
      this.onGround = false;
      this.coyote = 0;
      this.jumpHeld = true;
      this.jumpGrace = 0.11;   // 이 동안은 무조건 위로 (짧게 눌러도 최소 높이 확보)
      if (BB.sfx) BB.sfx.play('jump');
    }
    // 가변 점프: 유예 시간이 끝난 뒤 점프키를 떼고 있으면 상승을 줄인다 (단 최소 높이 보장)
    if (this.jumpHeld && this.jumpGrace <= 0 && !BB.input.held('jump')) {
      var floorV = -C.JUMP_V * 0.5;
      if (this.vy < floorV) this.vy = floorV;
      this.jumpHeld = false;
    }
    if (this.jumpHeld && BB.input.held('jump') && this.vy >= 0) this.jumpHeld = false;

    // --- 중력 ---
    this.vy += C.GRAVITY * dt;
    if (this.vy > C.MAX_FALL) this.vy = C.MAX_FALL;

    var prevBottom = this.y + this.h;
    var prevRight = this.x + this.w;
    var prevLeft = this.x;

    // --- 가로 이동: 발판·벽에 옆으로 막힘 (밖에서 다가올 때만) ---
    this.x += this.vx * dt;
    this.x = BB.util.clamp(this.x, 0, C.VW - this.w);
    if (level) {
      var hb = this.box();
      for (var si = 0; si < level.solids.length; si++) {
        var s = level.solids[si];
        if (!BB.util.aabb(hb, s)) continue;
        if (this.vx > 0 && prevRight <= s.x + 0.5) {
          this.x = s.x - this.w; this.vx = 0;
        } else if (this.vx < 0 && prevLeft >= s.x + s.w - 0.5) {
          this.x = s.x + s.w; this.vx = 0;
        }
        hb = this.box();
      }
    }

    // --- 세로 이동 ---
    this.y += this.vy * dt;
    this.onGround = false;

    if (this.vy >= 0 && level) {
      var landY = level.landingY(this.box(), prevBottom);
      // 거품 위에 서기 (M3에서 BB.bubbles 생기면)
      if (landY === null && BB.bubbles) {
        for (var i = 0; i < BB.bubbles.length; i++) {
          var bb = BB.bubbles[i];
          if (bb.canStandOn && bb.canStandOn()) {
            var top = bb.y;
            var bx = bb.x, bw = bb.w;
            if (this.x + this.w > bx && this.x < bx + bw &&
                prevBottom <= top + 2 && this.y + this.h >= top) {
              landY = top;
              this.vy = -C.JUMP_V * 0.45; // 통 하고 튕김
              break;
            }
          }
        }
      }
      if (landY !== null) {
        this.y = landY - this.h;
        if (this.vy > 0) this.vy = 0;
        this.onGround = true;
      }
    }

    // --- 화면 위아래 래핑 ---
    BB.util.wrapY(this, C.VH);

    // --- 거품 뿜기 ---
    if (this.bubbleCooldown > 0) this.bubbleCooldown -= dt;
    if (BB.input.pressed('bubble') && this.bubbleCooldown <= 0 && BB.bubbles &&
        BB.bubbles.length < 6) {
      var dirX = this.facing === 'R' ? 1 : -1;
      var mx = this.x + this.w / 2 + dirX * 12;
      var my = this.y + this.h / 2 - 1;
      // 가끔 특수 거품 (물·번개·불)
      var kind = 'normal';
      var rr = Math.random();
      if (rr < 0.04) kind = 'water';
      else if (rr < 0.07) kind = 'lightning';
      else if (rr < 0.10) kind = 'fire';
      var bub = new BB.Bubble(mx, my, dirX, kind);
      bub.rangeMul = this.stats.bubbleRange;
      bub.riseMul = this.stats.bubbleRise;
      BB.bubbles.push(bub);
      this.bubbleCooldown = 0.34 / this.stats.bubbleCooldown;
      this.blowT = 0.22;
      if (BB.sfx) BB.sfx.play('blow');
    }

    if (this.blowT > 0) this.blowT -= dt;
    if (this.invuln > 0) this.invuln -= dt;
  };

  // 그림 뜻:  주인공1=오른쪽  주인공3=왼쪽  주인공2=거품 뿜는 순간  주인공5=점프
  // (걷기 애니메이션 없음 — 그대로 미끄러지듯 이동)
  BB.Player.prototype.draw = function (ctx) {
    // 무적 중엔 깜빡
    if (this.invuln > 0 && (Math.floor(this.invuln * 12) % 2) === 0) return;
    var img, flip;

    if (!this.onGround) {
      // 공중: 점프 그림 (오른쪽 기준으로 그려졌다고 보고 왼쪽이면 뒤집기)
      img = BB.assets.images['주인공5'];
      flip = (this.facing === 'L');
    } else if (this.blowT > 0 && Math.abs(this.vx) < 8) {
      // 멈춰서 거품 뿜는 순간
      img = BB.assets.images['주인공2'];
      flip = (this.facing === 'L');
    } else if (this.facing === 'L') {
      img = BB.assets.images['주인공3'];   // 왼쪽 전용 그림
      flip = false;
    } else {
      img = BB.assets.images['주인공1'];   // 오른쪽 전용 그림
      flip = false;
    }
    if (!img) return;

    var dw = 26, dh = 26;
    var dx = this.x + this.w / 2 - dw / 2;
    var dy = this.y + this.h - dh + 2;

    if (flip) {
      ctx.save();
      ctx.translate(dx + dw, dy);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, dw, dh);
      ctx.restore();
    } else {
      ctx.drawImage(img, dx, dy, dw, dh);
    }
  };
})(window.BB);
