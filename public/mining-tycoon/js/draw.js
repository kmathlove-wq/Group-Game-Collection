// ===== draw.js =====
// 게임 상태를 Canvas에 그린다. 그림 파일 없이 사각형·다각형·글자로만 그린다.
// 그리는 순서: 하늘·배경 → 건물 → 땅 칸·광석 → 차 → 부스러기·떠오르는 글자 → 손전등 어둠 → 미니맵.
(function (MT) {
  var Rules = MT.Rules;
  var Game = MT.Game;
  var TILE = Rules.TILE;
  var T = 32; // 한 칸 크기(화면 픽셀)
  var HALF = Rules.CAR_SIZE / 2;

  // 칸마다 늘 같은 무늬가 나오도록 좌표로 만든 가짜 무작위 값(0~1).
  function hash(x, y, k) {
    var n = Math.imul(x + 1013, 374761393) ^ Math.imul(y + 7919, 668265263) ^ Math.imul(k || 1, 1442695041);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }

  function shade(hex, amount) {
    var v = parseInt(hex.slice(1), 16);
    var r = Math.max(0, Math.min(255, ((v >> 16) & 255) + amount));
    var g = Math.max(0, Math.min(255, ((v >> 8) & 255) + amount));
    var b = Math.max(0, Math.min(255, (v & 255) + amount));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  var TILE_COLOR = {};
  TILE_COLOR[TILE.DIRT] = '#8b5a2b';
  TILE_COLOR[TILE.STONE] = '#767682';
  TILE_COLOR[TILE.ROCK] = '#474454';
  TILE_COLOR[TILE.CONCRETE] = '#b8b3a8';
  TILE_COLOR[TILE.BEDROCK] = '#17161c';
  TILE_COLOR[TILE.LAVA] = '#e2461c';
  TILE_COLOR[TILE.TREASURE] = '#f5c518';

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = null;
    this.particles = [];
    this.floaters = [];
    this.shake = 0;
  }

  Renderer.prototype.tileColor = function (tile) { return TILE_COLOR[tile] || '#000'; };

  // 부스러기: 땅을 팔 때 튀는 흙 조각(칸 좌표).
  Renderer.prototype.debris = function (x, y, color, count) {
    for (var i = 0; i < count; i++) {
      this.particles.push({ x: x, y: y, vx: (Math.random() - 0.5) * 6, vy: -Math.random() * 5 - 1, life: 0.5 + Math.random() * 0.4, color: color, size: 2 + Math.random() * 3 });
    }
  };

  // 떠오르는 글자: "+석탄", "가방이 가득!" 같은 짧은 알림(칸 좌표).
  Renderer.prototype.floatText = function (text, x, y, color) {
    this.floaters.push({ text: text, x: x, y: y, life: 1.4, color: color || '#fff' });
  };

  Renderer.prototype.updateCamera = function (s, dt) {
    var W = this.canvas.width, H = this.canvas.height;
    var tx = s.car.x * T - W / 2;
    var ty = s.car.y * T - H * 0.45;
    tx = Math.max(0, Math.min(Rules.WIDTH * T - W, tx));
    ty = Math.max(-9 * T, Math.min((Rules.DEPTH + 1) * T - H, ty));
    if (!this.cam || dt > 0.5) this.cam = { x: tx, y: ty };
    var k = Math.min(1, dt * 8);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  };

  Renderer.prototype.render = function (s, now, dt) {
    var ctx = this.ctx;
    var W = this.canvas.width, H = this.canvas.height;
    this.updateCamera(s, dt);
    var cam = this.cam;
    var shakeX = 0, shakeY = 0;
    if (s.dig) { shakeX = (Math.random() - 0.5) * 2; shakeY = (Math.random() - 0.5) * 2; }
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); shakeX += (Math.random() - 0.5) * 10 * this.shake; shakeY += (Math.random() - 0.5) * 10 * this.shake; }
    var ox = Math.round(-cam.x + shakeX), oy = Math.round(-cam.y + shakeY);

    // 땅속 뒷벽(깊을수록 어두워짐)과 하늘
    var deep = Math.min(1, Math.max(0, cam.y / T) / Rules.DEPTH);
    ctx.fillStyle = shade('#3a2618', -Math.round(deep * 40));
    ctx.fillRect(0, 0, W, H);
    var skyBottom = oy;
    if (skyBottom > 0) {
      var sky = ctx.createLinearGradient(0, oy - 9 * T, 0, skyBottom);
      sky.addColorStop(0, '#5aa9ff');
      sky.addColorStop(1, '#bfe3ff');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, skyBottom);
      this.drawSkyThings(ctx, ox, oy, now);
    }

    var x0 = Math.max(0, Math.floor(cam.x / T) - 1), x1 = Math.min(Rules.WIDTH - 1, Math.floor((cam.x + W) / T) + 1);
    var y0 = Math.max(0, Math.floor(cam.y / T) - 1), y1 = Math.min(s.world.h - 1, Math.floor((cam.y + H) / T) + 1);
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) this.drawCell(ctx, s, x, y, ox + x * T, oy + y * T, now);
    }
    if (skyBottom > -T) this.drawBuildings(ctx, s, ox, oy);
    this.drawCar(ctx, s, ox + s.car.x * T, oy + s.car.y * T, now);
    this.drawEffects(ctx, ox, oy, dt);
    this.drawDarkness(ctx, s, ox + s.car.x * T, oy + s.car.y * T, W, H);
    this.drawMinimap(ctx, s, W, now);
  };

  Renderer.prototype.drawSkyThings = function (ctx, ox, oy, now) {
    ctx.fillStyle = '#fff3b0';
    ctx.beginPath(); ctx.arc(ox + 34 * T, oy - 6 * T, 26, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    for (var i = 0; i < 4; i++) {
      var cx = ((i * 11 * T + now * 0.008 * (i + 2)) % (Rules.WIDTH * T + 200)) - 100 + ox;
      var cy = oy - (4 + (i % 3) * 1.3) * T;
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2); ctx.arc(cx + 20, cy - 8, 22, 0, Math.PI * 2); ctx.arc(cx + 42, cy, 17, 0, Math.PI * 2);
      ctx.fill();
    }
  };

  Renderer.prototype.drawBuildings = function (ctx, s, ox, oy) {
    var base = oy; // 0줄 윗면
    Rules.BUILDINGS.forEach(function (b) {
      var bx = ox + b.x0 * T + 4, bw = (b.x1 - b.x0) * T - 8, bh = 2.6 * T;
      var by = base - bh;
      ctx.fillStyle = '#fdf7ec';
      ctx.fillRect(bx, by, bw, bh);
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.moveTo(bx - 6, by + 4); ctx.lineTo(bx + bw / 2, by - 22); ctx.lineTo(bx + bw + 6, by + 4); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#3b2a1a';
      ctx.fillRect(bx + bw / 2 - 14, base - 34, 28, 34); // 문
      ctx.fillStyle = s.building === b.key ? '#fff2a8' : '#ffffff';
      ctx.strokeStyle = b.color; ctx.lineWidth = 3;
      ctx.fillRect(bx + 6, by + 8, bw - 12, 26); ctx.strokeRect(bx + 6, by + 8, bw - 12, 26);
      ctx.fillStyle = '#202331';
      ctx.font = '800 14px Pretendard, "Noto Sans KR", sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.icon + ' ' + (b.key === 'shop' ? '상점' : b.name), bx + bw / 2, by + 21);
    });
    // 광산 입구 안내판
    var sx = ox + (Rules.PAD_WIDTH + 1.2) * T;
    ctx.fillStyle = '#6b4423'; ctx.fillRect(sx, base - 44, 5, 44);
    ctx.fillStyle = '#f5c518'; ctx.fillRect(sx - 30, base - 56, 66, 22);
    ctx.fillStyle = '#202331'; ctx.font = '800 12px Pretendard, "Noto Sans KR", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('⛏️ 광산 →', sx + 3, base - 45);
  };

  Renderer.prototype.drawCell = function (ctx, s, x, y, px, py, now) {
    var world = s.world;
    var i = y * world.w + x;
    var tile = world.tiles[i];
    var ore = world.ores[i];
    if (tile === TILE.EMPTY) {
      ctx.fillStyle = (x + y) % 2 ? 'rgba(0,0,0,.18)' : 'rgba(0,0,0,.24)';
      ctx.fillRect(px, py, T, T);
      if (ore) this.drawGem(ctx, ore, px + T / 2, py + T * 0.62 + Math.sin(now / 300 + x) * 2, 9);
      return;
    }
    var color = TILE_COLOR[tile];
    if (tile === TILE.LAVA) { this.drawLava(ctx, px, py, x, y, now); return; }
    if (tile === TILE.TREASURE) { this.drawTreasure(ctx, px, py, now); return; }
    var r = hash(x, y, 1);
    ctx.fillStyle = shade(color, Math.round((r - 0.5) * 18));
    ctx.fillRect(px, py, T, T);
    ctx.fillStyle = shade(color, -28);
    for (var k = 0; k < 3; k++) {
      ctx.fillRect(px + 3 + Math.floor(hash(x, y, k + 2) * 24), py + 3 + Math.floor(hash(x, y, k + 7) * 24), tile === TILE.ROCK ? 4 : 3, 3);
    }
    if (tile === TILE.CONCRETE) {
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(px, py, T, 2); ctx.fillRect(px + T - 2, py, 2, T);
    } else if (tile === TILE.BEDROCK) {
      ctx.strokeStyle = '#2d2b36'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py + T); ctx.lineTo(px + T, py); ctx.stroke();
    }
    if (y === 0 && tile === TILE.DIRT) {
      ctx.fillStyle = '#4caf50'; ctx.fillRect(px, py, T, 6);
      ctx.fillStyle = '#6fd46f'; ctx.fillRect(px, py, T, 2);
    }
    // 위쪽 칸이 비어 있으면 윗면을 밝게 해 굴 모양이 잘 보이게 한다
    if (y > 0 && world.tiles[i - world.w] === TILE.EMPTY) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(px, py, T, 3); }
    if (ore) {
      this.drawGem(ctx, ore, px + 10, py + 11, 6);
      this.drawGem(ctx, ore, px + 22, py + 15, 7);
      this.drawGem(ctx, ore, px + 13, py + 23, 5);
    }
  };

  Renderer.prototype.drawGem = function (ctx, ore, cx, cy, r) {
    var info = Rules.ORES[ore];
    if (ore === 1) { // 석탄은 덩어리
      ctx.fillStyle = info.color;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = info.shine; ctx.fillRect(cx - r / 2, cy - r / 2, 2, 2);
      return;
    }
    ctx.fillStyle = info.color;
    ctx.beginPath();
    ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath();
    ctx.fill();
    ctx.fillStyle = info.shine;
    ctx.beginPath(); ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r * 0.45, cy - r * 0.1); ctx.lineTo(cx - r * 0.2, cy - r * 0.1); ctx.closePath(); ctx.fill();
  };

  Renderer.prototype.drawLava = function (ctx, px, py, x, y, now) {
    ctx.fillStyle = '#c8321a';
    ctx.fillRect(px, py, T, T);
    ctx.fillStyle = '#ff8a1f';
    for (var k = 0; k < 3; k++) {
      var t = now / 600 + hash(x, y, k) * 6;
      ctx.beginPath();
      ctx.arc(px + 6 + hash(x, y, k + 3) * 20, py + 16 + Math.sin(t) * 9, 4 + Math.sin(t * 1.7) * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,220,80,.35)';
    ctx.fillRect(px, py + 2 + Math.sin(now / 400 + x) * 2, T, 3);
  };

  Renderer.prototype.drawTreasure = function (ctx, px, py, now) {
    ctx.fillStyle = '#474454'; ctx.fillRect(px, py, T, T);
    var hue = (now / 10) % 360;
    ctx.fillStyle = 'hsla(' + hue + ',100%,65%,.55)';
    ctx.beginPath(); ctx.arc(px + T / 2, py + T / 2, 15 + Math.sin(now / 200) * 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a4b14'; ctx.fillRect(px + 5, py + 11, 22, 15);
    ctx.fillStyle = '#f5c518'; ctx.fillRect(px + 5, py + 9, 22, 5); ctx.fillRect(px + 14, py + 14, 4, 6);
  };

  Renderer.prototype.drawCar = function (ctx, s, cx, cy, now) {
    var size = Rules.CAR_SIZE * T;
    var x = cx - size / 2, y = cy - size / 2;
    var d = s.dig;
    var dirDown = d ? d.dy === 1 : false;
    var face = d && d.dx ? d.dx : s.car.face;
    var spin = d ? now / 25 : 0;

    // 날 때 불꽃
    if (s.thrusting) {
      ctx.fillStyle = Math.random() < 0.5 ? '#ffb020' : '#ff6a3d';
      ctx.beginPath(); ctx.moveTo(cx - 6, y + size - 2); ctx.lineTo(cx + 6, y + size - 2); ctx.lineTo(cx, y + size + 10 + Math.random() * 6); ctx.closePath(); ctx.fill();
    }
    // 드릴
    ctx.save();
    ctx.translate(cx, cy);
    if (dirDown) ctx.rotate(Math.PI / 2); else if (face < 0) ctx.scale(-1, 1);
    ctx.fillStyle = '#9aa3ae';
    ctx.beginPath(); ctx.moveTo(size / 2 - 2, -7); ctx.lineTo(size / 2 + 11, 0); ctx.lineTo(size / 2 - 2, 7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#5d6470'; ctx.lineWidth = 2;
    for (var k = 0; k < 3; k++) {
      var off = ((k * 4 + spin) % 12);
      ctx.beginPath(); ctx.moveTo(size / 2 - 1 + off, -6 + off * 0.5); ctx.lineTo(size / 2 - 1 + off, 6 - off * 0.5); ctx.stroke();
    }
    ctx.restore();
    // 몸통
    ctx.fillStyle = '#f5c518';
    roundRect(ctx, x, y + 3, size, size - 9, 5); ctx.fill();
    ctx.fillStyle = '#d9a400'; ctx.fillRect(x, y + size - 10, size, 4);
    // 창문(앞쪽)
    ctx.fillStyle = '#bfe8ff';
    var wx = face > 0 ? x + size - 11 : x + 3;
    roundRect(ctx, wx, y + 6, 8, 7, 2); ctx.fill();
    // 바퀴(무한궤도)
    ctx.fillStyle = '#2b2d36';
    roundRect(ctx, x - 1, y + size - 7, size + 2, 7, 3); ctx.fill();
    ctx.fillStyle = '#5a5e6b';
    for (var w = 0; w < 3; w++) { ctx.beginPath(); ctx.arc(x + 4 + w * (size - 8) / 2, y + size - 3.5, 2, 0, Math.PI * 2); ctx.fill(); }
  };

  Renderer.prototype.drawEffects = function (ctx, ox, oy, dt) {
    var list = this.particles;
    for (var i = list.length - 1; i >= 0; i--) {
      var p = list[i];
      p.life -= dt;
      if (p.life <= 0) { list.splice(i, 1); continue; }
      p.vy += 20 * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.fillStyle = p.color;
      ctx.fillRect(ox + p.x * T, oy + p.y * T, p.size, p.size);
    }
    var fl = this.floaters;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 16px Pretendard, "Noto Sans KR", sans-serif';
    for (var j = fl.length - 1; j >= 0; j--) {
      var f = fl[j];
      f.life -= dt;
      if (f.life <= 0) { fl.splice(j, 1); continue; }
      f.y -= dt * 0.9;
      ctx.globalAlpha = Math.min(1, f.life * 1.5);
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.65)';
      ctx.strokeText(f.text, ox + f.x * T, oy + f.y * T);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, ox + f.x * T, oy + f.y * T);
    }
    ctx.globalAlpha = 1;
    if (list.length > 300) list.splice(0, list.length - 300);
  };

  // 손전등: 차 둘레만 밝고 멀수록 어둡다. 깊을수록 더 어두워진다.
  Renderer.prototype.drawDarkness = function (ctx, s, cx, cy, W, H) {
    var depth = Game.depthOf(s);
    var a = Math.min(0.94, Math.max(0, (depth - 2) / 70));
    if (a <= 0.01) return;
    var g = ctx.createRadialGradient(cx, cy, T * 1.2, cx, cy, T * 5.5);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, 'rgba(0,0,0,' + (a * 0.55).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(0,0,0,' + a.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };

  // 미니맵: 차 둘레 70줄을 한 칸 2픽셀로. 한 번이라도 본 곳만 보인다.
  Renderer.prototype.drawMinimap = function (ctx, s, W, now) {
    var world = s.world;
    var cell = 2, rows = 70;
    var mw = world.w * cell, mh = rows * cell;
    var mx = W - mw - 10, my = 10;
    var top = Math.max(0, Math.min(world.h - rows, Math.floor(s.car.y) - rows / 2));
    ctx.fillStyle = 'rgba(10,10,16,.78)';
    ctx.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
    for (var y = 0; y < rows; y++) {
      var wy = top + y;
      for (var x = 0; x < world.w; x++) {
        var i = wy * world.w + x;
        if (!world.seen[i]) continue;
        var tile = world.tiles[i], ore = world.ores[i];
        ctx.fillStyle = ore ? Rules.ORES[ore].color : tile === TILE.EMPTY ? '#5a3d28' : tile === TILE.LAVA ? '#ff4a1c' : shade(TILE_COLOR[tile], -30);
        ctx.fillRect(mx + x * cell, my + y * cell, cell, cell);
      }
    }
    var carY = s.car.y - top;
    if (carY >= 0 && carY < rows && Math.floor(now / 300) % 2 === 0) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(mx + s.car.x * cell - 2, my + carY * cell - 2, 4, 4);
    }
    ctx.fillStyle = '#fff';
    ctx.font = '700 10px Pretendard, "Noto Sans KR", sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText((top + 1) + 'm', mx - 6, my);
    ctx.textBaseline = 'bottom';
    ctx.fillText((top + rows) + 'm', mx - 6, my + mh);
  };

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  MT.Renderer = Renderer;
})(window.MT = window.MT || {});
