// 눈치게임 판정 규칙 — 소켓·타이머 없이 숫자와 시각만 다루는 순수 함수라 시험하기 쉽다.
// 한 라운드: 1부터 차례로 숫자를 외친다(누가 외칠지는 정해지지 않음). 서버가 받은 시각으로만 판정한다.
//  - 같은 숫자를 처음 외친 뒤 clashMs(0.4초) 안에 또 누가 외치면 그 숫자를 외친 사람 모두 '겹침'.
//    겹치면 그 라운드는 바로 끝난다.
//  - 한 사람만 외쳤으면 clashMs 뒤 '성공'으로 확정되고 다음 숫자로 넘어간다.
//  - 안 외친 사람이 한 명만 남으면 그 사람이 '꼴찌'.
//  - 라운드 제한 시간이 끝나면(expire) 아직 안 외친 사람 모두 '시간 초과'.
const CLASH_MS = 400;

function createRound(ids) {
  return { ids: [...ids], calls: [], pending: null, number: 0, done: false, outs: null, clashNumber: null };
}
const hasCalled = (round, userId) => round.calls.some((c) => c.userId === userId);
const uncalled = (round) => round.ids.filter((id) => !hasCalled(round, id));

function finish(round, outs) {
  round.done = true;
  round.pending = null;
  round.outs = outs;
}

// 안 외친 사람이 한 명이면 꼴찌, 아무도 없으면(나간 사람 때문에) 탈락 없이 끝.
function checkLast(round) {
  if (round.done || round.pending) return;
  const left = uncalled(round);
  if (left.length === 1 && round.ids.length >= 2) finish(round, [{ userId: left[0], why: 'last' }]);
  else if (left.length === 0 || round.ids.length < 2) finish(round, []);
}

// 기다리던 숫자를 확정한다: 한 명이면 성공, 여럿이면 겹침(라운드 끝).
function settle(round) {
  const pending = round.pending;
  if (!pending || round.done) return [];
  round.pending = null;
  const entries = round.calls.filter((c) => c.number === pending.number);
  if (pending.ids.length > 1) {
    for (const entry of entries) entry.status = 'clash';
    round.clashNumber = pending.number;
    finish(round, pending.ids.map((userId) => ({ userId, why: 'clash' })));
    return [{ type: 'clash', userIds: [...pending.ids], number: pending.number }];
  }
  entries[0].status = 'safe';
  checkLast(round);
  return [{ type: 'safe', userId: pending.ids[0], number: pending.number }];
}

// 누군가 외쳤다(now = 서버가 받은 시각). 앞 숫자의 겹침 시간이 이미 지났으면 먼저 확정한다.
function call(round, userId, now, clashMs = CLASH_MS) {
  if (round.done) return { ok: false, reason: 'done', events: [] };
  if (!round.ids.includes(userId)) return { ok: false, reason: 'not-player', events: [] };
  if (hasCalled(round, userId)) return { ok: false, reason: 'already', events: [] };
  const events = [];
  if (round.pending && now - round.pending.at > clashMs) events.push(...settle(round));
  if (round.done) return { ok: false, reason: 'done', events }; // 확정해 보니 이미 끝(예: 내가 꼴찌로 정해짐)
  let number;
  if (round.pending) {
    number = round.pending.number;
    round.pending.ids.push(userId);
  } else {
    round.number += 1;
    number = round.number;
    round.pending = { number, at: now, ids: [userId] };
  }
  round.calls.push({ userId, number, at: now, status: 'pending' });
  return { ok: true, number, events };
}

// 라운드 제한 시간이 끝났다: 기다리던 숫자를 먼저 확정하고, 그래도 안 끝났으면 안 외친 사람 모두 탈락.
function expire(round) {
  const events = settle(round);
  if (!round.done) finish(round, uncalled(round).map((userId) => ({ userId, why: 'timeout' })));
  return events;
}

// 라운드 도중 방을 나간 사람을 뺀다. 기다리던 숫자에만 있던 사람이면 그 외침도 지운다.
function removePlayer(round, userId) {
  if (round.done || !round.ids.includes(userId)) return;
  round.ids = round.ids.filter((id) => id !== userId);
  if (round.pending?.ids.includes(userId)) {
    round.pending.ids = round.pending.ids.filter((id) => id !== userId);
    round.calls = round.calls.filter((c) => !(c.userId === userId && c.number === round.pending.number));
    if (!round.pending.ids.length) { round.pending = null; round.number -= 1; }
  }
  checkLast(round);
}

// 끝난 라운드를 게임 규칙에 맞게 정리한다.
// 생존 모드: 남은 사람 모두가 탈락하게 되면(2명이 겹침, 아무도 안 누름 등) 아무도 안 빠지고 다시 한다.
// 점수 모드: 탈락한 사람마다 벌점 1점(모두여도 그대로).
function outcome(round, mode) {
  const outs = round.outs || [];
  const redo = mode === 'survival' && (outs.length === 0 || outs.length >= round.ids.length);
  return { outs: redo ? [] : outs, redo, everyone: outs.length >= round.ids.length && outs.length > 0, empty: round.calls.length === 0 };
}

// 최종 순위. 생존 모드는 늦게 떨어질수록 위(같은 라운드에 떨어지면 같은 등수), 점수 모드는 벌점 적은 순.
// players: [{ userId, outRound(null=생존), penalty }]
function rankPlayers(players, mode) {
  const key = mode === 'survival' ? (p) => -(p.outRound ?? Infinity) : (p) => p.penalty;
  return players.map((p) => ({ ...p, rank: players.filter((o) => key(o) < key(p)).length + 1 }))
    .sort((a, b) => a.rank - b.rank);
}

module.exports = { CLASH_MS, createRound, call, settle, expire, removePlayer, outcome, rankPlayers, uncalled, hasCalled };
