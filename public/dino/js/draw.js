// ===== draw.js =====
// 화면 그리기 전용. 비트맵 글자를 한 칸씩 찍어 작은 캔버스(그림)로 만들어 두고 drawImage로 정수 좌표에 그린다.
(function (D) {
  'use strict';
  var R = D.Rules;
  var S = D.Sprites;
  var INK = '#535353';
  var LIGHT = '#757575';
  var CLOUD = '#d6d6d6';
  var BG = '#f7f7f7';

  var canvas, ctx, scale = 1;
  var images = {};   // 이름 → 캔버스
  var glyphs = {};   // 색 → { 글자 → 캔버스 }
  var marks = [];

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  // 비트맵(문자열 줄 목록)을 1픽셀씩 찍어 캔버스로 만든다.
  function bake(rows, color) {
    var c = makeCanvas(rows[0].length, rows.length);
    var g = c.getContext('2d');
    g.fillStyle = color;
    for (var y = 0; y < rows.length; y++) {
      for (var x = 0; x < rows[y].length; x++) {
        if (rows[y].charAt(x) === '#') g.fillRect(x, y, 1, 1);
      }
    }
    return c;
  }
  function glyphSet(color) {
    if (glyphs[color]) return glyphs[color];
    var set = {};
    Object.keys(S.BITMAPS.font).forEach(function (ch) { set[ch] = bake(S.BITMAPS.font[ch], color); });
    glyphs[color] = set;
    return set;
  }

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    Object.keys(S.SIZES).forEach(function (name) {
      images[name] = bake(S.BITMAPS[name], name === 'cloud' ? CLOUD : INK);
    });
    // 바닥 흙 점(고정된 무늬를 되풀이)
    var seed = 7;
    for (var i = 0; i < 48; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      marks.push({ x: i * 25 + (seed % 17), y: 143 + (seed >> 5) % 6, w: 1 + (seed >> 9) % 3 });
    }
    resize();
    window.addEventListener('resize', resize);
  }

  // 화면 폭과 기기 화소 밀도에 맞춰 캔버스 안쪽 크기를 정수 배로 키운다(픽셀이 흐려지지 않게).
  function resize() {
    var rect = canvas.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    scale = Math.max(1, Math.floor((rect.width * dpr) / R.WIDTH + 0.0001));
    canvas.width = R.WIDTH * scale;
    canvas.height = R.HEIGHT * scale;
  }

  function img(name, x, y) {
    ctx.drawImage(images[name], Math.round(x), Math.round(y));
  }

  function text(str, x, y, color, px) {
    var set = glyphSet(color);
    var adv = (S.FONT_W + 1) * px;
    for (var i = 0; i < str.length; i++) {
      var g = set[str.charAt(i)];
      if (g) ctx.drawImage(g, x + i * adv, y, S.FONT_W * px, S.FONT_H * px);
    }
  }
  function textWidth(str, px) { return str.length * (S.FONT_W + 1) * px; }

  function dinoImage(view) {
    var st = view.state;
    if (st.phase === 'over') return 'dinoDead';
    if (st.phase === 'ready') return 'dinoStand';
    var d = st.dino;
    var f = Math.floor(st.time * 10) % 2;
    if (d.ducking) return f ? 'duck2' : 'duck1';
    if (!d.onGround) return 'dinoStand';
    return f ? 'dinoRun2' : 'dinoRun1';
  }

  // view = { state, clouds, scroll, blinkOn, best }
  function render(view) {
    var st = view.state;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, R.WIDTH, R.HEIGHT);

    view.clouds.forEach(function (c) { img('cloud', c.x, c.y); });

    // 바닥
    ctx.fillStyle = INK;
    ctx.fillRect(0, R.GROUND_Y, R.WIDTH, 1);
    var span = 1200;
    for (var i = 0; i < marks.length; i++) {
      var m = marks[i];
      var x = ((m.x - view.scroll) % span + span) % span;
      if (x < R.WIDTH) ctx.fillRect(Math.round(x), m.y, m.w, 1);
    }

    // 장애물
    st.obstacles.forEach(function (o) {
      if (o.kind === 'ptero') {
        var flap = Math.floor(st.time * 6) % 2;
        img(flap ? 'ptero2' : 'ptero1', o.x, R.GROUND_Y - o.bottom - R.PTERO_H);
      } else {
        var name = o.kind === 'small' ? 'cactusSmall' : 'cactusLarge';
        var c = R.CACTUS[o.kind];
        for (var k = 0; k < o.count; k++) img(name, o.x + k * c.w, R.GROUND_Y - c.h);
      }
    });

    // 공룡
    var di = dinoImage(view);
    var h = S.SIZES[di][1];
    img(di, R.DINO_X, R.GROUND_Y - h - st.dino.y);

    // 점수 (오른쪽 위): HI 00123  00045
    var px = 2;
    var curStr = R.formatScore(st.score);
    var curX = R.WIDTH - 10 - textWidth(curStr, px);
    if (view.blinkOn) text(curStr, curX, 6, INK, px);
    var best = R.formatScore(view.best);
    var bestX = curX - 18 - textWidth(best, px);
    text(best, bestX, 6, LIGHT, px);
    text('HI', bestX - textWidth('HI ', px), 6, LIGHT, px);

    if (st.phase === 'over') {
      text('GAME OVER', Math.round((R.WIDTH - textWidth('GAME OVER', 2)) / 2), 40, INK, 2);
      img('restart', (R.WIDTH - 36) / 2, 68);
    }
  }

  D.Draw = { init: init, render: render, resize: resize };
})(window.Dino);
