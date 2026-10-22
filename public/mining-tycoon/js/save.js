// ===== save.js =====
// 게임 상태를 글자 한 덩어리로 바꿔 브라우저(localStorage)에 저장하고 다시 불러온다.
// 땅 칸(40x301)은 칸마다 숫자 한 글자('0'~'8')로 이어 붙인다.
(function (MT) {
  var Rules = MT.Rules || require('./rules.js');
  var Game = MT.Game || require('./game.js');

  var SAVE_KEY = 'mining-tycoon:save:v1';
  var NAME_KEY = 'mining-tycoon:nickname';
  var SOUND_KEY = 'mining-tycoon:sound';

  function packBytes(bytes) {
    var parts = [];
    for (var i = 0; i < bytes.length; i += 4096) {
      parts.push(String.fromCharCode.apply(null, Array.prototype.map.call(bytes.subarray(i, i + 4096), function (v) { return 48 + v; })));
    }
    return parts.join('');
  }

  function unpackBytes(text, length, max) {
    if (typeof text !== 'string' || text.length !== length) throw new Error('땅 크기가 맞지 않음');
    var out = new Uint8Array(length);
    for (var i = 0; i < length; i++) {
      var v = text.charCodeAt(i) - 48;
      if (!(v >= 0 && v <= max)) throw new Error('땅 칸 값이 이상함');
      out[i] = v;
    }
    return out;
  }

  function serialize(s) {
    return JSON.stringify({
      version: 1,
      name: s.name,
      playerId: s.playerId,
      world: { w: s.world.w, h: s.world.h, seed: s.world.seed, tiles: packBytes(s.world.tiles), ores: packBytes(s.world.ores), seen: packBytes(s.world.seen) },
      car: { x: s.car.x, y: s.car.y, face: s.car.face },
      levels: s.levels,
      bag: s.bag,
      fuel: s.fuel, hp: s.hp, money: s.money, debt: s.debt, earned: s.earned,
      recall: s.recall, wide: s.wide, time: s.time, treasureTime: s.treasureTime, maxDepth: s.maxDepth
    });
  }

  function num(value, min, max) {
    if (typeof value !== 'number' || !isFinite(value) || value < min || value > max) throw new Error('숫자가 이상함');
    return value;
  }

  // 저장 글자를 게임 상태로 되돌린다. 조금이라도 이상하면 오류를 던진다(화면은 새 게임으로 시작).
  function deserialize(text) {
    var d = JSON.parse(text);
    if (!d || d.version !== 1 || !d.world || !d.car || !d.levels) throw new Error('저장 형식이 다름');
    var w = d.world.w, h = d.world.h;
    if (w !== Rules.WIDTH || h !== Rules.DEPTH + 1) throw new Error('땅 크기가 다름');
    var s = Game.newGame({ seed: 1, name: String(d.name || '이름없음').slice(0, 20), playerId: String(d.playerId || '') });
    var oreMax = Rules.ORES.length - 1;
    s.world = { w: w, h: h, seed: d.world.seed >>> 0, tiles: unpackBytes(d.world.tiles, w * h, 7), ores: unpackBytes(d.world.ores, w * h, oreMax), seen: unpackBytes(d.world.seen, w * h, 1) };
    Rules.UPGRADE_ORDER.forEach(function (key) {
      var level = d.levels[key];
      if (!Number.isInteger(level) || level < 0 || level > Rules.UPGRADES[key].prices.length) throw new Error('업그레이드 단계가 이상함');
      s.levels[key] = level;
    });
    if (!Array.isArray(d.bag) || d.bag.length !== oreMax + 1) throw new Error('가방이 이상함');
    s.bag = d.bag.map(function (n) { if (!Number.isInteger(n) || n < 0) throw new Error('가방이 이상함'); return n; });
    s.car.x = num(d.car.x, 0, w);
    s.car.y = num(d.car.y, -10, h);
    s.car.face = d.car.face === -1 ? -1 : 1;
    s.fuel = num(d.fuel, 0, Game.fuelCap(s));
    s.hp = num(d.hp, 0, Game.hpCap(s));
    s.money = num(d.money, 0, Number.MAX_SAFE_INTEGER);
    s.debt = num(d.debt, 0, Number.MAX_SAFE_INTEGER);
    s.earned = num(d.earned, 0, Number.MAX_SAFE_INTEGER);
    s.recall = num(d.recall, 0, 1e6);
    s.time = num(d.time, 0, 1e9);
    s.maxDepth = num(d.maxDepth, 0, h);
    s.treasureTime = d.treasureTime == null ? null : num(d.treasureTime, 0, 1e9);
    s.wide = d.wide !== false;
    if (s.hp <= 0) s.hp = Game.hpCap(s);
    Game.fixStuck(s);
    return s;
  }

  function storageGet(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function storageSet(key, value) { try { localStorage.setItem(key, value); return true; } catch (e) { return false; } }
  function storageRemove(key) { try { localStorage.removeItem(key); } catch (e) {} }

  // 저장된 게임: { state } 또는 { broken: true }(망가짐) 또는 null(없음).
  function load() {
    var text = storageGet(SAVE_KEY);
    if (!text) return null;
    try { return { state: deserialize(text) }; } catch (e) { return { broken: true }; }
  }

  var Save = {
    serialize: serialize,
    deserialize: deserialize,
    load: load,
    save: function (s) { return storageSet(SAVE_KEY, serialize(s)); },
    clear: function () { storageRemove(SAVE_KEY); },
    getName: function () { return storageGet(NAME_KEY) || ''; },
    setName: function (name) { storageSet(NAME_KEY, name); },
    soundOn: function () { return storageGet(SOUND_KEY) !== 'off'; },
    setSound: function (on) { storageSet(SOUND_KEY, on ? 'on' : 'off'); }
  };

  MT.Save = Save;
  if (typeof module !== 'undefined' && module.exports) module.exports = Save;
})(typeof window !== 'undefined' ? (window.MT = window.MT || {}) : {});
