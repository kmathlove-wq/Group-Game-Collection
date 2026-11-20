// ===== src/baseball/index.js =====
// 풀카운트 야구 👫 친구와 경기(사용자 결정 2026-11-20: 사람끼리, 팀을 골라 유니폼이 다름).
// 방에는 원정·홈 두 자리 + 관전. 서버가 rules.js로 판정한다(서버 권위):
//   차례(bb:turn) → 투수 화면이 구종·코스·제구를 보냄(bb:pitch) → 서버가 공을 만들어 모두에게(bb:pitch)
//   → 타자 화면이 스윙 타이밍(dt)·타격 원 위치를 보냄(bb:swing) → 서버가 판정해 모두에게(bb:result) → 연출 시간 뒤 다음 차례.
// 타이밍은 타자 화면이 자기 화면의 공을 보고 재므로 인터넷이 느려도 밀리지 않는다. 값의 범위는 서버가 다시 검사한다.
const crypto = require('crypto');
const R = require('../../public/baseball/js/rules.js');
const { hasBadWord } = require('../../lib/bad-words');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_PEOPLE = 20;
const AIM_TIMEOUT_MS = 45_000;

function text(value, maxLength) {
  return Array.from(String(value ?? '').replace(/[<>\p{Cc}]/gu, '').trim()).slice(0, maxLength).join('');
}
const sameName = (n) => String(n).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
const clampNum = (v, a, b, d) => { const n = Number(v); return Number.isFinite(n) ? Math.max(a, Math.min(b, n)) : d; };

function summary(s) {
  return { innings: s.innings, inning: s.inning, half: s.half, teams: s.teams, outs: s.outs, balls: s.balls, strikes: s.strikes,
    bases: s.bases.slice(), score: { ...s.score }, hits: { ...s.hits }, line: { away: s.line.away.slice(), home: s.line.home.slice() },
    battingOrder: { ...s.battingOrder }, over: s.over, winner: s.winner, level: s.level };
}

function setupBaseball({ io, timing = {} }) {
  const T = { start: 2600, after: 1.0, ...timing };          // 시험에서는 짧게 바꿀 수 있다
  const rooms = new Map();
  const channel = (room) => 'bb:' + room.code;

  function roomCode() {
    let code;
    do code = Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
    while (rooms.has(code));
    return code;
  }
  function publicRoom(room) {
    const seat = (side) => { const id = room.seats[side]; const p = id && room.players.get(id); return p ? { id: p.id, nickname: p.nickname } : null; };
    return { code: room.code, title: room.title, hostId: room.hostId, state: room.state, innings: room.innings, teams: { ...room.teams },
      seats: { away: seat('away'), home: seat('home') }, players: [...room.players.values()].map((p) => ({ id: p.id, nickname: p.nickname })) };
  }
  function publicList() {
    return [...rooms.values()].map((r) => ({ code: r.code, title: r.title, count: r.players.size, state: r.state }))
      .sort((a, b) => (a.state === 'playing') - (b.state === 'playing') || b.count - a.count).slice(0, 30);
  }
  const emitRoom = (room) => io.to(channel(room)).emit('bb:room', publicRoom(room));
  function checkName(raw) {
    const nickname = text(raw, 12);
    if (!nickname) return { error: '이름을 써 주세요.' };
    if (hasBadWord(nickname)) return { error: '그 이름은 쓸 수 없어요.' };
    return { nickname };
  }

  function clearTimers(g) { if (g) { clearTimeout(g.timer); g.timer = null; } }
  function stopGame(room, reason) {
    if (!room.game) return;
    clearTimers(room.game);
    room.game = null;
    room.state = 'lobby';
    io.to(channel(room)).emit('bb:stopped', { reason });
    emitRoom(room);
  }

  function turn(room) {
    const g = room.game;
    if (!g) return;
    const s = g.s;
    if (s.over) {
      io.to(channel(room)).emit('bb:over', { state: summary(s) });
      room.game = null;
      room.state = 'lobby';
      emitRoom(room);
      return;
    }
    g.seq += 1;
    g.phase = 'aim';
    g.pitch = null;
    const pitcherId = room.seats[R.fieldingSide(s)], batterId = room.seats[R.battingSide(s)];
    io.to(channel(room)).emit('bb:turn', { seq: g.seq, pitcherId, batterId, state: summary(s) });
    clearTimers(g);
    g.timer = setTimeout(() => {                                // 너무 오래 안 던지면 가운데 직구로
      if (room.game === g && g.phase === 'aim') throwPitch(room, { type: 'fastball', target: { x: 0, y: 0.78 }, acc: 0.5 });
    }, AIM_TIMEOUT_MS);
  }

  function throwPitch(room, raw) {
    const g = room.game;
    const type = R.PITCHES[raw?.type] ? raw.type : 'fastball';
    const target = { x: clampNum(raw?.target?.x, -0.75, 0.75, 0), y: clampNum(raw?.target?.y, 0.15, 1.65, 0.78) };
    const acc = clampNum(raw?.acc, 0, 1, 0.5);
    const pitch = R.makePitch(type, target, 0.015 + (1 - acc) * 0.13, g.s.rand);
    g.pitch = pitch;
    g.phase = 'pitching';
    io.to(channel(room)).emit('bb:pitch', { seq: g.seq, pitch });
    clearTimers(g);
    // 타자가 아무것도 안 보내면(나감·멈춤) 안 친 것으로
    g.timer = setTimeout(() => { if (room.game === g && g.phase === 'pitching') resolve(room, null); },
      (R.PITCH_RELEASE + pitch.cross.t + 3) * 1000);
  }

  function resolve(room, swing) {
    const g = room.game;
    g.phase = 'play';
    clearTimers(g);
    const res = R.resolveSwing(g.pitch, swing, g.s.rand);
    const out = R.applyPitch(g.s, g.pitch, res, g.s.rand);
    io.to(channel(room)).emit('bb:result', { seq: g.seq, out, state: summary(g.s) });
    // 화면 연출 시간만큼 기다렸다가 다음 차례(화면의 after 시간 + 여유)
    let wait = out.play ? out.play.duration + (out.runs ? 2.2 : 1.4) : (out.halfOver || out.event ? 1.9 : 1.25);
    if (out.halfOver) wait += 2.0;
    g.timer = setTimeout(() => { if (room.game === g) turn(room); }, (wait + T.after) * 1000);
  }

  function leave(socket) {
    const room = rooms.get(socket.data.bbRoom);
    socket.data.bbRoom = null;
    if (!room) return;
    room.players.delete(socket.id);
    socket.leave(channel(room));
    let seated = false;
    for (const side of ['away', 'home']) if (room.seats[side] === socket.id) { room.seats[side] = null; seated = true; }
    if (room.players.size === 0) { clearTimers(room.game); rooms.delete(room.code); return; }
    if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
    if (seated && room.game) stopGame(room, '선수가 나가서 경기가 멈췄어요.');
    emitRoom(room);
  }

  function enter(socket, room, nickname) {
    leave(socket);
    room.players.set(socket.id, { id: socket.id, nickname });
    socket.join(channel(room));
    socket.data.bbRoom = room.code;
    for (const side of ['away', 'home']) {                        // 빈자리가 있으면 자동으로 앉힌다(경기 중이 아닐 때)
      if (!room.game && !room.seats[side]) { room.seats[side] = socket.id; break; }
    }
  }

  io.on('connection', (socket) => {
    const ok = (ack) => (typeof ack === 'function' ? ack : () => {});
    const mine = () => { const room = rooms.get(socket.data.bbRoom); return room && room.players.has(socket.id) ? room : null; };

    socket.on('bb:rooms', (_raw, ack) => ok(ack)({ ok: true, rooms: publicList() }));

    socket.on('bb:create', (raw, ack) => {
      const reply = ok(ack);
      const name = checkName(raw?.nickname);
      if (name.error) return reply({ ok: false, error: name.error });
      const room = { code: roomCode(), title: name.nickname + '의 야구장', hostId: socket.id, players: new Map(), seats: { away: null, home: null },
        teams: { away: 'foxes', home: 'whales' }, innings: 3, state: 'lobby', game: null };
      rooms.set(room.code, room);
      enter(socket, room, name.nickname);
      room.hostId = socket.id;
      reply({ ok: true, room: publicRoom(room), me: socket.id });
      emitRoom(room);
    });

    socket.on('bb:join', (raw, ack) => {
      const reply = ok(ack);
      const name = checkName(raw?.nickname);
      if (name.error) return reply({ ok: false, error: name.error });
      const room = rooms.get(text(raw?.code, 4).toUpperCase());
      if (!room) return reply({ ok: false, error: '그런 방이 없어요. 코드를 다시 확인해 주세요.' });
      if (room.players.size >= MAX_PEOPLE) return reply({ ok: false, error: '방이 꽉 찼어요.' });
      if ([...room.players.values()].some((p) => sameName(p.nickname) === sameName(name.nickname) && p.id !== socket.id)) {
        return reply({ ok: false, error: '방에 같은 이름이 있어요. 다른 이름을 써 주세요.' });
      }
      enter(socket, room, name.nickname);
      reply({ ok: true, room: publicRoom(room), me: socket.id, state: room.game ? summary(room.game.s) : null });
      emitRoom(room);
    });

    socket.on('bb:seat', (raw, ack) => {
      const reply = ok(ack), room = mine();
      const side = raw?.side === 'home' ? 'home' : raw?.side === 'away' ? 'away' : null;
      if (!room || !side) return reply({ ok: false, error: '방에 들어가 있지 않아요.' });
      if (room.game) return reply({ ok: false, error: '경기 중에는 자리를 바꿀 수 없어요.' });
      if (room.seats[side] && room.seats[side] !== socket.id) return reply({ ok: false, error: '이미 다른 사람이 앉았어요.' });
      for (const s of ['away', 'home']) if (room.seats[s] === socket.id) room.seats[s] = null;
      room.seats[side] = socket.id;
      reply({ ok: true });
      emitRoom(room);
    });

    socket.on('bb:team', (raw, ack) => {
      const reply = ok(ack), room = mine();
      const side = raw?.side === 'home' ? 'home' : raw?.side === 'away' ? 'away' : null;
      if (!room || !side) return reply({ ok: false, error: '방에 들어가 있지 않아요.' });
      if (room.game) return reply({ ok: false, error: '경기 중에는 팀을 바꿀 수 없어요.' });
      if (room.seats[side] !== socket.id) return reply({ ok: false, error: '내 자리의 팀만 고를 수 있어요.' });
      if (!R.TEAMS.some((t) => t.id === raw?.team)) return reply({ ok: false, error: '없는 팀이에요.' });
      const other = side === 'away' ? 'home' : 'away';
      if (room.teams[other] === raw.team) return reply({ ok: false, error: '상대와 다른 팀을 골라 주세요.' });
      room.teams[side] = raw.team;
      reply({ ok: true });
      emitRoom(room);
    });

    socket.on('bb:innings', (raw) => {
      const room = mine();
      if (!room || room.hostId !== socket.id || room.game) return;
      const n = Number(raw?.innings);
      if ([1, 3, 5].includes(n)) { room.innings = n; emitRoom(room); }
    });

    socket.on('bb:start', (_raw, ack) => {
      const reply = ok(ack), room = mine();
      if (!room) return reply({ ok: false, error: '방에 들어가 있지 않아요.' });
      if (room.hostId !== socket.id) return reply({ ok: false, error: '방장만 시작할 수 있어요.' });
      if (room.game) return reply({ ok: false, error: '이미 경기 중이에요.' });
      if (!room.seats.away || !room.seats.home) return reply({ ok: false, error: '두 자리에 한 명씩 앉아야 해요.' });
      const s = R.createGame({ seed: crypto.randomInt(1, 2 ** 31 - 1), away: room.teams.away, home: room.teams.home, innings: room.innings, level: 'normal' });
      room.game = { s, seq: 0, phase: 'start', pitch: null, timer: null };
      room.state = 'playing';
      io.to(channel(room)).emit('bb:start', { state: summary(s), seats: { ...room.seats } });
      emitRoom(room);
      const g = room.game;
      g.timer = setTimeout(() => { if (room.game === g) turn(room); }, T.start);
      reply({ ok: true });
    });

    socket.on('bb:pitch', (raw, ack) => {
      const room = mine(), g = room?.game;
      if (!g || g.phase !== 'aim' || room.seats[R.fieldingSide(g.s)] !== socket.id) return ok(ack)({ ok: false, error: '지금은 던질 차례가 아니에요.' });
      throwPitch(room, raw);
      ok(ack)({ ok: true });
    });

    socket.on('bb:swing', (raw, ack) => {
      const room = mine(), g = room?.game;
      if (!g || g.phase !== 'pitching' || room.seats[R.battingSide(g.s)] !== socket.id) return ok(ack)({ ok: false });
      const sw = raw?.none ? null : { dt: clampNum(raw?.dt, -2, 2, 2), x: clampNum(raw?.x, -1, 1, 0), y: clampNum(raw?.y, 0, 2, 0) };
      resolve(room, sw);
      ok(ack)({ ok: true });
    });

    socket.on('bb:leave', (_raw, ack) => { leave(socket); ok(ack)({ ok: true }); });
    socket.on('disconnect', () => leave(socket));
  });

  return { rooms };
}

module.exports = { setupBaseball, summary };
