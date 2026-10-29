// ===== rules.js =====
// 탐조 여행의 규칙(화면을 모름): 포인트·새 나오기·미션·상점·저장 다듬기.
// 브라우저(window.Birdwatch.Rules)와 Node 시험이 함께 쓴다. 저장 키는 main.js의 'birdwatch:save'.
(function (root) {
  'use strict';

  var D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.Birdwatch.Data;

  var LOG_MAX = 300;            // 기록장에 남기는 최대 줄 수
  var POINTS_MAX = 999999999;
  var SCOPE_COSTS = [120, 300, 600, 1000];   // 망원경 1~4단계 값(새가 천천히, 오래 머묾)
  var FEED_COSTS = [100, 250, 500, 900];     // 새 모이 1~4단계 값(새가 더 많이, 자주 나옴)
  var MAX_LEVEL = 4;

  // ----- 새가 나오는 규칙 -----
  // 등급별로 얼마나 머무는지(초): 희귀할수록 빨리 날아간다. 망원경 단계마다 30%씩 더 머문다.
  var STAY = { common: 10, normal: 8, rare: 6, legend: 4.5 };
  // 하늘을 가로지르는 데 걸리는 시간(초): 작을수록 빠름. 망원경 단계마다 25%씩 느려진다.
  var CROSS = { common: 9, normal: 7.5, rare: 6, legend: 5 };

  function stayTime(rarity, scope) { return (STAY[rarity] || 8) * (1 + 0.3 * clampLevel(scope)); }
  function crossTime(rarity, scope) { return (CROSS[rarity] || 8) * (1 + 0.25 * clampLevel(scope)); }
  function maxBirds(feed) { return 3 + clampLevel(feed); }                  // 한 화면 최대 새 수 3~7
  function spawnGap(feed) { return Math.max(0.9, 2.4 - 0.35 * clampLevel(feed)); } // 새가 나오는 간격(초)

  function clampLevel(n) { n = Math.floor(Number(n) || 0); return Math.max(0, Math.min(MAX_LEVEL, n)); }

  // 지역 새 가운데 하나를 등급 무게로 고른다(rand는 0~1을 돌려주는 함수).
  function pickBird(regionId, rand) {
    var r = D.region(regionId);
    if (!r) return null;
    var list = r.birds.map(function (id) { return D.bird(id); });
    var total = 0;
    list.forEach(function (b) { total += D.RARITIES[b.rarity].weight; });
    var x = (rand || Math.random)() * total;
    for (var i = 0; i < list.length; i++) {
      x -= D.RARITIES[list[i].rarity].weight;
      if (x < 0) return list[i];
    }
    return list[list.length - 1];
  }

  function pointsFor(birdId, isNew) {
    var b = D.bird(birdId);
    if (!b) return 0;
    var r = D.RARITIES[b.rarity];
    return isNew ? r.points : r.again;
  }

  // ----- 저장 -----
  function defaultRegions() {
    return D.REGIONS.filter(function (r) { return r.cost === 0; }).map(function (r) { return r.id; });
  }
  function newSave() {
    return { v: 1, points: 0, earned: 0, dex: {}, log: [], regions: defaultRegions(), scope: 0, feed: 0,
      mission: 0, bought: 0, sightings: 0, current: 'park' };
  }

  function int(n, min, max) {
    n = Math.floor(Number(n));
    if (!isFinite(n)) return min;
    return Math.max(min, Math.min(max, n));
  }

  // 저장 값을 믿지 않고 모르는 값·범위 밖 값을 걸러 낸다.
  function sanitize(raw) {
    var s = newSave();
    if (!raw || typeof raw !== 'object') return s;
    s.points = int(raw.points, 0, POINTS_MAX);
    s.earned = int(raw.earned, 0, POINTS_MAX);
    s.scope = clampLevel(raw.scope);
    s.feed = clampLevel(raw.feed);
    s.mission = int(raw.mission, 0, MISSIONS.length);
    s.bought = int(raw.bought, 0, 1000);
    s.sightings = int(raw.sightings, 0, 1e9);
    if (raw.dex && typeof raw.dex === 'object') {
      Object.keys(raw.dex).forEach(function (id) {
        var e = raw.dex[id];
        if (!D.bird(id) || !e || typeof e !== 'object') return;
        s.dex[id] = { count: int(e.count, 1, 1e9), first: int(e.first, 0, 8.64e15),
          where: D.region(e.where) ? e.where : '' };
      });
    }
    if (Array.isArray(raw.regions)) {
      raw.regions.forEach(function (id) {
        if (D.region(id) && s.regions.indexOf(id) < 0) s.regions.push(id);
      });
    }
    if (Array.isArray(raw.log)) {
      raw.log.slice(-LOG_MAX).forEach(function (e) {
        if (!e || !D.bird(e.bird) || !D.region(e.region)) return;
        s.log.push({ t: int(e.t, 0, 8.64e15), bird: e.bird, region: e.region, isNew: !!e.isNew });
      });
    }
    if (D.region(raw.current) && s.regions.indexOf(raw.current) >= 0) s.current = raw.current;
    return s;
  }

  // ----- 새를 찾았을 때 -----
  // 저장을 바꾸고 { isNew, points, missions: [다 한 미션들] }을 돌려준다.
  function recordSighting(save, birdId, regionId, now) {
    if (!D.bird(birdId) || !D.region(regionId)) return null;
    var isNew = !save.dex[birdId];
    if (isNew) save.dex[birdId] = { count: 1, first: now || 0, where: regionId };
    else save.dex[birdId].count = Math.min(1e9, save.dex[birdId].count + 1);
    var pts = pointsFor(birdId, isNew);
    addPoints(save, pts);
    save.sightings = Math.min(1e9, (save.sightings || 0) + 1);
    save.log.push({ t: now || 0, bird: birdId, region: regionId, isNew: isNew });
    if (save.log.length > LOG_MAX) save.log.splice(0, save.log.length - LOG_MAX);
    return { isNew: isNew, points: pts, missions: advanceMissions(save) };
  }

  function addPoints(save, n) {
    save.points = Math.min(POINTS_MAX, save.points + n);
    save.earned = Math.min(POINTS_MAX, (save.earned || 0) + n);
  }

  // ----- 도감 통계 -----
  function stats(save) {
    var st = { species: 0, common: 0, normal: 0, rare: 0, legend: 0, water: 0, shore: 0, monument: 0,
      endangered: 0, regionsSeen: 0, unlocked: save.regions.length, bought: save.bought || 0,
      sightings: save.sightings || 0, total: D.BIRDS.length };
    Object.keys(save.dex).forEach(function (id) {
      var b = D.bird(id);
      if (!b) return;
      st.species++;
      st[b.rarity]++;
      var where = D.SHAPES[b.shape];
      if (where === 'water') st.water++;
      if (where === 'shore') st.shore++;
      if (b.monument) st.monument++;
      if (b.endangered) st.endangered++;
    });
    var seen = {};
    save.log.forEach(function (e) { seen[e.region] = true; });
    Object.keys(save.dex).forEach(function (id) { if (save.dex[id].where) seen[save.dex[id].where] = true; });
    st.regionsSeen = Object.keys(seen).length;
    return st;
  }

  // 지역에서 본 새 수
  function regionProgress(save, regionId) {
    var r = D.region(regionId);
    if (!r) return { seen: 0, total: 0 };
    return { seen: r.birds.filter(function (id) { return !!save.dex[id]; }).length, total: r.birds.length };
  }

  // ----- 미션(차례로 하나씩) -----
  // key = stats()의 칸, goal = 목표, reward = 받는 포인트
  var MISSIONS = [
    { title: '첫 번째 새 발견하기', key: 'species', goal: 1, reward: 20 },
    { title: '흔한 새 3종 발견하기', key: 'common', goal: 3, reward: 30 },
    { title: '도감 5종 채우기', key: 'species', goal: 5, reward: 40 },
    { title: '상점에서 물건 하나 사기', key: 'bought', goal: 1, reward: 30 },
    { title: '물 위에 뜬 물새 1종 만나기', key: 'water', goal: 1, reward: 40 },
    { title: '보통 새 3종 발견하기', key: 'normal', goal: 3, reward: 60 },
    { title: '새 지역 하나 더 열기', key: 'unlocked', goal: 4, reward: 80 },
    { title: '3곳의 지역에서 새 발견하기', key: 'regionsSeen', goal: 3, reward: 80 },
    { title: '희귀 새 1종 발견하기', key: 'rare', goal: 1, reward: 100 },
    { title: '천연기념물 새 1종 만나기', key: 'monument', goal: 1, reward: 100 },
    { title: '물가에 서 있는 새 3종 만나기', key: 'shore', goal: 3, reward: 100 },
    { title: '도감 20종 채우기', key: 'species', goal: 20, reward: 150 },
    { title: '새 관찰 100번 하기', key: 'sightings', goal: 100, reward: 150 },
    { title: '멸종위기 새 3종 만나기', key: 'endangered', goal: 3, reward: 200 },
    { title: '전설 새 1종 발견하기', key: 'legend', goal: 1, reward: 250 },
    { title: '도감 40종 채우기', key: 'species', goal: 40, reward: 300 },
    { title: '모든 지역 열기', key: 'unlocked', goal: D.REGIONS.length, reward: 400 },
    { title: '도감 전부 채우기', key: 'species', goal: D.BIRDS.length, reward: 1000 }
  ];

  // 지금 미션 { index, mission, value, done } (모두 끝냈으면 mission이 null)
  function currentMission(save) {
    var m = MISSIONS[save.mission] || null;
    if (!m) return { index: save.mission, mission: null, value: 0, done: true };
    var v = Math.min(m.goal, stats(save)[m.key] || 0);
    return { index: save.mission, mission: m, value: v, done: v >= m.goal };
  }

  // 다 한 미션은 상을 주고 다음으로 넘어간다(여러 개를 한꺼번에 깰 수도 있음).
  function advanceMissions(save) {
    var done = [];
    for (;;) {
      var c = currentMission(save);
      if (!c.mission || !c.done) break;
      addPoints(save, c.mission.reward);
      done.push(c.mission);
      save.mission++;
    }
    return done;
  }

  // ----- 상점 -----
  function upgradeCost(kind, level) {
    var table = kind === 'scope' ? SCOPE_COSTS : kind === 'feed' ? FEED_COSTS : null;
    if (!table) return null;
    return level >= MAX_LEVEL ? null : table[level];
  }

  // 사기: { ok, error, missions }  error = 'max'(끝 단계)·'points'(포인트 모자람)·'unknown'·'owned'
  function buyUpgrade(save, kind) {
    if (kind !== 'scope' && kind !== 'feed') return { ok: false, error: 'unknown' };
    var cost = upgradeCost(kind, save[kind]);
    if (cost == null) return { ok: false, error: 'max' };
    if (save.points < cost) return { ok: false, error: 'points' };
    save.points -= cost;
    save[kind]++;
    save.bought = Math.min(1000, (save.bought || 0) + 1);
    return { ok: true, cost: cost, missions: advanceMissions(save) };
  }

  function unlockRegion(save, regionId) {
    var r = D.region(regionId);
    if (!r) return { ok: false, error: 'unknown' };
    if (save.regions.indexOf(regionId) >= 0) return { ok: false, error: 'owned' };
    if (save.points < r.cost) return { ok: false, error: 'points' };
    save.points -= r.cost;
    save.regions.push(regionId);
    save.bought = Math.min(1000, (save.bought || 0) + 1);
    return { ok: true, cost: r.cost, missions: advanceMissions(save) };
  }

  var api = { LOG_MAX: LOG_MAX, POINTS_MAX: POINTS_MAX, SCOPE_COSTS: SCOPE_COSTS, FEED_COSTS: FEED_COSTS,
    MAX_LEVEL: MAX_LEVEL, MISSIONS: MISSIONS,
    stayTime: stayTime, crossTime: crossTime, maxBirds: maxBirds, spawnGap: spawnGap, pickBird: pickBird,
    pointsFor: pointsFor, newSave: newSave, sanitize: sanitize, recordSighting: recordSighting, stats: stats,
    regionProgress: regionProgress, currentMission: currentMission, advanceMissions: advanceMissions,
    upgradeCost: upgradeCost, buyUpgrade: buyUpgrade, unlockRegion: unlockRegion };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.Birdwatch = root.Birdwatch || {}; root.Birdwatch.Rules = api; }
})(typeof window !== 'undefined' ? window : this);
