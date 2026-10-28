const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const bcrypt = require('bcrypt');
const { createMusicDatabase } = require('../src/music/database');
const { parseSong, checkAnswer, createTokenStore, IMAGE_EXTENSIONS, IMAGE_MIMES } = require('../src/music/service');

test('송캐치 음원 검증과 정답 별칭을 서버에서 처리한다', () => {
  const parsed = parseSong({ title: '테스트 송', artist: '가수', titleAliases: '테스트송, Test Song',
    artistAliases: 'Singer', duration: 30, startTime: 2, firstDuration: 3, secondDuration: 5, thirdDuration: 10 });
  assert.equal(parsed.error, '');
  assert.equal(checkAnswer(parsed.value, 'title', { value: 'TEST-SONG' }), true);
  assert.equal(checkAnswer(parsed.value, 'artist', { value: ' singer ' }), true);
  assert.match(parseSong({ title: '곡', artist: '가수', duration: 8, firstDuration: 3, secondDuration: 5, thirdDuration: 10 }).error, /벗어납니다/);
  assert.equal(IMAGE_EXTENSIONS.has('.jfif'), true);
  assert.equal(IMAGE_MIMES.has('image/jpeg'), true);
});

test('SQLite 공개 음원 데이터에는 저장 파일명이 포함되지 않는다', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'music-game-'));
  const store = createMusicDatabase({ filename: path.join(directory, 'test.db'), bcrypt,
    adminUsername: 'admin', adminPassword: 'long-test-password' });
  const song = store.insertSong({ title: '비밀 노래', artist: '가수', titleAliases: [], artistAliases: [],
    audioFilename: 'private-audio.mp3', imageFilename: null, startTime: 0, firstDuration: 3,
    secondDuration: 5, thirdDuration: 10, duration: 20, genre: '팝', difficulty: '보통',
    releaseYear: 2026, tags: [], description: '', isActive: true, useInSolo: true, useInGroup: true });
  assert.equal(song.audioFilename, 'private-audio.mp3');
  assert.equal(store.getSong(song.id).audioFilename, undefined);
  const setId = store.saveSet(null, { name: '기본 문제집', description: '', isRandom: true,
    useInSolo: true, useInGroup: true, isPublic: true, songIds: [song.id] });
  assert.deepEqual(store.getSetSongIds(setId, 'solo'), [song.id]);
  assert.equal(store.findAdmin('ADMIN').username, 'admin');
  store.db.close(); fs.rmSync(directory, { recursive: true, force: true });
});

test('음원 접근 토큰은 임의 문자열이며 만료 후 사용할 수 없다', async () => {
  const tokens = createTokenStore(10); const token = tokens.issue({ filename: 'audio.mp3' });
  assert.equal(tokens.get(token).filename, 'audio.mp3');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(tokens.get(token), null); tokens.clear();
});

test('🎵 누구나 노래 추가: 닉네임과 함께 올리면 바로 모두의 문제가 되고, 관리자 목록에 올린 사람이 보인다', async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'music-public-'));
  process.env.MUSIC_DB_PATH = path.join(directory, 'test.db');
  process.env.MUSIC_UPLOAD_DIR = path.join(directory, 'uploads');
  const http = require('http');
  const express = require('express');
  const { Server } = require('socket.io');
  const { setupMusicGame } = require('../src/music');
  const { createNameLock } = require('../lib/name-lock');
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  const nameLock = createNameLock({ secret: 'test' });
  const music = setupMusicGame({ app, io, rootDir: directory, nameLock });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(() => {
    music.close(); io.close(); server.close();
    delete process.env.MUSIC_DB_PATH; delete process.env.MUSIC_UPLOAD_DIR;
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const upload = (fields) => {
    const form = new FormData();
    form.set('audio', new Blob([Buffer.alloc(64)], { type: 'audio/mpeg' }), 'song.mp3');
    for (const [key, value] of Object.entries({ title: '첫 노래', artist: '가수', startTime: '5', duration: '120', uploader: '노래왕', copyrightConfirmed: 'true', ...fields })) form.set(key, value);
    return fetch(`${url}/api/music/songs`, { method: 'POST', body: form });
  };

  assert.equal((await upload({ copyrightConfirmed: 'false' })).status, 400);
  assert.equal((await upload({ uploader: '' })).status, 400);
  assert.equal((await upload({ uploader: '관리자' })).status, 403, '🔑 잠긴 닉네임');
  assert.equal((await upload({ startTime: '115' })).status, 400, '시작 위치부터 10초를 못 들으면 안 된다');
  const ok = await upload({});
  assert.equal(ok.status, 201);
  assert.equal((await ok.json()).song.title, '첫 노래');
  assert.equal((await upload({})).status, 409, '같은 노래는 한 번만');
  assert.equal((await (await fetch(`${url}/api/music/songs/count`)).json()).total, 1);
  const song = music.database.listSongs({ active: true }).songs[0];
  assert.equal(song.uploader, '노래왕');
  assert.equal(song.useInSolo && song.useInGroup, true, '개인·단체전 모두에 나온다');
  assert.equal(song.thirdDuration, 10);
});

test('☁️ 송캐치 Gist 보관: 서버가 새로 켜져도 노래 목록과 파일이 되살아나고, 지운 노래는 Gist에서도 지운다', async (t) => {
  const http = require('http');
  const express = require('express');
  const { Server } = require('socket.io');
  const { setupMusicGame } = require('../src/music');
  const { createGistSync } = require('../lib/gist-sync');
  const { createSongVault } = require('../lib/song-vault');
  // 가짜 GitHub: 공용 Gist 하나 + 노래마다 만든 비밀 Gist들
  const gists = new Map([['main', {}]]);
  let next = 1;
  const reply = (body, status = 200) => ({ ok: status < 400, status, headers: { get: () => null }, json: async () => body, text: async () => body });
  const fetchImpl = async (url, options = {}) => {
    const id = url.split('/gists')[1].replace(/^\//, '');
    const method = options.method || 'GET';
    if (method === 'POST') { const nid = 'song' + next++; gists.set(nid, JSON.parse(options.body).files); return reply({ id: nid }); }
    if (!gists.has(id)) return reply({}, 404);
    if (method === 'PATCH') { Object.assign(gists.get(id), JSON.parse(options.body).files); return reply({}); }
    if (method === 'DELETE') { gists.delete(id); return reply({}); }
    return reply({ files: Object.fromEntries(Object.entries(gists.get(id)).map(([n, f]) => [n, { content: f.content, truncated: false }])) });
  };
  async function boot() {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'music-gist-'));
    process.env.MUSIC_DB_PATH = path.join(directory, 'test.db');
    process.env.MUSIC_UPLOAD_DIR = path.join(directory, 'uploads');
    const app = express();
    const server = http.createServer(app);
    const io = new Server(server);
    const remote = createGistSync({ token: 't', gistId: 'main', fetchImpl, saveDelayMs: 0, minGapMs: 0 });
    const music = setupMusicGame({ app, io, rootDir: directory, remote, vault: createSongVault({ token: 't', fetchImpl }) });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const stop = () => { music.close(); io.close(); server.close(); fs.rmSync(directory, { recursive: true, force: true }); };
    return { url: `http://127.0.0.1:${server.address().port}`, music, remote, directory, stop };
  }
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  process.env.ADMIN_USERNAME = 'admin'; process.env.ADMIN_PASSWORD = 'long-test-password';
  t.after(() => { for (const k of ['MUSIC_DB_PATH', 'MUSIC_UPLOAD_DIR', 'ADMIN_USERNAME', 'ADMIN_PASSWORD']) delete process.env[k]; });

  // 첫 서버: 노래 하나를 올린다 → 파일은 비밀 Gist, 목록은 공용 Gist
  const first = await boot();
  await wait(20);
  const form = new FormData();
  const sound = Buffer.from('가짜 노래 소리'.repeat(20));
  form.set('audio', new Blob([sound], { type: 'audio/mpeg' }), 'song.mp3');
  for (const [k, v] of Object.entries({ title: '보관 노래', artist: '가수', startTime: '0', duration: '60', uploader: '노래왕', copyrightConfirmed: 'true' })) form.set(k, v);
  assert.equal((await fetch(`${first.url}/api/music/songs`, { method: 'POST', body: form })).status, 201);
  for (let i = 0; i < 50 && !gists.get('main')['songcatch-songs.json']; i++) { await wait(20); await first.remote.flush(); }
  const saved = JSON.parse(gists.get('main')['songcatch-songs.json'].content);
  assert.equal(saved.songs.length, 1);
  assert.ok(saved.songs[0].audio_gist, '노래 파일을 넣은 Gist 번호를 함께 적는다');
  assert.equal(Buffer.from(gists.get(saved.songs[0].audio_gist)['audio.b64'].content, 'base64').toString(), sound.toString());
  // 관리자 등록·수정 통로는 없다
  assert.equal((await fetch(`${first.url}/api/admin/songs`, { method: 'POST' })).status, 404);
  first.stop();

  // 새로 켜진 서버(빈 디스크): 목록이 되살아나고, 재생할 때 파일을 Gist에서 받아 온다
  const second = await boot();
  for (let i = 0; i < 50 && !second.music.database.listSongs({}).total; i++) await wait(20);
  const song = second.music.database.getSong(second.music.database.listSongs({}).songs[0].id, true);
  assert.equal(song.title, '보관 노래');
  assert.equal(song.uploader, '노래왕');
  for (let i = 0; i < 50 && !fs.existsSync(path.join(second.directory, 'uploads', 'audio', song.audioFilename)); i++) await wait(20);
  assert.equal(fs.readFileSync(path.join(second.directory, 'uploads', 'audio', song.audioFilename)).toString(), sound.toString());

  // 관리자가 지우면 노래 파일 Gist도 지우고, 지운 노래로 적어 저장한다(다시 켜도 안 되살아남)
  const login = await fetch(`${second.url}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'long-test-password' }) });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const preview = await (await fetch(`${second.url}/api/admin/songs/${song.id}/preview`, { method: 'POST', headers: { cookie } })).json();
  assert.equal((await (await fetch(`${second.url}/api/music/audio/${preview.audioToken}`)).text()), sound.toString(), '🎧 원본 듣기는 파일 전체');
  assert.equal((await fetch(`${second.url}/api/admin/songs/${song.id}`, { method: 'DELETE', headers: { cookie } })).status, 200);
  for (let i = 0; i < 50 && gists.has(song.audioGist); i++) await wait(20);
  assert.equal(gists.has(song.audioGist), false);
  await second.remote.flush();
  const after = JSON.parse(gists.get('main')['songcatch-songs.json'].content);
  assert.equal(after.songs.length, 0);
  assert.deepEqual(after.deleted, [song.audioFilename]);
  second.stop();
});
