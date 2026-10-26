const test = require('node:test');
const assert = require('node:assert/strict');
// 순위 시험 점수가 진짜 순위 파일(data/)에 쌓이지 않게 임시 폴더를 쓴다(server.js를 불러오기 전에 정해야 함).
process.env.SCORES_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'bird-scores-'));
const S = require('../public/bird-find/js/scene.js');

test('같은 씨앗이면 같은 숲, 다른 씨앗이면 다른 숲', () => {
  assert.deepEqual(S.build(3, 42), S.build(3, 42));
  assert.notDeepEqual(S.build(3, 42).birds, S.build(3, 43).birds);
});

test('모든 단계에서 새가 정해진 수만큼, 화면 안에, 서로 떨어져 숨는다', () => {
  for (let level = 1; level <= 15; level++) {
    const info = S.levelInfo(level);
    for (let seed = 1; seed <= 40; seed++) {
      const sc = S.build(level, seed * 7919);
      assert.equal(sc.birds.length, info.birds, `${level}단계 씨앗 ${seed}`);
      for (const b of sc.birds) {
        assert.ok(b.x >= b.size && b.x <= S.W - b.size && b.y >= b.size && b.y <= S.H - b.size, '화면 밖');
        // 판정 범위가 겹치지 않아 한 번 눌러 두 마리가 잡히지 않는다
        for (const o of sc.birds) if (o !== b) assert.ok(Math.hypot(o.x - b.x, o.y - b.y) >= b.size * S.HIT_SCALE * 2);
      }
      // 헷갈리기용 잎사귀는 새 판정 범위 밖에만
      for (const d of sc.decoys) for (const b of sc.birds) assert.ok(Math.hypot(d.x - b.x, d.y - b.y) >= b.size * 2);
      // 가리는 잎은 새 한가운데를 덮지 않는다
      for (const c of sc.covers) for (const b of sc.birds) assert.ok(Math.hypot(c.x - b.x, c.y - b.y) > c.r);
    }
  }
});

test('단계가 오를수록 새가 많아지고 작아진다', () => {
  assert.equal(S.levelInfo(1).birds, 4);
  assert.equal(S.levelInfo(20).birds, 12);
  assert.ok(S.levelInfo(1).size > S.levelInfo(8).size);
  assert.equal(S.levelInfo(30).size, 14);
  assert.equal(S.levelInfo(1).camo, 0.5);
  assert.equal(S.levelInfo(4).camo, 1);
});

test('판정: 새 근처를 누르면 그 새, 멀리 누르면 없음, 찾은 새는 다시 안 잡힘', () => {
  const sc = S.build(2, 99);
  const b = sc.birds[0];
  assert.equal(S.hit(sc, b.x + b.size, b.y), b);
  assert.equal(S.hit(sc, b.x + b.size * S.HIT_SCALE * 1.01, b.y + b.size * S.HIT_SCALE), null);
  b.found = true;
  assert.equal(S.hit(sc, b.x, b.y), null);
  assert.equal(S.remaining(sc), sc.birds.length - 1);
});

test('점수: 새마다 50+단계×10, 남은 초마다 5점', () => {
  assert.equal(S.birdPoints(1), 60);
  assert.equal(S.birdPoints(5), 100);
  assert.equal(S.clearBonus(12.7), 60);
  assert.equal(S.clearBonus(-1), 0);
});

test('새 찾기 순위 API', async (t) => {
  const { server, io, rooms } = require('../server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    rooms.clear();
    await new Promise((resolve) => io.close(resolve));
  });
  assert.equal((await fetch(`${url}/bird-find/`)).status, 200);
  const post = (body) => fetch(`${url}/api/bird-find/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ name: '시험', score: 1_000_000 })).status, 400);
  const ok = await post({ name: '새박사', score: 1234 });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).rank, 1);
});
