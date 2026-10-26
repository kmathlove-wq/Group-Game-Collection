const test = require('node:test');
const assert = require('node:assert/strict');
// 순위 시험 점수가 진짜 순위 파일(data/)에 쌓이지 않게 임시 폴더를 쓴다(server.js를 불러오기 전에 정해야 함).
process.env.SCORES_DIR = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'dino-scores-'));
const R = require('../public/dino/js/rules.js');
const Sprites = require('../public/dino/js/sprites.js');

function run(state, input, frames) {
  for (let i = 0; i < frames && state.phase === 'running'; i++) R.step(state, input);
}

test('비트맵 그림의 가로·세로 칸 수가 정해진 크기와 같다', () => {
  for (const [name, [w, h]] of Object.entries(Sprites.SIZES)) {
    const rows = Sprites.BITMAPS[name];
    assert.equal(rows.length, h, `${name} 세로`);
    for (const row of rows) {
      assert.equal(row.length, w, `${name} 가로`);
      assert.match(row, /^[#.]+$/);
    }
  }
  assert.deepEqual(Sprites.SIZES.dinoStand, [R.DINO_W, R.DINO_H]);
  assert.deepEqual(Sprites.SIZES.duck1, [R.DUCK_W, R.DUCK_H]);
  assert.deepEqual(Sprites.SIZES.cactusSmall, [R.CACTUS.small.w, R.CACTUS.small.h]);
  assert.deepEqual(Sprites.SIZES.cactusLarge, [R.CACTUS.large.w, R.CACTUS.large.h]);
  assert.deepEqual(Sprites.SIZES.ptero1, [R.PTERO_W, R.PTERO_H]);
  for (const [ch, rows] of Object.entries(Sprites.BITMAPS.font)) {
    assert.equal(rows.length, Sprites.FONT_H, ch);
    rows.forEach((r) => assert.equal(r.length, Sprites.FONT_W, ch));
  }
  for (const ch of '0123456789HIGAMEOVR') assert.ok(Sprites.BITMAPS.font[ch], `글꼴 ${ch}`);
});

test('충돌 상자가 그림 크기 안에 들어간다', () => {
  const inside = (b, w, h) => b.x >= 0 && b.y >= 0 && b.x + b.w <= w && b.y + b.h <= h;
  R.DINO_STAND_BOXES.forEach((b) => assert.ok(inside(b, R.DINO_W, R.DINO_H)));
  R.DINO_DUCK_BOXES.forEach((b) => assert.ok(inside(b, R.DUCK_W, R.DUCK_H)));
  R.PTERO_BOXES.forEach((b) => assert.ok(inside(b, R.PTERO_W, R.PTERO_H)));
});

test('점프하면 땅으로 돌아오고, 오래 누르면 조금 더 높이 뜬다', () => {
  const peak = (hold) => {
    const s = R.createState(() => 0.5);
    R.start(s);
    s.obstacles = []; s.time = -100; // 장애물이 나오지 않게
    let max = 0;
    R.step(s, { jump: true });
    for (let i = 0; i < 120; i++) {
      R.step(s, { jump: hold });
      max = Math.max(max, s.dino.y);
      if (s.dino.onGround) return { max, frames: i };
    }
    throw new Error('땅으로 돌아오지 않음');
  };
  const tap = peak(false), hold = peak(true);
  assert.ok(tap.max > 60 && tap.max < 90, `탭 높이 ${tap.max}`);
  assert.ok(hold.max > tap.max);
  assert.ok(tap.frames < 40);
});

test('점수는 거리에 따라 오르고 100점마다 사건이 생기며 속도는 최대를 넘지 않는다', () => {
  const s = R.createState(() => 0.5);
  R.start(s);
  s.time = -1e6; s.obstacles = [];
  let milestones = 0, last = 0;
  for (let i = 0; i < 60 * 200; i++) {
    R.step(s, {});
    if (s.events.includes('milestone')) milestones++;
    assert.ok(s.score >= last); last = s.score;
    assert.ok(s.speed <= R.MAX_SPEED);
  }
  assert.equal(s.speed, R.MAX_SPEED);
  assert.equal(milestones, Math.floor(s.score / 100));
  assert.equal(R.formatScore(45), '00045');
});

test('장애물 간격은 최고 속도에서도 점프로 넘을 수 있는 최소 간격 이상이다', () => {
  for (let v = R.START_SPEED; v <= R.MAX_SPEED; v += 20) {
    assert.ok(R.minGap(v) >= R.requiredJumpGap(v), `속도 ${v}`);
  }
  assert.ok(R.minGap(R.MAX_SPEED) >= R.requiredJumpGap(R.MAX_SPEED));
  // 실제로 만든 장애물 사이 간격도 확인
  const s = R.createState(R.makeRng(1));
  R.start(s);
  let minSeen = Infinity;
  for (let i = 0; i < 60 * 150 && s.phase === 'running'; i++) {
    R.step(s, R.autoPilot(s));
    for (let k = 1; k < s.obstacles.length; k++) {
      const a = s.obstacles[k - 1], b = s.obstacles[k];
      minSeen = Math.min(minSeen, b.x - (a.x + a.w));
    }
  }
  assert.ok(minSeen >= R.requiredJumpGap(R.START_SPEED), `실제 최소 간격 ${minSeen}`);
  // 선인장 묶음은 점프로 넘을 수 있는 길이만 만든다
  for (const kind of ['small', 'large']) {
    for (let n = 1; n <= 3; n++) {
      const need = R.groupMinSpeed(kind, n);
      assert.ok(need <= R.MAX_SPEED, `${kind} ${n}개`);
    }
  }
});

test('장애물 앞에서 점프/숙이는 자동 조종으로 몇천 프레임 달려도 피할 수 없는 배치가 없다', () => {
  let unavoidable = 0;
  let pteros = 0, maxScore = 0, runs = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = R.createState(R.makeRng(seed * 7919));
    R.start(s);
    for (let i = 0; i < 60 * 240; i++) { // 한 판 최대 4분(1만 4천여 프레임)
      R.step(s, R.autoPilot(s));
      if (s.phase === 'over') { unavoidable++; break; }
    }
    pteros += s.obstacles.filter((o) => o.kind === 'ptero').length;
    maxScore = Math.max(maxScore, s.score);
    runs++;
  }
  assert.equal(unavoidable, 0, '자동 조종이 부딪힌 판 수');
  assert.ok(maxScore > R.PTERO_SCORE, '익룡이 나오는 점수까지 달려 봄');
  assert.equal(runs, 12);
  void pteros;
});

test('가만히 서 있으면 장애물에 부딪히고, 부딪힌 직후 0.5초는 다시 시작할 수 없다', () => {
  const s = R.createState(R.makeRng(3));
  R.start(s);
  run(s, {}, 60 * 30);
  assert.equal(s.phase, 'over');
  assert.equal(R.canRestart(s), false);
  for (let i = 0; i < 20; i++) R.step(s, {});
  assert.equal(R.canRestart(s), false);
  for (let i = 0; i < 20; i++) R.step(s, {});
  assert.equal(R.canRestart(s), true);
});

test('숙이기로 중간 높이 익룡을 피하고, 서 있으면 부딪힌다', () => {
  const make = () => {
    const s = R.createState(() => 0.5);
    R.start(s); s.time = -1e6;
    s.obstacles = [{ kind: 'ptero', count: 1, w: R.PTERO_W, h: R.PTERO_H, bottom: R.PTERO_BOTTOMS[1], x: 300 }];
    s.gap = 99999;
    return s;
  };
  const stand = make(); run(stand, {}, 120);
  assert.equal(stand.phase, 'over');
  const duck = make(); run(duck, { duck: true }, 120);
  assert.equal(duck.phase, 'running');
  const high = make(); high.obstacles[0].bottom = R.PTERO_BOTTOMS[2]; run(high, {}, 120);
  assert.equal(high.phase, 'running', '높은 익룡은 서 있어도 지나간다');
});

test('공룡 달리기 순위 API: 제출·조회·상한 검사', async (t) => {
  const { server, io, rooms } = require('../server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    rooms.clear();
    await new Promise((resolve) => io.close(resolve));
  });
  const page = await fetch(`${url}/dino/`);
  assert.equal(page.status, 200);
  const post = (body) => fetch(`${url}/api/dino/scores`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ name: '시험', score: -1 })).status, 400);
  assert.equal((await post({ name: '시험', score: 1_000_000 })).status, 400);
  const ok = await post({ name: '공룡시험', score: 4321 });
  assert.equal(ok.status, 200);
  const body = await ok.json();
  assert.equal(body.rank, 1);
  assert.equal(body.scores[0].name, '공룡시험');
  assert.equal((await post({ name: '공룡시험', score: 10 })).status, 429);
  const list = await (await fetch(`${url}/api/dino/scores`)).json();
  assert.equal(list.scores[0].score, 4321);
});
