// ===== art.js =====
// 탐조 여행의 그림(그림 파일 없이 SVG 글자로 만듦). 브라우저(window.Birdwatch.Art)와 Node 시험이 함께 쓴다.
// 새 그림: 상자 viewBox(-60 -60 120 120) 안에 오른쪽을 보는 새를 그린다. 자세(pose) = perch(앉음)·stand(섬)·swim(물에 뜸)·fly(남).
// 배경: 논리 1000×700. 앉을 자리(perches)·물(water)·물가(shore)·땅(ground) 구역을 함께 돌려준다.
// 여기 들어가는 값은 모두 data.js에 사람이 적은 색·숫자뿐이다(사용자가 쓴 글은 넣지 않음).
(function (root) {
  'use strict';

  var VIEW = '-60 -60 120 120';
  var W = 1000, H = 700;

  // 모양마다 기본 비율: rx·ry 몸, hr 머리, bl 부리 길이, beak 부리 모양, tail 꼬리, leg 다리, neck 목
  var SHAPE = {
    song: { rx: 20, ry: 14, hr: 11, bl: 8, beak: 'short', tail: 14, leg: 9 },
    kingfisher: { rx: 17, ry: 13, hr: 13, bl: 16, beak: 'dagger', tail: 6, leg: 5 },
    pigeon: { rx: 22, ry: 16, hr: 9, bl: 6, beak: 'short', tail: 16, leg: 8 },
    woodpecker: { rx: 19, ry: 13, hr: 11, bl: 12, beak: 'dagger', tail: 14, leg: 8 },
    pheasant: { rx: 22, ry: 14, hr: 9, bl: 6, beak: 'short', tail: 40, leg: 12 },
    raptor: { rx: 14, ry: 19, hr: 10, bl: 8, beak: 'hook', tail: 14, leg: 8, upright: true },
    owl: { rx: 16, ry: 20, hr: 14, bl: 5, beak: 'short', tail: 8, leg: 4, upright: true },
    duck: { rx: 26, ry: 12, hr: 9, bl: 11, beak: 'flat', tail: 6, leg: 8, neck: 6 },
    grebe: { rx: 20, ry: 11, hr: 9, bl: 7, beak: 'short', tail: 4, leg: 8, neck: 3 },
    goose: { rx: 27, ry: 13, hr: 8, bl: 11, beak: 'flat', tail: 6, leg: 10, neck: 16 },
    swan: { rx: 30, ry: 14, hr: 7, bl: 12, beak: 'flat', tail: 6, leg: 10, neck: 34 },
    gull: { rx: 25, ry: 10, hr: 9, bl: 11, beak: 'gull', tail: 8, leg: 8, neck: 6 },
    cormorant: { rx: 26, ry: 9, hr: 8, bl: 13, beak: 'hook', tail: 10, leg: 8, neck: 14 },
    heron: { rx: 18, ry: 9, hr: 6, bl: 20, beak: 'long', tail: 6, leg: 34, neck: 30 },
    crane: { rx: 22, ry: 11, hr: 7, bl: 16, beak: 'long', tail: 6, leg: 36, neck: 32 },
    spoonbill: { rx: 20, ry: 10, hr: 7, bl: 20, beak: 'spoon', tail: 6, leg: 26, neck: 22 },
    stork: { rx: 22, ry: 11, hr: 7, bl: 22, beak: 'thick', tail: 6, leg: 32, neck: 20 },
    ibis: { rx: 20, ry: 11, hr: 7, bl: 20, beak: 'down', tail: 6, leg: 22, neck: 16 },
    shore: { rx: 16, ry: 10, hr: 7, bl: 12, beak: 'long', tail: 6, leg: 14, neck: 4 }
  };
  var LONG_LEGS = { heron: 1, crane: 1, spoonbill: 1, stork: 1, ibis: 1, shore: 1 };
  var GREY = '#7d8a96', GREY2 = '#6b7782';

  function n(v) { return Math.round(v * 10) / 10; }
  function ell(cx, cy, rx, ry, fill, extra) {
    return '<ellipse cx="' + n(cx) + '" cy="' + n(cy) + '" rx="' + n(rx) + '" ry="' + n(ry) + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function circ(cx, cy, r, fill, extra) {
    return '<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(r) + '" fill="' + fill + '"' + (extra || '') + '/>';
  }
  function path(d, fill, extra) { return '<path d="' + d + '" fill="' + fill + '"' + (extra || '') + '/>'; }
  function line(x1, y1, x2, y2, color, w, extra) {
    return '<path d="M' + n(x1) + ',' + n(y1) + ' L' + n(x2) + ',' + n(y2) + '" stroke="' + color + '" stroke-width="' + w + '" stroke-linecap="round" fill="none"' + (extra || '') + '/>';
  }
  function P(x, y) { return n(x) + ',' + n(y); }

  // 새 모양 숫자(모양 기본값 + 종마다 다른 값)
  function params(bird) {
    var s = SHAPE[bird.shape] || SHAPE.song;
    var L = bird.look || {};
    return {
      rx: s.rx, ry: s.ry, hr: s.hr, upright: !!s.upright,
      bl: L.bl || s.bl, beak: L.beakType || s.beak, tail: L.tail || s.tail,
      leg: L.legs || s.leg, neck: s.neck || 0, tailUp: !!L.tailUp, fork: !!L.fork
    };
  }

  // 색표: 실루엣이면 모두 회색
  function palette(bird, silhouette) {
    var L = bird.look || {};
    if (silhouette) {
      return { head: GREY, body: GREY, belly: GREY, wing: GREY2, beak: GREY2, leg: GREY2, tail: GREY2,
        neck: GREY, feet: GREY2, eye: null, marks: [] };
    }
    return { head: L.head, body: L.body, belly: L.belly, wing: L.wing, beak: L.beak, leg: L.leg,
      tail: L.tailColor || L.wing, neck: L.neckColor || L.head, feet: L.feet || L.leg, eye: L.eye || null,
      marks: L.marks || [] };
  }
  function mark(c, t) {
    for (var i = 0; i < c.marks.length; i++) if (c.marks[i].t === t) return c.marks[i].c;
    return null;
  }

  // ----- 부리 -----
  function beakPath(type, x, y, len) {
    switch (type) {
      case 'stubby': return 'M' + P(x, y - 4) + ' Q' + P(x + len, y) + ' ' + P(x, y + 4) + ' Z';
      case 'dagger': return 'M' + P(x, y - 2.4) + ' L' + P(x + len, y) + ' L' + P(x, y + 2.4) + ' Z';
      case 'flat': return 'M' + P(x, y - 3) + ' L' + P(x + len, y - 1.5) + ' Q' + P(x + len + 1.5, y + 1) + ' ' + P(x + len - 1, y + 2.2) + ' L' + P(x, y + 3) + ' Z';
      case 'wide': return 'M' + P(x, y - 3) + ' L' + P(x + len, y - 4.5) + ' Q' + P(x + len + 2.5, y) + ' ' + P(x + len, y + 3.5) + ' L' + P(x, y + 3) + ' Z';
      case 'gull': return 'M' + P(x, y - 2.6) + ' L' + P(x + len, y - 0.8) + ' L' + P(x + len - 1, y + 2.4) + ' L' + P(x, y + 2.6) + ' Z';
      case 'hook': return 'M' + P(x, y - 3) + ' L' + P(x + len - 2, y - 2.2) + ' Q' + P(x + len + 2, y - 1) + ' ' + P(x + len - 1, y + 3.5) + ' L' + P(x, y + 2.6) + ' Z';
      case 'long': return 'M' + P(x, y - 2) + ' L' + P(x + len, y + 1) + ' L' + P(x, y + 2.2) + ' Z';
      case 'thick': return 'M' + P(x, y - 3.6) + ' L' + P(x + len, y + 1) + ' L' + P(x, y + 3.2) + ' Z';
      case 'spoon': return 'M' + P(x, y - 1.6) + ' L' + P(x + len - 5, y - 1.2) + ' Q' + P(x + len, y - 4.5) + ' ' + P(x + len + 1, y + 0.4) + ' Q' + P(x + len, y + 4.5) + ' ' + P(x + len - 5, y + 1.3) + ' L' + P(x, y + 1.6) + ' Z';
      case 'down': return 'M' + P(x, y - 2) + ' Q' + P(x + len * 0.65, y - 1.4) + ' ' + P(x + len * 0.95, y + len * 0.36) + ' L' + P(x + len * 0.88, y + len * 0.4) + ' Q' + P(x + len * 0.55, y + 2.2) + ' ' + P(x, y + 2) + ' Z';
      case 'up': return 'M' + P(x, y - 1.8) + ' Q' + P(x + len * 0.6, y - 0.6) + ' ' + P(x + len, y - len * 0.2) + ' L' + P(x + len, y - len * 0.12) + ' Q' + P(x + len * 0.6, y + 2) + ' ' + P(x, y + 1.8) + ' Z';
      default: return 'M' + P(x, y - 3) + ' L' + P(x + len, y) + ' L' + P(x, y + 3) + ' Z';
    }
  }
  function beakTip(type, x, y, len) {
    if (type === 'down') return [x + len * 0.9, y + len * 0.36];
    if (type === 'up') return [x + len * 0.95, y - len * 0.15];
    if (type === 'spoon') return [x + len - 1, y];
    return [x + len - 2, y];
  }
  function drawBeak(p, c, x, y) {
    var out = path(beakPath(p.beak, x, y, p.bl), c.beak);
    var tip = mark(c, 'beaktip');
    if (tip) { var t = beakTip(p.beak, x, y, p.bl); out += circ(t[0], t[1], p.beak === 'spoon' ? 3.6 : 2.2, tip); }
    return out;
  }

  // ----- 머리(무늬·눈·부리) -----
  function drawHead(p, c, hx, hy, hr) {
    var out = circ(hx, hy, hr, c.head);
    var v;
    if ((v = mark(c, 'crest'))) out += path('M' + P(hx - hr * 0.2, hy - hr * 0.85) + ' L' + P(hx - hr * 1.6, hy - hr * 0.95) + ' L' + P(hx - hr * 0.7, hy - hr * 0.25) + ' Z', v);
    if ((v = mark(c, 'tufts'))) {
      out += path('M' + P(hx - hr * 0.75, hy - hr * 0.6) + ' L' + P(hx - hr * 0.55, hy - hr * 1.45) + ' L' + P(hx - hr * 0.2, hy - hr * 0.85) + ' Z', v);
      out += path('M' + P(hx + hr * 0.75, hy - hr * 0.6) + ' L' + P(hx + hr * 0.55, hy - hr * 1.45) + ' L' + P(hx + hr * 0.2, hy - hr * 0.85) + ' Z', v);
    }
    if ((v = mark(c, 'cap'))) out += ell(hx, hy - hr * 0.55, hr * 0.88, hr * 0.5, v);
    if ((v = mark(c, 'nape'))) out += circ(hx - hr * 0.72, hy - hr * 0.25, hr * 0.38, v);
    if ((v = mark(c, 'cheekw'))) out += ell(hx + hr * 0.02, hy + hr * 0.3, hr * 0.62, hr * 0.42, v);
    if ((v = mark(c, 'face'))) out += circ(hx + hr * 0.38, hy - hr * 0.05, hr * 0.5, v);
    if ((v = mark(c, 'cheek'))) out += circ(hx - hr * 0.08, hy + hr * 0.38, hr * 0.28, v);
    if ((v = mark(c, 'mask'))) out += '<rect x="' + n(hx - hr * 0.75) + '" y="' + n(hy - hr * 0.36) + '" width="' + n(hr * 1.6) + '" height="' + n(hr * 0.32) + '" rx="' + n(hr * 0.15) + '" fill="' + v + '"/>';
    if ((v = mark(c, 'brow'))) out += ell(hx + hr * 0.12, hy - hr * 0.55, hr * 0.62, hr * 0.13, v);
    if ((v = mark(c, 'bib'))) out += ell(hx + hr * 0.3, hy + hr * 0.82, hr * 0.45, hr * 0.38, v);
    if ((v = mark(c, 'shield'))) out += ell(hx + hr * 0.78, hy - hr * 0.42, hr * 0.32, hr * 0.3, v);
    // 눈
    var ex = hx + hr * 0.38, ey = hy - hr * 0.15, er = Math.max(1.6, hr * 0.17);
    if (c.eye) out += circ(ex, ey, er + 0.9, c.eye);
    if (c.head !== GREY) {
      out += circ(ex, ey, er, '#111');
      out += circ(ex + er * 0.35, ey - er * 0.35, er * 0.35, '#fff');
    }
    if ((v = mark(c, 'ring'))) out += circ(ex, ey, er + 1.3, 'none', ' stroke="' + v + '" stroke-width="1.3"');
    out += drawBeak(p, c, hx + hr * 0.86, hy + hr * 0.05);
    return out;
  }

  // ----- 꼬리 -----
  function drawTail(p, c, bx, by, rx, ry) {
    var tl = p.tail;
    var x0 = bx - rx * 0.72, y0 = by - ry * 0.25, x1 = bx - rx * 0.55, y1 = by + ry * 0.35;
    var dx = -0.94, dy = 0.34;
    if (p.tailUp) { dx = -0.45; dy = -0.89; }
    var cx = (x0 + x1) / 2 + dx * tl, cy = (y0 + y1) / 2 + dy * tl;
    var px = -dy, py = dx, w = 3.2 + tl * 0.05;
    var d = 'M' + P(x0, y0) + ' L' + P(cx + px * w, cy + py * w);
    if (p.fork) d += ' L' + P(cx - dx * tl * 0.35, cy - dy * tl * 0.35);
    d += ' L' + P(cx - px * w, cy - py * w) + ' L' + P(x1, y1) + ' Z';
    var out = path(d, c.tail);
    var band = mark(c, 'tailband');
    if (band && !p.fork) out += line(cx + px * w, cy + py * w, cx - px * w, cy - py * w, band, 3.4);
    return out;
  }

  function bellyMarks(c, bx, by, rx, ry, upright) {
    var out = '', v;
    if ((v = mark(c, 'breast'))) out += upright ? ell(bx + rx * 0.3, by - ry * 0.45, rx * 0.6, ry * 0.3, v) : ell(bx + rx * 0.62, by - ry * 0.05, rx * 0.34, ry * 0.62, v);
    if ((v = mark(c, 'stripe'))) {
      if (upright) { for (var i = 0; i < 4; i++) out += line(bx + rx * 0.05 + (i % 2) * 5, by - ry * 0.2 + i * 6, bx + rx * 0.05 + (i % 2) * 5, by - ry * 0.2 + i * 6 + 3, v, 1.6); }
      else out += line(bx + rx * 0.58, by - ry * 0.55, bx + rx * 0.3, by + ry * 0.85, v, Math.max(2, ry * 0.22));
    }
    if ((v = mark(c, 'vent'))) out += ell(bx - rx * 0.55, by + ry * 0.55, rx * 0.25, ry * 0.3, v);
    if ((v = mark(c, 'collar')) && upright) out += ell(bx + 2, by - ry * 0.85, rx * 0.8, 3, v);
    return out;
  }

  // ----- 앉은 새(작은 새·딱다구리·비둘기·꿩) -----
  function perchArt(p, c) {
    var rx = p.rx, ry = p.ry, hr = p.hr, bx = 0, by = 4;
    var foot = by + ry + p.leg;
    var out = '';
    out += drawTail(p, c, bx, by, rx, ry);
    out += line(bx - 3, by + ry * 0.7, bx - 4, foot, c.leg, 2.2) + line(bx + 3, by + ry * 0.7, bx + 3, foot, c.leg, 2.2);
    out += line(bx - 8, foot, bx + 0, foot, c.leg, 1.6) + line(bx - 1, foot, bx + 7, foot, c.leg, 1.6);
    out += ell(bx, by, rx, ry, c.body);
    out += ell(bx + rx * 0.2, by + ry * 0.35, rx * 0.66, ry * 0.58, c.belly);
    out += bellyMarks(c, bx, by, rx, ry, false);
    out += ell(bx - rx * 0.18, by - ry * 0.08, rx * 0.68, ry * 0.55, c.wing, ' transform="rotate(-8 ' + n(bx - rx * 0.18) + ' ' + n(by) + ')"');
    var v;
    if ((v = mark(c, 'wingbar'))) out += ell(bx - rx * 0.25, by + ry * 0.12, rx * 0.42, 1.8, v);
    var hx = bx + rx * 0.72, hy = by - ry * 0.85;
    if ((v = mark(c, 'collar'))) out += ell(hx - hr * 0.2, hy + hr * 0.9, hr * 0.75, hr * 0.28, v);
    out += drawHead(p, c, hx, hy, hr);
    return { body: out, foot: foot };
  }

  // ----- 꼿꼿이 앉은 맹금류 -----
  function raptorArt(p, c) {
    var out = '';
    out += '<rect x="-9" y="20" width="9" height="16" rx="2" fill="' + c.tail + '"/>';
    var band = mark(c, 'tailband');
    if (band) out += '<rect x="-9" y="31" width="9" height="3" fill="' + band + '"/>';
    out += line(-2, 20, -3, 30, c.leg, 2.6) + line(5, 20, 5, 30, c.leg, 2.6);
    out += line(-7, 30, 1, 30, c.leg, 1.8) + line(1, 30, 9, 30, c.leg, 1.8);
    out += ell(0, 6, p.rx, p.ry, c.body);
    out += ell(4, 10, p.rx * 0.62, p.ry * 0.68, c.belly);
    out += bellyMarks(c, 2, 8, p.rx, p.ry, true);
    out += ell(-5, 4, p.rx * 0.7, p.ry * 0.88, c.wing, ' transform="rotate(10 -5 4)"');
    out += drawHead(p, c, 4, -14, p.hr);
    return { body: out, foot: 30 };
  }

  // ----- 올빼미(앞을 봄) -----
  function owlArt(p, c) {
    var out = '', v;
    out += line(-4, 24, -4, 29, c.leg, 3) + line(4, 24, 4, 29, c.leg, 3);
    out += ell(0, 8, p.rx, p.ry, c.body);
    out += ell(-13, 9, 6, 16, c.wing) + ell(13, 9, 6, 16, c.wing);
    out += ell(0, 12, 10.5, 13.5, c.belly);
    if ((v = mark(c, 'stripe'))) for (var i = 0; i < 6; i++) out += line(-5 + (i % 3) * 5, 5 + Math.floor(i / 3) * 8, -5 + (i % 3) * 5, 9 + Math.floor(i / 3) * 8, v, 1.6);
    if ((v = mark(c, 'tufts'))) out += path('M-12,-20 L-10,-32 L-4,-24 Z', v) + path('M12,-20 L10,-32 L4,-24 Z', v);
    out += circ(0, -13, p.hr, c.head);
    if (c.head !== GREY) {
      var iris = c.eye || '#f5c400';
      out += circ(-5.5, -14, 4.4, iris) + circ(5.5, -14, 4.4, iris);
      out += circ(-5.5, -14, 2.2, '#111') + circ(5.5, -14, 2.2, '#111');
      out += circ(-4.8, -14.8, 0.8, '#fff') + circ(6.2, -14.8, 0.8, '#fff');
    }
    out += path('M-2,-10 L2,-10 L0,-5 Z', c.beak);
    return { body: out, foot: 29 };
  }

  // ----- 물에 뜬 새(오리·고니·갈매기·가마우지) -----
  function swimArt(p, c, shape) {
    var rx = p.rx, ry = p.ry, hr = p.hr, by = shape === 'cormorant' ? 8 : 4;
    var water = by + ry * 0.5;
    var out = '', v;
    out += ell(0, water + 1, rx * 1.25, 3, '#ffffff', ' opacity=".45"');
    // 꼬리
    var tl = p.tail;
    out += path('M' + P(-rx + 2, by - ry * 0.1) + ' L' + P(-rx - tl, by - ry * 0.6 - tl * 0.3) + ' L' + P(-rx + 6, by - ry * 0.65) + ' Z', c.tail);
    // 몸(배 모양)
    out += path('M' + P(-rx, by) + ' Q' + P(-rx, by - ry) + ' ' + P(0, by - ry) + ' Q' + P(rx * 0.9, by - ry) + ' ' + P(rx, by) +
      ' Q' + P(rx * 0.6, water + ry * 0.2) + ' ' + P(0, water) + ' Q' + P(-rx * 0.7, water) + ' ' + P(-rx, by) + ' Z', c.body);
    out += path('M' + P(-rx * 0.8, water - 1) + ' L' + P(rx * 0.85, water - 1) + ' Q' + P(rx * 0.5, water + 2) + ' ' + P(0, water + 1) + ' Z', c.belly);
    if ((v = mark(c, 'breast'))) out += ell(rx * 0.68, by - ry * 0.1, rx * 0.3, ry * 0.7, v);
    if ((v = mark(c, 'stripe'))) out += line(rx * 0.1, by + 1, rx * 0.4, by + 1, v, 2) + line(-rx * 0.1, by + 4, rx * 0.25, by + 4, v, 2);
    out += ell(-rx * 0.18, by - ry * 0.4, rx * 0.6, ry * 0.5, c.wing);
    if ((v = mark(c, 'wingbar'))) out += ell(-rx * 0.3, by - ry * 0.25, rx * 0.25, 2, v);
    // 목·머리
    var nx0 = rx * 0.6, ny0 = by - ry * 0.6;
    var hx = nx0 + p.neck * 0.3 + 2, hy = by - ry - p.neck - hr * 0.3;
    if (p.neck > 4) {
      var cxq = shape === 'swan' ? nx0 + 12 : nx0 - 2;
      out += '<path d="M' + P(nx0, ny0) + ' Q' + P(cxq, (ny0 + hy) / 2) + ' ' + P(hx - 1, hy) + '" stroke="' + c.neck + '" stroke-width="' + n(hr * 1.3) + '" stroke-linecap="round" fill="none"/>';
    }
    if ((v = mark(c, 'collar'))) out += ell(hx - 1, hy + hr * 0.95, hr * 0.8, hr * 0.28, v);
    out += drawHead(p, c, hx, hy, hr);
    return { body: out, foot: water };
  }

  // ----- 서 있는 새(백로·두루미·도요) -----
  function standArt(p, c, shape) {
    var rx = p.rx, ry = p.ry, hr = p.hr, L = p.leg;
    var ground = 48, by = ground - L - ry * 0.6, bx = -2;
    var out = '', v;
    out += line(bx - 2, by + ry * 0.5, bx - 5, ground, c.leg, 2.2) + line(bx + 3, by + ry * 0.5, bx + 5, ground, c.leg, 2.2);
    out += line(bx - 9, ground, bx - 1, ground, c.feet, 1.6) + line(bx + 1, ground, bx + 10, ground, c.feet, 1.6);
    out += path('M' + P(bx - rx * 0.8, by - 2) + ' L' + P(bx - rx - p.tail, by + 2) + ' L' + P(bx - rx * 0.7, by + 4) + ' Z', c.tail);
    out += ell(bx, by, rx, ry, c.body, ' transform="rotate(-10 ' + n(bx) + ' ' + n(by) + ')"');
    out += ell(bx + rx * 0.2, by + ry * 0.3, rx * 0.65, ry * 0.55, c.belly);
    out += bellyMarks(c, bx, by, rx, ry, false);
    out += ell(bx - rx * 0.15, by - ry * 0.15, rx * 0.72, ry * 0.6, c.wing, ' transform="rotate(-10 ' + n(bx) + ' ' + n(by) + ')"');
    if ((v = mark(c, 'wingbar'))) out += ell(bx - rx * 0.2, by + ry * 0.05, rx * 0.4, 1.6, v);
    if (shape === 'crane') out += ell(bx - rx * 0.85, by + ry * 0.3, rx * 0.45, ry * 0.5, mark(c, 'tailband') || c.wing);
    var nx0 = bx + rx * 0.62, ny0 = by - ry * 0.45;
    var hx = nx0 + 5, hy = by - ry * 0.4 - p.neck - hr * 0.2;
    if (p.neck > 4) {
      out += '<path d="M' + P(nx0, ny0) + ' Q' + P(nx0 - 7, (ny0 + hy) / 2) + ' ' + P(hx - 1, hy + 1) + '" stroke="' + c.neck + '" stroke-width="' + n(hr * 1.15) + '" stroke-linecap="round" fill="none"/>';
    } else {
      hx = bx + rx * 0.75; hy = by - ry * 0.8;
    }
    if ((v = mark(c, 'collar'))) out += ell(hx - 1, hy + hr, hr * 0.8, hr * 0.3, v);
    out += drawHead(p, c, hx, hy, hr);
    return { body: out, foot: ground };
  }

  // ----- 나는 새 -----
  function flyArt(p, c, shape) {
    var rx = p.upright ? p.ry : p.rx, ry = p.upright ? p.rx * 0.6 : p.ry * 0.75, hr = p.hr * (p.upright ? 0.85 : 1);
    if (shape === 'owl') { rx = 16; ry = 10; hr = 9; }
    var span = Math.max(26, rx * 1.7);
    if (shape === 'raptor' || shape === 'swan' || shape === 'crane' || shape === 'stork') span = Math.max(span, 40);
    var neck = (shape === 'heron') ? p.neck * 0.25 : p.neck * 0.7;
    var hx = rx + neck + hr * 0.4, hy = -3;
    var tipC = mark(c, 'tailband');
    var dark = shape === 'stork' || shape === 'crane' || shape === 'gull' ? '#222' : null;
    function wing(fill, cls) {
      var d = 'M' + P(-rx * 0.45, -2) + ' L' + P(rx * 0.35, -2) + ' Q' + P(rx * 0.15, -span * 0.7) + ' ' + P(-rx * 0.55, -span) +
        ' Q' + P(-rx * 0.75, -span * 0.5) + ' ' + P(-rx * 0.45, -2) + ' Z';
      var g = '<g class="' + cls + '">' + path(d, fill);
      if (dark && c.head !== GREY) g += path('M' + P(-rx * 0.62, -span * 0.75) + ' Q' + P(-rx * 0.4, -span * 0.95) + ' ' + P(-rx * 0.55, -span) + ' Q' + P(-rx * 0.75, -span * 0.85) + ' ' + P(-rx * 0.62, -span * 0.75) + ' Z', '#222');
      return g + '</g>';
    }
    var out = '';
    out += wing(c.wing, 'bw-wing2');
    if (LONG_LEGS[shape]) out += line(-rx * 0.6, 2, -rx - p.leg * 0.6, 4, c.leg, 2);
    out += path('M' + P(-rx + 1, -2) + ' L' + P(-rx - p.tail * 0.8 - 4, -5) + ' L' + P(-rx - p.tail * 0.8 - 4, 3) + ' L' + P(-rx + 1, 2) + ' Z', c.tail);
    if (tipC && shape !== 'crane') out += line(-rx - p.tail * 0.8 - 3, -4, -rx - p.tail * 0.8 - 3, 2, tipC, 3);
    if (neck > 3) out += line(rx * 0.6, -1, hx - 1, hy, c.neck, n(hr * 1.2));
    out += ell(0, 0, rx, ry, c.body);
    out += ell(rx * 0.1, ry * 0.35, rx * 0.75, ry * 0.5, c.belly);
    out += drawHead(p, c, hx, hy, hr);
    out += wing(c.wing, 'bw-wing');
    // 상자 밖으로 나가면 줄인다
    var maxX = hx + hr + p.bl + 2, minX = -rx - p.tail * 0.8 - 6;
    var fit = Math.min(1, 56 / Math.max(maxX, -minX, span + 4));
    var shift = -(maxX + minX) / 2;
    return { body: '<g transform="scale(' + n(fit * 100) / 100 + ') translate(' + n(shift) + ' 0)">' + out + '</g>', foot: 0 };
  }

  // 새 한 마리 SVG 글. pose: perch/stand/swim/fly. silhouette: 회색 그림자(도감의 안 본 새)
  function bird(b, pose, silhouette) {
    var p = params(b), c = palette(b, !!silhouette);
    var r;
    if (pose === 'fly') r = flyArt(p, c, b.shape);
    else if (b.shape === 'owl') r = owlArt(p, c);
    else if (b.shape === 'raptor') r = raptorArt(p, c);
    else if (pose === 'swim') r = swimArt(p, c, b.shape);
    else if (pose === 'stand' && LONG_LEGS[b.shape]) r = standArt(p, c, b.shape);
    else if (LONG_LEGS[b.shape]) r = standArt(p, c, b.shape);
    else r = perchArt(p, c);
    return {
      svg: '<svg viewBox="' + VIEW + '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + r.body + '</svg>',
      foot: (r.foot + 60) / 120   // 발(또는 물 높이)이 상자 위에서 몇 % 지점인지
    };
  }

  // ===== 배경 =====
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function sky(top, bottom) {
    return '<defs><linearGradient id="bwSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + top + '"/><stop offset="1" stop-color="' + bottom + '"/></linearGradient>' +
      '<linearGradient id="bwWater" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6fb8e0"/><stop offset="1" stop-color="#3d8fc4"/></linearGradient></defs>' +
      '<rect width="' + W + '" height="' + H + '" fill="url(#bwSky)"/>';
  }
  function cloud(x, y, s) {
    return '<g fill="#ffffff" opacity=".9">' + ell(x, y, 46 * s, 18 * s, '#fff') + ell(x - 30 * s, y + 6 * s, 30 * s, 14 * s, '#fff') + ell(x + 34 * s, y + 5 * s, 32 * s, 13 * s, '#fff') + '</g>';
  }
  function hills(y, color, amp, rand, count) {
    var d = 'M0,' + H + ' L0,' + y;
    var step = W / count;
    for (var i = 0; i < count; i++) {
      var x1 = i * step + step / 2, x2 = (i + 1) * step;
      d += ' Q' + P(x1, y - amp * (0.5 + rand())) + ' ' + P(x2, y + (rand() - 0.5) * amp * 0.4);
    }
    return path(d + ' L' + W + ',' + H + ' Z', color);
  }
  function peaks(y, color, rand, count, tall) {
    var d = 'M0,' + H + ' L0,' + y;
    var step = W / count;
    for (var i = 0; i < count; i++) d += ' L' + P(i * step + step / 2, y - tall * (0.6 + rand() * 0.5)) + ' L' + P((i + 1) * step, y - rand() * 20);
    return path(d + ' L' + W + ',' + H + ' Z', color);
  }

  // 둥근 나무: 줄기 + 잎 덩어리. 앉을 자리 3~4곳을 perches에 더한다.
  function roundTree(x, base, h, r, leaf, perches) {
    var out = '<path d="M' + P(x - 7, base) + ' L' + P(x - 4, base - h) + ' L' + P(x + 4, base - h) + ' L' + P(x + 7, base) + ' Z" fill="#7a5532"/>';
    out += line(x, base - h * 0.6, x + r * 0.7, base - h * 0.95, '#7a5532', 5);
    var cy = base - h - r * 0.4;
    out += circ(x - r * 0.55, cy + r * 0.2, r * 0.7, leaf) + circ(x + r * 0.55, cy + r * 0.25, r * 0.68, leaf) + circ(x, cy - r * 0.25, r * 0.8, leaf);
    out += circ(x - r * 0.2, cy - r * 0.45, r * 0.3, '#ffffff', ' opacity=".12"');
    perches.push({ x: x, y: cy - r * 1.02 }, { x: x - r * 0.95, y: cy - r * 0.2 }, { x: x + r * 0.95, y: cy - r * 0.1 }, { x: x + r * 0.7, y: base - h * 0.95 });
    return out;
  }
  function pineTree(x, base, h, leaf, perches) {
    var out = '<rect x="' + n(x - 4) + '" y="' + n(base - h * 0.25) + '" width="8" height="' + n(h * 0.25) + '" fill="#6b4a2e"/>';
    for (var i = 0; i < 3; i++) {
      var w = h * (0.42 - i * 0.1), top = base - h * (0.45 + i * 0.25), bot = base - h * (0.15 + i * 0.25);
      out += path('M' + P(x - w, bot) + ' L' + P(x, top - h * 0.12) + ' L' + P(x + w, bot) + ' Z', leaf);
    }
    perches.push({ x: x, y: base - h * 1.07 }, { x: x - h * 0.3, y: base - h * 0.33 });
    return out;
  }
  function reeds(x0, x1, base, h, rand, perches, color) {
    var out = '';
    for (var x = x0; x < x1; x += 9 + rand() * 6) {
      var hh = h * (0.6 + rand() * 0.5), lean = (rand() - 0.5) * 14;
      out += line(x, base, x + lean, base - hh, color || '#b59a5a', 2.2);
      out += ell(x + lean, base - hh - 5, 2.6, 8, '#9a7a45');
    }
    for (var i = 0; i < 3; i++) perches.push({ x: x0 + (x1 - x0) * (0.2 + i * 0.3), y: base - h * 0.95 });
    return out;
  }
  function bush(x, y, r, color, perches) {
    if (perches) perches.push({ x: x, y: y - r * 1.05 });
    return circ(x - r * 0.6, y, r * 0.7, color) + circ(x + r * 0.6, y, r * 0.7, color) + circ(x, y - r * 0.3, r * 0.8, color);
  }
  function ripples(x0, x1, y0, y1, rand, count) {
    var out = '';
    for (var i = 0; i < count; i++) {
      var x = x0 + rand() * (x1 - x0), y = y0 + rand() * (y1 - y0);
      out += line(x, y, x + 18 + rand() * 20, y, '#ffffff', 2, ' opacity=".35"');
    }
    return out;
  }

  function buildScene(region) {
    var kind = region.scene, perches = [], areas = { water: [], shore: [], ground: [] };
    var seed = 0;
    for (var i = 0; i < region.id.length; i++) seed = (seed * 31 + region.id.charCodeAt(i)) >>> 0;
    var rand = rng(seed);
    var out = '';
    var sun = circ(860, 90, 38, '#fff3b0', ' opacity=".9"');
    if (kind === 'park' || kind === 'pond') {
      out += sky('#8fd0ff', '#e3f6ff') + sun + cloud(200, 110, 1) + cloud(620, 70, 0.8);
      out += hills(420, '#a8d8a0', 60, rand, 4) + hills(470, '#7cc36e', 40, rand, 5);
      out += '<rect x="0" y="480" width="1000" height="220" fill="#6dbb5c"/>';
      out += path('M420,700 Q470,600 520,560 Q560,520 640,500 L680,500 Q600,540 580,580 Q550,640 560,700 Z', '#e8d9b0');
      if (kind === 'pond') {
        out += ell(560, 590, 280, 70, '#5a9e4c') + ell(560, 588, 265, 60, 'url(#bwWater)');
        out += ripples(340, 760, 560, 620, rand, 10);
        areas.water.push({ x0: 340, x1: 770, y0: 565, y1: 615 });
        areas.shore.push({ x0: 320, x1: 800, y0: 655, y1: 670 });
        out += reeds(290, 340, 610, 60, rand, perches) + reeds(780, 830, 615, 55, rand, perches);
      }
      out += roundTree(110, 520, 120, 70, '#3f8f3a', perches) + roundTree(330, 500, 100, 58, '#4ea544', perches);
      out += roundTree(760, 500, 110, 62, '#3b8a3c', perches) + roundTree(930, 530, 130, 72, '#4a9b3f', perches);
      out += bush(220, 600, 34, '#3f9a3a', perches) + bush(860, 640, 38, '#3a8f35', perches);
      out += '<rect x="250" y="640" width="90" height="8" rx="3" fill="#9a6a3a"/>' + line(258, 648, 258, 668, '#6b4a2e', 4) + line(332, 648, 332, 668, '#6b4a2e', 4);
      perches.push({ x: 300, y: 639 });
      areas.ground.push({ x0: 40, x1: 960, y0: 620, y1: 680 });
      if (!areas.shore.length) areas.shore.push({ x0: 40, x1: 400, y0: 650, y1: 680 });
    } else if (kind === 'lake' || kind === 'marsh') {
      out += sky('#86c9f5', '#e6f5ff') + sun + cloud(300, 100, 0.9) + cloud(700, 140, 0.7);
      out += hills(400, '#93b8a8', 70, rand, 3) + hills(440, '#7fae7a', 35, rand, 5);
      out += '<rect x="0" y="450" width="1000" height="250" fill="url(#bwWater)"/>';
      out += ripples(60, 940, 470, 620, rand, 22);
      if (kind === 'marsh') {
        for (var k = 0; k < 26; k++) out += ell(60 + rand() * 880, 500 + rand() * 120, 14 + rand() * 10, 5, '#4f8f3a', ' opacity=".85"');
        out += ell(780, 470, 120, 26, '#6aa457');
        out += roundTree(760, 470, 70, 48, '#5a9b45', perches) + roundTree(840, 468, 60, 40, '#6aa850', perches);
      } else {
        out += roundTree(120, 455, 80, 50, '#4e9443', perches) + roundTree(230, 452, 60, 40, '#5aa04b', perches);
      }
      out += path('M0,640 Q250,620 500,642 Q760,662 1000,636 L1000,700 L0,700 Z', '#8bb36a');
      out += reeds(20, 220, 650, 90, rand, perches) + reeds(820, 990, 650, 80, rand, perches);
      out += bush(500, 670, 28, '#5f9a48', perches);
      areas.water.push({ x0: 60, x1: 940, y0: 480, y1: 610 });
      areas.shore.push({ x0: 240, x1: 800, y0: 652, y1: 680 });
      areas.ground.push({ x0: 240, x1: 800, y0: 660, y1: 685 });
    } else if (kind === 'mountain') {
      out += sky('#9fd3f7', '#eef8ff') + sun + cloud(250, 90, 1) + cloud(640, 120, 0.7);
      out += peaks(330, '#9fb6c7', rand, 4, 150) + peaks(420, '#7e9e8a', rand, 6, 110) + hills(520, '#5d8f4f', 50, rand, 5);
      out += '<rect x="0" y="560" width="1000" height="140" fill="#5c9a48"/>';
      var xs = [70, 190, 300, 430, 560, 690, 820, 940];
      for (var t = 0; t < xs.length; t++) {
        if (t % 3 === 1) out += roundTree(xs[t], 600 + (t % 2) * 30, 90, 52, '#3f7f3a', perches);
        else out += pineTree(xs[t], 600 + (t % 2) * 40, 170 + rand() * 40, '#2f6b3a', perches);
      }
      out += bush(360, 660, 30, '#3e8a3a', perches) + bush(640, 670, 34, '#3a7f36', perches);
      areas.ground.push({ x0: 60, x1: 940, y0: 640, y1: 690 });
      areas.shore.push({ x0: 60, x1: 940, y0: 650, y1: 690 });
    } else if (kind === 'field') {
      out += sky('#a6d8f8', '#fdf3df') + sun + cloud(380, 90, 0.9);
      out += peaks(380, '#a7b8c6', rand, 5, 90) + hills(420, '#93ae84', 25, rand, 6);
      out += '<rect x="0" y="430" width="1000" height="270" fill="#d9c47d"/>';
      for (var f = 0; f < 9; f++) out += line(0, 540 + f * 18, 1000, 536 + f * 18, '#c4ac62', 3);
      out += path('M0,470 Q300,455 520,478 Q760,500 1000,468 L1000,505 Q760,535 520,512 Q300,492 0,506 Z', 'url(#bwWater)');
      out += ripples(80, 900, 478, 500, rand, 8);
      // 전깃줄과 울타리 기둥
      out += line(0, 300, 1000, 320, '#333', 1.5) + line(80, 300, 80, 440, '#6b5a4a', 5) + line(900, 318, 900, 440, '#6b5a4a', 5);
      for (var w = 0; w < 6; w++) perches.push({ x: 150 + w * 130, y: 300 + (150 + w * 130) * 0.02 });
      for (var q = 0; q < 6; q++) { out += '<rect x="' + (120 + q * 150) + '" y="410" width="7" height="34" fill="#7a5a3a"/>'; perches.push({ x: 123 + q * 150, y: 409 }); }
      out += roundTree(930, 440, 90, 50, '#5c8f45', perches);
      areas.water.push({ x0: 60, x1: 940, y0: 478, y1: 500 });
      areas.shore.push({ x0: 60, x1: 940, y0: 560, y1: 670 });
      areas.ground.push({ x0: 60, x1: 940, y0: 560, y1: 670 });
    } else if (kind === 'mudflat') {
      out += sky('#a9d6f2', '#f3efe6') + sun + cloud(220, 120, 0.8) + cloud(600, 80, 0.9);
      out += hills(400, '#a3b1a0', 30, rand, 4);
      out += '<rect x="0" y="405" width="1000" height="40" fill="#7fb3cf"/>';
      out += '<rect x="0" y="440" width="1000" height="260" fill="#9a8c74"/>';
      for (var g = 0; g < 40; g++) out += ell(rand() * 1000, 470 + rand() * 220, 6 + rand() * 10, 2, '#86795f');
      out += path('M0,500 Q260,480 470,505 Q700,530 1000,490 L1000,520 Q700,560 470,532 Q260,510 0,530 Z', '#7fb3cf');
      out += ripples(80, 920, 500, 525, rand, 8);
      out += path('M0,560 Q120,520 240,560 L240,700 L0,700 Z', '#c9a35a', ' opacity=".55"');
      out += reeds(10, 230, 610, 110, rand, perches, '#c9a35a');
      for (var pst = 0; pst < 4; pst++) { out += '<rect x="' + (560 + pst * 110) + '" y="430" width="6" height="40" fill="#6b5a4a"/>'; perches.push({ x: 563 + pst * 110, y: 429 }); }
      areas.water.push({ x0: 80, x1: 920, y0: 500, y1: 525 });
      areas.shore.push({ x0: 260, x1: 960, y0: 560, y1: 680 });
      areas.ground.push({ x0: 260, x1: 960, y0: 580, y1: 680 });
    } else { // coast
      out += sky('#8ccdf5', '#eaf7ff') + sun + cloud(260, 90, 1) + cloud(560, 130, 0.7);
      out += '<rect x="0" y="380" width="1000" height="200" fill="url(#bwWater)"/>';
      out += ripples(20, 980, 400, 560, rand, 26);
      out += path('M0,560 Q300,540 600,566 Q820,584 1000,552 L1000,700 L0,700 Z', '#ead8a8');
      out += path('M650,560 Q690,500 740,510 Q790,505 810,560 Z', '#7d7a74') + path('M90,580 Q120,540 170,548 Q200,560 205,585 Z', '#8a867e');
      perches.push({ x: 740, y: 508 }, { x: 150, y: 546 });
      out += pineTree(880, 600, 210, '#2f6b3a', perches) + roundTree(940, 640, 90, 46, '#3f8a3e', perches);
      out += bush(820, 650, 30, '#4a8f3f', perches);
      areas.water.push({ x0: 40, x1: 900, y0: 420, y1: 545 });
      areas.shore.push({ x0: 220, x1: 760, y0: 600, y1: 680 });
      areas.ground.push({ x0: 220, x1: 760, y0: 600, y1: 680 });
    }
    return {
      svg: '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" aria-hidden="true">' + out + '</svg>',
      perches: perches, areas: areas, W: W, H: H
    };
  }

  var api = { W: W, H: H, SHAPE: SHAPE, bird: bird, buildScene: buildScene, rng: rng };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.Birdwatch = root.Birdwatch || {}; root.Birdwatch.Art = api; }
})(typeof window !== 'undefined' ? window : this);
