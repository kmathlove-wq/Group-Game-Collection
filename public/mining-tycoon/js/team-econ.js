// ===== team-econ.js =====
// ⚔️ 팀전에서 팀끼리 함께 쓰는 것(돈·빚·번 돈·업그레이드 단계·가방)을 숫자 한 줄(배열)로 다룬다. 브라우저와 Node(서버)가 함께 쓴다.
// 화면은 "내가 바꾼 차이"만 서버에 보내고, 서버는 팀원들의 차이를 모두 더해 팀 전체에 다시 나눠 준다.
// 그래서 기존 상점·주유소·뽑기 코드는 고치지 않아도 저절로 팀 공용이 된다. 팔기만은 서버가 직접 한다(동시에 팔아 돈이 두 배가 되지 않게).
(function (MT) {
  var Rules = MT.Rules || (typeof require !== 'undefined' ? require('./rules.js') : null);
  var LEVELS = Rules.UPGRADE_ORDER;
  var MONEY = 0, DEBT = 1, EARNED = 2, LEVEL0 = 3, BAG0 = LEVEL0 + LEVELS.length;
  var SIZE = BAG0 + Rules.ORES.length;

  function empty() { var v = []; for (var i = 0; i < SIZE; i++) v.push(0); return v; }

  // 게임 상태 → 숫자 한 줄
  function read(s) {
    var v = empty();
    v[MONEY] = s.money; v[DEBT] = s.debt; v[EARNED] = s.earned;
    for (var i = 0; i < LEVELS.length; i++) v[LEVEL0 + i] = s.levels[LEVELS[i]];
    for (var j = 1; j < Rules.ORES.length; j++) v[BAG0 + j] = s.bag[j];
    return v;
  }

  // 숫자 한 줄 → 게임 상태
  function write(s, v) {
    s.money = v[MONEY]; s.debt = v[DEBT]; s.earned = v[EARNED];
    for (var i = 0; i < LEVELS.length; i++) s.levels[LEVELS[i]] = v[LEVEL0 + i];
    for (var j = 1; j < Rules.ORES.length; j++) s.bag[j] = v[BAG0 + j];
  }

  function diff(a, b) { var d = [], any = false; for (var i = 0; i < SIZE; i++) { d.push(a[i] - b[i]); if (d[i]) any = true; } return any ? d : null; }
  function add(a, b) { var r = []; for (var i = 0; i < SIZE; i++) r.push(a[i] + (b ? b[i] : 0)); return r; }

  // 서버가 더한 뒤 말이 되게 고친다: 동시에 사서 돈이 모자라면 모자란 만큼 빚, 단계는 0~끝, 개수는 0 이상.
  function fix(v) {
    for (var i = 0; i < SIZE; i++) if (!Number.isFinite(v[i])) v[i] = 0;
    if (v[MONEY] < 0) { v[DEBT] += -v[MONEY]; v[MONEY] = 0; }
    if (v[DEBT] < 0) v[DEBT] = 0;
    if (v[EARNED] < 0) v[EARNED] = 0;
    for (var k = 0; k < LEVELS.length; k++) {
      var max = Rules.UPGRADES[LEVELS[k]].prices.length;
      v[LEVEL0 + k] = Math.max(0, Math.min(max, Math.round(v[LEVEL0 + k])));
    }
    v[BAG0] = 0;
    for (var j = 1; j < Rules.ORES.length; j++) v[BAG0 + j] = Math.max(0, Math.round(v[BAG0 + j]));
    return v;
  }

  // 판매소: 팀 가방을 모두 판다(빚이 있으면 먼저 갚음 — Game.sell과 같은 규칙).
  function sell(v) {
    var count = 0, total = 0;
    for (var j = 1; j < Rules.ORES.length; j++) { count += v[BAG0 + j]; total += v[BAG0 + j] * Rules.ORES[j].value; v[BAG0 + j] = 0; }
    var debtPaid = Math.min(v[DEBT], total);
    v[DEBT] -= debtPaid;
    v[MONEY] += total - debtPaid;
    v[EARNED] += total;
    return { count: count, total: total, debtPaid: debtPaid };
  }

  var TeamEcon = { SIZE: SIZE, empty: empty, read: read, write: write, diff: diff, add: add, fix: fix, sell: sell };
  MT.TeamEcon = TeamEcon;
  if (typeof module !== 'undefined' && module.exports) module.exports = TeamEcon;
})(typeof window !== 'undefined' ? (window.MT = window.MT || {}) : {});
