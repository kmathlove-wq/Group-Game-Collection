// ===== draw.js =====
// 게임 상태를 Canvas에 그린다. 그림 파일 없이 사각형·다각형·글자로만 그린다.
// 그리는 순서: 하늘·배경 → 땅 칸·광석 → 건물 → 자동 드릴 → 차 → 부스러기·떠오르는 글자 → 손전등 어둠 → 열 → 미니맵.
// 지구 중심 방(drawCore)과 지구 파괴 연출(drawDestroy)은 따로 그린다.
(function (MT) {
  var Rules = MT.Rules;
  var Game = MT.Game;
  var TILE = Rules.TILE;
  var T = 32; // 한 칸 크기(화면 픽셀)
  var FONT = 'Pretendard, "Noto Sans KR", sans-serif';

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
  TILE_COLOR[TILE.MANTLE] = '#a8502c';
  TILE_COLOR[TILE.OUTER] = '#b8331e';
  TILE_COLOR[TILE.INNER] = '#e8d9a0';
  TILE_COLOR[TILE.SEAL] = '#17161c';
  TILE_COLOR[TILE.CORE_FLOOR] = '#e8d9a0'; // 내핵과 똑같이 보여서 숨은 바닥인 줄 모른다

  // 층별 빈 칸(굴) 색과 손전등 어둠 세기. 깊은 핵은 스스로 빛나서 덜 어둡다.
  var LAYER_LOOK = [
    { back: 'rgba(0,0,0,.22)', dark: 0.94 },
    { back: 'rgba(90,20,0,.55)', dark: 0.85 },
    { back: 'rgba(150,25,0,.55)', dark: 0.6 },
    { back: 'rgba(120,95,30,.5)', dark: 0.35 }
  ];

  // 드릴 10단계 모습: 몸통 색·줄무늬 색·길이. 9단계는 지지직, 10단계는 무지개.
  var DRILL_LOOK = [
    { color: '#9aa3ae', line: '#5d6470' }, // 1 기본
    { color: '#cd7f32', line: '#8a4f18' }, // 2 청동
    { color: '#c9d3de', line: '#7d8896' }, // 3 강철
    { color: '#eef3f8', line: '#9aa7b6' }, // 4 은
    { color: '#f5c518', line: '#b08a00' }, // 5 황금
    { color: '#e0244f', line: '#8f0f2c' }, // 6 루비
    { color: '#18b86a', line: '#0b6d3d' }, // 7 에메랄드
    { color: '#7fe3ff', line: '#e6fbff', sparkle: true }, // 8 다이아몬드
    { color: '#a855f7', line: '#f0d4ff', zap: true }, // 9 플라즈마
    { color: 'rainbow', line: '#ffffff', sparkle: true } // 10 별빛
  ];

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = null;
    this.particles = [];
    this.floaters = [];
    this.shake = 0;
    this.destroyAt = null; // 지구 파괴 연출 시작 시각
    this.friends = []; // 👫 같은 땅에 있는 친구 차들 { name, color, x, y, f, d, t, l, h } (main.js의 Multi가 채움)
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
    if (this.floaters.length > 40) this.floaters.shift();
    this.floaters.push({ text: text, x: x, y: y, life: 1.4, color: color || '#fff' });
  };

  Renderer.prototype.updateCamera = function (s, dt) {
    var W = this.canvas.width, H = this.canvas.height;
    var w = Game.world(s);
    var tx = s.car.x * T - W / 2;
    var ty = s.car.y * T - H * 0.45;
    if (s.inCore) { tx = w.w * T / 2 - W / 2; ty = w.h * T / 2 - H / 2; }
    else {
      tx = Math.max(0, Math.min(w.w * T - W, tx));
      ty = Math.max(-9 * T, Math.min(w.h * T - H, ty));
    }
    if (!this.cam || dt > 0.5 || this.cam.core !== s.inCore) this.cam = { x: tx, y: ty, core: s.inCore };
    var k = Math.min(1, dt * 8);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
  };

  Renderer.prototype.render = function (s, now, dt) {
    var ctx = this.ctx;
    var W = this.canvas.width, H = this.canvas.height;
    if (this.destroyAt != null) { this.drawDestroy(ctx, s, now, W, H); return; }
    this.updateCamera(s, dt);
    var cam = this.cam;
    var shakeX = 0, shakeY = 0;
    if (s.dig) { shakeX = (Math.random() - 0.5) * 2; shakeY = (Math.random() - 0.5) * 2; }
    if (this.shake > 0) { this.shake = Math.max(0, this.shake - dt); shakeX += (Math.random() - 0.5) * 10 * this.shake; shakeY += (Math.random() - 0.5) * 10 * this.shake; }
    var ox = Math.round(-cam.x + shakeX), oy = Math.round(-cam.y + shakeY);

    if (s.inCore) { this.drawCore(ctx, s, ox, oy, now, W, H, dt); return; }

    // 땅속 뒷벽(깊을수록 어두워짐)과 하늘
    var deep = Math.min(1, Math.max(0, cam.y / T) / Rules.CRUST_DEPTH);
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

    var w = s.world;
    var x0 = Math.max(0, Math.floor(cam.x / T) - 1), x1 = Math.min(w.w - 1, Math.floor((cam.x + W) / T) + 1);
    var y0 = Math.max(0, Math.floor(cam.y / T) - 1), y1 = Math.min(w.h - 1, Math.floor((cam.y + H) / T) + 1);
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) this.drawCell(ctx, s, x, y, ox + x * T, oy + y * T, now);
    }
    if (skyBottom > -T) this.drawBuildings(ctx, s, ox, oy);
    this.drawAutos(ctx, s, ox, oy, now);
    this.drawFriends(ctx, ox, oy, now);
    this.drawCar(ctx, s, ox + s.car.x * T, oy + s.car.y * T, now);
    this.drawEffects(ctx, ox, oy, dt);
    this.drawDarkness(ctx, s, ox + s.car.x * T, oy + s.car.y * T, W, H);
    this.drawHeat(ctx, s, now, W, H);
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
      ctx.font = '800 14px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.icon + ' ' + (b.key === 'shop' ? '상점' : b.name), bx + bw / 2, by + 21);
    });
    // 광산 입구 안내판
    var sx = ox + (Rules.PAD_WIDTH + 1.2) * T;
    ctx.fillStyle = '#6b4423'; ctx.fillRect(sx, base - 44, 5, 44);
    ctx.fillStyle = '#f5c518'; ctx.fillRect(sx - 30, base - 56, 66, 22);
    ctx.fillStyle = '#202331'; ctx.font = '800 12px ' + FONT; ctx.textAlign = 'center';
    ctx.fillText('⛏️ 광산 →', sx + 3, base - 45);
  };

  Renderer.prototype.drawCell = function (ctx, s, x, y, px, py, now) {
    var w = s.world;
    var i = y * w.w + x;
    var tile = w.tiles[i];
    var ore = w.ores[i];
    var layer = Rules.layerOf(y + 1);
    if (tile === TILE.EMPTY) {
      ctx.fillStyle = LAYER_LOOK[layer].back;
      ctx.fillRect(px, py, T, T);
      if ((x + y) % 2) { ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(px, py, T, T); }
      if (ore) this.drawGem(ctx, ore, px + T / 2, py + T * 0.62 + Math.sin(now / 300 + x) * 2, 9);
      return;
    }
    if (tile === TILE.LAVA) { this.drawLava(ctx, px, py, x, y, now); return; }
    if (tile === TILE.TREASURE) { this.drawTreasure(ctx, px, py, now); return; }
    var color = TILE_COLOR[tile];
    var r = hash(x, y, 1);
    var glow = 0;
    if (tile === TILE.OUTER) glow = Math.round(Math.sin(now / 500 + x * 0.7 + y * 0.3) * 14);
    if (tile === TILE.INNER || tile === TILE.CORE_FLOOR) glow = Math.round(Math.sin(now / 700 + x * 0.5 + y * 0.5) * 10);
    ctx.fillStyle = shade(color, Math.round((r - 0.5) * 18) + glow);
    ctx.fillRect(px, py, T, T);
    ctx.fillStyle = tile === TILE.INNER || tile === TILE.CORE_FLOOR ? shade(color, 22) : shade(color, -28);
    for (var k = 0; k < 3; k++) {
      ctx.fillRect(px + 3 + Math.floor(hash(x, y, k + 2) * 24), py + 3 + Math.floor(hash(x, y, k + 7) * 24), tile === TILE.ROCK || tile >= TILE.MANTLE ? 4 : 3, 3);
    }
    if (tile === TILE.OUTER) { // 외핵: 녹은 금속 줄기
      ctx.fillStyle = 'rgba(255,170,60,.45)';
      ctx.fillRect(px, py + 10 + Math.floor(hash(x, y, 9) * 12), T, 2);
    }
    if (tile === TILE.CONCRETE) {
      ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(px, py, T, 2); ctx.fillRect(px + T - 2, py, 2, T);
    } else if (tile === TILE.BEDROCK || tile === TILE.SEAL) {
      ctx.strokeStyle = '#2d2b36'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(px, py + T); ctx.lineTo(px + T, py); ctx.stroke();
    }
    if (y === 0 && tile === TILE.DIRT) {
      ctx.fillStyle = '#4caf50'; ctx.fillRect(px, py, T, 6);
      ctx.fillStyle = '#6fd46f'; ctx.fillRect(px, py, T, 2);
    }
    // 위쪽 칸이 비어 있으면 윗면을 밝게 해 굴 모양이 잘 보이게 한다
    if (y > 0 && w.tiles[i - w.w] === TILE.EMPTY) { ctx.fillStyle = 'rgba(255,255,255,.12)'; ctx.fillRect(px, py, T, 3); }
    if (ore && tile !== TILE.SEAL) {
      this.drawGem(ctx, ore, px + 10, py + 11, 6);
      this.drawGem(ctx, ore, px + 22, py + 15, 7);
      this.drawGem(ctx, ore, px + 13, py + 23, 5);
    }
  };

  Renderer.prototype.drawGem = function (ctx, ore, cx, cy, r) {
    var info = Rules.ORES[ore];
    if (ore === 1 || ore === 11) { // 석탄·운석철은 덩어리
      ctx.fillStyle = info.color;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = info.shine; ctx.fillRect(cx - r / 2, cy - r / 2, 2, 2);
      return;
    }
    if (ore >= 13) { // 핵 결정·별의 심장은 반짝이는 별 모양
      ctx.fillStyle = info.color;
      ctx.beginPath();
      for (var k = 0; k < 10; k++) {
        var ang = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.45 : r;
        ctx.lineTo(cx + Math.cos(ang) * rr, cy + Math.sin(ang) * rr);
      }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(60,20,0,.8)'; ctx.lineWidth = 1.5; ctx.stroke(); // 밝은 내핵 위에서도 잘 보이게
      ctx.fillStyle = info.shine; ctx.fillRect(cx - 1, cy - 1, 2, 2);
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

  // 드릴 끝(원뿔). 차와 자동 드릴이 같이 쓴다. size = 몸통 크기, level = 드릴 단계(0부터).
  Renderer.prototype.drawDrillTip = function (ctx, size, level, spin, now) {
    var look = DRILL_LOOK[Math.min(level, DRILL_LOOK.length - 1)];
    var len = 11 + level * 0.8;
    var color = look.color === 'rainbow' ? 'hsl(' + ((now / 6) % 360) + ',90%,65%)' : look.color;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(size / 2 - 2, -7); ctx.lineTo(size / 2 + len, 0); ctx.lineTo(size / 2 - 2, 7); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = look.line; ctx.lineWidth = 2;
    for (var k = 0; k < 3; k++) {
      var off = ((k * 4 + spin) % 12);
      ctx.beginPath(); ctx.moveTo(size / 2 - 1 + off, -6 + off * 0.5); ctx.lineTo(size / 2 - 1 + off, 6 - off * 0.5); ctx.stroke();
    }
    if (look.sparkle && Math.floor(now / 120) % 3 === 0) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(size / 2 + 2 + Math.random() * len * 0.7, -2 + (Math.random() - 0.5) * 6, 2, 2);
    }
    if (look.zap) {
      ctx.strokeStyle = 'rgba(240,212,255,.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(size / 2 + len, 0);
      for (var z = 1; z <= 3; z++) ctx.lineTo(size / 2 + len + z * 3, (Math.random() - 0.5) * 8);
      ctx.stroke();
    }
  };

  // 👫 친구 차: 내 차와 같은 모양에 몸통 색만 다르고, 위에 이름표를 단다.
  Renderer.prototype.drawFriends = function (ctx, ox, oy, now) {
    for (var i = 0; i < this.friends.length; i++) {
      var f = this.friends[i];
      var cx = ox + f.x * T, cy = oy + f.y * T;
      if (cx < -T * 2 || cy < -T * 2 || cx > this.canvas.width + T * 2 || cy > this.canvas.height + T * 2) continue;
      var look = { dig: f.d ? { dx: f.d === 2 ? f.f : 0, dy: f.d === 1 ? 1 : 0 } : null, car: { face: f.f }, thrusting: !!f.t, levels: { drill: f.l, heat: f.h } };
      this.drawCar(ctx, look, cx, cy, now, f.color);
      ctx.font = '800 12px ' + FONT;
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)';
      ctx.strokeText(f.name, cx, cy - Rules.CAR_SIZE * T / 2 - 4);
      ctx.fillStyle = f.color;
      ctx.fillText(f.name, cx, cy - Rules.CAR_SIZE * T / 2 - 4);
    }
  };

  // body: 몸통 색(친구 차). 없으면 내 차 노란색.
  Renderer.prototype.drawCar = function (ctx, s, cx, cy, now, body) {
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
    ctx.save();
    ctx.translate(cx, cy);
    if (dirDown) ctx.rotate(Math.PI / 2); else if (face < 0) ctx.scale(-1, 1);
    this.drawDrillTip(ctx, size, s.levels.drill, spin, now);
    ctx.restore();
    // 몸통
    ctx.fillStyle = body || '#f5c518';
    roundRect(ctx, x, y + 3, size, size - 9, 5); ctx.fill();
    ctx.fillStyle = body ? shade(body, -40) : '#d9a400'; ctx.fillRect(x, y + size - 10, size, 4);
    // 열보호를 사면 몸통에 파란 보호막 줄
    if (s.levels.heat > 0) { ctx.fillStyle = 'rgba(79,140,255,' + (0.25 + s.levels.heat * 0.12) + ')'; ctx.fillRect(x, y + 3, size, 3); }
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

  // 🤖 자동 드릴: 작은 파란 로봇 + 남은 시간 막대.
  Renderer.prototype.drawAutos = function (ctx, s, ox, oy, now) {
    var size = 0.6 * T;
    for (var i = 0; i < s.autos.length; i++) {
      var a = s.autos[i];
      var p = a.mode ? Math.min(1, a.p) : 0;
      var digging = a.mode === 'dig';
      var fx = a.x + (digging ? 0 : (a.tx - a.x) * p), fy = a.y + (digging ? 0 : (a.ty - a.y) * p);
      var cx = ox + (fx + 0.5) * T, cy = oy + (fy + 0.6) * T;
      if (cx < -T || cy < -T || cx > this.canvas.width + T || cy > this.canvas.height + T) continue;
      var down = a.mode ? a.ty > a.y : true;
      ctx.save();
      ctx.translate(cx, cy);
      if (down) ctx.rotate(Math.PI / 2); else if (a.tx < a.x) ctx.scale(-1, 1);
      this.drawDrillTip(ctx, size, s.levels.drill, digging ? now / 25 : 0, now);
      ctx.restore();
      ctx.fillStyle = '#4f8cff';
      roundRect(ctx, cx - size / 2, cy - size / 2, size, size, 5); ctx.fill();
      ctx.fillStyle = '#dff0ff'; ctx.fillRect(cx - 5, cy - 4, 3, 3); ctx.fillRect(cx + 2, cy - 4, 3, 3); // 눈
      var ratio = Math.max(0, a.life / a.lifeMax);
      ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(cx - 10, cy - size / 2 - 7, 20, 4);
      ctx.fillStyle = ratio < 0.25 ? '#ff6b6b' : '#7dffb0'; ctx.fillRect(cx - 10, cy - size / 2 - 7, 20 * ratio, 4);
    }
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
    ctx.font = '900 16px ' + FONT;
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

  // 손전등: 차 둘레만 밝고 멀수록 어둡다. 깊을수록 더 어둡고, 핵은 스스로 빛나 덜 어둡다.
  Renderer.prototype.drawDarkness = function (ctx, s, cx, cy, W, H) {
    var depth = Game.depthOf(s);
    var layer = Rules.layerOf(depth);
    var a = layer === 0 ? Math.min(0.94, Math.max(0, (depth - 2) / 70)) : LAYER_LOOK[layer].dark;
    if (a <= 0.01) return;
    var g = ctx.createRadialGradient(cx, cy, T * 1.2, cx, cy, T * 5.5);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.55, 'rgba(0,0,0,' + (a * 0.55).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(0,0,0,' + a.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };

  // 열 피해를 받는 동안 화면 가장자리가 붉게 일렁인다.
  Renderer.prototype.drawHeat = function (ctx, s, now, W, H) {
    var dps = Game.heatDps(s);
    if (dps <= 0) return;
    var a = Math.min(0.55, 0.15 + dps / 30) * (0.75 + Math.sin(now / 250) * 0.25);
    var g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.65);
    g.addColorStop(0, 'rgba(255,60,0,0)');
    g.addColorStop(1, 'rgba(255,60,0,' + a.toFixed(3) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };

  // 미니맵: 차 둘레 70줄을 한 칸 2픽셀로. 한 번이라도 본 곳만 보인다.
  Renderer.prototype.drawMinimap = function (ctx, s, W, now) {
    var w = s.world;
    var cell = 2, rows = 70;
    var mw = w.w * cell, mh = rows * cell;
    var mx = W - mw - 10, my = 10;
    var top = Math.max(0, Math.min(w.h - rows, Math.floor(s.car.y) - rows / 2));
    ctx.fillStyle = 'rgba(10,10,16,.78)';
    ctx.fillRect(mx - 3, my - 3, mw + 6, mh + 6);
    for (var y = 0; y < rows; y++) {
      var wy = top + y;
      for (var x = 0; x < w.w; x++) {
        var i = wy * w.w + x;
        if (!w.seen[i]) continue;
        var tile = w.tiles[i], ore = w.ores[i];
        ctx.fillStyle = ore && tile !== TILE.SEAL ? Rules.ORES[ore].color : tile === TILE.EMPTY ? '#5a3d28' : tile === TILE.LAVA ? '#ff4a1c' : shade(TILE_COLOR[tile], -30);
        ctx.fillRect(mx + x * cell, my + y * cell, cell, cell);
      }
    }
    for (var p = 0; p < s.warps.length; p++) { // 📍 저장한 워프석 자리는 분홍 점(미니맵 밖이면 위·아래 끝에 표시)
      var spot = s.warps[p];
      if (!spot || s.inCore) continue;
      var py = Math.floor(spot.y) - top;
      ctx.fillStyle = '#ff5fa2';
      if (py >= 0 && py < rows) ctx.fillRect(mx + spot.x * cell - 2, my + py * cell - 2, 4, 4);
      else ctx.fillRect(mx + spot.x * cell - 2, py < 0 ? my - 3 : my + mh + 1, 4, 2);
    }
    for (var k = 0; k < s.autos.length; k++) { // 자동 드릴은 파란 점
      var ay = s.autos[k].y - top;
      if (ay >= 0 && ay < rows) { ctx.fillStyle = '#4f8cff'; ctx.fillRect(mx + s.autos[k].x * cell, my + ay * cell, cell, cell); }
    }
    for (var q = 0; q < this.friends.length; q++) { // 👫 친구는 자기 색 점
      var fr = this.friends[q], fy = Math.floor(fr.y) - top;
      ctx.fillStyle = fr.color;
      if (fy >= 0 && fy < rows) ctx.fillRect(mx + fr.x * cell - 2, my + fy * cell - 2, 4, 4);
      else ctx.fillRect(mx + fr.x * cell - 2, fy < 0 ? my - 3 : my + mh + 1, 4, 2);
    }
    var carY = s.car.y - top;
    if (carY >= 0 && carY < rows && Math.floor(now / 300) % 2 === 0) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(mx + s.car.x * cell - 2, my + carY * cell - 2, 4, 4);
    }
    ctx.fillStyle = '#fff';
    ctx.font = '700 10px ' + FONT;
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText((top + 1) + 'm', mx - 6, my);
    ctx.textBaseline = 'bottom';
    ctx.fillText((top + rows) + 'm', mx - 6, my + mh);
  };

  // ⭐ 지구 중심 방: 하얗게 빛나는 둥근 방, 가운데 🔴 버튼, 왼쪽 🚪 문.
  Renderer.prototype.drawCore = function (ctx, s, ox, oy, now, W, H, dt) {
    var room = Game.CORE_ROOM;
    var bg = ctx.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, W * 0.7);
    bg.addColorStop(0, '#fffbe6');
    bg.addColorStop(0.5, '#ffd76a');
    bg.addColorStop(1, '#b8331e');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    // 빛줄기
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate(now / 6000);
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    for (var r = 0; r < 12; r++) { ctx.rotate(Math.PI / 6); ctx.fillRect(0, -6, W, 12); }
    ctx.restore();
    for (var y = 0; y < room.h; y++) {
      for (var x = 0; x < room.w; x++) {
        if (room.tiles[y * room.w + x] === TILE.EMPTY) continue;
        ctx.fillStyle = shade('#e8d9a0', Math.round((hash(x, y, 1) - 0.5) * 20));
        ctx.fillRect(ox + x * T, oy + y * T, T, T);
      }
    }
    var floor = oy + (room.h - 1) * T;
    // 🚪 문
    var dx = ox + Game.CORE_DOOR.x0 * T + 6, dw = (Game.CORE_DOOR.x1 - Game.CORE_DOOR.x0) * T - 12;
    ctx.fillStyle = '#5b3a1e'; roundRect(ctx, dx, floor - 2.2 * T, dw, 2.2 * T, 10); ctx.fill();
    ctx.fillStyle = '#f5c518'; ctx.beginPath(); ctx.arc(dx + dw - 9, floor - 1.1 * T, 3, 0, Math.PI * 2); ctx.fill();
    // 🔴 버튼(받침 + 빨간 단추, 숨 쉬듯 빛남)
    var bx = ox + (Game.CORE_BUTTON.x0 + Game.CORE_BUTTON.x1) / 2 * T;
    ctx.fillStyle = '#4a4756'; roundRect(ctx, bx - 30, floor - 22, 60, 22, 6); ctx.fill();
    var pulse = 0.5 + Math.sin(now / 300) * 0.5;
    ctx.fillStyle = 'rgba(255,40,40,' + (0.25 + pulse * 0.35).toFixed(2) + ')';
    ctx.beginPath(); ctx.arc(bx, floor - 26, 30 + pulse * 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e5242b'; ctx.beginPath(); ctx.ellipse(bx, floor - 26, 22, 12, 0, Math.PI, 0); ctx.fill();
    ctx.fillRect(bx - 22, floor - 26, 44, 5);
    ctx.fillStyle = '#ff9a9a'; ctx.beginPath(); ctx.ellipse(bx - 6, floor - 32, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
    // 안내 글자
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '900 22px ' + FONT;
    ctx.fillStyle = '#7a2a00';
    ctx.fillText('⭐ 지구 중심', W / 2, oy + 1.6 * T);
    ctx.font = '800 13px ' + FONT;
    ctx.fillStyle = '#3b2a1a';
    var near = function (zone) { return s.car.x >= zone.x0 && s.car.x <= zone.x1; };
    ctx.fillText(near(Game.CORE_DOOR) ? '▼ 누르면 나가기' : '🚪', dx + dw / 2, floor - 2.2 * T - 12);
    ctx.fillText(near(Game.CORE_BUTTON) ? '▼ 누르기' : '', bx, floor - 60);
    this.drawCar(ctx, s, ox + s.car.x * T, oy + s.car.y * T, now);
    this.drawEffects(ctx, ox, oy, dt);
  };

  // 💥 지구 파괴 연출: 0~2.6초 흔들림·금 → 2.6~3.3초 하얀 번쩍 → 우주에서 본 지구가 부서진다.
  Renderer.prototype.drawDestroy = function (ctx, s, now, W, H) {
    var t = (now - this.destroyAt) / 1000;
    if (t < 2.6) {
      var amp = 2 + t * 9;
      ctx.save();
      ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
      var saved = this.destroyAt; this.destroyAt = null; // 흔들리는 동안에도 중심 방을 계속 그린다
      this.drawCore(ctx, s, Math.round(-this.cam.x), Math.round(-this.cam.y), now, W, H, 0);
      this.destroyAt = saved;
      ctx.restore();
      // 금: 시간이 갈수록 늘어난다
      ctx.strokeStyle = 'rgba(30,10,0,.85)'; ctx.lineWidth = 3;
      var cracks = Math.floor(t * 6);
      for (var c = 0; c < cracks; c++) {
        var ang = hash(c, 3, 5) * Math.PI * 2, x = W / 2, y = H / 2;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (var seg = 1; seg <= 6; seg++) {
          x += Math.cos(ang + (hash(c, seg, 9) - 0.5)) * 40; y += Math.sin(ang + (hash(c, seg, 11) - 0.5)) * 40;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      return;
    }
    if (t < 3.3) {
      ctx.fillStyle = 'rgba(255,255,255,' + Math.min(1, (t - 2.6) / 0.25).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
      return;
    }
    // 우주
    ctx.fillStyle = '#05040f';
    ctx.fillRect(0, 0, W, H);
    for (var st = 0; st < 120; st++) {
      ctx.fillStyle = 'rgba(255,255,255,' + (0.3 + hash(st, 1, 2) * 0.7).toFixed(2) + ')';
      ctx.fillRect(hash(st, 2, 3) * W, hash(st, 4, 5) * H, 2, 2);
    }
    var k = Math.min(1, (t - 3.3) / 3); // 조각이 퍼지는 정도
    var cx = W / 2, cy = H / 2, R = 120;
    // 빛나는 핵
    var glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * (0.6 + k * 1.6));
    glow.addColorStop(0, 'rgba(255,250,220,' + (1 - k * 0.6).toFixed(2) + ')');
    glow.addColorStop(0.4, 'rgba(255,150,40,' + (0.8 - k * 0.5).toFixed(2) + ')');
    glow.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, R * (0.6 + k * 1.6), 0, Math.PI * 2); ctx.fill();
    // 지구 조각(바다 파랑·땅 초록 부채꼴)이 바깥으로 날아간다
    for (var p = 0; p < 14; p++) {
      var a0 = p / 14 * Math.PI * 2, a1 = (p + 1) / 14 * Math.PI * 2;
      var mid = (a0 + a1) / 2;
      var dist = k * (160 + hash(p, 7, 7) * 260);
      var px = cx + Math.cos(mid) * dist, py = cy + Math.sin(mid) * dist;
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(k * (hash(p, 8, 8) - 0.5) * 4);
      ctx.fillStyle = p % 3 === 0 ? '#3fa34d' : '#2b6cd8';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, a0, a1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c8321a';
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R * 0.45, a0, a1); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  };

  Renderer.prototype.startDestroy = function (now) { this.destroyAt = now; };
  Renderer.prototype.destroyElapsed = function (now) { return this.destroyAt == null ? 0 : (now - this.destroyAt) / 1000; };

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
