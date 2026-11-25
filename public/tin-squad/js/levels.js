// ===== levels.js =====
// 깡통 소탕대 스테이지 설계(화면을 모름, 브라우저 window.TinSquad.Levels · Node 겸용).
// 8개 세계 × 5판 = 40판. 손으로 만든 조각(CHUNKS)을 씨앗(seed)으로 이어 붙여서, 같은 판은 언제나 같은 지도가 나온다.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.TinSquad = root.TinSquad || {}; root.TinSquad.Levels = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var TILE = 45, ROWS = 12, VIEW_W = 960, VIEW_H = 540;
  var AIR = 0, SOLID = 1, PLAT = 2, SPIKE = 3;
  var STAGES_PER_WORLD = 5;

  // 세계: 이름, 나오는 적(g 땅 / f 하늘 / t 고정 / G 큰 적), 보스
  var WORLDS = [
    { id: 'market', name: '골목 시장', g: ['toaster', 'toaster', 'kettle'], f: ['fan'], t: ['turret'], G: ['microwave'], boss: 'toastking' },
    { id: 'junk', name: '고물상', g: ['toaster', 'kettle', 'vacuum'], f: ['fan', 'bulb'], t: ['turret'], G: ['microwave', 'blender'], boss: 'dustking' },
    { id: 'subway', name: '지하철', g: ['vacuum', 'toaster', 'kettle'], f: ['bulb', 'fan'], t: ['turret', 'cam'], G: ['microwave', 'blender'], boss: 'train' },
    { id: 'park', name: '놀이공원', g: ['kettle', 'toaster', 'vacuum'], f: ['fan', 'bulb'], t: ['speaker', 'cam'], G: ['blender', 'microwave'], boss: 'clown' },
    { id: 'ice', name: '냉동 창고', g: ['vacuum', 'toaster', 'vacuum'], f: ['bulb', 'fan'], t: ['cam', 'turret'], G: ['fridge', 'microwave'], boss: 'queen' },
    { id: 'sky', name: '하늘 공장', g: ['kettle', 'toaster', 'vacuum'], f: ['fan', 'fan', 'bulb'], t: ['turret', 'cam', 'speaker'], G: ['blender', 'fridge'], boss: 'airship' },
    { id: 'lava', name: '용암 제철소', g: ['kettle', 'vacuum', 'toaster'], f: ['bulb', 'fan'], t: ['speaker', 'turret'], G: ['fridge', 'blender'], boss: 'dragon' },
    { id: 'core', name: '로봇 본부', g: ['toaster', 'vacuum', 'kettle'], f: ['fan', 'bulb'], t: ['cam', 'speaker', 'turret'], G: ['fridge', 'microwave', 'blender'], boss: 'overlord' }
  ];
  var TYPES = ['normal', 'battle', 'chase', 'mech', 'boss'];
  var TYPE_NAMES = { normal: '탐험', battle: '전투 구역', chase: '추격전', mech: '로봇 탑승', boss: '보스', tower: '끝없는 탑' };

  // 조각: 가로 16칸 × 아래쪽 8줄. 양 끝은 언제나 평평해서 어떻게 이어도 지나갈 수 있다.
  // # 땅  = 아래에서 뚫고 올라가는 발판  ^ 가시  b 폭발통  x 나무 상자  P 동물 우리  o 동전
  // g 땅 적  f 하늘 적  t 고정 적  i 천장 다리미  G 큰 적
  var CHUNKS = [
    { lv: 0, map: [ // 평지
      '................',
      '................',
      '................',
      '................',
      '.....oooo.......',
      '.......g..x..g..',
      '################',
      '################'] },
    { lv: 0, map: [ // 가운데 발판
      '................',
      '................',
      '.......oo.......',
      '......P.t.......',
      '.....=====......',
      '...x......g..b..',
      '################',
      '################'] },
    { lv: 0, map: [ // 작은 구덩이
      '................',
      '................',
      '..........f.....',
      '.......oo.......',
      '......o..o......',
      '...g........g...',
      '#######..#######',
      '#######..#######'] },
    { lv: 0, map: [ // 계단 언덕
      '................',
      '................',
      '........f.......',
      '.......oo.......',
      '......##.P......',
      '...g.#####..g...',
      '################',
      '################'] },
    { lv: 0, map: [ // 폭발통 길
      '................',
      '................',
      '.......f........',
      '................',
      '.....x..........',
      '....b..g.gb..x..',
      '################',
      '################'] },
    { lv: 1, map: [ // 두 층 발판
      '................',
      '.......P........',
      '......====......',
      '..........f.....',
      '..====....===...',
      '....g..b.....g..',
      '################',
      '################'] },
    { lv: 1, map: [ // 가시 건너기
      '................',
      '................',
      '......oo........',
      '................',
      '......===..f....',
      '..g...^^^....t..',
      '################',
      '################'] },
    { lv: 1, map: [ // 구덩이 둘
      '................',
      '................',
      '........f.......',
      '.......o........',
      '....o....o.x....',
      '..g....g.....g..',
      '####..###..#####',
      '####..###..#####'] },
    { lv: 1, map: [ // 높은 벽
      '................',
      '................',
      '................',
      '........t.......',
      '.......###..P...',
      '..g..b.###..##..',
      '################',
      '################'] },
    { lv: 1, map: [ // 천장 다리미 길
      '................',
      '....i....i......',
      '................',
      '................',
      '................',
      '..o.g..x.o..g.o.',
      '################',
      '################'] },
    { lv: 2, map: [ // 떠 있는 섬
      '................',
      '................',
      '......P.........',
      '.....===..f.....',
      '................',
      '.g..........x.g.',
      '####..##..######',
      '####..##..######'] },
    { lv: 2, map: [ // 포탑 언덕
      '................',
      '................',
      '.........t......',
      '........##......',
      '......####......',
      '..g.######..b.g.',
      '################',
      '################'] },
    { lv: 2, map: [ // 하늘 길
      '................',
      '....ooo..ooo....',
      '...====..====...',
      '.P........f.....',
      '===....==...t...',
      '....g..g...G....',
      '################',
      '################'] },
    { lv: 2, map: [ // 큰 적 문지기
      '................',
      '................',
      '.....f....f.....',
      '................',
      '...===....===...',
      '..x....G.....x..',
      '################',
      '################'] },
    { lv: 2, map: [ // 가시밭 둘
      '................',
      '................',
      '...i....i.......',
      '................',
      '...o......o.....',
      '.g...^^..^^..g..',
      '################',
      '################'] },
    { lv: 3, map: [ // 징검다리
      '................',
      '................',
      '.....f....f.....',
      '.......oo.......',
      '................',
      '.g..........t...',
      '###..##..##..###',
      '###..##..##..###'] },
    { lv: 3, map: [ // 창고
      '................',
      '..t......P......',
      '.===....====....',
      '................',
      '....====....===.',
      '.g..b..G.x.b..g.',
      '################',
      '################'] },
    { lv: 3, map: [ // 벽과 가시
      '................',
      '................',
      '.......f........',
      '................',
      '.....##...##.t..',
      '..g..##^^^##.g..',
      '################',
      '################'] },
    { lv: 4, map: [ // 넓은 구덩이와 발판
      '................',
      '......ooo.......',
      '......f..f......',
      '......P.........',
      '.....====.......',
      '.g...........G..',
      '####.......#####',
      '####.......#####'] },
    { lv: 4, map: [ // 저격 골목
      '................',
      '...........t....',
      '...i......===...',
      '................',
      '...===..........',
      '.g..x..g.b.G..t.',
      '################',
      '################'] },
    { lv: 4, map: [ // 총공격
      '................',
      '....f..f..f.....',
      '................',
      '................',
      '....====...==...',
      '.g.g..b..G..g.t.',
      '################',
      '################'] },
    { lv: 5, map: [ // 좁은 섬들
      '................',
      '....f......f....',
      '.......oo.......',
      '................',
      '................',
      '.g............t.',
      '###..##..##..###',
      '###..##..##..###'] },
    { lv: 5, map: [ // 다리미 다리
      '................',
      '...i...i...i....',
      '................',
      '......x..P......',
      '....=======.....',
      '.g..^^^^^^^..G..',
      '################',
      '################'] }
  ];

  function repeat(ch, n) { return new Array(n + 1).join(ch); }
  function flat(n) { return ['.', '.', '.', '.', '.', '.', '#', '#'].map(function (c) { return repeat(c, n); }); }
  // 전투 구역(가로 24칸): 카메라가 잠기고 적이 몰려온다
  var AIR24 = repeat('.', 24), GND24 = repeat('#', 24);
  var ARENAS = [
    [AIR24, AIR24, AIR24, AIR24, '....====........====....', AIR24, GND24, GND24],
    [AIR24, AIR24, '.........======.........', AIR24, '...====..........====...', AIR24, GND24, GND24],
    [AIR24, AIR24, AIR24, '.......====..====.......', AIR24, '.....##..........##.....', GND24, GND24]
  ];
  var BOSS_ARENA = [AIR24, AIR24, AIR24, '.........======.........', AIR24, AIR24, GND24, GND24];

  function rng(seed) {
    var a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(list, r) { return list[Math.floor(r() * list.length)]; }

  function stageInfo(index) {
    var w = Math.floor(index / STAGES_PER_WORLD), n = index % STAGES_PER_WORLD;
    return { index: index, world: w, num: n, type: TYPES[n], label: (w + 1) + '-' + (n + 1), name: WORLDS[w].name, typeName: TYPE_NAMES[TYPES[n]] };
  }
  var STAGE_COUNT = WORLDS.length * STAGES_PER_WORLD;

  // 판 하나 만들기. spec: { world, type, diff(0~60), seed, length }
  function build(spec) {
    var r = rng(spec.seed), W = WORLDS[spec.world];
    var maxLv = Math.min(5, Math.floor(spec.diff / 4) + 1);
    var minLv = spec.diff > 24 ? 2 : spec.diff > 12 ? 1 : 0;
    var pool = CHUNKS.filter(function (c) { return c.lv <= maxLv && c.lv >= minLv; });
    var parts = [{ kind: 'start', map: flat(14) }];
    var n = spec.length, last = null, before = null;
    var arenaAt = {};
    if (spec.type === 'battle') { arenaAt[Math.floor(n / 2) - 1] = 1; arenaAt[n - 1] = 1; }
    if (spec.type === 'mech' || (spec.type === 'normal' && spec.diff > 4)) arenaAt[n - 1] = 1;
    for (var i = 0; i < n; i++) {
      var c;
      do { c = pick(pool, r); } while ((c === last || c === before) && pool.length > 2);
      before = last; last = c;
      parts.push({ kind: 'chunk', map: c.map, mech: spec.type === 'mech' && i === 1 });
      if (arenaAt[i]) parts.push({ kind: 'arena', map: pick(ARENAS, r) });
    }
    if (spec.type === 'boss') parts.push({ kind: 'boss', map: BOSS_ARENA });
    else parts.push({ kind: 'end', map: flat(16) });

    var cols = parts.reduce(function (s, p) { return s + p.map[0].length; }, 0);
    var tiles = new Uint8Array(cols * ROWS);
    var out = { cols: cols, rows: ROWS, width: cols * TILE, tiles: tiles, world: spec.world, type: spec.type, diff: spec.diff, seed: spec.seed,
      spawns: [], props: [], coins: [], arenas: [], boss: null, goal: null, mech: null, petsTotal: 0, start: { x: 4 * TILE, y: 10 * TILE } };
    var pets = [], spots = [];
    var fill = Math.min(0.82, 0.52 + spec.diff * 0.008);
    var cx = 0;
    parts.forEach(function (p) {
      var w = p.map[0].length;
      for (var y = 0; y < 8; y++) for (var x = 0; x < w; x++) {
        var ch = p.map[y][x], col = cx + x, row = y + 4;
        if (ch === '.') continue;
        var px = col * TILE + TILE / 2, py = (row + 1) * TILE; // 칸 바닥 가운데
        if (ch === '#') tiles[row * cols + col] = SOLID;
        else if (ch === '=') tiles[row * cols + col] = PLAT;
        else if (ch === '^') tiles[row * cols + col] = SPIKE;
        else if (ch === 'o') out.coins.push({ x: px, y: py - TILE / 2 });
        else if (ch === 'b') out.props.push({ kind: 'barrel', x: px, y: py });
        else if (ch === 'x') out.props.push({ kind: 'crate', x: px, y: py });
        else if (ch === 'P') pets.push({ x: px, y: py });
        else if (ch === 'i') { if (spec.diff >= 3 && r() < fill) out.spawns.push({ type: 'iron', x: px, y: row * TILE }); }
        else if (r() < (ch === 'G' ? fill - 0.1 : fill)) out.spawns.push({ type: pick(W[ch], r), x: px, y: py });
      }
      if (p.kind === 'chunk') {
        spots.push({ x: (cx + 1) * TILE + TILE / 2, y: 10 * TILE });
        if (p.mech) out.mech = { x: (cx + 1) * TILE, y: 10 * TILE };
      }
      var camX = cx * TILE + (w * TILE - VIEW_W) / 2;
      if (p.kind === 'arena') out.arenas.push({ x: camX, waves: makeWaves(W, spec.diff, r), state: 'wait', wave: -1 });
      if (p.kind === 'boss') out.boss = { kind: W.boss, x: camX };
      if (p.kind === 'end') out.goal = { x: (cx + 9) * TILE, y: 10 * TILE };
      cx += w;
    });
    // 동물 우리는 판마다 3개(보스전은 길이 짧아 2개, 탑 보스층은 1개)
    var want = spec.type === 'boss' ? Math.min(2, n) : 3;
    for (var k = pets.length - 1; k > 0; k--) { var j = Math.floor(r() * (k + 1)); var t = pets[k]; pets[k] = pets[j]; pets[j] = t; }
    pets = pets.slice(0, want);
    while (pets.length < want && spots.length) pets.push(spots.splice(Math.floor(r() * spots.length), 1)[0]);
    pets.forEach(function (p, idx) { out.props.push({ kind: 'cage', x: p.x, y: p.y, pet: (idx + spec.seed) % 4 }); });
    out.petsTotal = pets.length;
    return out;
  }

  function makeWaves(W, diff, r) {
    var count = 2 + Math.min(1, Math.floor(diff / 18)), waves = [];
    for (var i = 0; i < count; i++) {
      var n = Math.min(6, 2 + Math.floor(diff / 12) + i), list = [];
      for (var k = 0; k < n; k++) {
        var flying = r() < 0.35;
        list.push({ type: pick(flying ? W.f : W.g, r), side: r() < 0.5 ? -1 : 1, delay: k * 0.6, fly: flying });
      }
      if (i === count - 1 && diff >= 3) list.push({ type: pick(W.G, r), side: 1, delay: 1.2, fly: false });
      waves.push(list);
    }
    return waves;
  }

  function buildStage(index) {
    var info = stageInfo(index);
    var length = info.type === 'boss' ? 3 : { normal: 7, battle: 7, chase: 10, mech: 8 }[info.type] + Math.floor(info.world / 2);
    var map = build({ world: info.world, type: info.type, diff: index, seed: 1000 + index * 7919, length: length });
    map.info = info;
    return map;
  }
  // 끝없는 탑 n층(1부터): 5층마다 보스, 나머지는 짧은 판. 씨앗은 도전할 때마다 달라진다.
  function buildTower(floor, seed) {
    var bossFloor = floor % 5 === 0;
    var world = bossFloor ? (floor / 5 - 1) % WORLDS.length : (floor - 1) % WORLDS.length;
    var diff = Math.min(60, 2 + (floor - 1) * 1.7);
    var type = bossFloor ? 'boss' : ['normal', 'battle', 'chase', 'battle'][(floor - 1) % 5];
    var map = build({ world: world, type: type, diff: diff, seed: seed + floor * 104729, length: bossFloor ? 1 : 4 });
    map.info = { index: -1, world: world, num: 0, type: type, label: floor + '층', name: WORLDS[world].name, typeName: TYPE_NAMES[type] };
    return map;
  }

  return { TILE: TILE, ROWS: ROWS, VIEW_W: VIEW_W, VIEW_H: VIEW_H, AIR: AIR, SOLID: SOLID, PLAT: PLAT, SPIKE: SPIKE, WORLDS: WORLDS, CHUNKS: CHUNKS,
    ARENAS: ARENAS, STAGE_COUNT: STAGE_COUNT, STAGES_PER_WORLD: STAGES_PER_WORLD, TYPE_NAMES: TYPE_NAMES, rng: rng, stageInfo: stageInfo, buildStage: buildStage, buildTower: buildTower };
});
