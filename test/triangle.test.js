const test = require('node:test');
const assert = require('node:assert/strict');
const { io: createClient } = require('socket.io-client');
const G = require('../src/triangle/geometry');
const { rankPlayers } = require('../src/triangle');

function emitAck(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event} 응답 시간 초과`)), 2_000);
    socket.emit(event, payload, (result) => { clearTimeout(timeout); resolve(result); });
  });
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = createClient(url, { transports: ['websocket'], forceNew: true });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

function hullSize(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const half = (list) => { const out = []; for (const p of list) { while (out.length >= 2 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop(); out.push(p); } out.pop(); return out; };
  return half(sorted).length + half([...sorted].reverse()).length;
}

// 아무 선이나 그을 수 있는 첫 번째 선을 고른다.
function firstMove(points, edges) {
  for (let a = 0; a < points.length; a += 1) for (let b = a + 1; b < points.length; b += 1) {
    if (G.checkEdge(points, edges, a, b).ok) return { a, b };
  }
  return null;
}

test('삼각형 땅따먹기: 선 교차·점 통과·삼각형 판정을 계산한다', () => {
  const points = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }, { x: 30, y: 30 }];
  assert.equal(G.segmentsCross(points[0], points[3], points[1], points[2]), true);
  assert.equal(G.segmentsCross(points[0], points[1], points[0], points[2]), false); // 끝점 공유는 괜찮음
  const edges = [{ a: 0, b: 3 }];
  assert.match(G.checkEdge(points, edges, 1, 2).message, /엇갈릴/);
  assert.match(G.checkEdge(points, edges, 0, 3).message, /이미/);
  assert.match(G.checkEdge(points, edges, 0, 0).message, /서로 다른/);
  // 0-1-2 삼각형 안에 점 4가 있으면 땅이 아니다
  const withInside = [{ a: 0, b: 1 }, { a: 0, b: 2 }, { a: 1, b: 2 }];
  assert.deepEqual(G.newTriangles(points, withInside, 1, 2), []);
  // 점 4와 0,1을 이으면 빈 삼각형 0-1-4가 생긴다
  const small = [{ a: 0, b: 1 }, { a: 0, b: 4 }, { a: 1, b: 4 }];
  assert.deepEqual(G.newTriangles(points, small, 1, 4), [[0, 1, 4]]);
  assert.equal(G.pointCountFor(2), 18);
  assert.equal(G.pointCountFor(4), 32);
});

test('삼각형 땅따먹기: 점은 개수가 맞고 서로 떨어져 있다', () => {
  for (const players of [2, 3, 4]) {
    const points = G.generatePoints(G.pointCountFor(players));
    assert.equal(points.length, G.pointCountFor(players));
    for (const p of points) {
      assert.ok(p.x >= 0 && p.x <= G.BOARD_WIDTH && p.y >= 0 && p.y <= G.BOARD_HEIGHT);
    }
  }
});

// 선이 점을 스치면 못 긋기 때문에 테두리 근처 작은 틈은 땅이 안 될 수 있다. 그래서 공식값 이하이고, 대부분은 채워져야 한다.
test('삼각형 땅따먹기: 끝까지 두면 판 대부분이 삼각형 땅이 된다', () => {
  for (let round = 0; round < 5; round += 1) {
    const points = G.generatePoints(25); const edges = []; let total = 0;
    while (G.hasAnyMove(points, edges)) {
      const pairs = [];
      for (let a = 0; a < points.length; a += 1) for (let b = a + 1; b < points.length; b += 1) {
        if (G.checkEdge(points, edges, a, b).ok) pairs.push({ a, b });
      }
      const move = pairs[Math.floor(Math.random() * pairs.length)];
      edges.push(move); total += G.newTriangles(points, edges, move.a, move.b).length;
    }
    const full = 2 * points.length - hullSize(points) - 2;
    assert.ok(total <= full && total >= full * 0.75, `삼각형 ${total}개 / 최대 ${full}개`);
  }
});

test('삼각형 땅따먹기: 동점은 같은 등수다', () => {
  const ranking = rankPlayers([{ userId: 'a', score: 3 }, { userId: 'b', score: 5 }, { userId: 'c', score: 3 }, { userId: 'd', score: 1 }]);
  assert.deepEqual(ranking.map((r) => [r.userId, r.rank]), [['b', 1], ['a', 2], ['c', 2], ['d', 4]]);
});

test('삼각형 땅따먹기: 방을 만들고 차례대로 끝까지 진행한다', async (t) => {
  const { server, io } = require('../server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const host = await connect(url); const guest = await connect(url); const late = await connect(url);
  t.after(async () => {
    host.close(); guest.close(); late.close();
    await new Promise((resolve) => io.close(resolve));
  });

  const created = await emitAck(host, 'tri:room:create', { userId: 'tri-host', nickname: '방장', turnTime: 0, maxPlayers: 4 });
  assert.equal(created.ok, true);
  const { code } = created;
  assert.equal((await emitAck(guest, 'tri:room:join', { userId: 'tri-guest', nickname: '방장', code })).ok, false); // 닉네임 중복
  assert.equal((await emitAck(guest, 'tri:room:join', { userId: 'tri-guest', nickname: '손님', code })).ok, true);
  assert.equal((await emitAck(guest, 'tri:game:start')).ok, false); // 방장만 시작
  assert.match((await emitAck(host, 'tri:game:start')).message, /준비/);
  assert.equal((await emitAck(guest, 'tri:room:ready', true)).ok, true);

  const started = new Promise((resolve) => host.on('tri:room:state', (room) => { if (room.state === 'playing') resolve(room); }));
  assert.equal((await emitAck(host, 'tri:game:start')).ok, true);
  const room = await started;
  host.removeAllListeners('tri:room:state');
  assert.equal(room.game.points.length, 18);
  assert.equal(room.game.turnUserId, 'tri-host');
  assert.match((await emitAck(late, 'tri:room:join', { userId: 'tri-late', nickname: '늦은사람', code })).message, /이미 게임/);

  const { points } = room.game; const edges = [];
  const firstGuess = firstMove(points, edges);
  assert.match((await emitAck(guest, 'tri:move', firstGuess)).message, /차례/); // 손님은 아직 차례가 아님

  const finished = new Promise((resolve) => host.once('tri:game:finished', resolve));
  const sockets = [host, guest]; let turn = 0; let total = 0;
  for (let move = firstMove(points, edges); move; move = firstMove(points, edges)) {
    const result = await emitAck(sockets[turn], 'tri:move', move);
    assert.equal(result.ok, true, result.message);
    edges.push(move); total += result.triangles; turn = 1 - turn;
  }
  const { ranking } = await finished;
  assert.ok(total > 0 && total <= 2 * points.length - hullSize(points) - 2);
  assert.equal(ranking.reduce((sum, r) => sum + r.score, 0), total);
  assert.equal((await emitAck(host, 'tri:move', { a: 0, b: 1 })).ok, false);

  const closed = new Promise((resolve) => guest.once('tri:room:closed', resolve));
  assert.equal((await emitAck(guest, 'tri:room:close')).ok, false);
  assert.equal((await emitAck(host, 'tri:room:close')).ok, true);
  await closed;
});
