// ===== enemy.js =====
// 적 몬스터 (민결이 설계 + 엔트리 원작 난이도):
//  - 항상 주인공을 쫓아온다. 발판 위/아래로도 따라온다(점프·낙하).
//  - 시간이 지날수록 빨라진다. 마지막 1마리거나 시간이 얼마 안 남으면 "화남"(빨강·더 빠름).
//  - 걷는 그림: 오른쪽=적1↔적2,  왼쪽=적3↔적4
//  - 방울1(날아가는 거품)에 닿으면 적소멸1 로 떠올라 천장에 붙어 좌우로 흔들림
//  - 주인공이 닿으면 적소멸2 로 죽고 과일을 떨군다
//  - 심술고래(Whale): 판 시간이 다 되면 나타나 무적으로 주인공만 쫓는다.
(function (BB) {
  var C = BB.CONFIG;

  var TYPE = {
    walker: { speed: 54,  jump: 0.92, fly: false },  // 기본 통통이 (발판 3칸 위까지 점프)
    hopper: { speed: 46,  jump: 1.00, fly: false },  // 콩콩 뛰며 쫓아옴
    flyer:  { speed: 60,  jump: 0,    fly: true  }   // 발판 무시하고 날아옴
  };

  // 발판 위에 서 있을 때, 가까운 낭떠러지 방향(-1/+1)
  function nearestEdgeDir(level, e) {
    var footY = e.y + e.h + 2;
    var cx = e.x + e.w / 2;
    var dL = 999, dR = 999;
    for (var d = 4; d < 280; d += 6) {
      if (dR === 999 && !level.overlapsSolid({ x: cx + d, y: footY, w: 2, h: 5 })) dR = d;
      if (dL === 999 && !level.overlapsSolid({ x: cx - d, y: footY, w: 2, h: 5 })) dL = d;
      if (dL !== 999 && dR !== 999) break;
    }
    return dR <= dL ? 1 : -1;
  }

  BB.Enemy = function (type, x, y) {
    this.type = TYPE[type] ? type : 'walker';
    this.w = 13;
    this.h = 13;
    this.x = x + (C.TILE - this.w) / 2;
    this.y = y + (C.TILE - this.h);
    this.vx = -TYPE[this.type].speed;
    this.vy = 0;
    this.onGround = false;
    this.state = 'walk';       // 'walk' | 'floating' | 'dying'
    this.face = 'L';
    this.angry = false;
    this.animT = 0;
    this.wantDir = -1;
    this._descend = null;   // 아래 주인공한테 내려갈 때 향하는 발판 끝 방향
    this.jumpCd = BB.util.rand(0.2, 0.8);
    this.floatT = 0;
    this.stuck = false;
    this.wobbleBase = 0;
    this.dyingT = 0;
    this.dead = false;
  };

  BB.Enemy.prototype.box = function () {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  };

  // 시간이 지날수록 빨라짐 (main 이 넘겨주는 rush = 0~1)
  BB.Enemy.prototype.speed = function () {
    var s = TYPE[this.type].speed;
    if (this.angry) s *= 1.6;
    s *= 1 + (BB.game.rush || 0) * 0.6;
    return s;
  };

  BB.Enemy.prototype.update = function (dt, level, player) {
    this.animT += dt;

    if (this.state === 'dying') {
      this.dyingT += dt;
      if (this.dyingT >= 0.34) this.dead = true;
      return;
    }

    if (this.state === 'floating') {
      this.floatT += dt;
      if (!this.stuck) {
        // 가운데 발판들은 무시하고 위로, 맨 위 핑크 천장(=맨 윗줄 발판, 두께 16px)에 막힌다
        this.y -= 90 * dt;
        if (this.y <= C.TILE) {
          this.y = C.TILE;
          this.stuck = true;
          this.wobbleBase = this.x;
        }
      } else {
        // 천장에 붙어 좌우로 흔들
        this.x = this.wobbleBase + Math.sin(this.floatT * 3) * 10;
        this.x = BB.util.clamp(this.x, 2, C.VW - this.w - 2);
      }
      return;
    }

    // ===== walk: 항상 주인공을 쫓아온다 =====
    var spd = this.speed();
    var pcx = player ? player.x + player.w / 2 : this.x;
    var pcy = player ? player.y + player.h / 2 : this.y;
    var ecx = this.x + this.w / 2;
    var ecy = this.y + this.h / 2;

    if (TYPE[this.type].fly) {
      // 날개몬: 주인공을 향해 직선으로 날아옴 (발판 무시)
      var ang = Math.atan2(pcy - ecy, pcx - ecx);
      this.vx = Math.cos(ang) * spd;
      this.vy = Math.sin(ang) * spd;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.x = BB.util.clamp(this.x, 0, C.VW - this.w);
      BB.util.wrapY(this, C.VH);
      this.face = this.vx > 0 ? 'R' : 'L';
      return;
    }

    // 걷는 적
    var dx = pcx - ecx;
    var dy = pcy - ecy;
    var playerBelow = dy > 20;
    var playerAbove = dy < -22;
    var wasOnGround = this.onGround;

    // 방향 정하기 (땅에 있을 때만)
    if (this.onGround) {
      if (playerBelow) {
        // 주인공이 있는 방향으로 걸어가서 발판 끝에서 떨어진다. (공중 될 때까지 방향 유지)
        if (this._descend == null) this._descend = (dx >= 0 ? 1 : -1);
        this.wantDir = this._descend;
      } else {
        this._descend = null;
        if (Math.abs(dx) > 8) this.wantDir = dx > 0 ? 1 : -1;
      }
    }
    // 공중이면 wantDir 그대로 유지 (걸어 나간 방향으로 낙하)
    this.vx = this.wantDir * spd;
    this.face = this.wantDir > 0 ? 'R' : 'L';

    // 중력
    this.vy += C.GRAVITY * dt;
    if (this.vy > C.MAX_FALL) this.vy = C.MAX_FALL;

    var prevBottom = this.y + this.h;
    var prevLeft = this.x, prevRight = this.x + this.w;
    var hitWall = false;

    // 가로 이동 + 벽/발판 옆면
    this.x += this.vx * dt;
    if (this.x <= 0) { this.x = 0; hitWall = true; this.wantDir = 1; }
    if (this.x + this.w >= C.VW) { this.x = C.VW - this.w; hitWall = true; this.wantDir = -1; }
    if (level) {
      var hb = this.box();
      for (var i = 0; i < level.solids.length; i++) {
        var s = level.solids[i];
        if (!BB.util.aabb(hb, s)) continue;
        if (this.vx > 0 && prevRight <= s.x + 0.5) { this.x = s.x - this.w; hitWall = true; }
        else if (this.vx < 0 && prevLeft >= s.x + s.w - 0.5) { this.x = s.x + s.w; hitWall = true; }
        hb = this.box();
      }
    }
    // 땅에서 내려가려는데 벽에 막히면 반대쪽으로 (공중에서 발판 모서리에 스친 건 무시)
    if (hitWall && this.onGround && this._descend != null) {
      this._descend = -this._descend;
      this.wantDir = this._descend;
    }

    // 세로 이동 + 착지
    this.y += this.vy * dt;
    this.onGround = false;
    if (this.vy >= 0 && level) {
      var landY = level.landingY(this.box(), prevBottom);
      if (landY !== null) { this.y = landY - this.h; this.vy = 0; this.onGround = true; }
    }
    BB.util.wrapY(this, C.VH);

    // 방금 착지했고 아직 주인공이 아래면 → 주인공 쪽으로 새로 방향 잡기
    if (!wasOnGround && this.onGround) {
      this._descend = playerBelow ? (dx >= 0 ? 1 : -1) : null;
    }
    if (!playerBelow) this._descend = null;

    // ----- 점프 -----
    // 주인공이 아래에 있으면 절대 점프하지 않는다 (걸어서 발판 끝으로 내려가야 하니까).
    this.jumpCd -= dt;
    if (this.onGround && this.jumpCd <= 0 && !playerBelow) {
      if (playerAbove && (hitWall || Math.abs(dx) < 44)) {
        this.vy = -C.JUMP_V * (TYPE[this.type].jump + (this.angry ? 0.05 : 0));
        this.jumpCd = BB.util.rand(0.3, 0.7);
      } else if (hitWall) {
        this.vy = -C.JUMP_V * TYPE[this.type].jump;
        this.jumpCd = BB.util.rand(0.25, 0.55);
      } else if (this.type === 'hopper') {
        this.vy = -C.JUMP_V * TYPE[this.type].jump * 0.6;
        this.jumpCd = BB.util.rand(0.25, 0.55);
      } else {
        this.jumpCd = BB.util.rand(0.15, 0.5);
      }
    }
  };

  BB.Enemy.prototype.captureFloat = function () {
    if (this.state !== 'walk') return;
    this.state = 'floating';
    this.floatT = 0;
    this.stuck = false;
    this.vx = 0; this.vy = 0;
    this.angry = false;
    if (BB.sfx) BB.sfx.play('trap');
  };

  BB.Enemy.prototype.popKill = function () {
    if (this.state !== 'floating') return;
    this.state = 'dying';
    this.dyingT = 0;
  };

  BB.Enemy.prototype.draw = function (ctx) {
    var img, dw = 24, dh = 24;

    if (this.state === 'dying') {
      img = BB.assets.images[this.dyingT > 0.18 ? '적소멸3' : '적소멸2'];
    } else if (this.state === 'floating') {
      img = BB.assets.images['적소멸1'];
    } else {
      var f = Math.floor(this.animT * 8) % 2;
      if (this.face === 'R') img = BB.assets.images[f === 0 ? '적1' : '적2'];
      else                   img = BB.assets.images[f === 0 ? '적3' : '적4'];
    }
    if (!img) return;

    var dx = this.x + this.w / 2 - dw / 2;
    var dy = this.y + this.h - dh + 2;

    ctx.save();
    if (this.type === 'flyer' && this.state === 'walk') {
      ctx.filter = 'hue-rotate(280deg) saturate(1.6)';           // 날개몬: 분홍빛
    } else if (this.type === 'hopper' && this.state === 'walk') {
      ctx.filter = 'hue-rotate(90deg) saturate(1.3)';            // 콩콩이: 초록빛
    }
    if (this.angry && this.state === 'walk') {
      ctx.filter = 'brightness(1.15) saturate(2) hue-rotate(-50deg)'; // 화남: 빨강
    }
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  };

  // ===================== 보스 =====================
  // 거대 몬스터. 날아가는 거품(방울1)에 맞으면 hp -1. 좌우로 다니며 졸개를 부른다.
  BB.Boss = function (x, y) {
    this.w = 46; this.h = 44;
    this.x = x; this.y = y;
    this.vx = 44; this.vy = 0;
    this.onGround = false;
    this.hp = 10;
    this.maxHp = 10;
    this.animT = 0;
    this.hurtT = 0;
    this.spawnCd = 4;
    this.jumpCd = 2.5;
    this.dead = false;
    this.state = 'walk';
    this.dyingT = 0;
  };
  BB.Boss.prototype.box = function () {
    return { x: this.x + 4, y: this.y + 4, w: this.w - 8, h: this.h - 8 };
  };
  BB.Boss.prototype.hit = function () {
    if (this.state !== 'walk') return;
    this.hp--;
    this.hurtT = 0.18;
    if (BB.sfx) BB.sfx.play('bossHit');
    if (this.hp <= 0) { this.state = 'dying'; this.dyingT = 0; }
  };
  BB.Boss.prototype.update = function (dt, level, player) {
    this.animT += dt;
    if (this.hurtT > 0) this.hurtT -= dt;

    if (this.state === 'dying') {
      this.dyingT += dt;
      this.y += 30 * dt;
      if (this.dyingT >= 1.2) this.dead = true;
      return;
    }

    // 화날수록(hp 낮을수록) 빨라짐
    var rage = 1 + (1 - this.hp / this.maxHp) * 1.1;

    // 중력 + 좌우
    this.vy += C.GRAVITY * dt;
    if (this.vy > C.MAX_FALL) this.vy = C.MAX_FALL;
    var prevBottom = this.y + this.h;

    this.x += this.vx * rage * dt;
    if (this.x <= 2) { this.x = 2; this.vx = Math.abs(this.vx); }
    if (this.x + this.w >= C.VW - 2) { this.x = C.VW - 2 - this.w; this.vx = -Math.abs(this.vx); }

    this.y += this.vy * dt;
    this.onGround = false;
    if (this.vy >= 0 && level) {
      var landY = level.landingY(this.box(), prevBottom);
      if (landY !== null) { this.y = landY - this.h; this.vy = 0; this.onGround = true; }
    }
    BB.util.wrapY(this, C.VH);

    // 가끔 점프
    this.jumpCd -= dt;
    if (this.onGround && this.jumpCd <= 0) {
      this.vy = -C.JUMP_V * 0.8;
      this.jumpCd = BB.util.rand(1.8, 3.2) / rage;
    }

    // 졸개 소환
    this.spawnCd -= dt;
    if (this.spawnCd <= 0 && BB.enemies && BB.enemies.length < 4) {
      BB.enemies.push(new BB.Enemy(Math.random() < 0.5 ? 'walker' : 'hopper',
        this.x + this.w / 2, this.y));
      this.spawnCd = BB.util.rand(4, 7);
    }
  };
  BB.Boss.prototype.draw = function (ctx) {
    var img = BB.assets.images['적1'];
    ctx.save();
    if (this.state === 'dying') {
      ctx.globalAlpha = 1 - this.dyingT / 1.2;
      ctx.filter = 'brightness(2)';
    } else if (this.hurtT > 0) {
      ctx.filter = 'brightness(2.4) saturate(0)';
    } else {
      ctx.filter = 'hue-rotate(200deg) saturate(1.8) brightness(0.9)';
    }
    if (img) ctx.drawImage(img, this.x, this.y, this.w, this.h);
    else { ctx.fillStyle = '#a24bff'; ctx.fillRect(this.x, this.y, this.w, this.h); }
    ctx.restore();

    // 체력 막대
    var bw = this.w, bx = this.x, by = this.y - 8;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(bx, by, bw, 4);
    ctx.fillStyle = '#ff4444'; ctx.fillRect(bx, by, bw * Math.max(0, this.hp) / this.maxHp, 4);
  };

  // ===================== 심술고래 =====================
  BB.Whale = function () {
    this.w = 40; this.h = 26;
    // 화면 밖 위에서 등장
    this.x = BB.util.rand(60, C.VW - 100);
    this.y = -40;
    this.speed = 90;
    this.appearT = 0;
  };
  BB.Whale.prototype.box = function () {
    return { x: this.x + 4, y: this.y + 4, w: this.w - 8, h: this.h - 8 };
  };
  BB.Whale.prototype.update = function (dt, player) {
    this.appearT += dt;
    if (!player) return;
    var tx = player.x + player.w / 2 - this.w / 2;
    var ty = player.y + player.h / 2 - this.h / 2;
    var ang = Math.atan2(ty - this.y, tx - this.x);
    var sp = Math.min(this.speed, this.speed * this.appearT); // 서서히 가속
    this.x += Math.cos(ang) * sp * dt;
    this.y += Math.sin(ang) * sp * dt;
  };
  BB.Whale.prototype.draw = function (ctx) {
    var img = BB.assets.images['고래'];
    // 진행 방향으로 바라보게 좌우 뒤집기 (그림은 오른쪽 기준)
    var goingLeft = false; // update 에서 각도로 움직이니 대략 플레이어 방향
    var dw = this.w + 8, dh = this.h + 8;
    var dx = this.x - 4, dy = this.y - 4;
    if (img) {
      ctx.save();
      ctx.globalAlpha = this.appearT < 0.4 ? this.appearT / 0.4 : 1;
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = '#eef3ff';
      ctx.beginPath();
      ctx.ellipse(this.x + this.w / 2, this.y + this.h / 2, this.w / 2, this.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  };
})(window.BB);
