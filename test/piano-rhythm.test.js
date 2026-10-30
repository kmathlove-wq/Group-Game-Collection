const test = require('node:test');
const assert = require('node:assert/strict');
process.env.SCORES_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'piano-scores-'));
const R = require('../public/piano-rhythm/js/rules.js');

test('악보 읽기: 길이 표시(-, ., ~)와 쉼표', () => {
  const notes = R.parseScore('도 레- | 미. 파~ 쉼 높은도');
  assert.deepEqual(notes.map((n) => [n.lane, n.beat, n.beats]), [[0, 0, 1], [1, 1, 2], [2, 3, 1.5], [3, 4.5, 0.5], [7, 6, 1]]);
  assert.throws(() => R.parseScore('도 뭐'), /모르는 계이름/);
});

test('모든 곡이 읽히고, 어려움에서도 같은 줄 음표가 판정 폭보다 멀리 떨어져 있음', () => {
  assert.ok(R.SONGS.length >= 5);
  assert.equal(new Set(R.SONGS.map((s) => s.id)).size, R.SONGS.length);
  for (const song of R.SONGS) {
    for (const diff of Object.keys(R.DIFFICULTIES)) {
      const { notes, length } = R.buildChart(song, diff);
      assert.ok(notes.length >= 20, song.id);
      assert.ok(length > 5, song.id);
      const reach = R.DIFFICULTIES[diff].windows.good / 1000;
      const last = {};
      for (const n of notes) {
        assert.ok(n.lane >= 0 && n.lane < 8);
        if (last[n.lane] != null) assert.ok(n.time - last[n.lane] > reach * 1.5, `${song.id} ${diff} 줄 ${n.lane} 너무 붙음`);
        last[n.lane] = n.time;
      }
    }
  }
});

test('판정: 시간 차에 따라 퍼펙트·좋아요·괜찮아요, 폭 밖은 null', () => {
  const w = R.DIFFICULTIES.normal.windows;
  assert.equal(R.judge(0.02, w), 'perfect');
  assert.equal(R.judge(-0.08, w), 'great');
  assert.equal(R.judge(0.13, w), 'good');
  assert.equal(R.judge(0.2, w), null);
});

test('누르기: 맞는 줄은 판정, 다른 줄 음표가 가까우면 엉뚱한 건반, 아무것도 없으면 빈 결과', () => {
  const { notes } = R.buildChart(R.songById('lamb'), 'normal'); // 미 레 도 레 …
  const w = R.DIFFICULTIES.normal.windows;
  const first = notes[0];
  assert.deepEqual(R.press(notes, 0, first.time, w), { wrong: true });
  const hit = R.press(notes, first.lane, first.time + 0.01, w);
  assert.equal(hit.note, first);
  assert.equal(hit.result, 'perfect');
  first.judged = 'perfect';
  assert.deepEqual(R.press(notes, 7, -5, w), {});
  // 지나간 음표는 놓침 목록에
  assert.deepEqual(R.expired(notes, notes[1].time + 1, w).map((n) => n.id).slice(0, 1), [1]);
});

test('점수: 모두 퍼펙트면 100만 점, 등급 S~D', () => {
  const total = 40;
  const all = { perfect: total, great: 0, good: 0, miss: 0 };
  assert.equal(R.SCORE_MAX, 1_000_000);
  assert.equal(R.scoreFor(all, total, total), R.SCORE_MAX);
  assert.equal(R.scoreFor({ perfect: 0, great: 0, good: 0, miss: total }, total, 0), 0);
  assert.ok(R.scoreFor({ perfect: 20, great: 0, good: 0, miss: 20 }, total, 20) < R.scoreFor(all, total, total));
  assert.equal(R.gradeFor(1), 'S');
  assert.equal(R.gradeFor(0.9), 'A');
  assert.equal(R.gradeFor(0.3), 'D');
});

test('순위표 이름: 곡 5 × 난이도 3 = 15개, 겹치지 않음', () => {
  const slugs = R.boardSlugs();
  assert.equal(slugs.length, R.SONGS.length * Object.keys(R.DIFFICULTIES).length);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(R.boardSlug('twinkle', 'hard'), 'piano-rhythm-twinkle-hard');
  assert.ok(slugs.every((s) => /^[a-z0-9-]+$/.test(s)));
});

test('피아노 리듬 화면과 곡·난이도별 순위 API: 상한 100만 점, 서로 따로', async (t) => {
  const { server, io, rooms } = require('../server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    rooms.clear();
    await new Promise((resolve) => io.close(resolve));
  });
  assert.equal((await fetch(`${url}/piano-rhythm/`)).status, 200);
  assert.equal((await fetch(`${url}/piano-rhythm/js/main.js`)).status, 200);
  const api = (slug) => `${url}/api/${slug}/scores`;
  const post = (slug, body) => fetch(api(slug), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const easy = R.boardSlug('twinkle', 'easy');
  const hard = R.boardSlug('twinkle', 'hard');
  assert.equal((await post(easy, { name: '시험', score: R.SCORE_MAX + 1 })).status, 400);
  const ok = await post(easy, { name: '피아니스트', score: R.SCORE_MAX });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).rank, 1);
  // 다른 난이도 순위표에는 안 섞임
  assert.deepEqual((await (await fetch(api(hard))).json()).scores, []);
  for (const slug of R.boardSlugs()) assert.equal((await fetch(api(slug))).status, 200, slug);
  assert.equal((await fetch(`${url}/shared/ranking.js`)).status, 200);
});
