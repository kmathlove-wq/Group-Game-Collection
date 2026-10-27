// ===== world.js =====
// 학교 부수기의 학교 건물(블록 격자)·학교 종류·무기 목록과 부수기 규칙(화면을 모름). 브라우저(window.Smash.World)와 Node 시험이 함께 쓴다.
// 건물은 COLS×ROWS 칸, 칸마다 종류(벽돌·유리·지붕·문·시계·간판·기초·기둥·탑…)와 남은 힘(hp)이 있다.
// 부서진 칸 때문에 땅과 이어지지 않은 칸은 "떨어지는 블록"이 되어 건물에서 빠진다(점수는 빠지는 순간 셈).
// 무기는 모두 새로 디자인했다(사용자 결정 2026-10-27: 무기 수십 개, 다른 게임을 베끼지 않음).
(function (root) {
  'use strict';

  var W = 960, H = 600;
  var CELL = 12, COLS = 60, ROWS = 44;
  var LEFT = (W - COLS * CELL) / 2, GROUND = 560, TOP = GROUND - ROWS * CELL;
  var CHALLENGE_SECONDS = 60;
  var SCORE_MAX = 999999;

  // 칸 종류별 힘·점수·기본 색(학교마다 palette로 색을 바꿀 수 있음)
  var TYPES = {
    brick: { hp: 3, points: 10, colors: ['#e07a5f', '#d96c50', '#e88b70'] },
    line: { hp: 3, points: 10, colors: ['#b85c45'] },
    glass: { hp: 1, points: 5, colors: ['#9ad7f2', '#86cbe9'] },
    roof: { hp: 3, points: 15, colors: ['#3d5a80', '#34507a'] },
    door: { hp: 2, points: 20, colors: ['#8d5a3b'] },
    clock: { hp: 4, points: 100, colors: ['#fff8e1'] },
    sign: { hp: 2, points: 30, colors: ['#2a9d8f'] },
    base: { hp: 6, points: 20, colors: ['#8a8f99', '#7d828c'] },
    column: { hp: 4, points: 15, colors: ['#f1efe7', '#e4e0d4'] },
    tower: { hp: 4, points: 15, colors: ['#9c8fb8', '#8f82ab'] },
    metal: { hp: 6, points: 25, colors: ['#b8c2cc', '#a9b4bf'] }
  };

  // ----- 학교 종류 -----
  // w 폭(칸), floors 층 수, roof 지붕 모양, palette 종류별 색, hp 단단함 배율, sky·ground 배경 색, columns 기둥
  var SCHOOLS = [
    { id: 'elementary', emoji: '🏫', name: '초등학교', sign: '부수기 초등학교', w: 56, floors: 3, roof: 'triangle', hp: 1, palette: {} },
    { id: 'kinder', emoji: '🧸', name: '유치원', sign: '꿈나무 유치원', w: 42, floors: 2, roof: 'triangle', hp: 0.8,
      palette: { brick: ['#ffd166', '#ffc94a', '#ffdb85'], line: ['#ef476f'], roof: ['#ef476f', '#e63962'], sign: ['#06d6a0'], door: ['#118ab2'] } },
    { id: 'middle', emoji: '🏢', name: '중학교', sign: '부수기 중학교', w: 52, floors: 3, roof: 'flat', hp: 1,
      palette: { brick: ['#d6ccc2', '#cbbfb2', '#ddd4ca'], line: ['#a39382'], roof: ['#6c757d', '#5f676f'], sign: ['#1d3557'] } },
    { id: 'high', emoji: '🏬', name: '고등학교', sign: '부수기 고등학교', w: 58, floors: 4, roof: 'flat', hp: 1.1,
      palette: { brick: ['#9d4b3c', '#8f4234', '#a65445'], line: ['#6e2f24'], roof: ['#3a3a3a', '#333'], sign: ['#264653'] } },
    { id: 'univ', emoji: '🎓', name: '대학교', sign: '부수기 대학교', w: 58, floors: 3, roof: 'clocktower', hp: 1.2, columns: true,
      palette: { brick: ['#ece6d6', '#e2dbc8', '#f3eee1'], line: ['#c9bfa6'], roof: ['#7f5539', '#734c32'], tower: ['#e2dbc8', '#d8d0bb'], sign: ['#7f1d1d'] } },
    { id: 'magic', emoji: '🧙', name: '마법 학교', sign: '마법 학교', w: 56, floors: 3, roof: 'castle', hp: 1.3,
      palette: { brick: ['#6d6a85', '#625f7a', '#77748f'], line: ['#4f4c66'], glass: ['#ffd166', '#ffc24b'], roof: ['#3c096c', '#5a189a'], tower: ['#6d6a85', '#5d5a75'], sign: ['#5a189a'], door: ['#3d2b1f'] },
      sky: ['#2b1b4f', '#7b5ea7'], ground: '#3f6b3a' },
    { id: 'space', emoji: '🚀', name: '우주 학교', sign: '우주 학교', w: 50, floors: 3, roof: 'antenna', hp: 1.3,
      palette: { brick: ['#cfd8dc', '#c3ced3', '#dbe3e6'], line: ['#90a4ae'], glass: ['#4dd0e1', '#26c6da'], roof: ['#80deea', '#a7f3ff'], sign: ['#283593'] },
      sky: ['#05051a', '#1b1f4a'], ground: '#8d8d99', stars: true },
    { id: 'ice', emoji: '❄️', name: '얼음 학교', sign: '얼음 학교', w: 48, floors: 3, roof: 'dome', hp: 0.6,
      palette: { brick: ['#d6f1ff', '#c4e9ff', '#e6f7ff'], line: ['#9fd8f5'], glass: ['#ffffff', '#f0fbff'], roof: ['#b3e5fc', '#a1dcf7'], sign: ['#4fc3f7'], door: ['#81d4fa'], base: ['#b0cbd8', '#a3bfcc'] },
      sky: ['#c9e8ff', '#f4fbff'], ground: '#f4f8fb' },
    { id: 'candy', emoji: '🍪', name: '과자 학교', sign: '과자 학교', w: 48, floors: 2, roof: 'cookie', hp: 0.7,
      palette: { brick: ['#c68b59', '#b97d4b', '#d29a68'], line: ['#7b4a28'], glass: ['#ff8fab', '#ffb3c6'], roof: ['#fff0f6', '#ffd6e8'], sign: ['#ff5d8f'], door: ['#5c3317'], base: ['#7b4a28', '#6b3f22'] },
      sky: ['#ffc4e1', '#fff0f6'], ground: '#ff8fab' },
    { id: 'hanok', emoji: '🏯', name: '서당', sign: '부수기 서당', w: 44, floors: 2, roof: 'hanok', hp: 1,
      palette: { brick: ['#a47148', '#9a6840', '#ad7a52'], line: ['#6f4518'], glass: ['#f7ecd8', '#efe2c9'], roof: ['#3e4a52', '#36414a'], sign: ['#6f1d1b'], door: ['#6f4518'], base: ['#b5a58f', '#a89883'] } },
    { id: 'robot', emoji: '🤖', name: '로봇 학교', sign: '로봇 학교', w: 52, floors: 3, roof: 'antenna', hp: 1.5,
      palette: { brick: ['#78909c', '#6f8793', '#8299a4'], line: ['#455a64'], glass: ['#ff5252', '#ff6e6e'], roof: ['#b0bec5', '#a2b1b9'], sign: ['#212121'], door: ['#37474f'] },
      sky: ['#9aa8b5', '#dfe6ec'], ground: '#5c6770' },
    { id: 'ocean', emoji: '🐠', name: '바닷속 학교', sign: '바닷속 학교', w: 50, floors: 3, roof: 'dome', hp: 0.9,
      palette: { brick: ['#ff8a65', '#ff7a52', '#ff9a78'], line: ['#d84315'], glass: ['#b2ebf2', '#a0e4ec'], roof: ['#f48fb1', '#f06292'], sign: ['#00838f'], door: ['#6d4c41'], base: ['#e0cfa9', '#d4c29b'] },
      sky: ['#0277bd', '#4fc3f7'], ground: '#e8d8a8', bubbles: true }
  ];
  function school(id) {
    for (var i = 0; i < SCHOOLS.length; i++) if (SCHOOLS[i].id === id) return SCHOOLS[i];
    return SCHOOLS[0];
  }

  // ----- 무기 -----
  // kind: 어떻게 쓰는지(화면 main.js가 kind에 맞춰 움직임을 만든다). radius 반지름(칸)·power 힘·count 도전 모드 개수·cooldown 연속 사용 간격(초)
  var GROUPS = [
    { id: 'tool', name: '🔨 연장' }, { id: 'boom', name: '💥 폭발' }, { id: 'sky', name: '☄️ 하늘' },
    { id: 'nature', name: '🌪️ 자연' }, { id: 'giant', name: '🦖 괴물·기계' }, { id: 'magic', name: '✨ 신기한 힘' }
  ];
  var TOOL_LIST = [
    { id: 'hammer', icon: '🔨', name: '망치', group: 'tool', kind: 'drag', radius: 1.3, power: 2, count: Infinity, cooldown: 0.1 },
    { id: 'punch', icon: '👊', name: '주먹', group: 'tool', kind: 'tap', radius: 2.2, power: 4, count: 30, cooldown: 0.25 },
    { id: 'axe', icon: '🪓', name: '도끼', group: 'tool', kind: 'drag', radius: 1, power: 4, count: Infinity, cooldown: 0.18 },
    { id: 'saw', icon: '🪚', name: '전기톱', group: 'tool', kind: 'drag', radius: 0.8, power: 6, count: 12, cooldown: 0.03, uses: 0.08 },
    { id: 'drill', icon: '🛠️', name: '드릴', group: 'tool', kind: 'drag', radius: 0.6, power: 12, count: 12, cooldown: 0.04, uses: 0.08 },
    { id: 'flame', icon: '🔥', name: '화염방사기', group: 'tool', kind: 'drag', radius: 3, power: 1, count: 12, cooldown: 0.06, uses: 0.08 },
    { id: 'eraser', icon: '🧽', name: '지우개', group: 'tool', kind: 'drag', radius: 2, power: 99, count: 8, cooldown: 0.05, uses: 0.08 },

    { id: 'bomb', icon: '💣', name: '폭탄', group: 'boom', kind: 'delay', radius: 4.2, power: 8, count: 8, cooldown: 0.3, life: 0.45 },
    { id: 'dynamite', icon: '🧨', name: '다이너마이트', group: 'boom', kind: 'delay', radius: 6.5, power: 12, count: 3, cooldown: 0.6, life: 1.1 },
    { id: 'melon', icon: '🍉', name: '수박 폭탄', group: 'boom', kind: 'delay', radius: 5, power: 9, count: 4, cooldown: 0.4, life: 0.7, splat: ['#e63946', '#2a9d8f', '#1b1b1b'] },
    { id: 'firework', icon: '🎆', name: '불꽃놀이', group: 'boom', kind: 'firework', radius: 2.4, power: 5, count: 4, cooldown: 0.8, n: 9 },
    { id: 'missile', icon: '🚀', name: '미사일', group: 'boom', kind: 'shot', radius: 4.5, power: 10, count: 5, cooldown: 0.5, life: 0.5 },
    { id: 'barrage', icon: '🎯', name: '미사일 폭격', group: 'boom', kind: 'rain', radius: 3, power: 8, count: 2, cooldown: 2, life: 1.6, n: 10, spread: 14, drop: '🚀' },
    { id: 'megabomb', icon: '💥', name: '왕왕 폭탄', group: 'boom', kind: 'delay', radius: 16, power: 20, count: 1, cooldown: 3, life: 1.5 },

    { id: 'meteor', icon: '☄️', name: '운석', group: 'sky', kind: 'fall', radius: 7, power: 14, count: 2, cooldown: 1, life: 0.6 },
    { id: 'shower', icon: '🌠', name: '유성우', group: 'sky', kind: 'rain', radius: 2.5, power: 7, count: 2, cooldown: 2, life: 2.5, n: 24, spread: 30, drop: '☄️' },
    { id: 'hail', icon: '🧊', name: '우박', group: 'sky', kind: 'rain', radius: 1.2, power: 3, count: 3, cooldown: 1.5, life: 2.5, n: 60, spread: 26, drop: '🧊' },
    { id: 'acid', icon: '🧪', name: '산성비', group: 'sky', kind: 'rain', radius: 1.6, power: 2, count: 3, cooldown: 1.5, life: 3, n: 90, spread: 18, drop: '💧' },
    { id: 'piano', icon: '🎹', name: '피아노 낙하', group: 'sky', kind: 'fall', radius: 4, power: 10, count: 4, cooldown: 0.6, life: 0.7 },
    { id: 'lightning', icon: '⚡', name: '번개', group: 'sky', kind: 'bolt', radius: 2.5, power: 9, count: 6, cooldown: 0.4 },
    { id: 'planet', icon: '🪐', name: '행성 충돌', group: 'sky', kind: 'fall', radius: 24, power: 30, count: 1, cooldown: 3, life: 1.6 },

    { id: 'quake', icon: '🌋', name: '지진', group: 'nature', kind: 'quake', radius: 0, power: 2, count: 1, cooldown: 3, life: 2.2, n: 6 },
    { id: 'tornado', icon: '🌪️', name: '토네이도', group: 'nature', kind: 'sweep', radius: 3, power: 2, count: 2, cooldown: 2, life: 3.5, band: 'tall' },
    { id: 'tsunami', icon: '🌊', name: '쓰나미', group: 'nature', kind: 'sweep', radius: 3, power: 3, count: 1, cooldown: 3, life: 3, band: 'wave' },
    { id: 'freeze', icon: '❄️', name: '얼리기', group: 'nature', kind: 'freeze', radius: 7, power: 0, count: 3, cooldown: 0.6 },
    { id: 'ants', icon: '🐜', name: '개미 떼', group: 'nature', kind: 'swarm', radius: 0, power: 1, count: 2, cooldown: 3, life: 6, n: 10 },
    { id: 'sun', icon: '☀️', name: '햇빛 돋보기', group: 'nature', kind: 'drag', radius: 5, power: 1, count: 6, cooldown: 0.12, uses: 0.08 },

    { id: 'dino', icon: '🦖', name: '공룡 발', group: 'giant', kind: 'stomp', radius: 6, power: 30, count: 3, cooldown: 1, life: 0.8 },
    { id: 'robotfist', icon: '🤖', name: '거대 로봇 주먹', group: 'giant', kind: 'sweep', radius: 3.5, power: 12, count: 2, cooldown: 1.5, life: 0.9, band: 'punch' },
    { id: 'wrecking', icon: '🏗️', name: '철거 공', group: 'giant', kind: 'pendulum', radius: 4, power: 6, count: 2, cooldown: 2, life: 3.2 },
    { id: 'bulldozer', icon: '🚜', name: '불도저', group: 'giant', kind: 'sweep', radius: 3, power: 4, count: 2, cooldown: 2, life: 3, band: 'ground' },
    { id: 'bowling', icon: '🎳', name: '볼링공', group: 'giant', kind: 'sweep', radius: 2, power: 8, count: 4, cooldown: 0.8, life: 1.3, band: 'ball' },
    { id: 'dragon', icon: '🐉', name: '불 뿜는 용', group: 'giant', kind: 'sweep', radius: 2, power: 3, count: 2, cooldown: 2, life: 3, band: 'fire' },

    { id: 'laser', icon: '🔴', name: '레이저', group: 'magic', kind: 'beam', radius: 0.9, power: 3, count: 10, cooldown: 0.05, uses: 0.08 },
    { id: 'cannon', icon: '🔆', name: '레이저 대포', group: 'magic', kind: 'row', radius: 1.6, power: 15, count: 3, cooldown: 0.8 },
    { id: 'ufo', icon: '🛸', name: 'UFO 광선', group: 'magic', kind: 'column', radius: 2.5, power: 3, count: 2, cooldown: 2, life: 2.5 },
    { id: 'blackhole', icon: '🕳️', name: '블랙홀', group: 'magic', kind: 'blackhole', radius: 9, power: 2, count: 1, cooldown: 3, life: 3.5 }
  ];
  var TOOLS = {};
  TOOL_LIST.forEach(function (t) { TOOLS[t.id] = t; });
  var TOOL_ORDER = TOOL_LIST.map(function (t) { return t.id; });

  // ----- 학교 모양 -----
  // (c, r) 칸의 종류. 아래부터 기초 2줄 → 층(한 층 8줄) → 간판 2줄 → 지붕.
  function typeAt(sc, c, r) {
    var w = sc.w, c0 = Math.floor((COLS - w) / 2), c1 = c0 + w, mid = c0 + w / 2;
    var cc = c - c0;
    var baseTop = ROWS - 2;
    if (r >= baseTop) return c >= c0 - 1 && c < c1 + 1 ? 'base' : null;
    var floorsTop = baseTop - sc.floors * 8;
    if (r >= floorsTop) {
      if (c < c0 || c >= c1) return null;
      var floor = Math.floor((baseTop - 1 - r) / 8);      // 0 = 1층
      var fr = r - (baseTop - (floor + 1) * 8);           // 층 안의 줄(0 = 맨 위)
      if (fr === 0) return 'line';
      if (floor === 0 && fr >= 2 && Math.abs(c + 0.5 - mid) < 3) return 'door';
      if (sc.columns && (cc % 9 === 0 || cc % 9 === 1) && cc > 1 && cc < w - 2) return 'column';
      // 창문: 7칸마다 4칸(기둥 있는 학교는 기둥 사이 9칸마다 5칸), 1층 문 옆 창문 묶음은 뺌
      var per = sc.columns ? 9 : 7, from = sc.columns ? 3 : 2, to = sc.columns ? 7 : 5;
      if (fr >= 2 && fr <= 5 && cc >= 2 && cc < w - 2 && cc % per >= from && cc % per <= to && !(floor === 0 && Math.abs(c0 + Math.floor(cc / per) * per + per / 2 - mid) < 7)) return 'glass';
      return 'brick';
    }
    var signTop = floorsTop - 2;
    if (r >= signTop) {
      if (c < c0 || c >= c1) return null;
      return Math.abs(c + 0.5 - mid) < Math.min(11, w / 2 - 2) ? 'sign' : 'brick';
    }
    return roofAt(sc, c, r, signTop - 1 - r, c0, c1, mid);
  }

  // k = 간판 위로 몇 번째 줄인지(0 = 바로 위)
  function roofAt(sc, c, r, k, c0, c1, mid) {
    var w = sc.w, dx = Math.abs(c + 0.5 - mid), cc = c - c0;
    switch (sc.roof) {
      case 'triangle': {
        if (k > 5) return null;
        var half = w / 2 - k * (w / 2 - 8) / 5;
        if (dx >= half) return null;
        if (k >= 1 && k <= 3 && dx < 2) return 'clock';
        return 'roof';
      }
      case 'flat': {
        if (c < c0 || c >= c1) {
          return null;
        }
        if (k === 0) return 'roof';
        if (k === 1) return cc % 4 < 2 ? 'roof' : null;
        // 옥상 물탱크
        if (k >= 1 && k <= 4 && cc >= w - 12 && cc < w - 6) return 'metal';
        return null;
      }
      case 'dome': {
        var R = Math.min(w / 3, 13);
        if (k === 0 && c >= c0 && c < c1) return 'roof';
        if (dx * dx + (k + 0.5) * (k + 0.5) < R * R) return 'roof';
        if (dx < 0.6 && k >= R && k < R + 3) return 'metal'; // 깃대
        return null;
      }
      case 'castle': {
        if (c < c0 || c >= c1) return null;
        var side = cc < 7 || cc >= w - 7;
        if (side) {
          if (k < 8) return 'tower';
          if (k < 9) return (cc % 2 === 0) ? 'tower' : null;
          if (k < 13 && Math.abs((cc < 7 ? cc : w - 1 - cc) - 3) < 3.5 - (k - 9) * 0.9) return 'roof';
          return null;
        }
        if (dx < 5) {
          if (k < 11) return k >= 7 && k <= 9 && dx < 2 ? 'clock' : 'tower';
          if (k < 16 && dx < 5 - (k - 11)) return 'roof';
          return null;
        }
        if (k === 0) return 'brick';
        if (k === 1) return cc % 2 === 0 ? 'brick' : null;
        return null;
      }
      case 'hanok': {
        var widths = [w + 6, w + 2, w - 6, w - 14];
        if (k > 3) return null;
        var hw = widths[k] / 2;
        if (dx < hw) return 'roof';
        // 처마 끝이 살짝 올라감
        if (k === 1 && dx < w / 2 + 3 && dx >= hw) return 'roof';
        return null;
      }
      case 'cookie': {
        if (c < c0 || c >= c1) return null;
        if (k <= 1) return 'roof';
        if (k === 2) return cc % 6 < 3 ? 'roof' : null;
        if (k === 3 && cc % 6 === 1 && cc % 12 < 6) return 'sign'; // 체리
        return null;
      }
      case 'clocktower': {
        if (k === 0 && c >= c0 && c < c1) return 'roof';
        if (k === 1 && c >= c0 && c < c1 && (c - c0) % 3 !== 2) return 'roof';
        if (dx < 5) {
          if (k < 10) return k >= 5 && k <= 7 && dx < 2.5 ? 'clock' : 'tower';
          if (k < 15 && dx < 5 - (k - 10)) return 'roof';
        }
        return null;
      }
      case 'antenna': {
        var R2 = Math.min(w / 4, 9);
        if (k === 0 && c >= c0 && c < c1) return 'metal';
        if (dx * dx + (k + 0.5) * (k + 0.5) < R2 * R2) return 'glass';
        if (dx < 0.6 && k >= R2 && k < R2 + 6) return 'metal';
        if (cc >= 3 && cc < 7 && k >= 1 && k <= 3) return 'metal'; // 접시 안테나 받침
        if (k === 4 && cc >= 1 && cc < 9) return 'metal';
        return null;
      }
    }
    return null;
  }

  function create(schoolId) {
    var sc = school(schoolId);
    var cells = [];
    var total = 0;
    for (var r = 0; r < ROWS; r++) {
      for (var c = 0; c < COLS; c++) {
        var type = typeAt(sc, c, r);
        if (!type) { cells.push(null); continue; }
        var t = TYPES[type];
        var colors = sc.palette[type] || t.colors;
        var hp = Math.max(1, Math.round(t.hp * sc.hp));
        cells.push({ type: type, hp: hp, max: hp, color: colors[(c * 7 + r * 3) % colors.length] });
        total++;
      }
    }
    var world = { school: sc.id, cells: cells, total: total, destroyed: 0, score: 0 };
    // 맨 아래에서 이어지지 않은 칸(모양 실수)이 있으면 처음부터 빼 둔다
    var loose = dropLoose(world);
    world.total -= loose.length; world.destroyed = 0; world.score = 0;
    return world;
  }

  function get(world, c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return null;
    return world.cells[r * COLS + c];
  }

  // 화면 좌표 → 칸 좌표(소수)
  function toCell(x, y) { return { c: (x - LEFT) / CELL, r: (y - TOP) / CELL }; }
  function cellCenter(c, r) { return { x: LEFT + c * CELL + CELL / 2, y: TOP + r * CELL + CELL / 2 }; }

  function removeCell(world, c, r, out) {
    var cell = get(world, c, r);
    if (!cell) return;
    world.cells[r * COLS + c] = null;
    world.destroyed++;
    world.score = Math.min(SCORE_MAX, world.score + TYPES[cell.type].points);
    out.push({ c: c, r: r, type: cell.type, color: cell.color });
  }

  // 땅(맨 아래 줄)과 이어지지 않은 칸을 모두 떼어 낸다.
  function dropLoose(world) {
    var held = new Uint8Array(COLS * ROWS);
    var stack = [];
    for (var c = 0; c < COLS; c++) if (get(world, c, ROWS - 1)) { held[(ROWS - 1) * COLS + c] = 1; stack.push(c, ROWS - 1); }
    while (stack.length) {
      var r = stack.pop(), cc = stack.pop();
      var around = [[cc + 1, r], [cc - 1, r], [cc, r + 1], [cc, r - 1]];
      for (var i = 0; i < 4; i++) {
        var nc = around[i][0], nr = around[i][1];
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        var k = nr * COLS + nc;
        if (!held[k] && world.cells[k]) { held[k] = 1; stack.push(nc, nr); }
      }
    }
    var fallen = [];
    for (var rr = 0; rr < ROWS; rr++) for (var c2 = 0; c2 < COLS; c2++) {
      if (world.cells[rr * COLS + c2] && !held[rr * COLS + c2]) removeCell(world, c2, rr, fallen);
    }
    return fallen;
  }

  // 칸 하나에 피해. 0 이하가 되면 없앤다.
  function damage(world, c, r, dmg, res) {
    var cell = get(world, c, r);
    if (!cell) return;
    cell.hp -= dmg;
    if (cell.hp <= 0) removeCell(world, c, r, res.destroyed);
    else res.damaged.push({ c: c, r: r });
  }
  function finish(world, res) {
    res.fallen = res.destroyed.length ? dropLoose(world) : [];
    return res;
  }
  function empty() { return { destroyed: [], damaged: [], fallen: [] }; }

  // (x, y) 화면 좌표에 반지름 radius칸, 힘 power로 때린다(가운데일수록 셈).
  function hit(world, x, y, radius, power) {
    var p = toCell(x, y);
    var res = empty();
    var reach = Math.ceil(radius) + 1;
    for (var r = Math.floor(p.r) - reach; r <= Math.floor(p.r) + reach; r++) {
      for (var c = Math.floor(p.c) - reach; c <= Math.floor(p.c) + reach; c++) {
        if (!get(world, c, r)) continue;
        var d = Math.hypot(c + 0.5 - p.c, r + 0.5 - p.r);
        if (d > radius + 0.5) continue;
        damage(world, c, r, Math.max(1, Math.round(power * (1 - d / (radius + 1)))), res);
      }
    }
    return finish(world, res);
  }

  // 선분(x1,y1)-(x2,y2)에서 half칸 안쪽을 똑같은 힘으로(레이저·번개·광선)
  function hitLine(world, x1, y1, x2, y2, half, power) {
    var a = toCell(x1, y1), b = toCell(x2, y2);
    var res = empty();
    var minC = Math.max(0, Math.floor(Math.min(a.c, b.c) - half - 1)), maxC = Math.min(COLS - 1, Math.ceil(Math.max(a.c, b.c) + half + 1));
    var minR = Math.max(0, Math.floor(Math.min(a.r, b.r) - half - 1)), maxR = Math.min(ROWS - 1, Math.ceil(Math.max(a.r, b.r) + half + 1));
    var dc = b.c - a.c, dr = b.r - a.r, len2 = dc * dc + dr * dr || 1;
    for (var r = minR; r <= maxR; r++) for (var c = minC; c <= maxC; c++) {
      if (!get(world, c, r)) continue;
      var t = Math.max(0, Math.min(1, ((c + 0.5 - a.c) * dc + (r + 0.5 - a.r) * dr) / len2));
      var d = Math.hypot(c + 0.5 - (a.c + dc * t), r + 0.5 - (a.r + dr * t));
      if (d <= half + 0.5) damage(world, c, r, power, res);
    }
    return finish(world, res);
  }

  // 화면 좌표 사각형(x, y 왼쪽 위, w×h) 안을 똑같은 힘으로(공룡 발·불도저)
  function hitRect(world, x, y, w, h, power) {
    var a = toCell(x, y), b = toCell(x + w, y + h);
    var res = empty();
    for (var r = Math.max(0, Math.floor(a.r)); r <= Math.min(ROWS - 1, Math.floor(b.r)); r++)
      for (var c = Math.max(0, Math.floor(a.c)); c <= Math.min(COLS - 1, Math.floor(b.c)); c++)
        if (get(world, c, r)) damage(world, c, r, power, res);
    return finish(world, res);
  }

  // 얼리기: 반지름 안의 칸이 얼어붙어 힘이 1이 된다(한 번에 와르르 깨기 좋음)
  function freeze(world, x, y, radius) {
    var p = toCell(x, y), n = [];
    for (var r = Math.floor(p.r - radius); r <= Math.ceil(p.r + radius); r++)
      for (var c = Math.floor(p.c - radius); c <= Math.ceil(p.c + radius); c++) {
        var cell = get(world, c, r);
        if (!cell || cell.frozen || Math.hypot(c + 0.5 - p.c, r + 0.5 - p.r) > radius + 0.5) continue;
        cell.frozen = true; cell.hp = 1; cell.max = 1; cell.color = '#cdefff';
        n.push({ c: c, r: r });
      }
    return n;
  }

  // 지진: 남은 칸 중 무작위 count개에 힘 power
  function quake(world, count, power, rand) {
    rand = rand || Math.random;
    var alive = [];
    for (var i = 0; i < world.cells.length; i++) if (world.cells[i]) alive.push(i);
    var res = empty();
    for (var n = 0; n < count && alive.length; n++) {
      var j = Math.floor(rand() * alive.length);
      var k = alive[j];
      damage(world, k % COLS, Math.floor(k / COLS), power, res);
      alive[j] = alive[alive.length - 1]; alive.pop();
    }
    return finish(world, res);
  }

  // 개미 떼: 빈칸과 맞닿은(겉에 드러난) 칸만 골라 갉아 먹는다
  function nibble(world, count, power, rand) {
    rand = rand || Math.random;
    var edge = [];
    for (var i = 0; i < world.cells.length; i++) {
      if (!world.cells[i]) continue;
      var c = i % COLS, r = Math.floor(i / COLS);
      if (r === ROWS - 1) continue;
      if (!get(world, c + 1, r) || !get(world, c - 1, r) || !get(world, c, r - 1)) edge.push(i);
    }
    var res = empty();
    for (var n = 0; n < count && edge.length; n++) {
      var j = Math.floor(rand() * edge.length), k = edge[j];
      damage(world, k % COLS, Math.floor(k / COLS), power, res);
      edge[j] = edge[edge.length - 1]; edge.pop();
    }
    return finish(world, res);
  }

  // 남은 칸 범위(그리기·무기 높이 맞추기용): 가장 위 줄과 왼쪽·오른쪽 칸
  function bounds(world) {
    var top = ROWS, left = COLS, right = -1;
    for (var i = 0; i < world.cells.length; i++) if (world.cells[i]) {
      var c = i % COLS, r = Math.floor(i / COLS);
      if (r < top) top = r; if (c < left) left = c; if (c > right) right = c;
    }
    return { top: top, left: left, right: right };
  }

  function percent(world) { return world.total ? world.destroyed / world.total * 100 : 0; }
  function clearBonus(secondsLeft) { return Math.max(0, Math.floor(secondsLeft)) * 20; }

  var api = { W: W, H: H, CELL: CELL, COLS: COLS, ROWS: ROWS, LEFT: LEFT, TOP: TOP, GROUND: GROUND, CHALLENGE_SECONDS: CHALLENGE_SECONDS, SCORE_MAX: SCORE_MAX,
    TYPES: TYPES, SCHOOLS: SCHOOLS, school: school, GROUPS: GROUPS, TOOL_LIST: TOOL_LIST, TOOLS: TOOLS, TOOL_ORDER: TOOL_ORDER,
    create: create, get: get, toCell: toCell, cellCenter: cellCenter, hit: hit, hitLine: hitLine, hitRect: hitRect, freeze: freeze,
    quake: quake, nibble: nibble, dropLoose: dropLoose, bounds: bounds, percent: percent, clearBonus: clearBonus };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.Smash = root.Smash || {}; root.Smash.World = api; }
})(typeof window !== 'undefined' ? window : this);
