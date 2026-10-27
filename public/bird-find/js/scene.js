// ===== scene.js =====
// 새 찾기의 숲 만들기·새 숨기기·판정·점수(화면을 모름). 브라우저(window.BirdFind.Scene)와 Node 시험이 함께 쓴다.
// 같은 씨앗(seed)이면 언제나 같은 숲이 나온다. 좌표는 논리 크기 W×H 기준(화면은 비율대로 늘리고 줄임).
(function (root) {
  'use strict';

  var W = 960, H = 640;
  var LEVEL_SECONDS = 45;
  var WRONG_PENALTY = 3;          // 엉뚱한 곳을 누르면 3초 빠짐
  var HIT_SCALE = 1.2;            // 새 크기의 1.2배 안을 누르면 찾은 것으로 침
  var SCORE_MAX = 999999;
  // 난이도: 쉬움 = 원래 판 그대로, 어려움 = 웬만한 사람은 깨기 힘들게(사용자 결정 2026-10-27).
  var MODES = {
    easy: { seconds: LEVEL_SECONDS, penalty: WRONG_PENALTY, hints: 1 },
    hard: { seconds: 30, penalty: 5, hints: 0 }
  };

  // 씨앗으로 늘 같은 순서의 무작위 수(0~1)를 만든다.
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

  var LEAF = ['#2f7d32', '#3e8e41', '#4f9d3a', '#2e6b30', '#5aa845', '#3b7a3f'];
  var BRIGHT = ['#e63946', '#ffd60a', '#1e88e5', '#ff8c00', '#9b59b6', '#00b4d8', '#ff5fa2'];
  var CAMO = ['#4c8c3a', '#5f8f2e', '#7a5c3a', '#8a7f4a', '#3f7a35', '#6b5636'];

  // 단계별 난이도: 새 수·크기·숨김 정도. 사용자 결정(2026-10-26): 처음 만든 판은 너무 쉬웠음 → 1단계부터 절반은 숨는 색.
  // 어려움: 새가 아주 작고(13→8), 앉은 자리 색과 거의 같고(±3%), 잎 두 장이 늘 가장자리를 가리고,
  // 눈 없는 가짜 새·눈처럼 생긴 까만 점·작은 잎 수백 장이 숲을 덮는다.
  function hardInfo(level) {
    return {
      birds: Math.min(16, 5 + level),
      size: Math.max(8, 14 - level),
      camo: 1, tintRange: 0.06,
      hidden: 1, covers: 2,
      trees: Math.min(14, 8 + level),
      bushes: 14 + level * 2,
      decoys: Math.min(140, 50 + level * 10),
      fakes: Math.min(45, 8 + level * 4),
      spots: 80 + level * 10,
      litter: 380 + level * 30
    };
  }

  function levelInfo(level, mode) {
    if (mode === 'hard') return hardInfo(level);
    var d = Math.min(1, (level - 1) / 3);                 // 0(1단계) ~ 1(4단계부터)
    return {
      birds: Math.min(12, 3 + level),
      size: Math.max(14, Math.round(28 - (level - 1) * 2)), // 28 → 14
      camo: 0.5 + d * 0.5,                                  // 앉은 자리 색으로 숨을 확률(1단계 50% → 4단계부터 100%)
      hidden: Math.min(0.8, 0.2 + level * 0.12),            // 잎에 살짝 가려질 확률
      trees: Math.min(10, 4 + level),
      decoys: level >= 2 ? Math.min(50, (level - 1) * 8) : 0 // 새를 닮은 잎사귀
    };
  }

  // 숨는 새 색: 앉은 자리 색을 아주 조금만 밝게/어둡게
  function tint(hex, amount) {
    var n = parseInt(hex.slice(1), 16);
    var c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(function (v) {
      return Math.max(0, Math.min(255, Math.round(v * (1 + amount))));
    });
    return '#' + c.map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  }

  function pick(list, r) { return list[Math.floor(r() * list.length)]; }

  // 하늘·땅은 위아래로 색이 바뀌므로(draw.js 그라데이션과 같은 색) 어려움의 새는 그 높이의 색을 쓴다.
  function mix(a, b, t) {
    var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16);
    var c = [16, 8, 0].map(function (sh) { return Math.round(((x >> sh) & 255) * (1 - t) + ((y >> sh) & 255) * t); });
    return '#' + c.map(function (v) { return (v < 16 ? '0' : '') + v.toString(16); }).join('');
  }
  function groundAt(scene, y) { return mix('#8fcf6a', '#5fae45', Math.max(0, Math.min(1, (y - scene.horizon) / (H - scene.horizon)))); }
  function skyAt(scene, y) { return mix('#8fd3ff', '#dff3ff', Math.max(0, Math.min(1, y / scene.horizon))); }

  function build(level, seed, mode) {
    var r = rng(seed);
    var hard = mode === 'hard';
    var info = levelInfo(level, mode);
    var horizon = Math.round(H * (0.42 + r() * 0.1));
    var scene = { level: level, seed: seed, mode: hard ? 'hard' : 'easy', W: W, H: H, horizon: horizon, clouds: [], hills: [], trees: [], bushes: [], tufts: [], flowers: [], litter: [], spots: [], decoys: [], fakes: [], birds: [], covers: [] };

    for (var c = 0; c < 3 + Math.floor(r() * 3); c++) {
      scene.clouds.push({ x: r() * W, y: 30 + r() * (horizon * 0.45), s: 0.6 + r() * 0.8 });
    }
    for (var h = 0; h < 3; h++) {
      scene.hills.push({ x: r() * W, y: horizon + 10 + h * 6, rx: 220 + r() * 260, ry: 60 + r() * 60, shade: h });
    }
    // 나무: 줄기 + 잎 덩어리(원) 여러 개
    for (var t = 0; t < info.trees; t++) {
      var tx = (t + 0.2 + r() * 0.6) / info.trees * W;
      var base = horizon + 40 + r() * (H - horizon - 90);
      var height = 140 + r() * 140;
      var crownY = base - height;
      var crownR = 55 + r() * 45;
      var blobs = [];
      for (var b = 0; b < 7 + Math.floor(r() * 5); b++) {
        var ang = r() * Math.PI * 2, dist = r() * crownR * 0.75;
        blobs.push({ x: tx + Math.cos(ang) * dist, y: crownY + Math.sin(ang) * dist * 0.75, r: crownR * (0.45 + r() * 0.35), color: pick(LEAF, r) });
      }
      scene.trees.push({ x: tx, base: base, top: crownY, trunk: 10 + r() * 10, blobs: blobs });
    }
    scene.trees.sort(function (a, b) { return a.base - b.base; }); // 먼 나무부터 그림
    for (var u = 0; u < (hard ? info.bushes : 7 + level); u++) {
      var bx = r() * W, by = horizon + 30 + r() * (H - horizon - 30);
      var parts = [];
      for (var p = 0; p < 4; p++) parts.push({ x: bx + (r() - 0.5) * 70, y: by - r() * 20, r: 22 + r() * 18, color: pick(LEAF, r) });
      scene.bushes.push({ x: bx, y: by, parts: parts });
    }
    scene.bushes.sort(function (a, b) { return a.y - b.y; });
    for (var g = 0; g < (hard ? 160 : 70); g++) scene.tufts.push({ x: r() * W, y: horizon + 15 + r() * (H - horizon - 15), s: 0.6 + r() * 0.8 });
    for (var f = 0; f < 25; f++) scene.flowers.push({ x: r() * W, y: horizon + 30 + r() * (H - horizon - 30), color: pick(['#fff', '#ffe066', '#ff8fab', '#c77dff'], r) });

    // 새가 앉을 수 있는 자리: 나무 잎 위, 덤불 위, 풀밭, (2단계부터) 하늘
    function spot() {
      var kind = r();
      if (kind < 0.5 && scene.trees.length) {
        var tree = pick(scene.trees, r), blob = pick(tree.blobs, r);
        var a = r() * Math.PI * 2, d = r() * blob.r * 0.8;
        return { x: blob.x + Math.cos(a) * d, y: blob.y + Math.sin(a) * d, pose: 'perch', under: blob.color };
      }
      if (kind < 0.72) {
        var bush = pick(scene.bushes, r), part = pick(bush.parts, r);
        return { x: part.x + (r() - 0.5) * part.r, y: part.y - r() * part.r * 0.6, pose: 'perch', under: part.color };
      }
      if (kind < 0.9 || (level < 2 && !hard)) {
        var gx = r() * W, gy = horizon + 30 + r() * (H - horizon - 40);
        return { x: gx, y: gy, pose: 'ground', under: hard ? groundAt(scene, gy) : '#6fbb52' };
      }
      var fx = r() * W, fy = 40 + r() * (horizon - 80);
      return { x: fx, y: fy, pose: 'fly', under: hard ? skyAt(scene, fy) : '#a9dcf5' };
    }
    // 어려움: 숲 전체에 작은 잎(무늬)과 눈처럼 보이는 까만 점을 깐다(새 아래에 그려짐).
    if (hard) {
      for (var li = 0; li < info.litter; li++) {
        var ls = spot();
        scene.litter.push({ x: ls.x, y: ls.y, r: 3 + r() * 4, rot: r() * Math.PI, color: tint(ls.under, (r() - 0.5) * 0.2) });
      }
      for (var si = 0; si < info.spots; si++) {
        var ss = spot();
        scene.spots.push({ x: ss.x, y: ss.y, r: 1 + r() * 0.9, color: tint(ss.under, -0.5 - r() * 0.2) });
      }
    }
    var size = info.size;
    var margin = size * 1.2;
    for (var tries = 0; scene.birds.length < info.birds && tries < 2000; tries++) {
      var s = spot();
      if (s.x < margin || s.x > W - margin || s.y < margin || s.y > H - margin) continue;
      var near = scene.birds.some(function (o) { return Math.hypot(o.x - s.x, o.y - s.y) < size * 3.2; });
      if (near) continue;
      var camo = r() < info.camo;
      var bird = { x: Math.round(s.x), y: Math.round(s.y), size: size, pose: s.pose, dir: r() < 0.5 ? -1 : 1, camo: camo,
        color: camo ? tint(s.under, (r() - 0.5) * (info.tintRange || 0.24)) : pick(BRIGHT, r), found: false };
      if (hard) bird.subtle = true;
      scene.birds.push(bird);
      // 잎이 새의 가장자리를 살짝 가린다(한가운데는 늘 보이게 새 크기만큼 떨어뜨림). 어려움은 두 장.
      if (hard) {
        var ca = r() * Math.PI * 2;
        for (var cv = 0; cv < info.covers; cv++) {
          var a2 = ca + cv * (2.2 + r());
          scene.covers.push({ x: bird.x + Math.cos(a2) * size * 0.95, y: bird.y + Math.sin(a2) * size * 0.75, r: size * 0.7,
            color: tint(s.under, (r() - 0.5) * 0.04) });
        }
      } else if (s.pose !== 'fly' && r() < info.hidden) {
        var ca1 = r() * Math.PI * 2;
        scene.covers.push({ x: bird.x + Math.cos(ca1) * size * 0.95, y: bird.y + Math.sin(ca1) * size * 0.75, r: size * 0.7, color: s.under === '#a9dcf5' ? pick(LEAF, r) : s.under });
      }
    }
    // 어려움: 눈 없는 가짜 새(새 모양 잎). 진짜 새와 판정이 안 헷갈리게 멀리 둔다.
    for (var fk = 0; scene.fakes.length < (info.fakes || 0) && fk < 800; fk++) {
      var fs = spot();
      if (fs.x < margin || fs.x > W - margin || fs.y < margin || fs.y > H - margin) continue;
      if (scene.birds.some(function (o) { return Math.hypot(o.x - fs.x, o.y - fs.y) < size * 2.6; })) continue;
      scene.fakes.push({ x: Math.round(fs.x), y: Math.round(fs.y), size: size * (0.9 + r() * 0.2), pose: fs.pose, dir: r() < 0.5 ? -1 : 1,
        color: tint(fs.under, (r() - 0.5) * 0.06), subtle: true, camo: true, fake: true });
    }
    // 새 색깔을 닮은 잎사귀(헷갈리게) — 새와 너무 가까우면 빼서 판정이 헷갈리지 않게
    for (var k = 0; scene.decoys.length < info.decoys && k < 500; k++) {
      var ds = spot();
      if (scene.birds.some(function (o) { return Math.hypot(o.x - ds.x, o.y - ds.y) < size * 2; })) continue;
      scene.decoys.push({ x: ds.x, y: ds.y, r: size * (0.35 + r() * 0.25), rot: r() * Math.PI,
        color: hard ? tint(ds.under, (r() - 0.5) * 0.12) : r() < 0.25 ? pick(BRIGHT, r) : (ds.under ? tint(ds.under, (r() - 0.5) * 0.3) : pick(CAMO, r)) });
    }
    return scene;
  }

  // 누른 자리(논리 좌표)에서 가장 가까운 아직 못 찾은 새(판정 거리 안). 없으면 null.
  function hit(scene, x, y) {
    var best = null, bestD = Infinity;
    scene.birds.forEach(function (b) {
      if (b.found) return;
      var d = Math.hypot(b.x - x, b.y - y);
      if (d <= b.size * HIT_SCALE && d < bestD) { best = b; bestD = d; }
    });
    return best;
  }

  function remaining(scene) {
    return scene.birds.filter(function (b) { return !b.found; }).length;
  }

  // 새 하나 찾을 때 점수, 단계를 깼을 때 남은 시간 점수
  function birdPoints(level) { return 50 + level * 10; }
  function clearBonus(secondsLeft) { return Math.max(0, Math.floor(secondsLeft)) * 5; }

  var api = { MODES: MODES, W: W, H: H, LEVEL_SECONDS: LEVEL_SECONDS, WRONG_PENALTY: WRONG_PENALTY, HIT_SCALE: HIT_SCALE, SCORE_MAX: SCORE_MAX,
    rng: rng, levelInfo: levelInfo, build: build, hit: hit, remaining: remaining, birdPoints: birdPoints, clearBonus: clearBonus };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.BirdFind = root.BirdFind || {}; root.BirdFind.Scene = api; }
})(typeof window !== 'undefined' ? window : this);
