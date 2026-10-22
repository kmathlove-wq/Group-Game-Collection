// ===== world.js =====
// 땅 만들기. 새 게임을 시작할 때 한 번 무작위로 만들고, 그 뒤로는 저장 파일에서 불러온다.
// 칸 종류(tiles)와 광석(ores)은 따로 담는다: 광석이 든 칸을 파면 칸은 비지만, 가방이 가득 차서
// 못 주운 광석은 빈 칸에 떨어진 채로 남아 나중에 주울 수 있다.
(function (MT) {
  var Rules = MT.Rules || require('./rules.js');
  var TILE = Rules.TILE;

  // 같은 씨앗(seed)이면 언제나 같은 수열을 내는 작은 난수 생성기(mulberry32).
  function makeRandom(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 깊이(m)에 따라 이 칸에 어떤 광석을 넣을지 정한다. 광석 번호(1~8) 또는 0(광석 없음)을 돌려준다.
  // TODO(직접 해 보기): 지금은 "12% 확률로, 이 깊이에서 나올 수 있는 가장 비싼 광석 3종 중 하나"라는
  // 아주 단순한 규칙이에요. 아래를 고쳐서 광석이 나오는 방식을 직접 정해 보세요. 예를 들면
  //   - 깊을수록 광석이 더 자주 나오게 (확률을 depth에 따라 키우기)
  //   - 비싼 광석일수록 드물게 (석탄은 자주, 다이아몬드는 아주 가끔)
  //   - 처음 나오는 깊이 근처에서는 드물다가 점점 많아지게
  // 쓸 수 있는 재료: depth(1~300), rand()(0 이상 1 미만의 무작위 수), Rules.ORES[번호].minDepth
  function oreAt(depth, rand) {
    if (rand() >= 0.12) return 0;
    var deepest = 1;
    for (var i = 1; i < Rules.ORES.length; i++) {
      if (depth >= Rules.ORES[i].minDepth) deepest = i;
    }
    return Math.max(1, deepest - Math.floor(rand() * 3));
  }

  // 깊이에 맞는 땅 종류. 경계 근처(±6m)는 섞여서 자연스럽게 바뀐다(지각과 맨틀 경계만은 섞지 않음).
  function groundAt(depth, rand) {
    var jitter = (rand() - 0.5) * 12;
    var d = depth + jitter;
    if (depth <= Rules.CRUST_DEPTH) {
      if (d < Rules.STONE_DEPTH) return TILE.DIRT;
      if (d < Rules.ROCK_DEPTH) return TILE.STONE;
      return TILE.ROCK;
    }
    if (d < Rules.LAYERS[2].from) return TILE.MANTLE;
    if (d < Rules.LAYERS[3].from) return TILE.OUTER;
    return TILE.INNER;
  }

  // 용암이 나올 확률: 100m부터 깊을수록 많아지고, 맨틀에 가장 많다. 외핵·내핵에는 없다(열 피해만).
  function lavaChance(depth) {
    if (depth < Rules.LAVA_DEPTH) return 0;
    if (depth < 150) return 0.02;
    if (depth < 250) return 0.04;
    if (depth <= Rules.CRUST_DEPTH) return 0.06;
    if (depth < Rules.LAYERS[2].from) return Rules.MANTLE_LAVA;
    return 0;
  }

  function createWorld(seed) {
    var rand = makeRandom(seed);
    var w = Rules.WIDTH;
    var h = Rules.DEPTH + 1; // 마지막 줄은 못 파는 바닥(내핵처럼 보임)
    var seal = Rules.CRUST_DEPTH; // 이 줄(301m)은 보물을 찾기 전까지 막힌 지각 바닥
    var tiles = new Uint8Array(w * h);
    var ores = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) {
      var depth = y + 1;
      for (var x = 0; x < w; x++) {
        var i = y * w + x;
        if (y === h - 1) { tiles[i] = TILE.CORE_FLOOR; continue; }
        if (y === 0 && x < Rules.PAD_WIDTH) { tiles[i] = TILE.CONCRETE; continue; }
        if (y === seal) { tiles[i] = TILE.SEAL; ores[i] = oreAt(depth, rand); continue; }
        if (rand() < lavaChance(depth)) { tiles[i] = TILE.LAVA; continue; }
        tiles[i] = groundAt(depth, rand);
        ores[i] = oreAt(depth, rand);
      }
    }
    // 지각 맨 아래 줄(300m)에 전설의 보물 하나. 둘레의 용암은 바위로 바꿔 보물에 닿을 수 있게 한다.
    var tx = 2 + Math.floor(rand() * (w - 4));
    var ty = Rules.CRUST_DEPTH - 1;
    for (var dy = -2; dy <= 0; dy++) {
      for (var dx = -2; dx <= 2; dx++) {
        var j = (ty + dy) * w + (tx + dx);
        if (tiles[j] === TILE.LAVA) tiles[j] = TILE.ROCK;
      }
    }
    tiles[ty * w + tx] = TILE.TREASURE;
    ores[ty * w + tx] = 0;
    return { w: w, h: h, seed: seed >>> 0, tiles: tiles, ores: ores, seen: new Uint8Array(w * h) };
  }

  // 칸 읽기. 땅 밖 좌우는 벽, 위(하늘)는 빈 칸, 아래는 바닥으로 본다.
  function tileAt(world, x, y) {
    if (x < 0 || x >= world.w) return TILE.BEDROCK;
    if (y < 0) return TILE.EMPTY;
    if (y >= world.h) return TILE.BEDROCK;
    return world.tiles[y * world.w + x];
  }

  function isSolid(tile) { return tile !== TILE.EMPTY; }

  // 첫 번째 엔딩: 막혀 있던 지각 바닥이 부서져 맨틀이 된다.
  function openSeal(world) {
    var row = Rules.CRUST_DEPTH * world.w;
    for (var x = 0; x < world.w; x++) if (world.tiles[row + x] === TILE.SEAL) world.tiles[row + x] = TILE.MANTLE;
  }

  var World = {
    makeRandom: makeRandom,
    oreAt: oreAt,
    createWorld: createWorld,
    tileAt: tileAt,
    isSolid: isSolid,
    openSeal: openSeal
  };

  MT.World = World;
  if (typeof module !== 'undefined' && module.exports) module.exports = World;
})(typeof window !== 'undefined' ? (window.MT = window.MT || {}) : {});
