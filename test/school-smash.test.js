const test = require('node:test');
const assert = require('node:assert/strict');
// 순위 시험 점수가 진짜 순위 파일(data/)에 쌓이지 않게 임시 폴더를 쓴다(server.js를 불러오기 전에 정해야 함).
process.env.SCORES_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'smash-scores-'));
const Wd = require('../public/school-smash/js/world.js');

function count(world, type) { return world.cells.filter((c) => c && (!type || c.type === type)).length; }

test('학교 12종: 모든 칸이 땅과 이어져 있고 화면 안에 들어간다', () => {
  assert.ok(Wd.SCHOOLS.length >= 12);
  assert.equal(new Set(Wd.SCHOOLS.map((s) => s.id)).size, Wd.SCHOOLS.length);
  for (const sc of Wd.SCHOOLS) {
    const w = Wd.create(sc.id);
    assert.equal(w.total, count(w), sc.name);
    assert.ok(w.total > 800, `${sc.name} 칸 ${w.total}`);
    assert.equal(Wd.dropLoose(w).length, 0, sc.name);
    assert.equal(Wd.percent(w), 0);
    for (const type of ['brick', 'glass', 'door', 'sign', 'base']) assert.ok(count(w, type) > 0, `${sc.name}에 ${type} 없음`);
  }
  const elem = Wd.create('elementary');
  for (const type of ['line', 'roof', 'clock']) assert.ok(count(elem, type) > 0);
  assert.ok(Wd.LEFT >= 0 && Wd.TOP >= 0 && Wd.GROUND < Wd.H);
  assert.equal(Wd.create('없는학교').school, 'elementary');
});

test('무기 목록: 30개가 넘고, 묶음·움직임 종류가 올바르다', () => {
  const kinds = ['drag', 'tap', 'delay', 'fall', 'shot', 'rain', 'firework', 'bolt', 'row', 'freeze', 'quake', 'swarm', 'blackhole', 'column', 'pendulum', 'stomp', 'sweep', 'beam'];
  assert.ok(Wd.TOOL_LIST.length >= 30, `무기 ${Wd.TOOL_LIST.length}개`);
  assert.equal(new Set(Wd.TOOL_ORDER).size, Wd.TOOL_LIST.length);
  const groups = new Set(Wd.GROUPS.map((g) => g.id));
  for (const T of Wd.TOOL_LIST) {
    assert.ok(groups.has(T.group), T.name);
    assert.ok(kinds.includes(T.kind), `${T.name} 움직임 ${T.kind}`);
    assert.ok(T.icon && T.name && T.cooldown > 0 && T.count > 0, T.name);
    if (T.kind === 'rain') assert.ok(T.n > 0 && T.spread > 0 && T.drop);
    if (T.kind === 'sweep') assert.ok(['tall', 'wave', 'punch', 'ground', 'ball', 'fire'].includes(T.band));
  }
  for (const g of groups) assert.ok(Wd.TOOL_LIST.filter((T) => T.group === g).length >= 4, `${g} 묶음 무기가 적음`);
  assert.equal(Wd.TOOLS.hammer.count, Infinity);
});

test('망치: 유리는 한 번, 벽돌은 여러 번 쳐야 깨진다', () => {
  const w = Wd.create('elementary');
  let glass = null;
  for (let r = Wd.ROWS - 1; r >= 0 && !glass; r--) for (let c = 0; c < Wd.COLS; c++) if (Wd.get(w, c, r)?.type === 'glass') { glass = { c, r }; break; }
  const g = Wd.cellCenter(glass.c, glass.r);
  const res = Wd.hit(w, g.x, g.y, 0.4, 1);
  assert.ok(res.destroyed.some((d) => d.type === 'glass'));
  // 1층 맨 왼쪽 벽돌
  let left = 0;
  while (!Wd.get(w, left, Wd.ROWS - 4)) left++;
  const b = Wd.cellCenter(left, Wd.ROWS - 4);
  assert.equal(Wd.get(w, left, Wd.ROWS - 4).type, 'brick');
  Wd.hit(w, b.x, b.y, 0.4, 1);
  assert.ok(Wd.get(w, left, Wd.ROWS - 4), '한 번에 안 깨짐');
  Wd.hit(w, b.x, b.y, 0.4, 1); Wd.hit(w, b.x, b.y, 0.4, 1);
  assert.equal(Wd.get(w, left, Wd.ROWS - 4), null);
  assert.ok(w.score > 0);
});

test('아래 줄을 가로로 끊으면 위쪽이 통째로 떨어지고 점수·부순 수에 들어간다', () => {
  const w = Wd.create('elementary');
  const baseCells = count(w, 'base');
  const r = Wd.ROWS - 3;
  const res = Wd.hitLine(w, 0, Wd.cellCenter(0, r).y, Wd.W, Wd.cellCenter(0, r).y, 0.2, 99);
  assert.ok(res.fallen.length > 1000, `떨어진 칸 ${res.fallen.length}`);
  assert.equal(count(w), baseCells, '기초만 남음');
  assert.equal(w.destroyed, w.total - baseCells);
});

test('여러 무기 규칙: 사각형·얼리기·갉아 먹기·지진, 다 부수면 100%', () => {
  const w = Wd.create('magic');
  const center = Wd.cellCenter(Wd.COLS / 2, Wd.ROWS / 2);
  assert.ok(Wd.hit(w, center.x, center.y, Wd.TOOLS.bomb.radius, Wd.TOOLS.bomb.power).destroyed.length > 20);
  const frozen = Wd.freeze(w, center.x + 120, center.y, 5);
  assert.ok(frozen.length > 20);
  for (const f of frozen) assert.equal(Wd.get(w, f.c, f.r).hp, 1);
  const rect = Wd.hitRect(w, center.x - 200, Wd.TOP, 40, 200, 99);
  assert.ok(rect.destroyed.length > 0);
  assert.ok(Wd.nibble(w, 30, 99, () => 0.3).destroyed.length > 0);
  assert.ok(Wd.quake(w, 300, 10, () => 0.5).destroyed.length > 0);
  for (let i = 0; i < 400 && w.destroyed < w.total; i++) {
    const p = Wd.cellCenter((i * 13) % Wd.COLS, Wd.ROWS - 1 - (i % 3));
    Wd.hit(w, p.x, p.y, Wd.TOOLS.meteor.radius, 99);
  }
  assert.equal(w.destroyed, w.total);
  assert.equal(Wd.percent(w), 100);
  assert.ok(w.score <= Wd.SCORE_MAX);
  assert.equal(Wd.clearBonus(10.9), 200);
});

test('학교 부수기 순위 API', async (t) => {
  const { server, io, rooms } = require('../server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    rooms.clear();
    await new Promise((resolve) => io.close(resolve));
  });
  assert.equal((await fetch(`${url}/school-smash/`)).status, 200);
  const ok = await fetch(`${url}/api/school-smash/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '부수기왕', score: 12345 }) });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).rank, 1);
});
