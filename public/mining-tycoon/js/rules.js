// ===== rules.js =====
// 광질 타이쿤의 숫자 표(광석 값, 업그레이드 값·효과, 물리 상수). 게임 규칙을 바꿀 때는 여기만 고친다.
// 브라우저(window.MT.Rules)와 Node 시험(require)에서 같이 쓴다.
(function (MT) {
  // 땅 칸 종류. 저장 파일에 숫자로 들어가므로 번호를 바꾸지 않는다.
  var TILE = { EMPTY: 0, DIRT: 1, STONE: 2, ROCK: 3, LAVA: 4, CONCRETE: 5, BEDROCK: 6, TREASURE: 7 };

  // 단단함: 파는 시간과 연료에 곱해진다. 0이면 못 판다.
  var HARDNESS = [0, 1, 2, 3, 0, 0, 0, 3];

  // 광석(1~8번). minDepth는 처음 나오는 깊이(m).
  var ORES = [
    null,
    { key: 'coal', name: '석탄', value: 10, minDepth: 0, color: '#2f2f35', shine: '#8b8b96' },
    { key: 'copper', name: '구리', value: 30, minDepth: 15, color: '#d9732b', shine: '#ffc08a' },
    { key: 'iron', name: '철', value: 60, minDepth: 35, color: '#a9b0bb', shine: '#eef2f7' },
    { key: 'silver', name: '은', value: 150, minDepth: 60, color: '#dfe6f0', shine: '#ffffff' },
    { key: 'gold', name: '금', value: 400, minDepth: 100, color: '#f5c518', shine: '#fff2a8' },
    { key: 'ruby', name: '루비', value: 1000, minDepth: 150, color: '#e0244f', shine: '#ff9fb4' },
    { key: 'emerald', name: '에메랄드', value: 2500, minDepth: 200, color: '#18b86a', shine: '#9dffd0' },
    { key: 'diamond', name: '다이아몬드', value: 6000, minDepth: 250, color: '#5fd8ff', shine: '#e6fbff' }
  ];

  // 업그레이드: values[단계-1]가 그 단계의 효과, prices[i]는 (i+2)단계로 올리는 값.
  var UPGRADES = {
    drill: { icon: '⛏️', name: '드릴', desc: '빨리 파고, 3단계부터 단단한 바위를 팔 수 있어요', values: [1, 1.45, 2, 2.7, 3.6], prices: [300, 1500, 6000, 20000] },
    fuel: { icon: '⛽', name: '연료통', desc: '연료를 더 많이 담아요', values: [100, 160, 250, 400, 600], prices: [200, 1000, 4000, 15000] },
    bag: { icon: '🎒', name: '가방', desc: '광석을 더 많이 담아요', values: [8, 15, 25, 40, 60], prices: [250, 1200, 5000, 18000] },
    hull: { icon: '🛡️', name: '몸체', desc: '체력이 늘어나요', values: [100, 160, 250, 360, 500], prices: [300, 1500, 6000, 20000] },
    engine: { icon: '🚀', name: '엔진', desc: '위로 빨리 날고 연료를 덜 써요', values: [3.2, 4.2, 5.4, 6.8, 8.5], prices: [300, 1500, 6000, 20000] },
    range: { icon: '💥', name: '파는 범위', desc: '한 번에 넓게 파요 (Q로 켜고 끄기)', values: [[1, 1], [1, 3], [3, 3], [5, 5]], prices: [2000, 10000, 50000] }
  };
  var UPGRADE_ORDER = ['drill', 'fuel', 'bag', 'hull', 'engine', 'range'];
  var ENGINE_FUEL_USE = [1, 0.9, 0.8, 0.7, 0.6]; // 엔진 단계별 연료 사용 배수
  var ROCK_DRILL_LEVEL = 2; // 단단한 바위는 드릴 3단계(0부터 세면 2)부터

  var MT_RULES = {
    TILE: TILE,
    HARDNESS: HARDNESS,
    ORES: ORES,
    UPGRADES: UPGRADES,
    UPGRADE_ORDER: UPGRADE_ORDER,
    ENGINE_FUEL_USE: ENGINE_FUEL_USE,
    ROCK_DRILL_LEVEL: ROCK_DRILL_LEVEL,

    // 땅 크기: 가로 40칸, 깊이 1~300m(0~299줄), 300줄은 못 파는 바닥.
    WIDTH: 40,
    DEPTH: 300,
    STONE_DEPTH: 60,
    ROCK_DEPTH: 150,
    LAVA_DEPTH: 100,
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

    // 순위 서버 주소.
    MONEY_API: '/api/mining-tycoon-money/scores',
    TIME_API: '/api/mining-tycoon-time/scores'
  };

  MT.Rules = MT_RULES;
  if (typeof module !== 'undefined' && module.exports) module.exports = MT_RULES;
})(typeof window !== 'undefined' ? (window.MT = window.MT || {}) : {});
