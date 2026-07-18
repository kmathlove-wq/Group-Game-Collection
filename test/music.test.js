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
