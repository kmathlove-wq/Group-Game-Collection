const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const express = require('express');
const bcrypt = require('bcrypt');
const { hasBadWord } = require('../lib/bad-words');
const { createBoardStore, KEEP_MS } = require('../lib/board-store');
const { setupBoard } = require('../src/board');

const DAY = 24 * 60 * 60 * 1000;
const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'board-')), 'board.json');

test('비속어는 기호·숫자·한 글자 띄어쓰기로 피해도 막고, 보통 말은 통과시킨다', () => {
  for (const bad of ['씨발', '시.발', '시1발', '시 발 놈', '병 신', 'ㅅㅂ', 'F U C K']) assert.equal(hasBadWord(bad), true, bad);
  for (const good of ['다시 발견했어요', '시발점이 어디예요?', '게임이 재밌어요!', '버블보블 순위 기능 좋아요']) assert.equal(hasBadWord(good), false, good);
});

test('글은 30일 뒤 사라지고 고정 글은 남으며, 고정을 풀면 그때부터 30일을 센다', () => {
  let now = 1_000_000;
  const store = createBoardStore(tempFile(), { now: () => now });
  const old = store.addPost('하나', '첫 글');
  const kept = store.addPost('둘', '고정할 글');
  store.addReply(kept.id, '셋', '답글');
  store.setPinned(kept.id, true);
  now += KEEP_MS + 1;
  const view = store.list();
  assert.deepEqual(view.map((post) => post.id), [kept.id], '안 고정한 글만 사라져야 한다');
  assert.equal(view[0].replies.length, 0, '30일 지난 답글은 사라진다');
  assert.equal(view[0].expiresAt, null);
  assert.ok(!view.some((post) => post.id === old.id));
  store.setPinned(kept.id, false);
  now += 29 * DAY;
  assert.equal(store.list().length, 1, '고정을 푼 뒤 30일이 안 지났으면 남는다');
  now += 2 * DAY;
  assert.equal(store.list().length, 0);
});

test('고정 글이 맨 위, 나머지는 최신순이고 다시 켜도(파일에서) 지운 글은 되살아나지 않는다', () => {
  let now = 1_000;
  const file = tempFile();
  const store = createBoardStore(file, { now: () => now });
  const first = store.addPost('a', '1'); now += 10;
  const second = store.addPost('b', '2'); now += 10;
  const third = store.addPost('c', '3');
  store.setPinned(first.id, true);
  assert.deepEqual(store.list().map((post) => post.id), [first.id, third.id, second.id]);
  store.remove(second.id);
  const reopened = createBoardStore(file, { now: () => now });
  reopened.absorb({ posts: [{ ...second, replies: [] }] }); // Gist에 옛날 내용이 남아 있어도
  assert.deepEqual(reopened.list().map((post) => post.id), [first.id, third.id]);
});

async function startBoard(t) {
  const app = express();
  app.use(express.json({ limit: '2kb' }));
  const adminHash = await bcrypt.hash('1234', 4);
  setupBoard({ app, store: createBoardStore(tempFile()), adminHash, cooldownMs: 60_000, cleanupTimer: false });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  return (route, { method = 'GET', body, token } = {}) => fetch(url + route, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Board-Admin': token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  }).then(async (response) => ({ status: response.status, body: await response.json() }));
}

test('누구나 글·답글을 쓰고, 욕설·도배·관리자 사칭은 막는다', async (t) => {
  const call = await startBoard(t);
  assert.equal((await call('/api/board/posts', { method: 'POST', body: { name: '철수', text: '시1발' } })).status, 400);
  assert.equal((await call('/api/board/posts', { method: 'POST', body: { name: '관리자', text: '안녕' } })).status, 400);
  assert.equal((await call('/api/board/posts', { method: 'POST', body: { name: '철수', text: '   ' } })).status, 400);
  const created = await call('/api/board/posts', { method: 'POST', body: { name: '철수', text: '오목 재밌어요' } });
  assert.equal(created.status, 200);
  const post = created.body.posts[0];
  assert.equal(post.name, '철수');
  assert.equal(post.admin, false);
  assert.equal((await call(`/api/board/posts/${post.id}/replies`, { method: 'POST', body: { name: '영희', text: '저도요' } })).status, 429, '20초 안에 또 쓰면 막힌다');
  assert.equal((await call(`/api/board/items/${post.id}`, { method: 'DELETE' })).status, 403, '관리자가 아니면 못 지운다');
  assert.equal((await call(`/api/board/posts/${post.id}/pin`, { method: 'POST', body: { pinned: true } })).status, 403);
});

test('관리자는 비밀번호로 열고 삭제·고정·관리자 글쓰기를 한다', async (t) => {
  const call = await startBoard(t);
  assert.equal((await call('/api/board/admin/login', { method: 'POST', body: { password: '9999' } })).status, 401);
  const { body: { token } } = await call('/api/board/admin/login', { method: 'POST', body: { password: '1234' } });
  assert.ok(token);
  assert.equal((await call('/api/board/admin/check', { token })).body.admin, true);
  const first = (await call('/api/board/posts', { method: 'POST', body: { name: '아무개', text: '공지입니다' }, token })).body.posts[0];
  assert.equal(first.admin, true);
  assert.equal(first.name, '관리자');
  await call('/api/board/posts', { method: 'POST', body: { text: '두 번째 글' }, token }); // 관리자는 도배 제한 없음
  const pinned = await call(`/api/board/posts/${first.id}/pin`, { method: 'POST', body: { pinned: true }, token });
  assert.equal(pinned.body.posts[0].id, first.id);
  assert.equal(pinned.body.posts[0].pinned, true);
  const reply = await call(`/api/board/posts/${first.id}/replies`, { method: 'POST', body: { text: '관리자 답글' }, token });
  const replyId = reply.body.posts[0].replies[0].id;
  assert.equal(reply.body.posts[0].replies[0].admin, true);
  assert.equal((await call(`/api/board/items/${replyId}`, { method: 'DELETE', token })).body.posts[0].replies.length, 0);
  const afterDelete = await call(`/api/board/items/${first.id}`, { method: 'DELETE', token });
  assert.deepEqual(afterDelete.body.posts.map((post) => post.text), ['두 번째 글']);
  await call('/api/board/admin/logout', { method: 'POST', token });
  assert.equal((await call('/api/board/admin/check', { token })).body.admin, false);
});

test('비밀번호를 여러 번 틀리면 잠깐 막는다', async (t) => {
  const call = await startBoard(t);
  for (let i = 0; i < 5; i += 1) await call('/api/board/admin/login', { method: 'POST', body: { password: 'x' } });
  assert.equal((await call('/api/board/admin/login', { method: 'POST', body: { password: '1234' } })).status, 429);
});
