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
const { createGameRequestStore } = require('../lib/game-request-store');
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

test('고정 답글은 답글 맨 위에 오고 자기 30일이 지나도 남지만, 원글이 사라지면 함께 사라진다', () => {
  let now = 1_000_000;
  const store = createBoardStore(tempFile(), { now: () => now });
  const post = store.addPost('하나', '원글');
  const a = store.addReply(post.id, '둘', '첫 답글').reply; now += 10;
  const b = store.addReply(post.id, '셋', '둘째 답글').reply; now += 10;
  const c = store.addReply(post.id, '넷', '셋째 답글').reply;
  assert.deepEqual(store.list()[0].replies.map((r) => r.id), [a.id, b.id, c.id], '답글은 오래된 것부터');
  assert.equal(store.setPinned(c.id, true), true);
  const view = store.list()[0].replies;
  assert.deepEqual(view.map((r) => r.id), [c.id, a.id, b.id], '고정 답글이 맨 위');
  assert.equal(view[0].pinned, true);
  assert.equal(view[0].expiresAt, null);
  store.setPinned(post.id, true); // 원글도 고정해 두면
  now += KEEP_MS + 1;
  assert.deepEqual(store.list()[0].replies.map((r) => r.id), [c.id], '고정 답글만 30일이 지나도 남는다');
  store.setPinned(c.id, false);
  now += 29 * DAY;
  assert.equal(store.list()[0].replies.length, 1, '고정을 푼 뒤 30일이 안 지났으면 남는다');
  now += 2 * DAY;
  assert.equal(store.list()[0].replies.length, 0);

  const other = store.addPost('다섯', '고정 안 한 원글');
  const kept = store.addReply(other.id, '여섯', '고정 답글').reply;
  store.setPinned(kept.id, true);
  now += KEEP_MS + 1;
  assert.ok(!store.list().some((item) => item.id === other.id), '원글이 사라지면 고정 답글도 함께 사라진다');
  assert.equal(store.find(kept.id), null);
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

async function startBoard(t, { now = Date.now, requestEndsAt } = {}) {
  const app = express();
  app.use(express.json({ limit: '2kb' }));
  const adminHash = await bcrypt.hash('1234', 4);
  setupBoard({ app, store: createBoardStore(tempFile()), requests: createGameRequestStore(tempFile()), requestEndsAt, now, adminHash, cooldownMs: 60_000, cleanupTimer: false });
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}`;
  return (route, { method = 'GET', body, token, owner } = {}) => fetch(url + route, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Board-Admin': token } : {}), ...(owner ? { 'X-Board-Owner': owner } : {}) },
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
  assert.equal((await call(`/api/board/items/${replyId}/pin`, { method: 'POST', body: { pinned: true } })).status, 403, '답글 고정도 관리자만');
  assert.equal((await call(`/api/board/items/${replyId}/pin`, { method: 'POST', body: { pinned: true }, token })).body.posts[0].replies[0].pinned, true);
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

test('내가 쓴 글·답글만 고치고 지울 수 있고, 고친 글엔 (수정됨) 표시가 붙는다', async (t) => {
  const call = await startBoard(t);
  const me = 'a'.repeat(32);
  const other = 'b'.repeat(32);
  const { body: { token } } = await call('/api/board/admin/login', { method: 'POST', body: { password: '1234' } });
  const post = (await call('/api/board/posts', { method: 'POST', body: { name: '철수', text: '처음 글' }, owner: me })).body.posts[0];
  assert.equal(post.mine, true);
  assert.equal(post.edited, false);
  assert.equal((await call('/api/board', { owner: other })).body.posts[0].mine, false, '다른 사람에겐 내 글로 안 보인다');
  assert.equal((await call(`/api/board/items/${post.id}`, { method: 'PATCH', body: { text: '몰래 고침' }, owner: other })).status, 403);
  assert.equal((await call(`/api/board/items/${post.id}`, { method: 'PATCH', body: { text: '고친 글' } })).status, 403, '열쇠가 없으면 못 고친다');
  assert.equal((await call(`/api/board/items/${post.id}`, { method: 'PATCH', body: { text: '시1발' }, owner: me })).status, 400, '고칠 때도 비속어는 막는다');
  const edited = (await call(`/api/board/items/${post.id}`, { method: 'PATCH', body: { text: '고친 글' }, owner: me })).body.posts[0];
  assert.equal(edited.text, '고친 글');
  assert.equal(edited.edited, true);
  assert.equal(edited.name, '철수');
  const reply = (await call(`/api/board/posts/${post.id}/replies`, { method: 'POST', body: { text: '관리자 답글' }, token, owner: other })).body.posts[0].replies[0];
  assert.equal((await call(`/api/board/items/${reply.id}`, { method: 'DELETE', owner: me })).status, 403, '남의 답글은 못 지운다');
  assert.equal((await call(`/api/board/items/${reply.id}`, { method: 'DELETE', owner: other })).status, 403, '👑관리자 답글은 쓴 기기라도 관리자 모드가 꺼져 있으면 못 지운다');
  assert.equal((await call(`/api/board/items/${reply.id}`, { method: 'DELETE', token, owner: other })).body.posts[0].replies.length, 0, '관리자 모드면 지운다');
  assert.equal((await call(`/api/board/items/${post.id}`, { method: 'DELETE', owner: other })).status, 403);
  assert.deepEqual((await call(`/api/board/items/${post.id}`, { method: 'DELETE', owner: me })).body.posts, []);
});

test('Gist와 합칠 때 더 늦게 고친 내용을 쓴다', () => {
  let now = 1_000;
  const store = createBoardStore(tempFile(), { now: () => now });
  const post = store.addPost('a', '처음');
  const old = JSON.parse(JSON.stringify(store.toJSON()));
  now += 10;
  store.edit(post.id, '고친 내용');
  store.absorb(old); // 고치기 전 내용이 Gist에 남아 있어도
  assert.equal(store.list()[0].text, '고친 내용');
  store.absorb({ posts: [{ ...old.posts[0], text: '다른 곳에서 더 늦게 고침', editedAt: now + 5 }] });
  assert.equal(store.list()[0].text, '다른 곳에서 더 늦게 고침');
});

test('게임 추천받기: 기간 안에만 받고, 비속어·도배를 막고, 들어온 추천은 관리자만 본다', async (t) => {
  let now = 1_000_000;
  const call = await startBoard(t, { now: () => now, requestEndsAt: 2_000_000 });
  assert.deepEqual((await call('/api/game-requests/status')).body, { open: true, endsAt: 2_000_000 });
  assert.equal((await call('/api/game-requests', { method: 'POST', body: { text: '  ' } })).status, 400);
  assert.equal((await call('/api/game-requests', { method: 'POST', body: { text: '시1발 게임' } })).status, 400);
  assert.equal((await call('/api/game-requests', { method: 'POST', body: { text: 'x'.repeat(201) } })).status, 400);
  assert.equal((await call('/api/game-requests', { method: 'POST', body: { text: '달리기 게임' } })).status, 200);
  assert.equal((await call('/api/game-requests', { method: 'POST', body: { text: '또 보내기' } })).status, 429, '20초 안에 또 보내면 막힌다');
  assert.equal((await call('/api/board/admin/game-requests')).status, 403, '관리자가 아니면 못 본다');
  const { body: { token } } = await call('/api/board/admin/login', { method: 'POST', body: { password: '1234' } });
  const list = (await call('/api/board/admin/game-requests', { token })).body.requests;
  assert.deepEqual(list.map((item) => item.text), ['달리기 게임']);
  assert.deepEqual((await call(`/api/board/admin/game-requests/${list[0].id}`, { method: 'DELETE', token })).body.requests, []);
  now = 2_000_001;
  assert.equal((await call('/api/game-requests/status')).body.open, false);
  assert.equal((await call('/api/game-requests', { method: 'POST', body: { text: '늦은 추천' } })).status, 403, '기간이 끝나면 안 받는다');
});

test('게임 추천받기: 다시 켜져도 남고, 지운 추천은 Gist와 합쳐도 되살아나지 않는다', () => {
  const file = tempFile();
  const store = createGameRequestStore(file);
  const keep = store.add('퍼즐 게임');
  const gone = store.add('장난 글');
  const old = JSON.parse(JSON.stringify(store.toJSON()));
  store.remove(gone.id);
  const reopened = createGameRequestStore(file);
  reopened.absorb(old);
  assert.deepEqual(reopened.list().map((item) => item.id), [keep.id]);
});

test('게임 추천받기 마감은 한국 시간 10월 31일 토요일 밤까지다', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'board', 'index.js'), 'utf8');
  const end = Date.parse(src.match(/REQUEST_ENDS_AT = Date\.parse\('([^']+)'\)/)[1]);
  assert.equal(new Date(end + 1).toISOString(), '2026-10-31T15:00:00.000Z'); // 한국 11월 1일 0시 = 끝난 직후
  assert.equal(new Date(end).getUTCDay(), 6, '토요일(한국 시간 기준 밤 = UTC 오후)');
});

test('👑 관리자 글은 관리자 모드일 때만 고친다: 다른 기기에서 쓴 글도 되고, 쓴 기기라도 관리자 모드를 끄면 안 된다(일반 사람 글은 관리자도 못 고침)', async (t) => {
  const call = await startBoard(t);
  const { body: { token } } = await call('/api/board/admin/login', { method: 'POST', body: { password: '1234' } });
  const deviceA = 'a'.repeat(32); const deviceB = 'b'.repeat(32); const user = 'c'.repeat(32);
  const notice = (await call('/api/board/posts', { method: 'POST', body: { text: '공지' }, token, owner: deviceA })).body.posts[0];
  const userPost = (await call('/api/board/posts', { method: 'POST', body: { name: '철수', text: '안녕' }, owner: user })).body.posts.find((p) => !p.admin);
  // 다른 기기(B) + 관리자 모드 → 관리자 글 고치기 OK
  const edited = await call(`/api/board/items/${notice.id}`, { method: 'PATCH', body: { text: '고친 공지' }, token, owner: deviceB });
  assert.equal(edited.status, 200);
  assert.equal(edited.body.posts.find((p) => p.id === notice.id).text, '고친 공지');
  // 관리자 모드가 아니면 다른 기기에서 못 고친다
  assert.equal((await call(`/api/board/items/${notice.id}`, { method: 'PATCH', body: { text: '몰래' }, owner: deviceB })).status, 403);
  // 관리자 글을 쓴 그 기기(A)라도 관리자 모드를 끄면 못 고치고 못 지운다
  const listed = (await call('/api/board', { owner: deviceA })).body.posts.find((p) => p.id === notice.id);
  assert.equal(listed.admin, true);
  assert.equal((await call(`/api/board/items/${notice.id}`, { method: 'PATCH', body: { text: '몰래' }, owner: deviceA })).status, 403);
  assert.equal((await call(`/api/board/items/${notice.id}`, { method: 'DELETE', owner: deviceA })).status, 403);
  // 관리자라도 일반 사람 글은 못 고친다(지우기만)
  assert.equal((await call(`/api/board/items/${userPost.id}`, { method: 'PATCH', body: { text: '바꿈' }, token, owner: deviceB })).status, 403);
});
