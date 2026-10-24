const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const zlib = require('zlib');
const express = require('express');
const Game = require('../public/mining-tycoon/js/game.js');
const Save = require('../public/mining-tycoon/js/save.js');
const { createMiningLinkStore, KEEP_MS, MAX_DEVICES } = require('../lib/mining-link-store');
const { setupMiningTycoon } = require('../src/mining-tycoon');

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mining-link-')), 'worlds.json');

function makeSave(name, money = 0) {
  const s = Game.newGame({ name, playerId: 'p-' + name });
  s.money = money;
  s.earned = money;
  return Save.serialize(s);
}

async function startServer(t, { clock } = {}) {
  let now = 1_000_000;
  const time = clock || { get: () => now, add: (ms) => { now += ms; } };
  const app = express();
  app.use(express.json({ limit: '2kb' }));
  const store = createMiningLinkStore(tempFile(), { now: time.get });
  setupMiningTycoon({ app, store, now: time.get, bcryptRounds: 4, cleanupTimer: false });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => { store.flush(); server.close(); });
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = (route, body) => fetch(url + route, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(body)
  }).then(async (response) => ({ status: response.status, body: await response.json() }));
  return { call, time, store };
}

test('연동: 만들기 → 닉네임으로 찾기 → 비밀번호로 다른 기기 붙이기 → 나중에 연 기기가 이긴다', async (t) => {
  const { call, time } = await startServer(t);
  const saveA = makeSave('광부', 500);
  assert.equal((await call('/api/mining-tycoon/link/create', { password: '123', save: saveA })).status, 400, '비밀번호는 4자 이상');
  assert.equal((await call('/api/mining-tycoon/link/create', { password: '1234', save: '{망가짐' })).status, 400, '망가진 저장은 거절');
  // 압축해서 올려도 받는다
  const created = await call('/api/mining-tycoon/link/create', { password: '1234', z: 'deflate-raw', save: zlib.deflateRawSync(saveA).toString('base64') });
  assert.equal(created.status, 200);
  const { worldId, key: keyA } = created.body;

  const list = (await call('/api/mining-tycoon/link/worlds?name=%20광부%20')).body.worlds;
  assert.equal(list.length, 1);
  assert.equal(list[0].id, worldId);
  assert.equal(list[0].earned, 500);
  assert.equal((await call('/api/mining-tycoon/link/worlds?name=다른사람')).body.worlds.length, 0);

  assert.equal((await call('/api/mining-tycoon/link/join', { worldId, password: '0000' })).status, 401);
  const joined = await call('/api/mining-tycoon/link/join', { worldId, password: '1234' });
  assert.equal(joined.status, 200);
  assert.equal(Save.deserialize(joined.body.save).money, 500, '다른 기기가 같은 월드를 받는다');
  const keyB = joined.body.key;

  // B가 나중에 열었으니 A의 올리기는 거절(taken)
  const takenA = await call('/api/mining-tycoon/link/sync', { worldId, key: keyA, rev: 1, save: makeSave('광부', 600) });
  assert.equal(takenA.status, 409);
  assert.equal(takenA.body.taken, true);
  const syncB = await call('/api/mining-tycoon/link/sync', { worldId, key: keyB, rev: 1, save: makeSave('광부', 700) });
  assert.equal(syncB.status, 200);
  assert.equal(syncB.body.rev, 2);
  assert.equal((await call('/api/mining-tycoon/link/sync', { worldId, key: keyB, rev: 2, save: makeSave('광부', 710) })).status, 429, '3초 안에 또 올리면 거절');

  // A가 다시 열면 더 새 저장을 받고, 이제 A가 지금 하는 기기다
  const openA = await call('/api/mining-tycoon/link/open', { worldId, key: keyA, rev: 1 });
  assert.equal(openA.body.rev, 2);
  assert.equal(Save.deserialize(openA.body.save).money, 700);
  assert.equal((await call('/api/mining-tycoon/link/open', { worldId, key: keyA, rev: 2 })).body.save, undefined, '이미 최신이면 저장을 안 보낸다');
  time.add(5_000);
  assert.equal((await call('/api/mining-tycoon/link/sync', { worldId, key: keyB, rev: 2, save: makeSave('광부', 800) })).status, 409, '이번엔 B가 밀려난다');
  // B가 "이 기기 것으로 계속"을 고르면 force로 덮는다
  const forced = await call('/api/mining-tycoon/link/sync', { worldId, key: keyB, rev: 1, force: true, save: makeSave('광부', 800) });
  assert.equal(forced.status, 200);
  assert.equal(forced.body.rev, 3);
});

test('연동: 비밀번호 바꾸기, 10대 제한, 틀린 비밀번호 제한', async (t) => {
  const { call, time } = await startServer(t);
  const { worldId, key } = (await call('/api/mining-tycoon/link/create', { password: 'abcd', save: makeSave('철수') })).body;
  assert.equal((await call('/api/mining-tycoon/link/password', { worldId, key, password: 'efgh' })).status, 200);
  assert.equal((await call('/api/mining-tycoon/link/join', { worldId, password: 'abcd' })).status, 401, '옛 비밀번호는 안 된다');
  for (let i = 1; i < MAX_DEVICES; i += 1) assert.equal((await call('/api/mining-tycoon/link/join', { worldId, password: 'efgh' })).status, 200);
  assert.equal((await call('/api/mining-tycoon/link/join', { worldId, password: 'efgh' })).status, 409, '11번째 기기는 막힌다');
  for (let i = 0; i < 5; i += 1) await call('/api/mining-tycoon/link/join', { worldId, password: 'xxxx' });
  assert.equal((await call('/api/mining-tycoon/link/join', { worldId, password: 'efgh' })).status, 429, '10분에 5번 틀리면 막힌다');
  time.add(10 * 60 * 1000 + 1);
  assert.equal((await call('/api/mining-tycoon/link/join', { worldId, password: 'xxxx' })).status, 401, '10분 뒤엔 다시 시도할 수 있다');
});

test('연동: 처음부터 다시·지구 파괴는 모든 기기, 연동 끊기는 누른 기기만 남는다', async (t) => {
  const { call, time } = await startServer(t);
  const one = (await call('/api/mining-tycoon/link/create', { password: '1111', save: makeSave('영희') })).body;
  const other = (await call('/api/mining-tycoon/link/join', { worldId: one.worldId, password: '1111' })).body;
  assert.equal((await call('/api/mining-tycoon/link/end', { worldId: one.worldId, key: one.key, reason: 'reset' })).status, 200);
  const gone = await call('/api/mining-tycoon/link/open', { worldId: one.worldId, key: other.key, rev: 1 });
  assert.equal(gone.status, 410);
  assert.equal(gone.body.gone, 'reset');

  time.add(30_000);
  const two = (await call('/api/mining-tycoon/link/create', { password: '2222', save: makeSave('영희') })).body;
  const twoB = (await call('/api/mining-tycoon/link/join', { worldId: two.worldId, password: '2222' })).body;
  assert.equal((await call('/api/mining-tycoon/link/unlink', { worldId: two.worldId, key: twoB.key })).status, 200);
  assert.equal((await call('/api/mining-tycoon/link/sync', { worldId: two.worldId, key: two.key, rev: 1, save: makeSave('영희') })).body.gone, 'unlinked');
  assert.equal((await call('/api/mining-tycoon/link/worlds?name=영희')).body.worlds.length, 0);

  time.add(30_000);
  const three = (await call('/api/mining-tycoon/link/create', { password: '3333', save: makeSave('영희') })).body;
  await call('/api/mining-tycoon/link/end', { worldId: three.worldId, key: three.key, reason: 'destroyed' });
  assert.equal((await call('/api/mining-tycoon/link/open', { worldId: three.worldId, key: three.key, rev: 1 })).body.gone, 'destroyed');
});

test('연동 보관함: 30일 안 하면 지우고(기기는 혼자 계속), 다시 켜도 남으며 지운 월드는 되살아나지 않는다', () => {
  let now = 1_000;
  const file = tempFile();
  const store = createMiningLinkStore(file, { now: () => now });
  const kept = store.create({ name: '가', hash: 'h', data: 'd', summary: {} });
  const old = store.create({ name: '나', hash: 'h', data: 'd', summary: {} });
  const snapshot = JSON.parse(JSON.stringify(store.toJSON()));
  now += KEEP_MS - 10;
  store.update(kept.world, kept.key, { data: 'd2', summary: {} });
  now += 20;
  assert.equal(store.check(old.world.id, old.key).gone, 'expired');
  assert.ok(store.check(kept.world.id, kept.key).world);
  store.flush();
  const reopened = createMiningLinkStore(file, { now: () => now });
  reopened.absorb(snapshot); // Gist에 옛날 내용이 남아 있어도
  assert.equal(reopened.check(old.world.id, old.key).gone, 'expired', '지운 월드는 되살아나지 않는다');
  assert.equal(reopened.check(kept.world.id, kept.key).world.data, 'd2', '판 번호가 더 큰 쪽을 쓴다');
});
