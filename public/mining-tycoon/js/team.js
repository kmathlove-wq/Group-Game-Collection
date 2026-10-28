// ===== team.js =====
// ⚔️ 팀전: 방 만들기·팀 고르기·기다리기·시작·끝을 다룬다. 서버는 src/mining-tycoon/team.js(`mt:team:*`).
// 차·땅 주고받기는 친구와 함께(Multi)를 prefix 'mt:team:'으로 그대로 쓴다.
// 팀 공용(돈·빚·번 돈·업그레이드·가방)은 TeamEcon으로 "내가 바꾼 차이"만 0.1초마다 보내고, 서버가 더해서 돌려준 값으로 맞춘다.
(function (MT) {
  var Econ = MT.TeamEcon;
  var SEND_EVERY = 0.1;

  // hooks: { getState, renderer, toast, onEvents(events), onChange(), onStart(info), onEnd(result), onClosed(reason) }
  function Team(hooks) {
    var self = this;
    this.hooks = hooks;
    this.phase = null; // null · 'waiting' · 'playing' · 'ended'
    this.code = null;
    this.key = null;
    this.you = -1;
    this.lobby = null;
    this.myTeam = 0;
    this.teams = [];
    this.shadow = null; // 서버에 있다고 믿는 팀 경제(내가 보낸 것까지 더함)
    this.pending = []; // 보냈지만 서버가 아직 받았다고 안 한 차이 [{ seq, d }]
    this.seq = 0;
    this.timer = 0;
    this.offline = false;
    this.multi = new MT.Multi({
      prefix: 'mt:team:',
      getState: hooks.getState,
      renderer: hooks.renderer,
      toast: hooks.toast,
      onEvents: hooks.onEvents,
      onChange: hooks.onChange,
      onRejoin: function (r) { if (r.econ) self.applyEcon(r.econ); },
      onEnd: function () {}
    });
  }

  Team.prototype.active = function () { return !!this.phase; };
  Team.prototype.playing = function () { return this.phase === 'playing'; };
  Team.prototype.count = function () { return this.lobby ? this.lobby.players.length : 0; };
  Team.prototype.isHost = function () {
    var self = this;
    return !!(this.lobby && this.lobby.players.some(function (p) { return p.id === self.you && p.host; }));
  };

  function emit(socket, event, data) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve({ ok: false, message: '서버가 대답하지 않아요. 인터넷 연결을 확인해 주세요.' }); } }, 10000);
      socket.emit(event, data, function (r) { if (done) return; done = true; clearTimeout(timer); resolve(r || { ok: false, message: '잘못된 대답이에요.' }); });
    });
  }

  Team.prototype.connect = function () {
    if (this.socket) return this.socket;
    var self = this;
    var socket = this.socket = this.multi.connect(); // 같은 소켓에 팀전 이벤트를 더 붙인다
    socket.on('mt:team:lobby', function (lobby) {
      if (!self.phase) return;
      self.lobby = lobby;
      lobby.players.forEach(function (p) { if (p.id === self.you) self.myTeam = p.team; });
      self.hooks.onChange();
    });
    socket.on('mt:team:started', function (info) { self.start(info); });
    socket.on('mt:team:econ', function (m) { self.applyEcon(m); });
    socket.on('mt:team:end', function (result) {
      if (!self.phase) return;
      self.phase = 'ended';
      result.mine = result.winner === self.myTeam;
      self.hooks.onEnd(result);
    });
    socket.on('mt:team:closed', function (d) {
      if (!self.phase || self.phase === 'ended') return;
      self.reset();
      self.hooks.onClosed(d.reason);
    });
    socket.on('disconnect', function () { if (self.phase) self.offline = true; });
    socket.on('connect', function () {
      // 게임 중이면 Multi가 다시 붙고(onRejoin), 기다리는 중이면 여기서 다시 붙는다.
      if (self.phase !== 'waiting' || !self.offline) return;
      socket.emit('mt:team:rejoin', { code: self.code, key: self.key }, function (r) {
        if (!r || !r.ok) { self.reset(); self.hooks.onClosed('lost'); return; }
        self.offline = false;
        self.lobby = r.lobby;
        self.hooks.onChange();
      });
    });
    return socket;
  };

  Team.prototype.enter = function (r) {
    this.phase = 'waiting';
    this.code = r.code;
    this.key = r.key;
    this.you = r.you;
    this.lobby = r.lobby;
    this.offline = false;
    var self = this;
    r.lobby.players.forEach(function (p) { if (p.id === self.you) self.myTeam = p.team; });
    this.hooks.onChange();
  };

  // 🏠 방 만들기(팀 수, 내 팀)
  Team.prototype.create = function (name, teams, team) {
    var self = this;
    if (this.phase) return Promise.resolve({ ok: false, message: '이미 팀전 방에 있어요.' });
    return emit(this.connect(), 'mt:team:create', { name: name, teams: teams, team: team }).then(function (r) { if (r.ok) self.enter(r); return r; });
  };
  Team.prototype.list = function () { return emit(this.connect(), 'mt:team:list', {}); };
  Team.prototype.peek = function (code) { return emit(this.connect(), 'mt:team:peek', { code: code }); };
  Team.prototype.join = function (name, code, team) {
    var self = this;
    if (this.phase) return Promise.resolve({ ok: false, message: '이미 팀전 방에 있어요.' });
    return emit(this.connect(), 'mt:team:join', { name: name, code: code, team: team }).then(function (r) { if (r.ok) self.enter(r); return r; });
  };
  Team.prototype.switchTeam = function (team) { return emit(this.connect(), 'mt:team:switch', { team: team }); };
  Team.prototype.begin = function () { return emit(this.connect(), 'mt:team:start', {}); };

  // ▶ 서버가 시작을 알리면: 화면(main.js)이 새 땅 게임을 만든 뒤 차·땅 주고받기를 켠다.
  Team.prototype.start = function (info) {
    if (this.phase !== 'waiting') return;
    this.phase = 'playing';
    this.you = info.you;
    this.myTeam = info.team;
    this.teams = info.teams;
    this.hooks.onStart(info); // 여기서 main.js가 state를 팀전 게임으로 바꾼다
    var s = this.hooks.getState();
    this.seq = 0;
    this.pending = [];
    this.shadow = Econ.read(s);
    this.multi.start('team', { code: this.code, key: this.key, you: info.you, players: info.players });
    this.applyEcon(info.econ);
  };

  // 서버가 보낸 팀 경제에 맞춘다: 서버 값 + 아직 안 받은 내 차이 + 아직 안 보낸 내 차이
  Team.prototype.applyEcon = function (m) {
    var s = this.hooks.getState();
    if (!s || !s.team || !this.shadow) return;
    var ack = (m.acks && m.acks[this.you]) || 0;
    this.pending = this.pending.filter(function (p) { return p.seq > ack; });
    var unsent = Econ.diff(Econ.read(s), this.shadow);
    var shadow = m.econ.slice();
    this.pending.forEach(function (p) { shadow = Econ.add(shadow, p.d); });
    this.shadow = shadow;
    Econ.write(s, Econ.add(shadow, unsent));
  };

  // 매 화면: 친구 차·땅(Multi) + 0.1초마다 내 차이 보내기
  Team.prototype.tick = function (dt) {
    if (this.phase !== 'playing') return;
    this.multi.tick(dt);
    this.timer += dt;
    if (this.timer < SEND_EVERY || !this.socket || !this.socket.connected || this.multi.offline) return;
    this.timer = 0;
    var s = this.hooks.getState();
    if (!s || !s.team) return;
    var d = Econ.diff(Econ.read(s), this.shadow);
    if (!d) return;
    this.seq++;
    this.pending.push({ seq: this.seq, d: d });
    this.shadow = Econ.add(this.shadow, d);
    this.socket.emit('mt:team:econ', { seq: this.seq, d: d });
  };

  // 🏪 팔기는 서버가 팀 가방을 직접 판다(대답: { count, total, debtPaid })
  Team.prototype.sell = function () { return emit(this.socket, 'mt:team:sell', {}); };
  Team.prototype.treasure = function () { if (this.socket) this.socket.emit('mt:team:treasure', {}, function () {}); };

  // 👋 나가기(끝난 뒤 돌아갈 때도)
  Team.prototype.leave = function () {
    if (!this.phase) return;
    if (this.socket && this.socket.connected) this.socket.emit('mt:team:leave', {}, function () {});
    this.reset();
  };
  Team.prototype.reset = function () {
    if (this.multi.active()) this.multi.finish('quiet');
    this.phase = null;
    this.code = this.key = null;
    this.lobby = null;
    this.shadow = null;
    this.pending = [];
    this.hooks.renderer.friends = [];
  };

  // 서버(src/mining-tycoon/team.js)의 TEAMS와 같다(방을 만들기 전에 팀을 고르는 데 씀).
  Team.TEAMS = [
    { id: 0, name: '빨강팀', emoji: '🔴', color: '#ff5a5a' },
    { id: 1, name: '파랑팀', emoji: '🔵', color: '#4d8dff' },
    { id: 2, name: '초록팀', emoji: '🟢', color: '#3cc46b' },
    { id: 3, name: '보라팀', emoji: '🟣', color: '#a66bff' }
  ];
  MT.Team = Team;
})(window.MT = window.MT || {});
