// ===== game.js =====
// 남극 탐험의 규칙(화면을 모름). 브라우저(window.Antarctica.Game)와 Node 시험이 함께 쓴다.
// update(state, input, dt)가 한 걸음 진행하고 일어난 일(사건) 목록을 돌려준다.
// 지도: 아래쪽이 바다(해안에 세종기지·장보고기지), 위로 갈수록 남극점(맨 위 가운데)에 가깝고 더 춥다.
// 지형: 눈밭 · 얼음(미끄러짐) · 깊은 눈(느림) · 크레바스(숨은 틈) · 바다·유빙·산(못 감) · 기지 · 남극점.
// 지도는 늘 같은 씨앗(WORLD_SEED)으로 만들어서 저장에는 지도를 넣지 않는다.
(function (root) {
  'use strict';

  var TILE = 32, COLS = 150, ROWS = 190;
  var WORLD_W = COLS * TILE, WORLD_H = ROWS * TILE;
  var T = { SNOW: 0, ICE: 1, DEEP: 2, CREV: 3, SEA: 4, FLOE: 5, MOUNT: 6, BASE: 7, POLE: 8 };
  var BLOCK = [false, false, false, false, true, true, true, false, false];
  var TERRAIN_NAME = ['눈밭', '얼음', '깊은 눈', '크레바스', '바다', '유빙', '산', '기지', '남극점'];
  var PLAYER_R = 11;
  var WORLD_SEED = 20261029;
  var BASE_SPEED = 150;
  var OBSERVE_R = 84, PICK_R = 42, CACHE_R = 30, POLE_R = 56;
  var SAMPLE_RESPAWN = 150, CACHE_RESPAWN = 120;

  // 실제 남극 동물. zone = 사는 곳(지도에서 놓일 자리), group = 함께 그릴 마릿수.
  var ANIMALS = [
    { id: 'emperor', name: '황제펭귄', kind: 'penguin', zone: 'seaice', spots: 2, group: 6, points: 25,
      desc: '가장 큰 펭귄(키 약 1.1m)이에요. 한겨울 얼음 위에서 아빠가 알을 발등에 올려 두 달 넘게 굶으며 품어요.' },
    { id: 'adelie', name: '아델리펭귄', kind: 'penguin', zone: 'coast', spots: 2, group: 5, points: 25,
      desc: '눈 둘레의 하얀 테두리가 특징이에요. 작은 돌멩이를 모아 둥지를 만들어요.' },
    { id: 'gentoo', name: '젠투펭귄', kind: 'penguin', zone: 'coast', spots: 2, group: 4, points: 25,
      desc: '주황색 부리와 눈 위 하얀 띠가 특징이고, 펭귄 중에서 헤엄이 가장 빨라요(시속 약 36km).' },
    { id: 'chinstrap', name: '턱끈펭귄', kind: 'penguin', zone: 'coast', spots: 2, group: 4, points: 25,
      desc: '턱 아래 가는 검은 줄이 모자 끈처럼 보여서 붙은 이름이에요. 세종기지 근처 바닷가에도 살아요.' },
    { id: 'weddell', name: '웨델물범', kind: 'seal', zone: 'coast', spots: 2, group: 2, points: 25,
      desc: '가장 남쪽에 사는 포유류 중 하나예요. 이빨로 얼음을 갈아 숨 쉴 구멍을 만들어요.' },
    { id: 'leopard', name: '표범물범', kind: 'seal', zone: 'coast', spots: 2, group: 1, points: 25,
      desc: '몸에 표범 같은 점무늬가 있는 사냥꾼이에요. 펭귄도 잡아먹는 남극 바다의 최상위 포식자예요.' },
    { id: 'elephant', name: '남방코끼리물범', kind: 'seal', zone: 'coast', spots: 2, group: 2, points: 25,
      desc: '가장 큰 물범으로 수컷은 4톤 가까이 나가요. 수컷의 코가 코끼리 코처럼 늘어져 있어요.' },
    { id: 'crabeater', name: '게잡이물범', kind: 'seal', zone: 'seaice', spots: 2, group: 3, points: 25,
      desc: '이름과 달리 게가 아니라 크릴을 걸러 먹어요. 세상에서 수가 가장 많은 물범이에요.' },
    { id: 'furseal', name: '남극물개', kind: 'seal', zone: 'coast', spots: 2, group: 2, points: 25,
      desc: '물범과 달리 작은 귓바퀴가 있고, 앞지느러미로 몸을 세워 뭍에서 걸을 수 있어요.' },
    { id: 'skua', name: '남극도둑갈매기', kind: 'bird', zone: 'coast', spots: 2, group: 2, points: 25,
      desc: '펭귄의 알과 새끼를 훔쳐 먹어서 "도둑"이라는 이름이 붙은 갈색 바닷새예요.' },
    { id: 'snowpetrel', name: '흰풀마갈매기', kind: 'bird', zone: 'mountain', spots: 3, group: 2, points: 25,
      desc: '온몸이 눈처럼 하얀 새예요. 바다에서 멀리 떨어진 남극 내륙 산의 바위틈에도 둥지를 틀어요.' },
    { id: 'giantpetrel', name: '남방큰풀마갈매기', kind: 'bird', zone: 'coast', spots: 2, group: 1, points: 25,
      desc: '날개를 펴면 2m 가까이 되는 큰 바닷새예요. 죽은 동물도 먹어 치우는 바다의 청소부예요.' }
  ];

  // 연구 표본: 기지에 가져가면 연구 점수
  var SAMPLES = [
    { id: 'moss', name: '이끼', points: 10, count: 8, where: '바닷가 근처 바위',
      desc: '남극에도 이끼와 지의류가 살아요. 바닷가 바위에서 짧은 여름 동안 조금씩 자라요.' },
    { id: 'fossil', name: '암석 화석', points: 20, count: 8, where: '산 바로 옆',
      desc: '남극 산맥에서는 글로소프테리스 같은 옛 식물 화석이 나와요. 아주 먼 옛날 남극이 따뜻했다는 증거예요.' },
    { id: 'meteorite', name: '운석', points: 40, count: 7, where: '내륙의 파란 얼음 위',
      desc: '바람이 눈을 쓸어 가 맨얼음이 드러난 곳에서는 검은 운석이 잘 보여요. 그래서 남극은 운석을 찾기 좋은 곳이에요.' },
    { id: 'core', name: '빙하 얼음 코어', points: 35, count: 6, where: '남극점 가까운 고원',
      desc: '얼음 속 작은 공기 방울에 수십만 년 전 공기가 갇혀 있어서, 옛날 지구의 기후를 알 수 있어요.' }
  ];

  // 장비 업그레이드(연구 점수로 삼, 기지 안에서만)
  var UPGRADES = {
    suit: { name: '🧥 방한복', max: 4, costs: [40, 90, 180, 300], desc: '최대 체온 +25, 추위를 덜 타요' },
    sled: { name: '🛷 썰매', max: 3, costs: [30, 80, 160], desc: '가방 칸 +2' },
    crampon: { name: '🦶 아이젠', max: 1, costs: [60], desc: '얼음에서 미끄러지지 않아요' },
    mobile: { name: '🛵 스노모빌', max: 3, costs: [100, 200, 350], desc: '더 빨리 달려요' },
    detector: { name: '📡 크레바스 탐지기', max: 3, costs: [50, 110, 220], desc: '숨은 틈을 더 멀리서 찾아요' },
    tent: { name: '⛺ 텐트', max: 3, costs: [60, 130, 220], desc: '밖에서 쉬어 몸을 녹여요(나갈 때마다 단계만큼)' }
  };
  var UP_KEYS = Object.keys(UPGRADES);

  function maxWarm(up) { return 100 + 25 * up.suit; }
  function capacity(up) { return 3 + 2 * up.sled; }
  function revealRadius(up) { return (1.6 + 2 * up.detector) * TILE; }

  // ----- 숫자 도우미 -----
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
  function hash2(x, y, seed) {
    var h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 982451653)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function vnoise(x, y, seed) {
    var x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
    var sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    var a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  }
  function fbm(x, y, seed) { return vnoise(x, y, seed) * 0.6 + vnoise(x * 2.1, y * 2.1, seed + 7) * 0.28 + vnoise(x * 4.3, y * 4.3, seed + 13) * 0.12; }
  function num(v) { return typeof v === 'number' && Number.isFinite(v) ? v : 0; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ----- 지도 만들기 -----
  var WORLD = null;
  function world() { if (!WORLD) WORLD = generate(WORLD_SEED); return WORLD; }

  function generate(seed) {
    var rand = rng(seed);
    var tiles = new Uint8Array(COLS * ROWS);
    var idx = function (c, r) { return r * COLS + c; };
    var coast = [];
    for (var c = 0; c < COLS; c++) {
      coast[c] = Math.round(clamp(ROWS - 16 + 6 * Math.sin(c * 0.07) + 10 * (vnoise(c * 0.09, 3.3, seed) - 0.5), ROWS - 26, ROWS - 8));
    }
    var mountRow = function (cc) { return Math.round(ROWS * 0.47 + 9 * Math.sin(cc * 0.05 + 1.3)); };
    for (var r = 0; r < ROWS; r++) {
      for (c = 0; c < COLS; c++) {
        var t = T.SNOW;
        var lat = 1 - r / (ROWS - 1);
        if (r > coast[c]) t = rand() < (r > coast[c] + 2 ? 0.1 : 0.04) ? T.FLOE : T.SEA;
        else if (c < 2 || c > COLS - 3 || r < 2) t = T.MOUNT;
        else {
          var m = fbm(c * 0.09, r * 0.09, seed + 101);
          var band = Math.abs(r - mountRow(c));
          if ((band < 8 && m > 0.5) || (lat > 0.15 && m > 0.74)) t = T.MOUNT;
          else {
            var ice = fbm(c * 0.07, r * 0.07, seed + 202);
            var deep = fbm(c * 0.11, r * 0.11, seed + 303);
            if (r >= coast[c] - 3 && ice > 0.45) t = T.ICE;                 // 바닷가 얼음
            else if (ice > (lat > 0.35 ? 0.64 : 0.72)) t = T.ICE;              // 내륙 파란 얼음
            else if (deep > 0.62 - lat * 0.08) t = T.DEEP;
          }
        }
        tiles[idx(c, r)] = t;
      }
    }

    var bases = [
      { id: 'sejong', name: '세종기지', col: 24 },
      { id: 'jangbogo', name: '장보고기지', col: 124 }
    ];
    bases.forEach(function (b) {
      var lowest = ROWS;
      for (var cc = b.col - 6; cc <= b.col + 6; cc++) lowest = Math.min(lowest, coast[cc]);
      b.row = lowest - 6;
      for (var rr = b.row - 5; rr <= b.row + 4; rr++) {
        for (cc = b.col - 6; cc <= b.col + 6; cc++) if (rr <= coast[cc] - 1) tiles[idx(cc, rr)] = T.SNOW;
      }
    });
    var pole = { col: Math.floor(COLS / 2), row: 9 };

    // 기지에서 남극점까지 반드시 갈 수 있는 길(산을 눈밭으로)
    bases.forEach(function (b) {
      var cc = b.col, rr = b.row;
      while (rr > pole.row) {
        for (var k = -1; k <= 1; k++) {
          var ci = clamp(cc + k, 2, COLS - 3);
          if (BLOCK[tiles[idx(ci, rr)]]) tiles[idx(ci, rr)] = T.SNOW;
        }
        if (rand() < 0.75) rr--;
        var drift = pole.col - cc;
        var go = rand() < 0.55 ? Math.sign(drift) : (rand() < 0.5 ? -1 : 1);
        if (Math.abs(drift) > rr - pole.row) go = Math.sign(drift);
        if (rand() < 0.6) cc = clamp(cc + go, 3, COLS - 4);
      }
    });

    // 크레바스 무리(기지·남극점 가까이는 없음)
    for (var n = 0; n < 90; n++) {
      var c0 = 4 + Math.floor(rand() * (COLS - 8)), r0 = 4 + Math.floor(rand() * (ROWS - 30));
      var near = bases.some(function (b) { return Math.abs(b.col - c0) < 10 && Math.abs(b.row - r0) < 9; }) || (Math.abs(pole.col - c0) < 8 && Math.abs(pole.row - r0) < 8);
      if (near) continue;
      var dc = rand() < 0.5 ? 1 : 0, dr = dc ? (rand() < 0.5 ? 0 : (rand() < 0.5 ? 1 : -1)) : 1;
      var len = 2 + Math.floor(rand() * 4);
      for (var k = 0; k < len; k++) {
        var ci = c0 + dc * k, ri = r0 + dr * k;
        if (ci < 2 || ci > COLS - 3 || ri < 2 || ri >= ROWS) break;
        var tt = tiles[idx(ci, ri)];
        if (tt === T.SNOW || tt === T.ICE || tt === T.DEEP) tiles[idx(ci, ri)] = T.CREV;
      }
    }

    // 기지·남극점 자리
    bases.forEach(function (b) {
      for (var rr = b.row - 1; rr <= b.row + 1; rr++) for (var cc = b.col - 2; cc <= b.col + 2; cc++) tiles[idx(cc, rr)] = T.BASE;
      b.x = (b.col + 0.5) * TILE; b.y = (b.row + 0.5) * TILE;
      b.rect = { x: (b.col - 2) * TILE, y: (b.row - 1) * TILE, w: 5 * TILE, h: 3 * TILE };
      b.spawn = { x: b.x, y: b.y + TILE };
    });
    for (var rr = pole.row - 4; rr <= pole.row + 4; rr++) for (c = pole.col - 4; c <= pole.col + 4; c++) tiles[idx(c, rr)] = T.SNOW;
    tiles[idx(pole.col, pole.row)] = T.POLE;
    pole.x = (pole.col + 0.5) * TILE; pole.y = (pole.row + 0.5) * TILE;

    // 세종기지에서 못 가는 땅은 산으로 막는다(끼일 자리를 없앰)
    var reach = new Uint8Array(COLS * ROWS);
    var queue = [idx(bases[0].col, bases[0].row)];
    reach[queue[0]] = 1;
    while (queue.length) {
      var cur = queue.pop(), cx = cur % COLS, cy = (cur - cx) / COLS;
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
        var nx = cx + d[0], ny = cy + d[1];
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return;
        var ni = idx(nx, ny);
        if (reach[ni] || BLOCK[tiles[ni]]) return;
        reach[ni] = 1; queue.push(ni);
      });
    }
    for (var i = 0; i < tiles.length; i++) if (!BLOCK[tiles[i]] && !reach[i]) tiles[i] = T.MOUNT;

    var W = { tiles: tiles, bases: bases, pole: pole, coast: coast };
    var at = function (cc, rr) { return cc < 0 || rr < 0 || cc >= COLS || rr >= ROWS ? T.MOUNT : tiles[idx(cc, rr)]; };
    var nearType = function (cc, rr, d, types) {
      for (var y = rr - d; y <= rr + d; y++) for (var x = cc - d; x <= cc + d; x++) if (types.indexOf(at(x, y)) >= 0) return true;
      return false;
    };
    // 사람 몸이 들어갈 수 있는 칸(주변 8칸이 막히지 않음)
    var roomy = function (cc, rr) {
      if (at(cc, rr) !== T.SNOW && at(cc, rr) !== T.ICE && at(cc, rr) !== T.DEEP) return false;
      return !nearType(cc, rr, 1, [T.SEA, T.FLOE, T.MOUNT, T.CREV, T.BASE, T.POLE]);
    };
    var zones = {
      coast: function (cc, rr) { return roomy(cc, rr) && 1 - rr / (ROWS - 1) < 0.3 && nearType(cc, rr, 3, [T.SEA, T.FLOE]); },
      seaice: function (cc, rr) { return roomy(cc, rr) && at(cc, rr) === T.ICE && nearType(cc, rr, 3, [T.SEA, T.FLOE]); },
      mountain: function (cc, rr) { var la = 1 - rr / (ROWS - 1); return la > 0.35 && la < 0.85 && at(cc, rr) !== T.ICE && !nearType(cc, rr, 1, [T.CREV]) && nearType(cc, rr, 2, [T.MOUNT]) && at(cc, rr) !== T.MOUNT && !nearType(cc, rr, 0, [T.MOUNT]); },
      moss: function (cc, rr) { return roomy(cc, rr) && 1 - rr / (ROWS - 1) < 0.3 && nearType(cc, rr, 2, [T.MOUNT, T.SEA]); },
      fossil: function (cc, rr) { var la = 1 - rr / (ROWS - 1); return la > 0.2 && la < 0.85 && !BLOCK[at(cc, rr)] && at(cc, rr) !== T.CREV && nearType(cc, rr, 1, [T.MOUNT]) && !nearType(cc, rr, 1, [T.CREV]); },
      meteorite: function (cc, rr) { return roomy(cc, rr) && at(cc, rr) === T.ICE && 1 - rr / (ROWS - 1) > 0.35; },
      core: function (cc, rr) { return roomy(cc, rr) && at(cc, rr) !== T.ICE && 1 - rr / (ROWS - 1) > 0.72; },
      cache: function (cc, rr) { var la = 1 - rr / (ROWS - 1); return roomy(cc, rr) && la > 0.12 && la < 0.9; }
    };
    var used = [];
    bases.forEach(function (b) { used.push({ c: b.col, r: b.row, d: 7 }); });
    used.push({ c: pole.col, r: pole.row, d: 6 });
    function pick(zone, count, gap) {
      var cands = [];
      for (var rr2 = 2; rr2 < ROWS; rr2++) for (var cc2 = 2; cc2 < COLS - 2; cc2++) if (reach[idx(cc2, rr2)] && zones[zone](cc2, rr2)) cands.push([cc2, rr2]);
      for (var k2 = cands.length - 1; k2 > 0; k2--) { var j = Math.floor(rand() * (k2 + 1)); var tmp = cands[k2]; cands[k2] = cands[j]; cands[j] = tmp; }
      var out = [];
      for (var q = 0; q < cands.length && out.length < count; q++) {
        var p = cands[q];
        var ok = used.every(function (u) { return Math.max(Math.abs(u.c - p[0]), Math.abs(u.r - p[1])) >= Math.max(u.d, gap); });
        if (!ok) continue;
        used.push({ c: p[0], r: p[1], d: gap });
        out.push({ x: (p[0] + 0.5) * TILE, y: (p[1] + 0.5) * TILE });
      }
      return out;
    }
    W.animals = [];
    ANIMALS.forEach(function (a) {
      var spots = pick(a.zone, a.spots, 4);
      if (spots.length < a.spots && a.zone === 'seaice') spots = spots.concat(pick('coast', a.spots - spots.length, 6));
      spots.forEach(function (p) { W.animals.push({ sp: a.id, x: p.x, y: p.y, group: a.group }); });
    });
    W.samples = [];
    SAMPLES.forEach(function (sm) {
      pick(sm.id, sm.count, 5).forEach(function (p) { W.samples.push({ kind: sm.id, x: p.x, y: p.y }); });
    });
    W.caches = pick('cache', 14, 8);
    return W;
  }

  function tileAt(x, y) {
    var c = Math.floor(x / TILE), r = Math.floor(y / TILE);
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return T.MOUNT;
    return world().tiles[r * COLS + c];
  }
  function blockedBox(x, y, rad) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return true;
    var c0 = Math.floor((x - rad) / TILE), c1 = Math.floor((x + rad) / TILE);
    var r0 = Math.floor((y - rad) / TILE), r1 = Math.floor((y + rad) / TILE);
    if (c0 < 0 || r0 < 0 || c1 >= COLS || r1 >= ROWS) return true;
    var tiles = world().tiles;
    for (var r = r0; r <= r1; r++) for (var c = c0; c <= c1; c++) if (BLOCK[tiles[r * COLS + c]]) return true;
    return false;
  }
  function latAt(y) { return clamp(1 - y / WORLD_H, 0, 1); }
  function baseAt(x, y) {
    var b = world().bases;
    for (var i = 0; i < b.length; i++) {
      var R = b[i].rect;
      if (x >= R.x - 8 && x <= R.x + R.w + 8 && y >= R.y - 8 && y <= R.y + R.h + 8) return i;
    }
    return -1;
  }

  // ----- 미션 -----
  function seenCount(s) { return Object.keys(s.seen).length; }
  function seenPenguin(s) { return ANIMALS.some(function (a) { return a.kind === 'penguin' && s.seen[a.id]; }); }
  function deliveredTotal(s) { return SAMPLES.reduce(function (n, sm) { return n + s.delivered[sm.id]; }, 0); }
  function anyUpgrade(s) { return UP_KEYS.some(function (k) { return s.up[k] > 0; }); }
  var MISSIONS = [
    { text: '🐧 펭귄 한 종류 관찰하기', bonus: 10, done: seenPenguin, progress: function (s) { return seenPenguin(s) ? '1/1' : '0/1'; } },
    { text: '🌿 이끼 표본을 기지에 가져가기', bonus: 15, done: function (s) { return s.delivered.moss >= 1; }, progress: function (s) { return Math.min(1, s.delivered.moss) + '/1'; } },
    { text: '🔍 동물 4종 관찰하기', bonus: 20, done: function (s) { return seenCount(s) >= 4; }, progress: function (s) { return Math.min(4, seenCount(s)) + '/4'; } },
    { text: '🛠️ 장비 하나 업그레이드하기', bonus: 15, done: anyUpgrade, progress: function (s) { return anyUpgrade(s) ? '1/1' : '0/1'; } },
    { text: '🧪 표본 6개 연구하기', bonus: 30, done: function (s) { return deliveredTotal(s) >= 6; }, progress: function (s) { return Math.min(6, deliveredTotal(s)) + '/6'; } },
    { text: '🏠 장보고기지 찾아가기', bonus: 30, target: 'jangbogo', done: function (s) { return s.visited.jangbogo; }, progress: function (s) { return s.visited.jangbogo ? '1/1' : '0/1'; } },
    { text: '☄️ 운석을 기지에 가져가기', bonus: 40, done: function (s) { return s.delivered.meteorite >= 1; }, progress: function (s) { return Math.min(1, s.delivered.meteorite) + '/1'; } },
    { text: '🐾 동물 8종 관찰하기', bonus: 40, done: function (s) { return seenCount(s) >= 8; }, progress: function (s) { return Math.min(8, seenCount(s)) + '/8'; } },
    { text: '🧊 빙하 얼음 코어를 기지에 가져가기', bonus: 50, done: function (s) { return s.delivered.core >= 1; }, progress: function (s) { return Math.min(1, s.delivered.core) + '/1'; } },
    { text: '🚩 남극점에 도착하기', bonus: 200, target: 'pole', done: function (s) { return s.poleReached; }, progress: function (s) { return s.poleReached ? '1/1' : '0/1'; } }
  ];
  var POLE_MISSION = MISSIONS.length - 1;
  function missionTarget(s) {
    var m = MISSIONS[s.mission];
    if (!m || !m.target) return null;
    var W = world();
    if (m.target === 'pole') return { x: W.pole.x, y: W.pole.y, name: '남극점' };
    return { x: W.bases[1].x, y: W.bases[1].y, name: W.bases[1].name };
  }

  // ----- 상태 -----
  function create(seed, save) {
    var W = world();
    var s = {
      rand: rng(seed == null ? (Date.now() & 0x7fffffff) : seed),
      t: 0, play: 0,
      player: { x: W.bases[0].spawn.x, y: W.bases[0].spawn.y, vx: 0, vy: 0, face: 1, moving: false, warm: 100, food: 100, bag: [], stun: 0, camping: false, tentsLeft: 0, safeX: W.bases[0].spawn.x, safeY: W.bases[0].spawn.y, stepAcc: 0, coldWarned: false, hungryWarned: false, atPole: false },
      up: { suit: 0, sled: 0, crampon: 0, mobile: 0, detector: 0, tent: 0 },
      rp: 0, total: 0,
      seen: {},
      delivered: { moss: 0, fossil: 0, meteorite: 0, core: 0 },
      mission: 0, poleReached: false, ended: false,
      visited: { sejong: true, jangbogo: false },
      rescues: 0,
      revealed: new Uint8Array(COLS * ROWS),
      samples: W.samples.map(function (sm) { return { kind: sm.kind, x: sm.x, y: sm.y, wait: 0 }; }),
      caches: W.caches.map(function (c) { return { x: c.x, y: c.y, wait: 0 }; }),
      weather: { phase: 'calm', timer: 90 }
    };
    if (save) applySave(s, save);
    return s;
  }

  function speedAt(s, tile) {
    var v = BASE_SPEED * (1 + 0.25 * s.up.mobile);
    if (tile === T.DEEP) v *= 0.5;
    if (s.player.food <= 0) v *= 0.6;
    if (s.weather.phase === 'storm') v *= 0.8;
    return v;
  }

  // 지금 E(관찰·줍기)를 누르면 무엇을 하게 되는지
  function nearby(s) {
    var p = s.player, best = null, bd = Infinity;
    s.samples.forEach(function (sm, i) {
      if (sm.wait > 0) return;
      var d = Math.hypot(sm.x - p.x, sm.y - p.y);
      if (d < PICK_R && d < bd) { bd = d; best = { type: 'sample', index: i, kind: sm.kind }; }
    });
    if (best) return best;
    world().animals.forEach(function (a, i) {
      var d = Math.hypot(a.x - p.x, a.y - p.y);
      if (d < OBSERVE_R && d < bd) { bd = d; best = { type: 'animal', index: i, sp: a.sp }; }
    });
    return best;
  }

  function weather(s, h, ev) {
    var w = s.weather;
    w.timer -= h;
    if (w.timer > 0) return;
    if (w.phase === 'calm') { w.phase = 'warn'; w.timer = 6; ev.push({ type: 'blizzard-warn' }); }
    else if (w.phase === 'warn') { w.phase = 'storm'; w.timer = 15 + s.rand() * 10; ev.push({ type: 'blizzard-start' }); }
    else { w.phase = 'calm'; w.timer = 60 + s.rand() * 50; ev.push({ type: 'blizzard-end' }); }
  }

  function rescue(s, ev) {
    var W = world(), p = s.player;
    var bi = 0, bd = Infinity;
    W.bases.forEach(function (b, i) {
      if (!s.visited[b.id]) return;
      var d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < bd) { bd = d; bi = i; }
    });
    var lost = p.bag.length;
    p.bag = [];
    p.x = W.bases[bi].spawn.x; p.y = W.bases[bi].spawn.y; p.safeX = p.x; p.safeY = p.y;
    p.vx = 0; p.vy = 0; p.stun = 0; p.camping = false;
    p.warm = maxWarm(s.up); p.food = Math.max(p.food, 60);
    s.rescues++;
    ev.push({ type: 'rescue', base: bi, lost: lost });
  }

  function step(s, inp, h, act, tent, ev) {
    var W = world(), p = s.player;
    s.t += h; s.play += h;
    weather(s, h, ev);
    var storm = s.weather.phase === 'storm';

    var ix = num(inp.x), iy = num(inp.y), mag = Math.hypot(ix, iy);
    if (mag > 1) { ix /= mag; iy /= mag; mag = 1; }
    if (mag < 0.15) { ix = 0; iy = 0; mag = 0; }
    var inBase = baseAt(p.x, p.y);

    if (p.camping && mag > 0.3) { p.camping = false; ev.push({ type: 'tent-off' }); }
    if (tent) {
      if (p.camping) { p.camping = false; ev.push({ type: 'tent-off' }); }
      else if (inBase >= 0) ev.push({ type: 'tent-base' });
      else if (!s.up.tent) ev.push({ type: 'tent-none' });
      else if (p.tentsLeft <= 0) ev.push({ type: 'tent-empty' });
      else { p.tentsLeft--; p.camping = true; p.vx = 0; p.vy = 0; ev.push({ type: 'tent-on', left: p.tentsLeft }); }
    }
    if (p.stun > 0) { p.stun = Math.max(0, p.stun - h); ix = 0; iy = 0; }
    if (p.camping) { ix = 0; iy = 0; }

    // 움직이기(얼음은 아이젠이 없으면 미끄러짐)
    var tile = tileAt(p.x, p.y);
    var sp = speedAt(s, tile);
    var slippery = tile === T.ICE && !s.up.crampon;
    var k = Math.min(1, (slippery ? 1.6 : 14) * h);
    p.vx += (ix * sp - p.vx) * k;
    p.vy += (iy * sp - p.vy) * k;
    if (Math.abs(p.vx) < 0.5 && !ix) p.vx = 0;
    if (Math.abs(p.vy) < 0.5 && !iy) p.vy = 0;
    var ox = p.x, oy = p.y;
    var nx = p.x + p.vx * h;
    if (!blockedBox(nx, p.y, PLAYER_R)) p.x = nx; else p.vx = 0;
    var ny = p.y + p.vy * h;
    if (!blockedBox(p.x, ny, PLAYER_R)) p.y = ny; else p.vy = 0;
    var moved = Math.hypot(p.x - ox, p.y - oy);
    p.moving = moved > 0.05;
    if (Math.abs(p.vx) > 5) p.face = p.vx > 0 ? 1 : -1;
    p.stepAcc += moved;
    if (p.stepAcc > (s.up.mobile ? 60 : 34)) { p.stepAcc = 0; ev.push({ type: 'step', terrain: tileAt(p.x, p.y), slide: slippery && !ix && !iy }); }

    // 크레바스 찾기(가까이 가면 보임, 탐지기가 있으면 더 멀리서)
    var R = revealRadius(s.up), rt = Math.ceil(R / TILE);
    var pc = Math.floor(p.x / TILE), pr = Math.floor(p.y / TILE);
    for (var r = pr - rt; r <= pr + rt; r++) {
      if (r < 0 || r >= ROWS) continue;
      for (var c = pc - rt; c <= pc + rt; c++) {
        if (c < 0 || c >= COLS) continue;
        var ii = r * COLS + c;
        if (W.tiles[ii] !== T.CREV || s.revealed[ii]) continue;
        if (Math.hypot((c + 0.5) * TILE - p.x, (r + 0.5) * TILE - p.y) <= R) { s.revealed[ii] = 1; if (s.up.detector) ev.push({ type: 'detect' }); }
      }
    }
    // 크레바스에 빠짐
    tile = tileAt(p.x, p.y);
    if (tile === T.CREV) {
      s.revealed[Math.floor(p.y / TILE) * COLS + Math.floor(p.x / TILE)] = 1;
      p.warm = Math.max(0, p.warm - 20);
      p.food = Math.max(0, p.food - 8);
      p.x = p.safeX; p.y = p.safeY; p.vx = 0; p.vy = 0; p.stun = 1.2;
      ev.push({ type: 'crevasse' });
    } else { p.safeX = p.x; p.safeY = p.y; }

    // 기지 안: 몸 녹이기·밥·텐트 채우기·표본 연구
    inBase = baseAt(p.x, p.y);
    var mw = maxWarm(s.up);
    if (inBase >= 0) {
      var b = W.bases[inBase];
      if (!s.visited[b.id]) { s.visited[b.id] = true; ev.push({ type: 'discover-base', base: inBase }); }
      if (!p.inBase) ev.push({ type: 'enter-base', base: inBase });
      p.warm = Math.min(mw, p.warm + 30 * h);
      p.food = Math.min(100, p.food + 20 * h);
      p.tentsLeft = s.up.tent;
      if (p.camping) p.camping = false;
      if (p.bag.length) {
        var pts = 0, kinds = p.bag.slice();
        p.bag.forEach(function (kind) {
          var sm = SAMPLES.filter(function (x) { return x.id === kind; })[0];
          pts += sm.points; s.delivered[kind]++;
        });
        p.bag = [];
        s.rp += pts; s.total += pts;
        ev.push({ type: 'deliver', count: kinds.length, points: pts, kinds: kinds });
      }
      p.coldWarned = false;
    } else if (p.camping) {
      p.warm = Math.min(mw, p.warm + 10 * h);
      p.food = Math.max(0, p.food - 0.2 * h);
    } else {
      var drain = (0.7 + 1.8 * latAt(p.y)) * (storm ? 3 : 1) * (p.food <= 0 ? 1.4 : 1) * (1 - 0.15 * s.up.suit);
      p.warm = Math.max(0, p.warm - drain * h);
      p.food = Math.max(0, p.food - (p.moving ? 0.35 : 0.15) * h);
    }
    p.inBase = inBase >= 0;
    if (p.warm < mw * 0.25 && !p.coldWarned && inBase < 0) { p.coldWarned = true; ev.push({ type: 'cold' }); }
    if (p.warm > mw * 0.5) p.coldWarned = false;
    if (p.food <= 0 && !p.hungryWarned) { p.hungryWarned = true; ev.push({ type: 'hungry' }); }
    if (p.food > 30) p.hungryWarned = false;

    // 보급 상자·표본 다시 나오기
    s.caches.forEach(function (cc) {
      if (cc.wait > 0) { cc.wait = Math.max(0, cc.wait - h); return; }
      if (Math.hypot(cc.x - p.x, cc.y - p.y) < CACHE_R + PLAYER_R) {
        cc.wait = CACHE_RESPAWN;
        p.food = Math.min(100, p.food + 50); p.warm = Math.min(mw, p.warm + 15);
        ev.push({ type: 'cache' });
      }
    });
    s.samples.forEach(function (sm) { if (sm.wait > 0) sm.wait = Math.max(0, sm.wait - h); });

    // E: 관찰하기·줍기
    if (act) {
      var nb = nearby(s);
      if (!nb) ev.push({ type: 'nothing' });
      else if (nb.type === 'sample') {
        if (p.bag.length >= capacity(s.up)) ev.push({ type: 'bag-full' });
        else { p.bag.push(nb.kind); s.samples[nb.index].wait = SAMPLE_RESPAWN; ev.push({ type: 'collect', kind: nb.kind }); }
      } else {
        var first = !s.seen[nb.sp];
        if (first) {
          s.seen[nb.sp] = true;
          var a = ANIMALS.filter(function (x) { return x.id === nb.sp; })[0];
          s.rp += a.points; s.total += a.points;
        }
        ev.push({ type: 'observe', sp: nb.sp, first: first });
      }
    }

    // 남극점
    var atPole = Math.hypot(W.pole.x - p.x, W.pole.y - p.y) < POLE_R;
    if (atPole && !p.atPole) {
      if (s.mission === POLE_MISSION) s.poleReached = true;
      else if (!s.ended) ev.push({ type: 'pole-early' });
      else ev.push({ type: 'pole-again' });
    }
    p.atPole = atPole;

    // 미션
    while (s.mission < MISSIONS.length && MISSIONS[s.mission].done(s)) {
      var m = MISSIONS[s.mission];
      s.rp += m.bonus; s.total += m.bonus;
      ev.push({ type: 'mission', index: s.mission, bonus: m.bonus });
      s.mission++;
      if (s.mission === MISSIONS.length && !s.ended) { s.ended = true; ev.push({ type: 'ending' }); }
    }

    if (p.warm <= 0) rescue(s, ev);
  }

  function update(s, input, dt) {
    var ev = [];
    input = input || {};
    dt = typeof dt === 'number' && Number.isFinite(dt) ? clamp(dt, 0, 5) : 0;
    var first = true;
    while (dt > 1e-9) {
      var h = Math.min(0.05, dt);
      dt -= h;
      step(s, input, h, first && !!input.act, first && !!input.tent, ev);
      first = false;
    }
    if (first && (input.act || input.tent)) step(s, input, 0, !!input.act, !!input.tent, ev);
    return ev;
  }

  function buy(s, key) {
    var u = UPGRADES[key];
    if (!u) return { ok: false, why: 'unknown' };
    if (baseAt(s.player.x, s.player.y) < 0) return { ok: false, why: 'outside' };
    var lv = s.up[key];
    if (lv >= u.max) return { ok: false, why: 'max' };
    var cost = u.costs[lv];
    if (s.rp < cost) return { ok: false, why: 'points' };
    s.rp -= cost;
    s.up[key] = lv + 1;
    if (key === 'tent') s.player.tentsLeft = s.up.tent;
    return { ok: true };
  }

  // ----- 저장 -----
  function toSave(s) {
    var p = s.player, revealed = [];
    for (var i = 0; i < s.revealed.length; i++) if (s.revealed[i]) revealed.push(i);
    return {
      v: 1, x: Math.round(p.x), y: Math.round(p.y), warm: Math.round(p.warm * 10) / 10, food: Math.round(p.food * 10) / 10,
      bag: p.bag.slice(), tentsLeft: p.tentsLeft, up: Object.assign({}, s.up), rp: Math.floor(s.rp), total: Math.floor(s.total),
      seen: Object.keys(s.seen), delivered: Object.assign({}, s.delivered), mission: s.mission, ended: s.ended,
      visited: { jangbogo: !!s.visited.jangbogo }, rescues: s.rescues, play: Math.floor(s.play), revealed: revealed,
      samples: s.samples.map(function (sm) { return Math.ceil(sm.wait); }), caches: s.caches.map(function (c) { return Math.ceil(c.wait); })
    };
  }
  function cleanInt(v, max) { return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0; }
  function cleanNum(v, max) { return typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0; }
  function applySave(s, save) {
    if (!save || typeof save !== 'object' || save.v !== 1) return false;
    var W = world(), p = s.player;
    UP_KEYS.forEach(function (k) { s.up[k] = cleanInt(save.up && save.up[k], UPGRADES[k].max); });
    s.total = cleanInt(save.total, 1e9);
    s.rp = Math.min(s.total, cleanInt(save.rp, 1e9));
    var ids = ANIMALS.map(function (a) { return a.id; });
    s.seen = {};
    (Array.isArray(save.seen) ? save.seen : []).forEach(function (id) { if (ids.indexOf(id) >= 0) s.seen[id] = true; });
    SAMPLES.forEach(function (sm) { s.delivered[sm.id] = cleanInt(save.delivered && save.delivered[sm.id], 1e6); });
    s.mission = cleanInt(save.mission, MISSIONS.length);
    s.ended = save.ended === true || s.mission >= MISSIONS.length;
    s.poleReached = s.mission >= MISSIONS.length;
    s.visited.jangbogo = !!(save.visited && save.visited.jangbogo === true);
    s.rescues = cleanInt(save.rescues, 1e6);
    s.play = cleanInt(save.play, 1e8);
    var kinds = SAMPLES.map(function (sm) { return sm.id; });
    p.bag = (Array.isArray(save.bag) ? save.bag : []).filter(function (k) { return kinds.indexOf(k) >= 0; }).slice(0, capacity(s.up));
    p.warm = Number.isFinite(save.warm) ? cleanNum(save.warm, maxWarm(s.up)) : maxWarm(s.up);
    p.food = Number.isFinite(save.food) ? cleanNum(save.food, 100) : 100;
    p.tentsLeft = cleanInt(save.tentsLeft, s.up.tent);
    var x = save.x, y = save.y;
    if (typeof x === 'number' && typeof y === 'number' && !blockedBox(x, y, PLAYER_R) && tileAt(x, y) !== T.CREV) { p.x = x; p.y = y; }
    else { p.x = W.bases[0].spawn.x; p.y = W.bases[0].spawn.y; }
    p.safeX = p.x; p.safeY = p.y;
    if (p.warm <= 0) p.warm = 1;
    (Array.isArray(save.revealed) ? save.revealed : []).forEach(function (i) {
      if (typeof i === 'number' && i >= 0 && i < W.tiles.length && Math.floor(i) === i && W.tiles[i] === T.CREV) s.revealed[i] = 1;
    });
    if (Array.isArray(save.samples)) s.samples.forEach(function (sm, i) { sm.wait = cleanNum(save.samples[i], SAMPLE_RESPAWN); });
    if (Array.isArray(save.caches)) s.caches.forEach(function (c, i) { c.wait = cleanNum(save.caches[i], CACHE_RESPAWN); });
    return true;
  }

  var api = {
    TILE: TILE, COLS: COLS, ROWS: ROWS, WORLD_W: WORLD_W, WORLD_H: WORLD_H, T: T, BLOCK: BLOCK, TERRAIN_NAME: TERRAIN_NAME,
    PLAYER_R: PLAYER_R, OBSERVE_R: OBSERVE_R, PICK_R: PICK_R, POLE_R: POLE_R,
    ANIMALS: ANIMALS, SAMPLES: SAMPLES, UPGRADES: UPGRADES, MISSIONS: MISSIONS,
    world: world, tileAt: tileAt, blockedBox: blockedBox, latAt: latAt, baseAt: baseAt,
    maxWarm: maxWarm, capacity: capacity, revealRadius: revealRadius, speedAt: speedAt,
    create: create, update: update, nearby: nearby, buy: buy, missionTarget: missionTarget,
    seenCount: seenCount, deliveredTotal: deliveredTotal,
    toSave: toSave, applySave: applySave, hash2: hash2
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.Antarctica = root.Antarctica || {}; root.Antarctica.Game = api; }
})(typeof window !== 'undefined' ? window : this);
