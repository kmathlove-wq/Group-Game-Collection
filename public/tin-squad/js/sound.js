// ===== sound.js =====
// 깡통 소탕대 소리: 효과음과 배경음악을 웹오디오로 직접 만든다(소리 파일 없음).
// localStorage 'tin-squad:sound'가 'off'면 모두 끔, 'music-off'면 음악만 끔.
(function (TS) {
  'use strict';
  var KEY = 'tin-squad:sound', mode = 'on', ctx = null, master = null, musicGain = null, noiseBuf = null, last = {};
  try { mode = localStorage.getItem(KEY) || 'on'; } catch (e) { mode = 'on'; }
  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC(); master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.35; musicGain.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.6, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
    return ctx;
  }
  function tone(f, f2, dur, type, vol, at, out) {
    var t = ctx.currentTime + (at || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'square'; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out || master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, freq, vol, at, type, out) {
    var t = ctx.currentTime + (at || 0), n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noiseBuf; f.type = type || 'lowpass'; f.frequency.setValueAtTime(freq, t); if (!type) f.frequency.exponentialRampToValueAtTime(80, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(out || master); n.start(t); n.stop(t + dur);
  }
  var S = {
    shot: function (e) {
      var k = e.kind;
      if (k === 'rocket') { noise(0.3, 900, 0.3); tone(180, 60, 0.25, 'sawtooth', 0.12); }
      else if (k === 'spread') { noise(0.18, 3200, 0.35); }
      else if (k === 'laser') tone(1500, 500, 0.1, 'sawtooth', 0.06);
      else if (k === 'flame') noise(0.1, 1400, 0.12);
      else if (k === 'ball') tone(260, 620, 0.1, 'sine', 0.16);
      else if (k === 'zap') { tone(1800, 200, 0.12, 'sawtooth', 0.08); noise(0.08, 5000, 0.1); }
      else { tone(k === 'screw' ? 520 : 400, 130, 0.07, 'square', 0.07); noise(0.05, 4200, 0.1); }
    },
    hit: function () { tone(900, 500, 0.04, 'square', 0.04); },
    clank: function () { tone(2200, 1500, 0.08, 'triangle', 0.1); },
    melee: function () { tone(220, 70, 0.14, 'square', 0.16); noise(0.1, 2600, 0.25); },
    kill: function () { noise(0.22, 1800, 0.22); tone(300, 70, 0.18, 'sawtooth', 0.08); },
    boom: function () { noise(0.5, 1100, 0.5); tone(110, 35, 0.4, 'sine', 0.32); },
    coin: function () { tone(990, null, 0.06, 'square', 0.05); tone(1480, null, 0.12, 'square', 0.05, 0.06); },
    heal: function () { [523, 659, 784].forEach(function (f, i) { tone(f, null, 0.12, 'triangle', 0.12, i * 0.07); }); },
    power: function () { [440, 554, 659, 880].forEach(function (f, i) { tone(f, null, 0.1, 'square', 0.07, i * 0.05); }); },
    pet: function () { [660, 880, 1100, 1320].forEach(function (f, i) { tone(f, null, 0.13, 'triangle', 0.13, i * 0.08); }); },
    combo: function () { [700, 900, 1200].forEach(function (f, i) { tone(f, null, 0.08, 'square', 0.06, i * 0.05); }); },
    jump: function () { tone(300, 560, 0.11, 'square', 0.04); },
    jump2: function () { tone(440, 860, 0.13, 'square', 0.05); },
    'throw': function () { tone(500, 250, 0.1, 'triangle', 0.08); },
    hurt: function () { tone(240, 80, 0.28, 'sawtooth', 0.16); },
    'mech-hurt': function () { tone(180, 80, 0.2, 'square', 0.14); },
    shield: function () { tone(1200, 1800, 0.16, 'triangle', 0.12); },
    dead: function () { [400, 320, 250, 180].forEach(function (f, i) { tone(f, f * 0.8, 0.18, 'square', 0.1, i * 0.14); }); },
    mech: function () { [200, 260, 330, 400].forEach(function (f, i) { tone(f, null, 0.14, 'sawtooth', 0.08, i * 0.09); }); },
    fuse: function () { tone(1300, 1500, 0.07, 'square', 0.04); },
    aim: function () { tone(1700, null, 0.06, 'square', 0.04); tone(1700, null, 0.06, 'square', 0.04, 0.12); },
    snipe: function () { noise(0.15, 5000, 0.25); },
    'foe-shot': function () { tone(420, 210, 0.09, 'triangle', 0.06); },
    thump: function () { tone(120, 40, 0.22, 'sine', 0.3); },
    beam: function () { tone(160, 90, 0.4, 'sawtooth', 0.14); noise(0.35, 3000, 0.15); },
    arena: function () { [300, 300, 300].forEach(function (f, i) { tone(f, null, 0.14, 'square', 0.09, i * 0.2); }); },
    go: function () { [523, 784].forEach(function (f, i) { tone(f, null, 0.16, 'square', 0.08, i * 0.12); }); },
    boss: function () { [160, 150, 140, 130].forEach(function (f, i) { tone(f, null, 0.28, 'sawtooth', 0.13, i * 0.26); }); },
    rage: function () { tone(140, 420, 0.5, 'sawtooth', 0.14); },
    'boss-dead': function () { noise(0.6, 1600, 0.5); tone(200, 30, 0.9, 'sawtooth', 0.2); },
    clear: function () { [523, 659, 784, 1047, 784, 1047].forEach(function (f, i) { tone(f, null, 0.2, 'square', 0.09, i * 0.13); tone(f / 2, null, 0.2, 'triangle', 0.1, i * 0.13); }); },
    fail: function () { [392, 330, 262, 196].forEach(function (f, i) { tone(f, null, 0.3, 'triangle', 0.14, i * 0.22); }); },
    buy: function () { tone(880, null, 0.08, 'square', 0.07); tone(1320, null, 0.16, 'square', 0.07, 0.08); },
    click: function () { tone(660, null, 0.05, 'square', 0.05); },
    star: function () { tone(1047, 1568, 0.25, 'triangle', 0.14); }
  };
  var GAP = { shot: 0.04, hit: 0.04, kill: 0.04, boom: 0.06, coin: 0.04, 'foe-shot': 0.07, clank: 0.07, spark: 0.1, fuse: 0.1, thump: 0.08 };

  // 배경음악: 세계마다 다른 가락(8마디 반복)
  var SONGS = [
    { bpm: 138, root: 196, scale: [0, 2, 4, 7, 9], mel: '0 2 4 2 3 4 2 1 0 2 4 5 4 3 2 -', bass: '0 0 3 4' },
    { bpm: 132, root: 165, scale: [0, 3, 5, 7, 10], mel: '0 - 2 0 3 - 2 1 0 - 4 3 2 1 0 -', bass: '0 0 2 3' },
    { bpm: 144, root: 147, scale: [0, 2, 3, 7, 8], mel: '0 0 4 - 3 2 4 - 0 0 5 4 3 2 1 -', bass: '0 3 0 4' },
    { bpm: 150, root: 220, scale: [0, 2, 4, 5, 7], mel: '0 4 2 4 0 4 2 4 1 5 3 5 4 3 2 1', bass: '0 1 3 0' },
    { bpm: 126, root: 233, scale: [0, 2, 3, 7, 10], mel: '4 - 3 - 2 - 3 4 5 - 4 - 2 1 0 -', bass: '0 2 3 0' },
    { bpm: 146, root: 208, scale: [0, 2, 4, 7, 11], mel: '0 2 3 5 4 - 2 3 0 2 3 6 5 4 3 -', bass: '0 4 2 3' },
    { bpm: 156, root: 139, scale: [0, 1, 4, 5, 7], mel: '0 1 2 1 0 - 4 3 0 1 2 4 3 2 1 -', bass: '0 0 1 0' },
    { bpm: 160, root: 156, scale: [0, 2, 3, 6, 7], mel: '0 4 3 4 0 4 3 5 2 5 4 5 1 4 3 2', bass: '0 2 0 3' }
  ];
  var song = null, step = 0, nextAt = 0, timer = 0, boss = false;
  function deg(sg, n, oct) { var l = sg.scale.length, o = Math.floor(n / l); return sg.root * Math.pow(2, (sg.scale[((n % l) + l) % l] + 12 * (o + (oct || 0))) / 12); }
  function tick() {
    if (!song || !ctx || ctx.state !== 'running') return;
    var dur = 60 / song.bpm / 2 * (boss ? 0.86 : 1);
    if (nextAt < ctx.currentTime) nextAt = ctx.currentTime + 0.05;
    while (nextAt < ctx.currentTime + 0.25) {
      var at = nextAt - ctx.currentTime, i = step % 16, bar = Math.floor(step / 16) % 4, m = song.mel[i], b = song.bass[bar];
      if (m !== '-') tone(deg(song, +m + (bar === 3 ? 1 : 0), boss ? 0 : 1), null, dur * 0.9, 'square', 0.09, at, musicGain);
      tone(deg(song, +b, -1) * (i % 2 ? 2 : 1), null, dur * 0.8, boss ? 'sawtooth' : 'triangle', 0.22, at, musicGain);
      if (i % 4 === 0) tone(130, 45, 0.12, 'sine', 0.5, at, musicGain);
      if (i % 4 === 2) noise(0.09, 2200, 0.22, at, 'highpass', musicGain);
      if (boss || i % 2) noise(0.03, 7000, 0.09, at, 'highpass', musicGain);
      step++; nextAt += dur;
    }
  }
  SONGS.forEach(function (s) { s.mel = s.mel.split(' '); s.bass = s.bass.split(' '); });

  TS.Sound = {
    unlock: function () { var c = ensure(); if (c && c.state === 'suspended') c.resume(); },
    play: function (name, e) {
      if (mode === 'off' || !S[name] || !ensure() || ctx.state !== 'running') return;
      var now = ctx.currentTime;
      if (last[name] && now - last[name] < (GAP[name] || 0.02)) return;
      last[name] = now;
      try { S[name](e || {}); } catch (err) { /* 무시 */ }
    },
    music: function (world, isBoss) {
      boss = !!isBoss;
      var s = world == null ? null : SONGS[world];
      if (s !== song) { song = s; step = 0; }
      if (mode !== 'on') return;
      clearInterval(timer);
      if (song && ensure()) timer = setInterval(tick, 80);
    },
    pause: function (on) { clearInterval(timer); if (!on && song && mode === 'on') timer = setInterval(tick, 80); },
    mode: function () { return mode; },
    next: function () { // 모두 켬 → 음악만 끔 → 모두 끔
      mode = mode === 'on' ? 'music-off' : mode === 'music-off' ? 'off' : 'on';
      try { localStorage.setItem(KEY, mode); } catch (e) { /* 무시 */ }
      clearInterval(timer); if (mode === 'on' && song && ensure()) timer = setInterval(tick, 80);
      return mode;
    }
  };
})(window.TinSquad);
