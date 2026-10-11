const test = require('node:test');
const assert = require('node:assert/strict');
const { io: createClient } = require('socket.io-client');
const omok = require('../src/duel/omok');
const baduk = require('../src/duel/baduk');
const chess = require('../src/duel/chess');
const Clock = require('../src/duel/clock');

function emitAck(socket, event, payload = {}) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${event} 응답 시간 초과`)), 3_000);
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
const nextEvent = (socket, event, check = () => true) => new Promise((resolve) => {
  const listener = (data) => { if (check(data)) { socket.off(event, listener); resolve(data); } };
  socket.on(event, listener);
});

// ── 오목 ──
function omokGame(preset, stones) {
  const game = omok.createGame(omok.normalizeSettings(typeof preset === 'string' ? { preset } : preset));
  for (const [x, y, color] of stones) game.board[y * omok.SIZE + x] = color === 'b' ? 1 : 2;
  return game;
}
const at = (x, y) => y * omok.SIZE + x;

test('오목: 다섯 개를 이으면 이기고, 일반룰의 6목은 승리가 아니다', () => {
  const game = omokGame('free', [[3, 7, 'b'], [4, 7, 'b'], [5, 7, 'b'], [6, 7, 'b']]);
  assert.equal(omok.act(game, 'white', { type: 'move', x: 7, y: 7 }).ok, false); // 흑 차례
  assert.equal(omok.act(game, 'black', { type: 'move', x: 7, y: 7 }).ok, true);
  assert.equal(game.result.winner, 'black');
  assert.equal(game.winLine.length, 5);

  const standard = omokGame('standard', [[2, 7, 'b'], [3, 7, 'b'], [4, 7, 'b'], [6, 7, 'b'], [7, 7, 'b']]);
  assert.equal(omok.act(standard, 'black', { type: 'move', x: 5, y: 7 }).ok, true);
  assert.equal(standard.result, null);
});

test('오목 렌주룰: 흑의 3-3·4-4·장목은 금수, 4-3은 허용, 백은 장목도 승리', () => {
  const doubleThree = omokGame('renju', [[6, 7, 'b'], [7, 7, 'b'], [8, 5, 'b'], [8, 6, 'b']]);
  assert.equal(omok.forbidden(doubleThree.board, at(8, 7), 'black', doubleThree.rule), '3-3');
  assert.match(omok.act(doubleThree, 'black', { type: 'move', x: 8, y: 7 }).message, /3-3 금수/);
  assert.equal(omok.forbidden(doubleThree.board, at(8, 7), 'white', doubleThree.rule), null);
  assert.ok(omok.forbiddenSpots(doubleThree, 'black').some((s) => s.index === at(8, 7)));

  const doubleFour = omokGame('renju', [[4, 7, 'b'], [5, 7, 'b'], [6, 7, 'b'], [7, 4, 'b'], [7, 5, 'b'], [7, 6, 'b']]);
  assert.equal(omok.forbidden(doubleFour.board, at(7, 7), 'black', doubleFour.rule), '4-4');

  const fourThree = omokGame('renju', [[4, 7, 'b'], [5, 7, 'b'], [6, 7, 'b'], [7, 5, 'b'], [7, 6, 'b']]);
  assert.equal(omok.forbidden(fourThree.board, at(7, 7), 'black', fourThree.rule), null);
  const custom = omok.normalizeSettings({ preset: 'custom', black: { d34: true, overline: 'win' }, white: {} });
  assert.equal(omok.forbidden(fourThree.board, at(7, 7), 'black', custom), '4-3');

  const overline = [[2, 7], [3, 7], [4, 7], [6, 7], [7, 7]];
  const black = omokGame('renju', overline.map(([x, y]) => [x, y, 'b']));
  assert.equal(omok.forbidden(black.board, at(5, 7), 'black', black.rule), '장목');
  const white = omokGame('renju', overline.map(([x, y]) => [x, y, 'w']));
  white.turn = 'white';
  assert.equal(omok.act(white, 'white', { type: 'move', x: 5, y: 7 }).ok, true);
  assert.equal(white.result.winner, 'white');

  // 오목이 완성되는 수는 금수보다 승리가 먼저다
  const fiveFirst = omokGame('renju', [[3, 7, 'b'], [4, 7, 'b'], [5, 7, 'b'], [6, 7, 'b'], [7, 4, 'b'], [7, 5, 'b'], [7, 6, 'b']]);
  assert.equal(omok.act(fiveFirst, 'black', { type: 'move', x: 7, y: 7 }).ok, true);
  assert.equal(fiveFirst.result.winner, 'black');
});

test('오목 쌍삼 금지룰: 흑·백 모두 3-3을 둘 수 없다', () => {
  const game = omokGame('korean', [[6, 7, 'w'], [7, 7, 'w'], [8, 5, 'w'], [8, 6, 'w']]);
  assert.equal(omok.forbidden(game.board, at(8, 7), 'white', game.rule), '3-3');
  assert.match(omok.describeSettings(game.rule), /쌍삼 금지룰/);
});

// ── 바둑 ──
function badukGame(stones, size = 9) {
  const game = baduk.createGame(baduk.normalizeSettings({ size }));
  for (const [x, y, color] of stones) game.board[y * size + x] = color === 'b' ? 1 : 2;
  return game;
}
const play = (game, color, x, y) => baduk.act(game, color, { type: 'move', x, y });

test('바둑: 돌 따내기, 자충수 금지, 패', () => {
  const capture = badukGame([[4, 4, 'w'], [3, 4, 'b'], [5, 4, 'b'], [4, 3, 'b']]);
  assert.equal(play(capture, 'black', 4, 5).captured, 1);
  assert.equal(capture.board[4 * 9 + 4], 0);
  assert.equal(capture.captures.black, 1);

  const suicide = badukGame([[1, 0, 'b'], [0, 1, 'b']]);
  suicide.turn = 'white';
  assert.match(play(suicide, 'white', 0, 0).message, /자충수/);

  const ko = badukGame([[1, 0, 'b'], [2, 0, 'w'], [0, 1, 'b'], [1, 1, 'w'], [3, 1, 'w'], [1, 2, 'b'], [2, 2, 'w']]);
  assert.equal(play(ko, 'black', 2, 1).captured, 1);
  assert.match(play(ko, 'white', 1, 1).message, /패/);
  assert.equal(play(ko, 'white', 8, 8).ok, true);
  assert.equal(play(ko, 'black', 8, 0).ok, true);
  assert.equal(play(ko, 'white', 1, 1).captured, 1); // 한 수 쉬고 오면 되따낼 수 있다
});

test('바둑: 둘 다 쉬면 계가 — 죽은 돌 표시, 집+따낸 돌, 백 덤 6.5', () => {
  const stones = [];
  for (let y = 0; y < 9; y += 1) stones.push([4, y, 'b'], [5, y, 'w']);
  stones.push([1, 1, 'w']); // 흑 집 안의 죽은 백돌
  const game = badukGame(stones);
  assert.equal(baduk.act(game, 'black', { type: 'pass' }).ok, true);
  assert.equal(baduk.turnOf(game), 'white');
  baduk.act(game, 'white', { type: 'pass' });
  assert.equal(game.phase, 'scoring');
  assert.equal(baduk.turnOf(game), null);
  assert.equal(baduk.act(game, 'white', { type: 'toggleDead', x: 1, y: 1 }).ok, true);
  baduk.act(game, 'black', { type: 'agree' });
  assert.equal(game.result, null);
  baduk.act(game, 'white', { type: 'agree' });
  assert.deepEqual(game.score.total, { black: 37, white: 33.5 });
  assert.equal(game.result.winner, 'black');

  // 계속 두기를 누르면 다시 둔다
  const again = badukGame([]);
  baduk.act(again, 'black', { type: 'pass' }); baduk.act(again, 'white', { type: 'pass' });
  baduk.act(again, 'black', { type: 'resume' });
  assert.equal(again.phase, 'play');
  assert.equal(baduk.turnOf(again), 'black');
});

// ── 체스 ──
const sq = (name) => (8 - Number(name[1])) * 8 + 'abcdefgh'.indexOf(name[0]);
const move = (game, color, from, to, promo) => chess.act(game, color, { type: 'move', from: sq(from), to: sq(to), promo });
function perft(game, depth) {
  const moves = chess.legalMoves(game, game.turn);
  if (depth === 1) return moves.length;
  let total = 0;
  for (const m of moves) {
    const copy = structuredClone(game);
    chess.act(copy, copy.turn, { type: 'move', from: m.from, to: m.to, promo: m.promo });
    total += perft(copy, depth - 1);
  }
  return total;
}
function chessGame(pieces, turn = 'white') {
  const game = chess.createGame();
  game.board = Array(64).fill(''); game.castling = ''; game.turn = turn;
  for (const [name, piece] of Object.entries(pieces)) game.board[sq(name)] = piece;
  return game;
}

test('체스: 처음 판에서 둘 수 있는 수의 개수가 정확하다(perft 1~3)', () => {
  assert.equal(perft(chess.createGame(), 1), 20);
  assert.equal(perft(chess.createGame(), 2), 400);
  assert.equal(perft(chess.createGame(), 3), 8902);
  // 캐슬링·앙파상·프로모션이 뒤섞인 유명한 시험 판(Kiwipete)
  const kiwipete = chess.createGame();
  kiwipete.board = [...'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R'.replaceAll('/', '')]
    .flatMap((ch) => (/\d/.test(ch) ? Array(Number(ch)).fill('') : [ch]));
  assert.equal(perft(kiwipete, 1), 48);
  assert.equal(perft(kiwipete, 2), 2039);
  assert.equal(perft(kiwipete, 3), 97862);
});

test('체스: 체크메이트·캐슬링·앙파상·프로모션·스테일메이트', () => {
  const fools = chess.createGame();
  move(fools, 'white', 'f2', 'f3'); move(fools, 'black', 'e7', 'e5'); move(fools, 'white', 'g2', 'g4');
  assert.equal(move(fools, 'black', 'd8', 'h4').ok, true);
  assert.equal(fools.result.winner, 'black');
  assert.equal(fools.history.at(-1), 'Qh4#');

  const castle = chessGame({ e1: 'K', h1: 'R', e8: 'k' });
  castle.castling = 'K';
  assert.equal(move(castle, 'white', 'e1', 'g1').ok, true);
  assert.equal(castle.board[sq('f1')], 'R');
  assert.equal(castle.castling, '');

  const ep = chess.createGame();
  move(ep, 'white', 'e2', 'e4'); move(ep, 'black', 'a7', 'a6'); move(ep, 'white', 'e4', 'e5'); move(ep, 'black', 'd7', 'd5');
  assert.equal(move(ep, 'white', 'e5', 'd6').ok, true);
  assert.equal(ep.board[sq('d5')], '');
  assert.deepEqual(ep.captured.white, ['p']);

  const promo = chessGame({ a7: 'P', h1: 'K', h8: 'k' });
  assert.equal(move(promo, 'white', 'a7', 'a8', 'n').ok, true);
  assert.equal(promo.board[sq('a8')], 'N');

  const stalemate = chessGame({ f6: 'Q', a1: 'K', h8: 'k' });
  assert.equal(move(stalemate, 'white', 'f6', 'f7').ok, true);
  assert.equal(stalemate.result.winner, null);
  assert.match(stalemate.result.reason, /스테일메이트/);

  const pinned = chessGame({ e1: 'K', e2: 'R', e8: 'q', a8: 'k' });
  assert.equal(move(pinned, 'white', 'e2', 'a2').ok, false); // 룩이 비키면 킹이 잡힌다
});

// ── 시계 ──
test('시계: 오목 한 수 타이머, 체스 피셔, 바둑 초읽기', () => {
  const move30 = Clock.normalizeTime({ mode: 'move', perMove: 30 }, omok.timeModes);
  assert.deepEqual(Clock.commit(Clock.startClock(move30), 25_000, move30), { main: 30_000, periods: 0 });
  assert.equal(Clock.spend(Clock.startClock(move30), 31_000, move30), null);
  assert.equal(Clock.normalizeTime({ mode: 'fischer', main: 10, inc: 5 }, omok.timeModes).mode, 'none'); // 오목엔 피셔 없음

  const blitz = Clock.normalizeTime({ mode: 'fischer', main: 3, inc: 2 }, chess.timeModes);
  assert.deepEqual(Clock.commit(Clock.startClock(blitz), 10_000, blitz), { main: 172_000, periods: 0 });
  assert.equal(Clock.describeTime(blitz), '블리츠 3분 + 2초(한 수마다 추가)');
  assert.deepEqual(Clock.normalizeTime({ mode: 'fischer', main: 7, inc: 9 }, chess.timeModes), { mode: 'fischer', main: 10, inc: 5 });

  const byo = Clock.normalizeTime({ mode: 'byoyomi', main: 0, period: 30, periods: 3 }, baduk.timeModes);
  const start = Clock.startClock(byo);
  assert.equal(Clock.spend(start, 45_000, byo).periods, 2);          // 30초를 넘겨 한 번 씀
  assert.equal(Clock.spend(start, 45_000, byo).periodLeft, 15_000);
  assert.deepEqual(Clock.commit(start, 20_000, byo), { main: 0, periods: 3 }); // 제때 두면 그대로
  assert.equal(Clock.spend(start, 95_000, byo), null);                 // 세 번 다 쓰면 시간패
  assert.equal(Clock.label(start, 5_000, byo), '초읽기 25초 · 3회');
});

// ── 로비 → 신청 → 수정 요청 → 수락 → 대국 → 관전 → 한 판 더 ──
test('오목 대결: 신청·수정 요청·수락, 관전, 승리, 색 바꿔 한 판 더', async (t) => {
  const { server, io } = require('../server');
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  for (const route of ['/omok', '/baduk', '/chess', '/omok/match', '/duel-rules/clock.js', '/duel/lobby.js']) {
    assert.equal((await fetch(`${url}${route}`)).status, 200, route);
  }
  assert.match(await (await fetch(`${url}/chess`)).text(), /그룹 게임 컬렉션-체스/);

  const a = await connect(url); const b = await connect(url); const c = await connect(url);
  t.after(async () => { a.close(); b.close(); c.close(); await new Promise((resolve) => io.close(resolve)); });

  assert.equal((await emitAck(a, 'omok:lobby:enter', { userId: 'ua', nickname: '철수' })).ok, true);
  assert.match((await emitAck(b, 'omok:lobby:enter', { userId: 'ub', nickname: '철수' })).message, /같은 닉네임/);
  const entered = await emitAck(b, 'omok:lobby:enter', { userId: 'ub', nickname: '영희' });
  assert.equal(entered.lobby.users.length, 2);

  const offered = nextEvent(b, 'omok:offer');
  const sent = await emitAck(a, 'omok:offer:send', { toId: 'ub', terms: { myColor: 'white', time: { mode: 'move', perMove: 20 }, rule: { preset: 'free' } } });
  assert.equal(sent.ok, true);
  const offer = await offered;
  assert.equal(offer.waitingFor, 'ub');
  assert.equal(offer.terms.fromColor, 'white');
  assert.equal(offer.summary, '한 수 20초 · 자유룰 (흑·백 모두 제한 없음)');
  assert.equal((await emitAck(a, 'omok:offer:reply', { id: offer.id, action: 'accept' })).ok, false); // 답할 차례가 아님

  // 영희가 "내가 흑, 피셔 시간"으로 수정 요청 → 오목엔 피셔가 없어 제한 없음이 된다
  const modified = nextEvent(a, 'omok:offer', (o) => o.round === 2);
  assert.equal((await emitAck(b, 'omok:offer:reply', { id: offer.id, action: 'modify', terms: { myColor: 'black', time: { mode: 'fischer', main: 3, inc: 2 }, rule: { preset: 'free' } } })).ok, true);
  const second = await modified;
  assert.equal(second.waitingFor, 'ua');
  assert.equal(second.terms.fromColor, 'white'); // 신청한 철수 기준으로 저장
  assert.equal(second.terms.time.mode, 'none');

  // 로비를 떠나면(lobby:leave) 바로 목록에서 빠지고 주고받던 신청도 취소된다.
  const d = await connect(url);
  t.after(() => d.close());
  await emitAck(d, 'omok:lobby:enter', { userId: 'ud', nickname: '잠깐온사람' });
  await emitAck(d, 'omok:offer:send', { toId: 'uc-none', terms: {} }).catch(() => {});
  const gone = nextEvent(b, 'omok:lobby:state', (s) => !s.users.some((u) => u.userId === 'ud'));
  assert.equal((await emitAck(d, 'omok:lobby:leave')).ok, true);
  await gone;
  assert.equal((await emitAck(d, 'omok:lobby:here')).ok, false); // 나간 뒤 신호는 거절 → 화면이 다시 들어간다

  const acceptedB = nextEvent(b, 'omok:offer:accepted');
  const accepted = await emitAck(a, 'omok:offer:reply', { id: offer.id, action: 'accept' });
  const { matchId } = await acceptedB;
  assert.equal(matchId, accepted.matchId);

  assert.equal((await emitAck(a, 'omok:match:join', { id: matchId, userId: 'ua', nickname: '철수' })).color, 'white');
  assert.equal((await emitAck(b, 'omok:match:join', { id: matchId, userId: 'ub', nickname: '영희' })).color, 'black');
  const watcher = await emitAck(c, 'omok:match:join', { id: matchId, userId: 'uc', nickname: '구경꾼' });
  assert.equal(watcher.color, null);
  assert.equal((await emitAck(c, 'omok:match:act', { action: { type: 'move', x: 0, y: 0 } })).ok, false); // 관전자는 못 둠
  assert.equal((await emitAck(c, 'omok:match:chat', { text: '화이팅!' })).ok, true);

  const finished = nextEvent(c, 'omok:match:state', (m) => m.state === 'finished');
  for (let i = 0; i < 5; i += 1) {
    assert.equal((await emitAck(b, 'omok:match:act', { action: { type: 'move', x: i, y: 7 } })).ok, true);
    if (i < 4) assert.equal((await emitAck(a, 'omok:match:act', { action: { type: 'move', x: i, y: 8 } })).ok, true);
  }
  const done = await finished;
  assert.equal(done.result.winner, 'black');
  assert.deepEqual(done.spectators, ['구경꾼']);

  // 둘 다 한 판 더 → 색이 바뀐 새 대결, 관전자에게도 알려진다
  const moved = nextEvent(c, 'omok:match:state', (m) => Boolean(m.next));
  await emitAck(a, 'omok:match:rematch');
  const rematch = await emitAck(b, 'omok:match:rematch');
  assert.ok(rematch.next);
  assert.equal((await moved).next, rematch.next);
  assert.equal((await emitAck(a, 'omok:match:join', { id: rematch.next, userId: 'ua', nickname: '철수' })).color, 'black');
});
