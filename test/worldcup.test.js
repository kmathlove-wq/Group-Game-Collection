const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
// 시험 결과가 진짜 통계 파일(data/)에 쌓이지 않게 임시 폴더를 쓴다(server.js를 불러오기 전에 정해야 함).
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'worldcup-'));
process.env.WORLDCUP_PATH = path.join(tmp, 'worldcup-stats.json');
const { TOPICS, SIZES } = require('../public/worldcup/js/topics.js');
const Bracket = require('../public/worldcup/js/bracket.js');
const { createWorldcupStore } = require('../lib/worldcup-store');

test('주제마다 후보가 16개이고 id가 겹치지 않는다', () => {
  const topicIds = new Set();
  for (const t of TOPICS) {
    assert.ok(/^[a-z]+$/.test(t.id), t.id);
    assert.ok(!topicIds.has(t.id), `주제 ${t.id} 중복`);
    topicIds.add(t.id);
    assert.equal(t.items.length, 16, `${t.title} 후보 수`);
    const ids = new Set(t.items.map((i) => i.id));
    assert.equal(ids.size, 16, `${t.title} 후보 id 중복`);
    for (const item of t.items) {
      assert.ok(/^[a-z]+$/.test(item.id), `${t.title} ${item.id}`);
      assert.ok(item.emoji && item.name, `${t.title} ${item.id} 비었음`);
    }
  }
  assert.deepEqual(SIZES, [8, 16]);
});

test('대진표: size-1번 고르면 1위가 정해지고, 되돌리기가 된다', () => {
  for (const size of SIZES) {
    const b = Bracket.create(TOPICS[0].items, size, () => 0.3);
    assert.equal(b.round.length, size);
    assert.equal(Bracket.roundName(b), `${size}강`);
    let picks = 0;
    while (Bracket.current(b)) { Bracket.pick(b, picks % 2); picks++; }
    assert.equal(picks, size - 1);
    assert.ok(b.winner && b.runnerUp && b.winner !== b.runnerUp);
    assert.deepEqual(Bracket.progress(b), { done: size - 1, total: size - 1 });
    assert.equal(Bracket.undo(b), true);
    assert.equal(b.winner, null);
    assert.equal(Bracket.roundName(b), '결승');
  }
  // 늘 왼쪽만 고르면 왼쪽에 있던 후보가 끝까지 이긴다
  const b = Bracket.create(TOPICS[0].items, 8, Math.random);
  const first = b.round[0];
  while (Bracket.current(b)) Bracket.pick(b, 0);
  assert.equal(b.winner, first);
});

test('통계 저장소: 기록하고, Gist 값과 합칠 때 칸마다 큰 값을 고른다', () => {
  const store = createWorldcupStore(path.join(tmp, 'store.json'));
  store.record('food', 'pizza', 'ramen');
  store.record('food', 'pizza', 'chicken');
  assert.deepEqual(store.stats('food'), { plays: 2, wins: { pizza: 2 }, finals: { pizza: 2, ramen: 1, chicken: 1 } });
  store.absorb({ topics: { food: { plays: 10, wins: { pizza: 1, ramen: 5 }, finals: { ramen: -3 } } } });
  const s = store.stats('food');
  assert.equal(s.plays, 10);
  assert.deepEqual(s.wins, { pizza: 2, ramen: 5 });
  assert.equal(s.finals.ramen, 1);
  // 파일에서 다시 불러와도 남는다
  assert.equal(createWorldcupStore(path.join(tmp, 'store.json')).stats('food').plays, 10);
});

test('이상형 월드컵 API: 올바른 결과만 받고 통계를 돌려준다', async (t) => {
  const { server, io, rooms } = require('../server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    rooms.clear();
    await new Promise((resolve) => io.close(resolve));
  });
  assert.equal((await fetch(`${url}/worldcup/`)).status, 200);
  const post = (body) => fetch(`${url}/api/worldcup/result`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ topic: 'nope', size: 16, winner: 'pizza', runnerUp: 'ramen' })).status, 400);
  assert.equal((await post({ topic: 'food', size: 4, winner: 'pizza', runnerUp: 'ramen' })).status, 400);
  assert.equal((await post({ topic: 'food', size: 16, winner: 'pizza', runnerUp: 'pizza' })).status, 400);
  assert.equal((await post({ topic: 'food', size: 16, winner: 'dog', runnerUp: 'ramen' })).status, 400);
  const ok = await post({ topic: 'food', size: 16, winner: 'pizza', runnerUp: 'ramen' });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { plays: 1, wins: { pizza: 1 }, finals: { pizza: 1, ramen: 1 } });
  const again = await post({ topic: 'food', size: 8, winner: 'ramen', runnerUp: 'pizza' });
  assert.equal(again.status, 429, '5초 안에 또 보내면 세지 않음');
  assert.equal((await again.json()).plays, 1);
  assert.equal((await fetch(`${url}/api/worldcup/stats/zzz`)).status, 404);
  assert.equal((await (await fetch(`${url}/api/worldcup/stats/food`)).json()).plays, 1);
});
