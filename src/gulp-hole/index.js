// ===== src/gulp-hole/index.js =====
// 꿀꺽 구멍 👫 친구들과 대결(사람끼리, 봇 없음 — 사용자 결정 2026-11-20). 2~10명, 방 코드 4글자.
// 판정은 서버가 한다(서버 권위): 화면은 방향(x, z)만 보내고, 서버가 public/gulp-hole/js/rules.js로
// 0.0167초씩 판을 움직여 누가 무엇을 먹었는지 정한다. 도시는 씨앗(seed)만 보내 각 화면이 똑같이 만든다.
// 보내는 것: gh:snap(초당 15번 — 구멍 [x,z,r,점수,살았나]·차 [x,z,각도]), gh:ev(빠지기 시작·먹음·구멍 삼킴·다시 나옴), gh:over.
const crypto = require('crypto');
const R = require('../../public/gulp-hole/js/rules.js');
const { hasBadWord } = require('../../lib/bad-words');

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 10;
const STEP = 1 / 60;
const SNAP_EVERY = 2;                       // 틱 2번(1/15초)마다 위치 보내기
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function text(value, maxLength) {
  return Array.from(String(value ?? '').replace(/[<>\p{Cc}]/gu, '').trim()).slice(0, maxLength).join('');
}
const sameName = (name) => String(name).normalize('NFKC').toLowerCase().replace(/\s+/g, '');
const round1 = (v) => Math.round(v * 10) / 10;
const round2 = (v) => Math.round(v * 100) / 100;

function setupGulpHole({ io, tickMs = 1000 / 30, duration = R.DURATION }) {
  const rooms = new Map();
  let loop = null;

  function roomCode() {
    let code;
    do code = Array.from({ length: 4 }, () => CODE_CHARS[crypto.randomInt(CODE_CHARS.length)]).join('');
    while (rooms.has(code));
    return code;
  }
  const channel = (room) => 'gh:' + room.code;
  function freeColor(room) {
    const used = new Set([...room.players.values()].map((p) => p.color));
    return R.COLORS.find((c) => !used.has(c)) || R.COLORS[0];
  }
  function publicRoom(room) {
    return {
      code: room.code, title: room.title, isPublic: room.isPublic, state: room.state, hostId: room.hostId,
      min: MIN_PLAYERS, max: MAX_PLAYERS,
      players: [...room.players.values()].map((p) => ({ id: p.id, nickname: p.nickname, color: p.color, isHost: p.id === room.hostId })),
    };
  }
  function publicList() {
    return [...rooms.values()].filter((r) => r.isPublic).map((r) => ({
      code: r.code, title: r.title, count: r.players.size, max: MAX_PLAYERS, state: r.state,
      canJoin: r.state !== 'playing' && r.players.size < MAX_PLAYERS,
    })).sort((a, b) => Number(b.canJoin) - Number(a.canJoin) || b.count - a.count).slice(0, 30);
  }
  function emitRoom(room) { io.to(channel(room)).emit('gh:room', publicRoom(room)); }

  function checkName(raw) {
    const nickname = text(raw, 12);
    if (!nickname) return { error: '이름을 써 주세요.' };
    if (hasBadWord(nickname)) return { error: '그 이름은 쓸 수 없어요.' };
    return { nickname };
  }

  function leave(socket) {
    const room = rooms.get(socket.data.ghRoom);
    socket.data.ghRoom = null;
    if (!room) return;
    const me = room.players.get(socket.id);
    room.players.delete(socket.id);
    socket.leave(channel(room));
    if (room.game && me) {                       // 경기 중에 나가면 그 구멍은 사라진 채로(다시 안 나옴)
      const h = room.game.state.holes[me.slot];
      if (h) { h.alive = false; h.respawnAt = Infinity; h.name += ' (나감)'; }
    }
    if (room.players.size === 0) { rooms.delete(room.code); return; }
    if (room.hostId === socket.id) room.hostId = room.players.keys().next().value;
    if (room.game && room.players.size < 1) room.state = 'lobby';
    emitRoom(room);
  }

  function snap(room) {
    const s = room.game.state;
    const h = [];
    s.holes.forEach((x) => h.push(round1(x.x), round1(x.z), round2(x.r), x.score, x.alive ? 1 : 0));
    const c = [];
    s.drivers.forEach((o) => {
      if (o.state === 'idle') c.push(round1(o.x), round1(o.z), round2(o.rot));
      else c.push(null, null, null);
    });
    return { t: round2(s.time), h, c };
  }

  function finish(room) {
    const s = room.game.state;
    room.state = 'over';
    const list = R.standings(s).map((x) => [x.id, x.score]);
    io.to(channel(room)).emit('gh:over', { standings: list, names: s.holes.map((x) => x.name) });
    room.game = null;
    emitRoom(room);
  }

  function tick() {
    let any = false;
    for (const room of rooms.values()) {
      const g = room.game;
      if (!g) continue;
      any = true;
      const s = g.state;
      const steps = Math.max(1, Math.round(tickMs / 1000 / STEP));
      for (let i = 0; i < steps && s.phase === 'playing'; i++) R.step(s, g.inputs, STEP);
      s.changed.forEach((o) => { o._c = false; });
      s.changed.length = 0;
      const ev = [];
      for (const e of s.events) {
        if (e.type === 'fall') ev.push(['f', e.obj, e.hole]);
        else if (e.type === 'eat') ev.push(['e', e.obj, e.hole, e.pts]);
        else if (e.type === 'hole') ev.push(['h', e.hole, e.victim, e.pts]);
        else if (e.type === 'respawn') ev.push(['r', e.hole]);
      }
      s.events.length = 0;
      if (ev.length) io.to(channel(room)).emit('gh:ev', ev);
      g.tick += 1;
      if (g.tick % SNAP_EVERY === 0) io.to(channel(room)).emit('gh:snap', snap(room));
      if (s.phase !== 'playing') finish(room);
    }
    if (!any && loop) { clearInterval(loop); loop = null; }
  }

  function startGame(room) {
    const order = [...room.players.values()];
    order.forEach((p, i) => { p.slot = i; });
    const seed = crypto.randomInt(1, 2 ** 31 - 1);
    const players = order.map((p) => ({ name: p.nickname, color: p.color }));
    const state = R.createGame({ seed, players, duration });
    room.game = { state, inputs: order.map(() => ({ x: 0, z: 0 })), tick: 0 };
    room.state = 'playing';
    for (const p of order) {
      io.to(p.id).emit('gh:start', { seed, players, you: p.slot, duration });
    }
    emitRoom(room);
    if (!loop) loop = setInterval(tick, tickMs);
  }

  io.on('connection', (socket) => {
    const ok = (ack) => (typeof ack === 'function' ? ack : () => {});

    socket.on('gh:rooms', (_raw, ack) => ok(ack)({ ok: true, rooms: publicList() }));

    socket.on('gh:create', (raw, ack) => {
      const reply = ok(ack);
      const name = checkName(raw?.nickname);
      if (name.error) return reply({ ok: false, error: name.error });
      leave(socket);
      const code = roomCode();
      const room = { code, title: text(raw?.title, 20) || name.nickname + '의 방', isPublic: raw?.isPublic !== false,
        hostId: socket.id, players: new Map(), state: 'lobby', game: null, createdAt: Date.now() };
      rooms.set(code, room);
      room.players.set(socket.id, { id: socket.id, nickname: name.nickname, color: freeColor(room), slot: -1 });
      socket.join(channel(room));
      socket.data.ghRoom = code;
      reply({ ok: true, room: publicRoom(room), me: socket.id });
      emitRoom(room);
    });

    socket.on('gh:join', (raw, ack) => {
      const reply = ok(ack);
      const name = checkName(raw?.nickname);
      if (name.error) return reply({ ok: false, error: name.error });
      const room = rooms.get(text(raw?.code, 4).toUpperCase());
      if (!room) return reply({ ok: false, error: '그런 방이 없어요. 코드를 다시 확인해 주세요.' });
      if (room.state === 'playing') return reply({ ok: false, error: '이미 경기 중이에요. 끝나면 들어올 수 있어요.' });
      if (room.players.size >= MAX_PLAYERS) return reply({ ok: false, error: '방이 꽉 찼어요(최대 ' + MAX_PLAYERS + '명).' });
      if ([...room.players.values()].some((p) => sameName(p.nickname) === sameName(name.nickname))) {
        return reply({ ok: false, error: '방에 같은 이름이 있어요. 다른 이름을 써 주세요.' });
      }
      leave(socket);
      room.players.set(socket.id, { id: socket.id, nickname: name.nickname, color: freeColor(room), slot: -1 });
      socket.join(channel(room));
      socket.data.ghRoom = room.code;
      reply({ ok: true, room: publicRoom(room), me: socket.id });
      emitRoom(room);
    });

    socket.on('gh:start', (_raw, ack) => {
      const reply = ok(ack);
      const room = rooms.get(socket.data.ghRoom);
      if (!room) return reply({ ok: false, error: '방에 들어가 있지 않아요.' });
      if (room.hostId !== socket.id) return reply({ ok: false, error: '방장만 시작할 수 있어요.' });
      if (room.state === 'playing') return reply({ ok: false, error: '이미 경기 중이에요.' });
      if (room.players.size < MIN_PLAYERS) return reply({ ok: false, error: '두 명 이상 모여야 시작할 수 있어요.' });
      startGame(room);
      reply({ ok: true });
    });

    socket.on('gh:input', (raw) => {
      const room = rooms.get(socket.data.ghRoom);
      const me = room?.players.get(socket.id);
      if (!room?.game || !me || me.slot < 0) return;
      let x = Number(raw?.x), z = Number(raw?.z);
      if (!Number.isFinite(x) || !Number.isFinite(z)) return;
      const len = Math.hypot(x, z);
      if (len > 1) { x /= len; z /= len; }               // 1보다 빠르게는 못 간다(서버가 다시 검사)
      room.game.inputs[me.slot] = { x, z };
    });

    socket.on('gh:leave', (_raw, ack) => { leave(socket); ok(ack)({ ok: true }); });
    socket.on('disconnect', () => leave(socket));
  });

  return { rooms, MIN_PLAYERS, MAX_PLAYERS };
}

module.exports = { setupGulpHole };
