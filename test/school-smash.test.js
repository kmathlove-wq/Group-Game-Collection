const test = require('node:test');
const assert = require('node:assert/strict');
// 순위 시험 점수가 진짜 순위 파일(data/)에 쌓이지 않게 임시 폴더를 쓴다(server.js를 불러오기 전에 정해야 함).
process.env.SCORES_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'smash-scores-'));
const Wd = require('../public/school-smash/js/world.js');

function count(world, type) { return world.cells.filter((c) => c && (!type || c.type === type)).length; }

test('학교 건물: 칸 종류가 다 있고, 처음엔 모든 칸이 땅과 이어져 있다', () => {
  const w = Wd.create();
  assert.equal(w.total, count(w));
  for (const type of Object.keys(Wd.TYPES)) assert.ok(count(w, type) > 0, `${type} 없음`);
  assert.equal(Wd.dropLoose(w).length, 0);
  assert.equal(Wd.percent(w), 0);
  assert.ok(Wd.LEFT >= 0 && Wd.TOP > 0 && Wd.GROUND < Wd.H);
});

test('망치: 유리는 한 번, 벽돌은 여러 번 쳐야 깨진다', () => {
  const w = Wd.create();
  // 1층 유리창 한 칸 찾기
  let glass = null;
  for (let r = Wd.ROWS - 1; r >= 0 && !glass; r--) for (let c = 0; c < Wd.COLS; c++) if (Wd.get(w, c, r)?.type === 'glass') { glass = { c, r }; break; }
  const g = Wd.cellCenter(glass.c, glass.r);
  const res = Wd.hit(w, g.x, g.y, 0.4, 1);
  assert.ok(res.destroyed.some((d) => d.type === 'glass'));
  const b = Wd.cellCenter(0, Wd.ROWS - 4); // 맨 왼쪽 벽돌
  assert.equal(Wd.get(w, 0, Wd.ROWS - 4).type, 'brick');
  Wd.hit(w, b.x, b.y, 0.4, 1);
  assert.ok(Wd.get(w, 0, Wd.ROWS - 4), '한 번에 안 깨짐');
  Wd.hit(w, b.x, b.y, 0.4, 1); Wd.hit(w, b.x, b.y, 0.4, 1);
  assert.equal(Wd.get(w, 0, Wd.ROWS - 4), null);
  assert.ok(w.score > 0);
});

test('아래 줄을 가로로 끊으면 위쪽이 통째로 떨어지고 점수·부순 수에 들어간다', () => {
  const w = Wd.create();
  // 기초 바로 위 줄 전체를 부숨
  const r = Wd.ROWS - 3;
  for (let c = 0; c < Wd.COLS; c++) { const cell = Wd.get(w, c, r); if (cell) cell.hp = 1; }
  let fallen = 0;
  for (let c = 0; c < Wd.COLS; c++) { const p = Wd.cellCenter(c, r); fallen += Wd.hit(w, p.x, p.y, 0.3, 1).fallen.length; }
  assert.ok(fallen > 1000, `떨어진 칸 ${fallen}`);
  assert.equal(count(w), Wd.COLS * 2, '기초 두 줄만 남음');
  assert.equal(w.destroyed, w.total - Wd.COLS * 2);
});

test('폭탄·운석·지진으로 부수고, 다 부수면 100%', () => {
  const w = Wd.create();
  const center = Wd.cellCenter(Wd.COLS / 2, Wd.ROWS / 2);
  const bomb = Wd.hit(w, center.x, center.y, Wd.TOOLS.bomb.radius, Wd.TOOLS.bomb.power);
  assert.ok(bomb.destroyed.length > 20);
  const q = Wd.quake(w, 300, 10, () => 0.5);
  assert.ok(q.destroyed.length > 0);
  for (let i = 0; i < 200 && w.destroyed < w.total; i++) {
    const p = Wd.cellCenter((i * 13) % Wd.COLS, Wd.ROWS - 1 - (i % 3));
    Wd.hit(w, p.x, p.y, Wd.TOOLS.meteor.radius, Wd.TOOLS.meteor.power);
  }
  assert.equal(w.destroyed, w.total);
  assert.equal(Wd.percent(w), 100);
  assert.ok(w.score <= Wd.SCORE_MAX);
  assert.equal(Wd.clearBonus(10.9), 200);
});

test('학교 뿌시기 순위 API', async (t) => {
  const { server, io, rooms } = require('../server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    rooms.clear();
    await new Promise((resolve) => io.close(resolve));
  });
  assert.equal((await fetch(`${url}/school-smash/`)).status, 200);
  const ok = await fetch(`${url}/api/school-smash/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: '뿌시기왕', score: 12345 }) });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).rank, 1);
});
