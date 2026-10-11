// 1:1 대결 게임(오목·바둑·체스) 공통 서버: 로비 → 대결 신청/수정 요청/수락 → 대국(시계) → 관전·채팅·한 판 더.
// 게임마다 다른 것은 규칙 모듈(omok.js·baduk.js·chess.js)만 바꿔 끼운다.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Clock = require('./clock');

const OFFER_MS = 60_000;          // 신청에 답할 시간(수정 요청을 보내면 다시 60초)
const DISCONNECT_GRACE_MS = 3_000; // 새로고침·화면 이동은 3초 안에 돌아온다
const FORFEIT_MS = 60_000;        // 대국 중 나간 선수가 이 시간 안에 안 돌아오면 기권
const FINISHED_KEEP_MS = 10 * 60_000;
const CHAT_LIMIT = 100;
const LOBBY_PING_MS = 5_000;      // 로비 화면은 보고 있는 동안 5초마다 "아직 있어요"를 보낸다
const LOBBY_TIMEOUT_MS = 15_000;  // 15초 동안 소식이 없으면 로비 목록에서 뺀다(휴대폰 앱 전환·전원 꺼짐 대비)

const GAMES = {
  omok: {
    rules: require('./omok'), title: '오목', emoji: '⚫', board: 'grid',
    intro: '가로·세로·대각선으로 내 돌 다섯 개를 먼저 이으면 이겨요.',
    features: [['⚫', '다섯 개를 먼저', '가로·세로·대각선 어느 쪽이든'], ['🚫', '금수 규칙 고르기', '렌주룰·쌍삼 금지 등'], ['👀', '관전 가능', '다른 사람 대결도 구경해요']]
  },
  baduk: {
    rules: require('./baduk'), title: '바둑', emoji: '⚪', board: 'grid',
    intro: '돌로 빈칸을 둘러싸 집을 만들고, 상대 돌을 따내요. 집이 많은 쪽이 이겨요.',
    features: [['🏠', '집 넓히기', '내 돌로 둘러싼 빈칸이 내 집'], ['✊', '돌 따내기', '숨구멍을 모두 막으면 따내요'], ['🤝', '쉬기 두 번이면 계가', '죽은 돌 표시 후 집 세기']]
  },
  chess: {
    rules: require('./chess'), title: '체스', emoji: '♞', board: 'chess',
    intro: '여섯 종류의 말을 움직여 상대 킹을 꼼짝 못 하게(체크메이트) 만들면 이겨요.',
    features: [['♚', '체크메이트', '킹을 피할 곳 없이 잡으면 승리'], ['🏰', '특수 규칙까지', '캐슬링·앙파상·프로모션'], ['⏱', '체스 시계', '각자 정한 시간 안에 두기']]
  }
};

function text(value, maxLength) {
  return [...String(value ?? '').replace(/[<>\p{Cc}]/gu, '').trim()].slice(0, maxLength).join('');
}
const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

const { describeTime } = Clock;

function setupDuelGame({ app, io, kind }) {
  const { rules, title, emoji, intro, features, board } = GAMES[kind];
  const [first, second] = rules.colors;
  const other = (color) => (color === first ? second : first);
  const ev = (name) => `${kind}:${name}`;
  const lobbyChannel = `${kind}:lobby`;
  const matchChannel = (match) => `${kind}:match:${match.id}`;

  // ── 화면: 세 게임이 같은 틀(pages/*.html)에 이름·설명만 바꿔 끼운다 ──
  const fill = (file) => fs.readFileSync(path.join(__dirname, 'pages', file), 'utf8')
    .replaceAll('{{KIND}}', kind).replaceAll('{{BOARD}}', board).replaceAll('{{TITLE}}', escapeHtml(title)).replaceAll('{{EMOJI}}', escapeHtml(emoji))
    .replaceAll('{{INTRO}}', escapeHtml(intro))
    .replaceAll('{{FEATURES}}', features.map(([icon, head, sub]) => `<div><span>${escapeHtml(icon)}</span><strong>${escapeHtml(head)}</strong><small>${escapeHtml(sub)}</small></div>`).join(''));
  const lobbyPage = fill('lobby.html'); const matchPage = fill('match.html');
  app.get(`/${kind}`, (_req, res) => res.type('html').send(lobbyPage));
  app.get(`/${kind}/match`, (_req, res) => res.type('html').send(matchPage));
  app.get('/duel-rules/clock.js', (_req, res) => res.sendFile(path.join(__dirname, 'clock.js')));
  app.get(`/duel-rules/${kind}.js`, (_req, res) => res.sendFile(path.join(__dirname, `${kind}.js`)));

  const users = new Map();   // 로비에 있는 사람: userId → { userId, nickname, socketId, offerId, leaveTimer }
  const offers = new Map();  // 주고받는 중인 대결 신청
  const matches = new Map(); // 진행 중·막 끝난 대결

  function newId(map) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let id;
    do id = Array.from({ length: 6 }, () => chars[crypto.randomInt(chars.length)]).join('');
    while (map.has(id));
    return id;
  }

  function normalizeTerms(raw) {
    return { myColor: rules.colors.includes(raw?.myColor) ? raw.myColor : 'random', time: Clock.normalizeTime(raw?.time, rules.timeModes), rule: rules.normalizeSettings(raw?.rule) };
  }

  // ── 로비 ──
  function lobbyState() {
    return {
      users: [...users.values()].map((u) => ({ userId: u.userId, nickname: u.nickname, busy: Boolean(u.offerId) })),
      matches: [...matches.values()].filter((m) => m.state === 'playing').map((m) => ({
        id: m.id, seats: rules.colors.map((color) => ({ color, nickname: m.seats[color].nickname })),
        spectators: m.spectators.size, moveCount: rules.moveCount(m.game), summary: summaryOf(m), createdAt: m.createdAt
      }))
    };
  }
  function emitLobby() { io.to(lobbyChannel).emit(ev('lobby:state'), lobbyState()); }
  const summaryOf = ({ time, rule }) => `${describeTime(time)} · ${rules.describeSettings(rule)}`;

  function lobbyMember(socket) {
    const user = users.get(socket.data[`${kind}User`]);
    return user && user.socketId === socket.id ? user : null;
  }
  // 로비 목록에서 빼고, 주고받던 신청도 취소한다.
  function removeUser(user) {
    if (users.get(user.userId) !== user) return;
    clearTimeout(user.leaveTimer);
    users.delete(user.userId);
    io.sockets.sockets.get(user.socketId)?.leave(lobbyChannel);
    const offer = offers.get(user.offerId);
    if (offer) closeOffer(offer, `${user.nickname}님이 로비를 떠나서 신청이 취소됐어요.`);
    emitLobby();
  }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const user of [...users.values()]) if (now - user.seenAt > LOBBY_TIMEOUT_MS) removeUser(user);
  }, LOBBY_PING_MS);
  sweep.unref?.();

  // ── 대결 신청 ──
  function publicOffer(offer) {
    return { id: offer.id, from: { userId: offer.fromId, nickname: users.get(offer.fromId)?.nickname || '' },
      to: { userId: offer.toId, nickname: users.get(offer.toId)?.nickname || '' }, round: offer.round,
      waitingFor: offer.waitingFor, msLeft: Math.max(0, offer.expiresAt - Date.now()),
      terms: { fromColor: offer.fromColor, time: offer.time, rule: offer.rule },
      summary: `${describeTime(offer.time)} · ${rules.describeSettings(offer.rule)}` };
  }
  function sendOffer(offer) {
    const data = publicOffer(offer);
    for (const id of [offer.fromId, offer.toId]) io.to(users.get(id)?.socketId || '').emit(ev('offer'), data);
  }
  function armOffer(offer) {
    clearTimeout(offer.timer);
    offer.expiresAt = Date.now() + OFFER_MS;
    offer.timer = setTimeout(() => closeOffer(offer, '답이 없어서 대결 신청이 취소됐어요.'), OFFER_MS);
    offer.timer.unref?.();
  }
  function closeOffer(offer, message) {
    clearTimeout(offer.timer); offers.delete(offer.id);
    for (const id of [offer.fromId, offer.toId]) {
      const user = users.get(id); if (!user) continue;
      if (user.offerId === offer.id) user.offerId = null;
      io.to(user.socketId).emit(ev('offer:closed'), { id: offer.id, message });
    }
    emitLobby();
  }
  // 보낸 사람 기준 "내 색"을 신청한 사람(from) 기준 색으로 바꿔 저장한다.
  function applyTerms(offer, senderId, terms) {
    offer.fromColor = terms.myColor === 'random' || senderId === offer.fromId ? terms.myColor : other(terms.myColor);
    offer.time = terms.time; offer.rule = terms.rule;
  }

  // ── 대국 ──
  function createMatch({ seats, time, rule }) {
    const match = { id: newId(matches), seats, time, rule, game: rules.createGame(rule), state: 'playing', result: null,
      clocks: time.mode === 'none' ? null : Object.fromEntries(rules.colors.map((c) => [c, Clock.startClock(time)])),
      clockColor: null, turnStartedAt: Date.now(), clockTimer: null, chat: [], spectators: new Map(),
      drawOffer: null, rematch: new Set(), next: null, createdAt: Date.now() };
    matches.set(match.id, match);
    // 수락하고 대결 화면에 끝내 안 들어오는 선수가 있으면 기권 처리해서 "진행 중"으로 남지 않게 한다.
    for (const color of rules.colors) {
      const seat = seats[color];
      Object.assign(seat, { connected: false, socketId: null });
      seat.awayTimer = setTimeout(() => {
        if (seat.socketId || match.state !== 'playing') return;
        finish(match, match.seats[other(color)].socketId
          ? { winner: other(color), reason: `${seat.nickname}님이 들어오지 않아 기권 처리됐어요.` }
          : { winner: null, reason: '두 선수 모두 들어오지 않아 대결이 취소됐어요.' });
      }, FORFEIT_MS);
      seat.awayTimer.unref?.();
    }
    addChat(match, { type: 'system', text: `대결 시작! ${rules.colors.map((c) => `${rules.colorNames[c]} ${seats[c].nickname}`).join(' vs ')} · ${summaryOf(match)}` });
    armClock(match);
    return match;
  }

  function addChat(match, message) {
    match.chat.push({ id: crypto.randomUUID(), at: Date.now(), ...message });
    if (match.chat.length > CHAT_LIMIT) match.chat.splice(0, match.chat.length - CHAT_LIMIT);
    io.to(matchChannel(match)).emit(ev('match:chat'), match.chat.at(-1));
  }

  // 시계는 "이번 차례가 시작될 때" 상태로 두고, 차례가 끝날 때만 쓴 시간을 반영한다(초읽기가 다시 차야 하므로).
  const spentNow = (match) => Date.now() - match.turnStartedAt;
  function armClock(match) {
    clearTimeout(match.clockTimer);
    match.clockColor = match.state === 'playing' ? rules.turnOf(match.game) : null;
    match.turnStartedAt = Date.now();
    if (!match.clocks || !match.clockColor) return;
    const color = match.clockColor;
    match.clockTimer = setTimeout(() => {
      if (match.clockColor !== color || Clock.spend(match.clocks[color], spentNow(match), match.time)) { armClock(match); return; }
      flag(match, color);
    }, Clock.msUntilFlag(match.clocks[color], match.time) + 30);
    match.clockTimer.unref?.();
  }
  function flag(match, color) {
    match.clocks[color] = { main: 0, periods: 0 };
    match.clockColor = null;
    finish(match, { winner: other(color), reason: `${match.seats[color].nickname}님의 시간이 다 됐어요.` });
  }

  function publicMatch(match) {
    return {
      id: match.id, kind, state: match.state, result: match.result, colors: rules.colors, next: match.next,
      seats: Object.fromEntries(rules.colors.map((c) => [c, { userId: match.seats[c].userId, nickname: match.seats[c].nickname, connected: match.seats[c].connected }])),
      game: rules.publicGame(match.game), clocks: match.clocks, clockColor: match.clockColor, spent: match.clockColor ? spentNow(match) : 0, time: match.time,
      rule: match.rule, summary: summaryOf(match), spectators: [...match.spectators.values()],
      drawOffer: match.drawOffer, rematch: [...match.rematch]
    };
  }
  function emitMatch(match) { io.to(matchChannel(match)).emit(ev('match:state'), publicMatch(match)); }

  function finish(match, result) {
    if (match.state !== 'playing') return;
    if (match.clockColor && match.clocks) match.clocks[match.clockColor] = Clock.spend(match.clocks[match.clockColor], spentNow(match), match.time) || { main: 0, periods: 0 };
    clearTimeout(match.clockTimer);
    match.state = 'finished'; match.result = result; match.clockColor = null; match.drawOffer = null;
    addChat(match, { type: 'system', text: `🏁 ${result.reason}` });
    emitMatch(match); emitLobby();
    setTimeout(() => {
      if (matches.get(match.id) !== match) return;
      for (const seat of Object.values(match.seats)) clearTimeout(seat.awayTimer);
      matches.delete(match.id);
    }, FINISHED_KEEP_MS).unref?.();
  }

  function seatOf(socket) {
    const info = socket.data[`${kind}Match`];
    const match = matches.get(info?.id);
    if (!match) return {};
    const color = info.color && match.seats[info.color]?.socketId === socket.id ? info.color : null;
    return { match, color };
  }

  io.on('connection', (socket) => {
    const handle = (name, fn) => socket.on(ev(name), (raw, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try { fn(raw, reply); } catch (error) { console.error(`[${kind}] ${name}`, error); reply({ ok: false, message: '서버에서 문제가 생겼어요.' }); }
    });

    // ── 로비 ──
    handle('lobby:enter', (raw, ack) => {
      const nickname = text(raw?.nickname, 30); const userId = text(raw?.userId, 80);
      if (!nickname || !userId) return ack({ ok: false, message: '닉네임을 입력해 주세요.' });
      const lower = nickname.toLocaleLowerCase('ko-KR');
      if ([...users.values()].some((u) => u.userId !== userId && u.nickname.toLocaleLowerCase('ko-KR') === lower)) {
        return ack({ ok: false, message: '로비에 같은 닉네임이 있어요. 다른 닉네임을 써 주세요.' });
      }
      const user = users.get(userId) || { userId, offerId: null };
      clearTimeout(user.leaveTimer);
      if (!offers.has(user.offerId)) user.offerId = null;
      if (user.socketId && user.socketId !== socket.id) io.sockets.sockets.get(user.socketId)?.leave(lobbyChannel);
      Object.assign(user, { nickname, socketId: socket.id, seenAt: Date.now() });
      users.set(userId, user);
      socket.data[`${kind}User`] = userId; socket.join(lobbyChannel);
      ack({ ok: true, lobby: lobbyState(), pingMs: LOBBY_PING_MS });
      if (user.offerId && offers.has(user.offerId)) socket.emit(ev('offer'), publicOffer(offers.get(user.offerId)));
      emitLobby();
    });

    handle('lobby:here', (_raw, ack) => {
      const user = lobbyMember(socket);
      if (!user) return ack({ ok: false });
      user.seenAt = Date.now(); ack({ ok: true });
    });

    // 로비 화면을 떠나거나(다른 화면·탭·앱으로) 닫을 때 바로 목록에서 뺀다.
    handle('lobby:leave', (_raw, ack) => {
      const user = lobbyMember(socket);
      if (user) removeUser(user);
      socket.leave(lobbyChannel);
      ack({ ok: true });
    });

    handle('offer:send', (raw, ack) => {
      const me = lobbyMember(socket); if (!me) return ack({ ok: false, message: '먼저 로비에 들어와 주세요.' });
      const target = users.get(text(raw?.toId, 80));
      if (!target || target.userId === me.userId) return ack({ ok: false, message: '대결할 상대를 찾을 수 없어요.' });
      if (Date.now() - target.seenAt > LOBBY_TIMEOUT_MS) {
        removeUser(target); return ack({ ok: false, message: `${target.nickname}님은 로비를 떠났어요.` });
      }
      if (me.offerId) return ack({ ok: false, message: '이미 주고받는 중인 신청이 있어요.' });
      if (target.offerId) return ack({ ok: false, message: `${target.nickname}님은 다른 사람과 신청을 주고받는 중이에요.` });
      const offer = { id: newId(offers), fromId: me.userId, toId: target.userId, round: 1, waitingFor: target.userId };
      applyTerms(offer, me.userId, normalizeTerms(raw?.terms));
      offers.set(offer.id, offer); me.offerId = offer.id; target.offerId = offer.id;
      armOffer(offer); sendOffer(offer); emitLobby();
      ack({ ok: true, id: offer.id });
    });

    handle('offer:reply', (raw, ack) => {
      const me = lobbyMember(socket); const offer = offers.get(text(raw?.id, 10));
      if (!me || !offer || ![offer.fromId, offer.toId].includes(me.userId)) return ack({ ok: false, message: '이미 끝난 신청이에요.' });
      const action = raw?.action;
      if (action === 'cancel') { closeOffer(offer, `${me.nickname}님이 신청을 취소했어요.`); return ack({ ok: true }); }
      if (offer.waitingFor !== me.userId) return ack({ ok: false, message: '상대의 답을 기다리는 중이에요.' });
      if (action === 'decline') { closeOffer(offer, `${me.nickname}님이 대결을 거절했어요.`); return ack({ ok: true }); }
      if (action === 'modify') {
        applyTerms(offer, me.userId, normalizeTerms(raw?.terms));
        offer.round += 1; offer.waitingFor = me.userId === offer.fromId ? offer.toId : offer.fromId;
        armOffer(offer); sendOffer(offer);
        return ack({ ok: true });
      }
      if (action !== 'accept') return ack({ ok: false, message: '알 수 없는 답이에요.' });

      const fromColor = offer.fromColor === 'random' ? rules.colors[crypto.randomInt(2)] : offer.fromColor;
      const seat = (id) => ({ userId: id, nickname: users.get(id)?.nickname || '선수' });
      const match = createMatch({ seats: { [fromColor]: seat(offer.fromId), [other(fromColor)]: seat(offer.toId) }, time: offer.time, rule: offer.rule });
      clearTimeout(offer.timer); offers.delete(offer.id);
      for (const id of [offer.fromId, offer.toId]) {
        const user = users.get(id); if (!user) continue;
        user.offerId = null;
        io.to(user.socketId).emit(ev('offer:accepted'), { id: offer.id, matchId: match.id });
      }
      emitLobby();
      ack({ ok: true, matchId: match.id });
    });

    // ── 대국 ──
    handle('match:join', (raw, ack) => {
      const match = matches.get(text(raw?.id, 10).toUpperCase());
      if (!match) return ack({ ok: false, message: '대결을 찾을 수 없어요. 이미 끝났을 수 있어요.' });
      const userId = text(raw?.userId, 80); const nickname = text(raw?.nickname, 30) || '관전자';
      const color = rules.colors.find((c) => match.seats[c].userId === userId) || null;
      socket.join(matchChannel(match));
      socket.data[`${kind}Match`] = { id: match.id, color };
      if (color) {
        const seat = match.seats[color]; const wasAway = seat.socketId && !seat.connected;
        clearTimeout(seat.awayTimer);
        Object.assign(seat, { socketId: socket.id, connected: true });
        if (wasAway && match.state === 'playing') addChat(match, { type: 'system', text: `${seat.nickname}님이 돌아왔어요.` });
      } else if (!match.spectators.has(socket.id)) {
        match.spectators.set(socket.id, nickname);
        addChat(match, { type: 'system', text: `👀 ${nickname}님이 관전을 시작했어요.` });
        emitLobby();
      }
      socket.emit(ev('match:history'), match.chat);
      ack({ ok: true, color });
      emitMatch(match);
    });

    handle('match:act', (raw, ack) => {
      const { match, color } = seatOf(socket);
      if (!match || !color) return ack({ ok: false, message: '선수만 둘 수 있어요.' });
      if (match.state !== 'playing') return ack({ ok: false, message: '이미 끝난 대결이에요.' });
      const ticking = match.clocks && match.clockColor === color;
      if (ticking && !Clock.spend(match.clocks[color], spentNow(match), match.time)) {
        flag(match, color); return ack({ ok: false, message: '시간이 다 됐어요.' });
      }
      const result = rules.act(match.game, color, raw?.action);
      if (!result.ok) return ack(result);
      // 내 차례를 마쳤으면 쓴 시간을 시계에 반영한다(초읽기는 다시 꽉 차고, 피셔는 추가 시간을 받는다).
      if (ticking && rules.turnOf(match.game) !== color) match.clocks[color] = Clock.commit(match.clocks[color], spentNow(match), match.time);
      if (match.drawOffer) { match.drawOffer = null; addChat(match, { type: 'system', text: '수를 둬서 무승부 제안이 없어졌어요.' }); }
      io.to(matchChannel(match)).emit(ev('match:acted'), { color, action: raw.action, captured: result.captured || 0 });
      if (result.notice) addChat(match, { type: 'system', text: result.notice });
      ack({ ok: true });
      const over = rules.resultOf(match.game);
      if (over) { finish(match, over); return; }
      armClock(match); emitMatch(match);
    });

    handle('match:resign', (_raw, ack) => {
      const { match, color } = seatOf(socket);
      if (!match || !color || match.state !== 'playing') return ack({ ok: false, message: '기권할 수 있는 대결이 아니에요.' });
      finish(match, { winner: other(color), reason: `${match.seats[color].nickname}님이 기권했어요.` });
      ack({ ok: true });
    });

    handle('match:draw', (raw, ack) => {
      const { match, color } = seatOf(socket);
      if (!match || !color || match.state !== 'playing' || !rules.allowDraw) return ack({ ok: false, message: '지금은 무승부를 제안할 수 없어요.' });
      const nickname = match.seats[color].nickname;
      if (raw?.action === 'offer') {
        if (match.drawOffer) return ack({ ok: false, message: '이미 무승부 제안이 있어요.' });
        match.drawOffer = color; addChat(match, { type: 'system', text: `🤝 ${nickname}님이 무승부를 제안했어요.` });
      } else if (raw?.action === 'accept' && match.drawOffer === other(color)) {
        finish(match, { winner: null, reason: '두 사람이 무승부에 합의했어요.' }); return ack({ ok: true });
      } else if (raw?.action === 'decline' && match.drawOffer) {
        const mine = match.drawOffer === color;
        match.drawOffer = null; addChat(match, { type: 'system', text: mine ? `${nickname}님이 무승부 제안을 거뒀어요.` : `${nickname}님이 무승부 제안을 거절했어요.` });
      } else return ack({ ok: false, message: '할 수 없는 동작이에요.' });
      emitMatch(match); ack({ ok: true });
    });

    // 끝난 뒤 두 선수가 모두 누르면 색을 바꿔 같은 조건으로 한 판 더. 관전자도 함께 새 대결로 옮겨 간다.
    handle('match:rematch', (_raw, ack) => {
      const { match, color } = seatOf(socket);
      if (!match || !color || match.state !== 'finished') return ack({ ok: false, message: '대결이 끝난 뒤에 누를 수 있어요.' });
      if (match.next) return ack({ ok: true, next: match.next });
      match.rematch.add(color);
      if (match.rematch.size < 2) {
        addChat(match, { type: 'system', text: `${match.seats[color].nickname}님이 한 판 더 하고 싶어 해요!` });
        emitMatch(match); return ack({ ok: true });
      }
      const seats = { [first]: { ...match.seats[second] }, [second]: { ...match.seats[first] } };
      const next = createMatch({ seats: Object.fromEntries(Object.entries(seats).map(([c, s]) => [c, { userId: s.userId, nickname: s.nickname }])), time: match.time, rule: match.rule });
      match.next = next.id;
      emitMatch(match); emitLobby();
      ack({ ok: true, next: next.id });
    });

    handle('match:chat', (raw, ack) => {
      const info = socket.data[`${kind}Match`]; const match = matches.get(info?.id);
      if (!match) return ack({ ok: false });
      const { color } = seatOf(socket);
      const nickname = color ? match.seats[color].nickname : match.spectators.get(socket.id);
      const value = text(raw?.text, 200);
      if (!nickname || !value) return ack({ ok: false });
      addChat(match, { type: 'chat', nickname, color, text: value }); ack({ ok: true });
    });

    socket.on('disconnect', () => {
      const user = lobbyMember(socket);
      if (user) {
        user.leaveTimer = setTimeout(() => { if (user.socketId === socket.id) removeUser(user); }, DISCONNECT_GRACE_MS);
      }
      const { match, color } = seatOf(socket);
      if (!match) return;
      if (!color) {
        if (match.spectators.delete(socket.id)) { emitMatch(match); emitLobby(); }
        return;
      }
      const seat = match.seats[color];
      seat.awayTimer = setTimeout(() => {
        if (seat.socketId !== socket.id) return;
        seat.connected = false;
        if (match.state === 'playing') addChat(match, { type: 'system', text: `${seat.nickname}님의 연결이 끊겼어요. ${FORFEIT_MS / 1000}초 안에 돌아오지 않으면 기권 처리돼요.` });
        emitMatch(match);
        seat.awayTimer = setTimeout(() => {
          if (seat.connected || seat.socketId !== socket.id || match.state !== 'playing') return;
          finish(match, { winner: other(color), reason: `${seat.nickname}님이 돌아오지 않아 기권 처리됐어요.` });
        }, FORFEIT_MS);
        seat.awayTimer.unref?.();
      }, DISCONNECT_GRACE_MS);
    });
  });

  return {
    users, offers, matches, lobbyState,
    close() {
      clearInterval(sweep);
      for (const offer of offers.values()) clearTimeout(offer.timer);
      for (const match of matches.values()) clearTimeout(match.clockTimer);
      users.clear(); offers.clear(); matches.clear();
    }
  };
}

function setupDuelGames({ app, io }) {
  return Object.fromEntries(Object.keys(GAMES).map((kind) => [kind, setupDuelGame({ app, io, kind })]));
}

module.exports = { setupDuelGames, GAMES };
