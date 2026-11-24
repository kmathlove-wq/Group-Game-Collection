// ===== save.js =====
// 깡통 소탕대 저장(localStorage 'tin-squad:save')과 상점 목록. 이상한 값은 걸러 낸다(브라우저 · Node 겸용).
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.TinSquad = root.TinSquad || {}; root.TinSquad.Save = api; }
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';
  var KEY = 'tin-squad:save', STAGES = 40;
  // 상점: 단계마다 값(prices 길이 = 최대 단계)
  var SHOP = [
    { id: 'heart', icon: '❤️', name: '튼튼 심장', desc: '최대 하트가 한 칸 늘어요', prices: [120, 320, 700] },
    { id: 'power', icon: '💥', name: '강철 나사', desc: '모든 공격이 12%씩 세져요', prices: [80, 160, 280, 450, 700] },
    { id: 'life', icon: '🧢', name: '여분 목숨', desc: '판마다 목숨이 하나 늘어요', prices: [200, 500] },
    { id: 'jump', icon: '🦘', name: '스프링 신발', desc: '공중에서 한 번 더 뛰어요(2단 점프)', prices: [350] },
    { id: 'bomb', icon: '💣', name: '폭탄 주머니', desc: '시작할 때 폭탄 2개 더', prices: [60, 120, 220, 350] },
    { id: 'ammo', icon: '🔋', name: '큰 탄약통', desc: '주운 총의 탄약이 20%씩 늘어요', prices: [70, 150, 260, 400] },
    { id: 'magnet', icon: '🧲', name: '동전 자석', desc: '멀리 있는 동전도 끌어와요', prices: [50, 130, 260] },
    { id: 'combo', icon: '🔥', name: '콤보 시계', desc: '콤보가 0.5초 더 오래 이어져요', prices: [90, 200, 380] },
    { id: 'box', icon: '🎁', name: '깜짝 무기 상자', desc: '판을 시작할 때 특별한 총을 하나 들고 시작해요', prices: [600] }
  ];
  function num(v, max) { v = Math.floor(Number(v)); return Number.isFinite(v) && v > 0 ? Math.min(v, max) : 0; }
  function clean(raw) {
    raw = raw && typeof raw === 'object' ? raw : {};
    var d = { v: 1, coins: num(raw.coins, 9999999), stars: [], best: [], up: {}, skin: 'orange', skins: ['orange'], towerBest: num(raw.towerBest, 9999), towerScore: num(raw.towerScore, 99999999) };
    for (var i = 0; i < STAGES; i++) {
      d.stars.push(num(raw.stars && raw.stars[i], 3));
      d.best.push(num(raw.best && raw.best[i], 9999999));
    }
    SHOP.forEach(function (it) { var lv = num(raw.up && raw.up[it.id], it.prices.length); if (lv) d.up[it.id] = lv; });
    if (Array.isArray(raw.skins)) raw.skins.slice(0, 30).forEach(function (s) { if (typeof s === 'string' && /^[a-z]{2,12}$/.test(s) && d.skins.indexOf(s) < 0) d.skins.push(s); });
    if (d.skins.indexOf(raw.skin) >= 0) d.skin = raw.skin;
    return d;
  }
  function load() { try { return clean(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return clean({}); } }
  function store(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 저장을 못 하는 브라우저 */ } }
  function unlocked(d, i) { return i === 0 || d.stars[i - 1] > 0; }
  function totalStars(d) { return d.stars.reduce(function (a, b) { return a + b; }, 0); }
  function totalScore(d) { return d.best.reduce(function (a, b) { return a + b; }, 0); }
  // 업그레이드 사기: 성공하면 true
  function buy(d, id) {
    var it = SHOP.filter(function (x) { return x.id === id; })[0];
    if (!it) return false;
    var lv = d.up[id] || 0, price = it.prices[lv];
    if (price == null || d.coins < price) return false;
    d.coins -= price; d.up[id] = lv + 1;
    return true;
  }
  // 판을 깼을 때: 새 별마다 동전 선물, 최고 점수 갱신
  function finish(d, i, stars, score, coins) {
    var newStars = Math.max(0, stars - d.stars[i]), bonus = newStars * 25 + 20 + Math.floor(i / 5) * 5, first = d.stars[i] === 0;
    d.coins += coins + bonus;
    d.stars[i] = Math.max(d.stars[i], stars);
    var record = score > d.best[i];
    if (record) d.best[i] = Math.min(9999999, score);
    return { bonus: bonus, record: record && !first, first: first };
  }
  return { KEY: KEY, STAGES: STAGES, SHOP: SHOP, clean: clean, load: load, store: store, unlocked: unlocked, totalStars: totalStars, totalScore: totalScore, buy: buy, finish: finish };
});
