// ===== rules.js =====
// 광질 타이쿤의 숫자 표(광석 값, 업그레이드 값·효과, 물리 상수). 게임 규칙을 바꿀 때는 여기만 고친다.
// 브라우저(window.MT.Rules)와 Node 시험(require)에서 같이 쓴다.
(function (MT) {
  // 땅 칸 종류. 저장 파일에 숫자로 들어가므로 번호를 바꾸지 않는다.
  // SEAL = 지각 바닥(보물을 찾으면 맨틀로 바뀜), CORE_FLOOR = 맨 아래 못 파는 바닥(내핵처럼 보임).
  var TILE = {
    EMPTY: 0, DIRT: 1, STONE: 2, ROCK: 3, LAVA: 4, CONCRETE: 5, BEDROCK: 6, TREASURE: 7,
    MANTLE: 8, OUTER: 9, INNER: 10, SEAL: 11, CORE_FLOOR: 12
  };
  var TILE_MAX = 12;

  // 단단함: 파는 시간과 연료에 곱해진다. 0이면 못 판다.
  var HARDNESS = [0, 1, 2, 3, 0, 0, 0, 3, 4, 5, 6, 0, 0];
  // 이 칸을 파려면 드릴이 몇 단계(0부터 셈) 이상이어야 하는지. 없으면 못 판다.
  var DRILL_NEED = {};
  DRILL_NEED[TILE.DIRT] = 0;
  DRILL_NEED[TILE.STONE] = 0;
  DRILL_NEED[TILE.ROCK] = 2; // 3단계
  DRILL_NEED[TILE.TREASURE] = 2;
  DRILL_NEED[TILE.MANTLE] = 4; // 5단계
  DRILL_NEED[TILE.OUTER] = 6; // 7단계
  DRILL_NEED[TILE.INNER] = 8; // 9단계

  // 광석(1~14번). minDepth는 처음 나오는 깊이(m).
  var ORES = [
    null,
    { key: 'coal', name: '석탄', value: 10, minDepth: 0, color: '#2f2f35', shine: '#8b8b96' },
    { key: 'copper', name: '구리', value: 30, minDepth: 15, color: '#d9732b', shine: '#ffc08a' },
    { key: 'iron', name: '철', value: 60, minDepth: 35, color: '#a9b0bb', shine: '#eef2f7' },
    { key: 'silver', name: '은', value: 150, minDepth: 60, color: '#dfe6f0', shine: '#ffffff' },
    { key: 'gold', name: '금', value: 400, minDepth: 100, color: '#f5c518', shine: '#fff2a8' },
    { key: 'ruby', name: '루비', value: 1000, minDepth: 150, color: '#e0244f', shine: '#ff9fb4' },
    { key: 'emerald', name: '에메랄드', value: 2500, minDepth: 200, color: '#18b86a', shine: '#9dffd0' },
    { key: 'diamond', name: '다이아몬드', value: 6000, minDepth: 250, color: '#5fd8ff', shine: '#e6fbff' },
    { key: 'peridot', name: '페리도트', value: 15000, minDepth: 301, color: '#9acd32', shine: '#eaffb0' },
    { key: 'spinel', name: '스피넬', value: 30000, minDepth: 420, color: '#ff4fa3', shine: '#ffc2e1' },
    { key: 'meteor', name: '운석철', value: 80000, minDepth: 601, color: '#6b7280', shine: '#ffd29a' },
    { key: 'plasma', name: '플라즈마석', value: 150000, minDepth: 720, color: '#a855f7', shine: '#f0d4ff' },
    { key: 'corecrystal', name: '핵 결정', value: 400000, minDepth: 851, color: '#ffe14d', shine: '#ffffff' },
    { key: 'starheart', name: '별의 심장', value: 1000000, minDepth: 940, color: '#ff7ad9', shine: '#fff0fb' }
  ];

  // 업그레이드: values[단계-1]가 그 단계의 효과, prices[i]는 (i+2)단계로 올리는 값.
  // lockedFrom: 이 단계(0부터 셈)부터 위로 올리려면 첫 번째 엔딩(보물)이 필요하다.
  var UPGRADES = {
    drill: { icon: '⛏️', name: '드릴', desc: '빨리 파고, 단계가 높을수록 단단한 땅을 파요', values: [1, 1.45, 2, 2.7, 3.6, 4.8, 6.3, 8.2, 10.5, 13.5], prices: [300, 1500, 6000, 20000, 60000, 150000, 350000, 800000, 2000000], lockedFrom: 5 },
    fuel: { icon: '⛽', name: '연료통', desc: '연료를 더 많이 담아요', values: [100, 160, 250, 400, 600, 900, 1300, 1800], prices: [200, 1000, 4000, 15000, 50000, 150000, 400000], lockedFrom: 5 },
    minigas: { icon: '🛢️', name: '간이 주유소', desc: '날지 않을 때 1초마다 연료가 저절로 차요', values: [0, 0.1, 0.2, 0.4, 0.6, 0.9], prices: [3000, 10000, 30000, 80000, 200000] },
    bag: { icon: '🎒', name: '가방', desc: '광석을 더 많이 담아요', values: [8, 15, 25, 40, 60], prices: [250, 1200, 5000, 18000] },
    hull: { icon: '🛡️', name: '몸체', desc: '체력이 늘어나요', values: [100, 160, 250, 360, 500], prices: [300, 1500, 6000, 20000] },
    engine: { icon: '🚀', name: '엔진', desc: '위로 빨리 날고 연료를 덜 써요', values: [3.2, 4.2, 5.4, 6.8, 8.5], prices: [300, 1500, 6000, 20000] },
    range: { icon: '💥', name: '파는 범위', desc: '한 번에 넓게 파요 (Q로 켜고 끄기)', values: [[1, 1], [1, 3], [3, 3], [5, 5]], prices: [2000, 10000, 50000] },
    heat: { icon: '🔥', name: '열보호', desc: '지각 밑의 뜨거운 열을 막아요 (끝까지 올리면 아예 안 닳아요)', values: [1, 0.75, 0.5, 0.3, 0.1, 0], prices: [20000, 60000, 150000, 400000, 1000000], lockedFrom: 0 },
    autoLife: { icon: '⏳', name: '자동 드릴 수명', desc: '자동 드릴이 더 오래 일해요', values: [120, 150, 180, 240, 300], prices: [10000, 30000, 80000, 200000], lockedFrom: 0 },
    autoHeat: { icon: '🧯', name: '자동 드릴 열보호', desc: '자동 드릴이 지각 밑(맨틀·외핵·내핵)까지 내려가요', values: [0, 1], prices: [300000], lockedFrom: 0 }
  };
  // 🎰 뽑기: ores = [광석 번호, 무게]. 무게가 클수록 잘 나온다(무게 합이 100이라 곧 % 확률).
  // 평균으로 낸 돈의 약 90%가 돌아온다(일반 268.8원/300원, 특수 89,750원/10만 원 — 사용자 결정 2026-10).
  // normal은 첫 번째 엔딩(보물) 전까지만, special은 그 뒤부터 뽑을 수 있다.
  var GACHA = {
    normal: { icon: '🎰', name: '일반 뽑기', price: 300, ores: [[1, 30], [2, 22], [3, 17], [4, 12], [5, 9], [6, 6], [7, 3], [8, 1]] },
    special: { icon: '🌟', name: '특수 뽑기', price: 100000, ores: [[9, 35], [10, 27], [11, 18], [12, 12], [13, 6], [14, 2]] }
  };

  var UPGRADE_ORDER = ['drill', 'fuel', 'minigas', 'bag', 'hull', 'engine', 'range', 'heat', 'autoLife', 'autoHeat'];
  var ENGINE_FUEL_USE = [1, 0.9, 0.8, 0.7, 0.6]; // 엔진 단계별 연료 사용 배수
  var ROCK_DRILL_LEVEL = 2; // 단단한 바위는 드릴 3단계(0부터 세면 2)부터

  // 층: 깊이(m)로 나눈다. heat는 열보호 없을 때 초당 체력 감소.
  var LAYERS = [
    { key: 'crust', name: '지각', from: 0, heat: 0 },
    { key: 'mantle', name: '맨틀', from: 301, heat: 3 },
    { key: 'outer', name: '외핵', from: 601, heat: 8 },
    { key: 'inner', name: '내핵', from: 851, heat: 15 }
  ];
  function layerOf(depth) {
    for (var i = LAYERS.length - 1; i > 0; i--) if (depth >= LAYERS[i].from) return i;
    return 0;
  }

  var MT_RULES = {
    TILE: TILE,
    TILE_MAX: TILE_MAX,
    HARDNESS: HARDNESS,
    DRILL_NEED: DRILL_NEED,
    ORES: ORES,
    UPGRADES: UPGRADES,
    GACHA: GACHA,
    UPGRADE_ORDER: UPGRADE_ORDER,
    ENGINE_FUEL_USE: ENGINE_FUEL_USE,
    ROCK_DRILL_LEVEL: ROCK_DRILL_LEVEL,
    LAYERS: LAYERS,
    layerOf: layerOf,

    // 땅 크기: 가로 40칸, 깊이 1~1000m(0~999줄), 1000줄은 못 파는 바닥.
    // 지각은 1~300m(0~299줄), 300줄(301m)은 보물을 찾기 전까지 막힌 지각 바닥.
    WIDTH: 40,
    DEPTH: 1000,
    CRUST_DEPTH: 300,
    OLD_DEPTH: 300, // 저장 버전 1의 땅 깊이(이어 쓰기용)
    STONE_DEPTH: 60,
    ROCK_DEPTH: 150,
    LAVA_DEPTH: 100,
    MANTLE_LAVA: 0.08,
    // 지상 왼쪽 콘크리트 바닥(못 팜)과 건물 4개(가로 칸 범위 [x0, x1)).
    PAD_WIDTH: 17,
    BUILDINGS: [
      { key: 'sell', icon: '💰', name: '판매소', x0: 1, x1: 4, color: '#f5c518' },
      { key: 'fuel', icon: '⛽', name: '주유소', x0: 5, x1: 8, color: '#ff6a3d' },
      { key: 'repair', icon: '🔧', name: '정비소', x0: 9, x1: 12, color: '#4f8cff' },
      { key: 'shop', icon: '🛒', name: '업그레이드 상점', x0: 13, x1: 16, color: '#9b5cff' }
    ],
    SPAWN_X: 2.5,

    // 차 크기·물리(단위: 칸, 초).
    CAR_SIZE: 0.78,
    GRAVITY: 22,
    THRUST: 34,
    MAX_FALL: 14,
    MOVE_SPEED: [3.6, 4, 4.4, 4.8, 5.2], // 엔진 단계별 좌우 속도
    MOVE_ACCEL: 28,
    SAFE_FALL_SPEED: 10, // 이 속도보다 빨리 떨어지면 다침
    FALL_DAMAGE: 5, // (속도 - 안전 속도) x 이 값
    LAVA_BURN: 18, // 용암에 닿아 있는 동안 초당 체력 감소

    // 연료(땅속에서만 줄어듦, 지상에서는 안 줄어듦).
    FUEL_IDLE: 0.12,
    FUEL_MOVE: 0.35,
    FUEL_THRUST: 1.0,
    DIG_FUEL: 0.35, // 단단함 x 이 값
    DIG_FUEL_EXTRA: 0.08, // 넓게 팔 때 칸 하나 더마다
    DIG_TIME: 0.3, // 단단함 1을 드릴 1단계로 파는 시간(초)
    LOW_FUEL: 0.2,

    // 가격.
    FUEL_PRICE: 2,
    REPAIR_PRICE: 3,
    RECALL_PRICE: 2000,
    RESCUE_BASE: 100,
    RESCUE_PER_M: 3,
    TREASURE_REWARD: 50000,
    INSTANT_PRICE: 1000, // 💸 즉시 팔기(한 번 쓰면 없어짐)
    INSTANT_MAX: 5,
    AUTO_PRICE: 5000, // 🤖 자동 드릴 한 대
    AUTO_MAX: 30,
    AUTO_SPEED: 0.5, // 내 드릴 속도의 절반
    AUTO_MOVE: 14, // 빈 칸을 지나가는 속도(칸/초, 떨어지듯 빠르게)
    TICKET_PRICE: 100000000, // 🎫 지구 핵 입장권 1억 원(열보호 5단계 필요, 모의 실험 뒤 사용자 결정 2026-10)

    // 순위 서버 주소.
    MONEY_API: '/api/mining-tycoon-money/scores',
    TIME_API: '/api/mining-tycoon-time/scores',
    DESTROY_API: '/api/mining-tycoon-destroy/scores'
  };

  MT.Rules = MT_RULES;
  if (typeof module !== 'undefined' && module.exports) module.exports = MT_RULES;
})(typeof window !== 'undefined' ? (window.MT = window.MT || {}) : {});
