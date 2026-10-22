// ===== save.js =====
// 게임 상태를 글자 한 덩어리로 바꿔 브라우저(localStorage)에 저장하고 다시 불러온다.
// 땅 칸(40x1001)은 칸마다 숫자 한 글자('0'~)로 이어 붙인다.
// 버전 1(땅 300m) 저장도 불러온다: 위 300m는 그대로 옮기고, 아래는 같은 씨앗으로 새로 만들어 붙인다.
(function (MT) {
  var Rules = MT.Rules || require('./rules.js');
  var World = MT.World || require('./world.js');
  var Game = MT.Game || require('./game.js');

  var SAVE_KEY = 'mining-tycoon:save:v1'; // 키 이름은 그대로 두고 안의 version으로 구분한다
  var NAME_KEY = 'mining-tycoon:nickname';
  var SOUND_KEY = 'mining-tycoon:sound';
  var DESTROYED_KEY = 'mining-tycoon:destroyed'; // 🌍 지구를 부순 횟수(새 게임을 해도 남음)
  var ORE_MAX = Rules.ORES.length - 1;
  var V1_ORE_MAX = 8;
  var V1_TILE_MAX = 7;

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
      version: 2,
      name: s.name,
      playerId: s.playerId,
      world: { w: s.world.w, h: s.world.h, seed: s.world.seed, tiles: packBytes(s.world.tiles), ores: packBytes(s.world.ores), seen: packBytes(s.world.seen) },
      car: { x: s.car.x, y: s.car.y, face: s.car.face },
      levels: s.levels,
      bag: s.bag,
      fuel: s.fuel, hp: s.hp, money: s.money, debt: s.debt, earned: s.earned,
      recall: s.recall, instant: s.instant, ticket: s.ticket, wide: s.wide, time: s.time,
      treasureTime: s.treasureTime, destroyedTime: s.destroyedTime, maxDepth: s.maxDepth,
      inCore: s.inCore, autoEarned: s.autoEarned, autoBought: s.autoBought,
      autos: s.autos.map(function (a) { return { x: a.x, y: a.y, dir: a.dir, life: Math.round(a.life * 10) / 10, lifeMax: a.lifeMax }; })
    });
  }

  function num(value, min, max) {
    if (typeof value !== 'number' || !isFinite(value) || value < min || value > max) throw new Error('숫자가 이상함');
    return value;
  }
  function int(value, min, max) {
    if (!Number.isInteger(value)) throw new Error('정수가 아님');
    return num(value, min, max);
  }

  // 버전 1의 땅(301줄)을 새 땅(1001줄) 위쪽에 옮겨 담는다.
  function upgradeWorld(old) {
    var w = Rules.WIDTH;
    var oldH = Rules.OLD_DEPTH + 1;
    if (old.w !== w || old.h !== oldH) throw new Error('땅 크기가 다름');
    var fresh = World.createWorld(old.seed >>> 0);
    var keep = Rules.OLD_DEPTH * w; // 0~299줄(1~300m)만 옮긴다. 300줄(옛 바닥)은 새 지각 바닥(SEAL)으로 둔다.
    fresh.tiles.set(unpackBytes(old.tiles, w * oldH, V1_TILE_MAX).subarray(0, keep));
    fresh.ores.set(unpackBytes(old.ores, w * oldH, V1_ORE_MAX).subarray(0, keep));
    fresh.seen.set(unpackBytes(old.seen, w * oldH, 1).subarray(0, keep));
    return fresh;
  }

  // 저장 글자를 게임 상태로 되돌린다. 조금이라도 이상하면 오류를 던진다(화면은 새 게임으로 시작).
  function deserialize(text) {
    var d = JSON.parse(text);
    if (!d || (d.version !== 1 && d.version !== 2) || !d.world || !d.car || !d.levels) throw new Error('저장 형식이 다름');
    var s = Game.newGame({ seed: 1, name: String(d.name || '이름없음').slice(0, 20), playerId: String(d.playerId || '') });
    if (d.version === 1) {
      s.world = upgradeWorld(d.world);
    } else {
      var w = d.world.w, h = d.world.h;
      if (w !== Rules.WIDTH || h !== Rules.DEPTH + 1) throw new Error('땅 크기가 다름');
      s.world = { w: w, h: h, seed: d.world.seed >>> 0, tiles: unpackBytes(d.world.tiles, w * h, Rules.TILE_MAX), ores: unpackBytes(d.world.ores, w * h, ORE_MAX), seen: unpackBytes(d.world.seen, w * h, 1) };
    }
    Rules.UPGRADE_ORDER.forEach(function (key) {
      var level = d.levels[key] == null && d.version === 1 ? 0 : d.levels[key];
      s.levels[key] = int(level, 0, Rules.UPGRADES[key].prices.length);
    });
    var bagLength = d.version === 1 ? V1_ORE_MAX + 1 : ORE_MAX + 1;
    if (!Array.isArray(d.bag) || d.bag.length !== bagLength) throw new Error('가방이 이상함');
    s.bag = Game.emptyBag();
    d.bag.forEach(function (n, i) { s.bag[i] = int(n, 0, 1e6); });
    s.inCore = d.inCore === true;
    var room = Game.world(s);
    s.car.x = num(d.car.x, 0, room.w);
    s.car.y = num(d.car.y, -10, room.h);
    s.car.face = d.car.face === -1 ? -1 : 1;
    s.fuel = num(d.fuel, 0, Game.fuelCap(s));
    s.hp = num(d.hp, 0, Game.hpCap(s));
    s.money = num(d.money, 0, Number.MAX_SAFE_INTEGER);
    s.debt = num(d.debt, 0, Number.MAX_SAFE_INTEGER);
    s.earned = num(d.earned, 0, Number.MAX_SAFE_INTEGER);
    s.recall = int(d.recall, 0, 1e6);
    s.instant = d.instant == null ? 0 : int(d.instant, 0, Rules.INSTANT_MAX);
    s.ticket = d.ticket == null ? 0 : int(d.ticket, 0, 1);
    s.time = num(d.time, 0, 1e9);
    s.maxDepth = num(d.maxDepth, 0, s.world.h);
    s.treasureTime = d.treasureTime == null ? null : num(d.treasureTime, 0, 1e9);
    s.destroyedTime = d.destroyedTime == null ? null : num(d.destroyedTime, 0, 1e9);
    s.autoEarned = d.autoEarned == null ? 0 : num(d.autoEarned, 0, Number.MAX_SAFE_INTEGER);
    s.autoBought = d.autoBought == null ? 0 : int(d.autoBought, 0, 1e9);
    s.autos = (Array.isArray(d.autos) ? d.autos : []).slice(0, Rules.AUTO_MAX).map(function (a) {
      var x = int(a.x, 0, s.world.w - 1), y = int(a.y, -1, s.world.h - 2);
      var lifeMax = num(a.lifeMax, 1, 1e4);
      return { x: x, y: y, tx: x, ty: y, mode: null, p: 0, dur: 1, dir: a.dir === -1 ? -1 : 1, side: 0, wait: 0, life: num(a.life, 0, lifeMax), lifeMax: lifeMax };
    });
    s.wide = d.wide !== false;
    if (s.treasureTime != null) World.openSeal(s.world); // 예전 저장에서 이미 보물을 찾았으면 바로 열려 있다
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
    setSound: function (on) { storageSet(SOUND_KEY, on ? 'on' : 'off'); },
    destroyedCount: function () { var n = parseInt(storageGet(DESTROYED_KEY), 10); return n > 0 ? n : 0; },
    addDestroyed: function () { var n = Save.destroyedCount() + 1; storageSet(DESTROYED_KEY, String(n)); return n; }
  };

  MT.Save = Save;
  if (typeof module !== 'undefined' && module.exports) module.exports = Save;
})(typeof window !== 'undefined' ? (window.MT = window.MT || {}) : {});
