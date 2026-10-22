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

  // 깊이에 맞는 땅 종류. 경계 근처(±6m)는 섞여서 자연스럽게 바뀐다.
  function groundAt(depth, rand) {
    var jitter = (rand() - 0.5) * 12;
    if (depth + jitter < Rules.STONE_DEPTH) return TILE.DIRT;
    if (depth + jitter < Rules.ROCK_DEPTH) return TILE.STONE;
    return TILE.ROCK;
  }

  // 용암이 나올 확률: 100m부터, 깊을수록 조금씩 많아진다.
  function lavaChance(depth) {
    if (depth < Rules.LAVA_DEPTH) return 0;
    if (depth < 150) return 0.02;
    if (depth < 250) return 0.04;
    return 0.06;
  }

  function createWorld(seed) {
    var rand = makeRandom(seed);
    var w = Rules.WIDTH;
    var h = Rules.DEPTH + 1; // 마지막 줄은 못 파는 바닥
    var tiles = new Uint8Array(w * h);
    var ores = new Uint8Array(w * h);
    for (var y = 0; y < h; y++) {
      var depth = y + 1;
      for (var x = 0; x < w; x++) {
        var i = y * w + x;
        if (y === h - 1) { tiles[i] = TILE.BEDROCK; continue; }
        if (y === 0 && x < Rules.PAD_WIDTH) { tiles[i] = TILE.CONCRETE; continue; }
        if (rand() < lavaChance(depth)) { tiles[i] = TILE.LAVA; continue; }
        tiles[i] = groundAt(depth, rand);
        ores[i] = oreAt(depth, rand);
      }
    }
    // 맨 아래 줄(300m)에 전설의 보물 하나. 둘레의 용암은 바위로 바꿔 보물에 닿을 수 있게 한다.
    var tx = 2 + Math.floor(rand() * (w - 4));
    var ty = h - 2;
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

  var World = {
    makeRandom: makeRandom,
    oreAt: oreAt,
    createWorld: createWorld,
    tileAt: tileAt,
    isSolid: isSolid
  };

  MT.World = World;
  if (typeof module !== 'undefined' && module.exports) module.exports = World;
})(typeof window !== 'undefined' ? (window.MT = window.MT || {}) : {});
