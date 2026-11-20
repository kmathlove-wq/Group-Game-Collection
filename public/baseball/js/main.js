// ===== baseball/js/main.js =====
// 풀카운트 야구 화면 흐름: 메뉴 → (혼자: 컴퓨터와 / 친구: 서버 방) → 공 하나씩: 투구 동작 → 공 비행 → 스윙 → 판정 → 타구 연출.
// 규칙·물리 = rules.js, 경기장·선수 = world.js. 친구 대결은 서버(src/baseball/index.js)가 판정하고 여기서는 그리기만 한다.
import * as THREE from 'three';
import * as W from './world.js';

const R = window.Baseball.Rules;
const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } },
};
const ranking = window.GroupRanking.create({ slug: 'baseball', unit: '점', top: 50 });

// ---------- 장면 ----------
const canvas = $('view');
const renderer = W.createRenderer(canvas);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 3000);
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.fov = camera.aspect < 0.8 ? 58 : 42;                    // 휴대폰 세로 화면은 넓게
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
W.buildSky(scene, renderer);
W.buildField(scene, renderer);
const ball = W.makeBall(scene);
ball.mesh.visible = false;

// 스트라이크 존(얇은 선)·타격 원·투구 조준
const zoneLines = (() => {
  const g = new THREE.BufferGeometry();
  const x = 0.216, lo = R.ZONE.low, hi = R.ZONE.high, pts = [];
  const seg = (a, b) => pts.push(a[0], a[1], 0, b[0], b[1], 0);
  seg([-x, lo], [x, lo]); seg([x, lo], [x, hi]); seg([x, hi], [-x, hi]); seg([-x, hi], [-x, lo]);
  for (const k of [1, 2]) { const xx = -x + 2 * x * k / 3, yy = lo + (hi - lo) * k / 3; seg([xx, lo], [xx, hi]); seg([-x, yy], [x, yy]); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35, depthTest: false }));
  l.renderOrder = 5;
  scene.add(l);
  return l;
})();
function ringMesh(r1, r2, color, opacity) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r1, r2, 64), new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, side: THREE.DoubleSide }));
  m.renderOrder = 6;
  scene.add(m);
  return m;
}
const batRing = ringMesh(R.BAT_R - 0.008, R.BAT_R, '#ffe066', 0.95);
const batDot = ringMesh(0, 0.012, '#ffe066', 0.9);
const aimRing = ringMesh(0.05, 0.062, '#ff6b6b', 0.95);
const aimDot = ringMesh(0, 0.014, '#ff6b6b', 0.95);
const meterRing = ringMesh(0.97, 1.0, '#ffffff', 0.95);
const meterTarget = ringMesh(0.075, 0.085, '#51cf66', 0.95);
function showAimTools(kind) {
  batRing.visible = batDot.visible = kind === 'bat';
  aimRing.visible = aimDot.visible = kind === 'aim' || kind === 'meter';
  meterRing.visible = meterTarget.visible = kind === 'meter';
  zoneLines.visible = kind === 'bat' || kind === 'aim' || kind === 'meter';
}
showAimTools(null);

// ---------- 소리(WebAudio로 직접 만든 소리) ----------
let audio = null, crowdGain = null;
let soundOn = store.get('baseball:sound') !== 'off';
function unlockAudio() {
  if (!soundOn) return;
  if (!audio) {
    try {
      audio = new (window.AudioContext || window.webkitAudioContext)();
      // 관중 웅성거림: 잔잔한 소음을 계속 깔아 둔다
      const buf = audio.createBuffer(1, audio.sampleRate * 2, audio.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.6;
      const src = audio.createBufferSource(); src.buffer = buf; src.loop = true;
      const bp = audio.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
      crowdGain = audio.createGain(); crowdGain.gain.value = 0.035;
      src.connect(bp).connect(crowdGain).connect(audio.destination); src.start();
    } catch (e) { audio = null; }
  }
  if (audio && audio.state === 'suspended') audio.resume();
}
function noiseBurst(dur, freq, q, vol, type = 'bandpass') {
  if (!soundOn || !audio) return;
  const t = audio.currentTime;
  const buf = audio.createBuffer(1, Math.max(1, audio.sampleRate * dur), audio.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
  const src = audio.createBufferSource(); src.buffer = buf;
  const f = audio.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = audio.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(audio.destination); src.start(t);
}
const sfx = {
  crack(q) { noiseBurst(0.09, 2600, 0.8, 0.5 + q * 0.5); noiseBurst(0.03, 6000, 1, 0.4, 'highpass'); },
  pop() { noiseBurst(0.07, 350, 1.2, 0.7); },
  cheer(big) {
    if (!soundOn || !audio || !crowdGain) return;
    const t = audio.currentTime, g = crowdGain.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(big ? 0.4 : 0.18, t + 0.25);
    g.linearRampToValueAtTime(0.035, t + (big ? 4.5 : 2.2));
  },
  whoosh() { noiseBurst(0.18, 900, 0.7, 0.18); },
};
$('soundBtn').textContent = soundOn ? '🔊' : '🔇';
$('soundBtn').addEventListener('click', () => {
  soundOn = !soundOn; store.set('baseball:sound', soundOn ? 'on' : 'off');
  $('soundBtn').textContent = soundOn ? '🔊' : '🔇';
  if (soundOn) unlockAudio(); else if (crowdGain) crowdGain.gain.value = 0;
});

// ---------- 화면 글자 ----------
const PANELS = ['menuPanel', 'lobbyPanel', 'roomPanel', 'resultPanel'];
function showPanel(id) { PANELS.forEach((p) => { $(p).hidden = p !== id; }); }
function showCall(text, big) {
  const el = $('call');
  el.textContent = text;
  el.classList.remove('show', 'big');
  void el.offsetWidth;
  el.classList.add('show');
  if (big) el.classList.add('big');
}
function hint(text) { $('hint').hidden = !text; $('hint').textContent = text || ''; }
function teamOf(side) { return R.TEAMS.find((t) => t.id === state.teams[side]) || R.TEAMS[0]; }
function dots(el, n, max) {
  el.textContent = '';
  for (let i = 0; i < max; i++) { const d = document.createElement('i'); if (i < n) d.className = 'on'; el.appendChild(d); }
}
function renderHud() {
  if (!state) return;
  for (const side of ['away', 'home']) {
    const row = $(side === 'away' ? 'bugAway' : 'bugHome'), t = teamOf(side);
    row.querySelector('i').style.background = t.accent;
    row.querySelector('span').textContent = t.emoji + ' ' + t.short;
    row.querySelector('b').textContent = state.score[side];
    row.classList.toggle('bat', R.battingSide(state) === side && !state.over);
  }
  $('bugInning').textContent = (state.half === 'top' ? '▲' : '▼') + state.inning;
  dots($('cB'), state.balls, 3); dots($('cS'), state.strikes, 2); dots($('cO'), state.outs, 2);
  ['b1', 'b2', 'b3'].forEach((id, i) => $(id).classList.toggle('on', Boolean(state.bases[i])));
  drawBoard();
}

// 전광판(3D) 그리기
let boardScreen = null;
function drawBoard() {
  if (!boardScreen || !state) return;
  const c = boardScreen.canvas, g = c.getContext('2d');
  g.fillStyle = '#04070b'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#ffd43b'; g.font = '900 34px Pretendard, sans-serif'; g.textAlign = 'left';
  g.fillText('풀카운트 스타디움', 24, 46);
  const n = Math.max(state.innings, state.inning);
  const x0 = 260, cw = Math.min(64, 600 / (n + 3));
  g.font = '800 30px Pretendard, sans-serif'; g.fillStyle = '#9fb3c8';
  for (let i = 0; i < n; i++) g.fillText(String(i + 1), x0 + i * cw + 16, 100);
  g.fillText('R', x0 + n * cw + 16, 100); g.fillText('H', x0 + (n + 1) * cw + 16, 100);
  ['away', 'home'].forEach((side, r) => {
    const y = 160 + r * 70, t = teamOf(side);
    g.fillStyle = t.accent; g.fillRect(20, y - 40, 10, 50);
    g.fillStyle = '#fff'; g.font = '900 36px Pretendard, sans-serif'; g.fillText(t.short, 44, y);
    g.font = '800 34px Pretendard, sans-serif';
    for (let i = 0; i < n; i++) {
      const v = state.line[side][i];
      g.fillStyle = '#e9ecef'; g.fillText(v == null ? '' : String(v), x0 + i * cw + 16, y);
    }
    g.fillStyle = '#ffd43b'; g.fillText(String(state.score[side]), x0 + n * cw + 16, y);
    g.fillStyle = '#e9ecef'; g.fillText(String(state.hits[side]), x0 + (n + 1) * cw + 16, y);
  });
  g.font = '800 30px Pretendard, sans-serif'; g.fillStyle = '#9fb3c8';
  g.fillText('B ' + '●'.repeat(state.balls) + '○'.repeat(3 - state.balls) + '   S ' + '●'.repeat(state.strikes) + '○'.repeat(2 - state.strikes) + '   O ' + '●'.repeat(state.outs) + '○'.repeat(2 - state.outs), 24, 360);
  boardScreen.tex.needsUpdate = true;
}

// ---------- 선수 배치 ----------
let assets = null, stadium = null;
const cast = { pitcher: null, catcher: null, umpire: null, batter: null, fielders: [], runners: [null, null, null], extra: [] };
const BATTER_POS = new THREE.Vector3(-0.95, 0, 0.05);
const FIELD_HOME = R.FIELDERS.map((f) => new THREE.Vector3(f.x, f.key === 'P' ? 0.25 : 0, f.z));
function faceTo(p, x, z) { p.root.rotation.y = Math.atan2(x - p.root.position.x, z - p.root.position.z); }

function removePlayer(p) { if (p) scene.remove(p.root); }
function setupHalf() {
  [cast.batter, cast.umpire, ...cast.fielders, ...cast.runners, ...cast.extra].forEach(removePlayer);
  cast.fielders = []; cast.runners = [null, null, null]; cast.extra = [];
  const fieldTeam = teamOf(R.fieldingSide(state));
  R.FIELDERS.forEach((f, i) => {
    const p = new W.Player(assets, fieldTeam, 'fielder');
    p.root.position.copy(FIELD_HOME[i]);
    scene.add(p.root);
    if (f.key === 'P') { p.root.rotation.y = 0; p.play('idle'); }
    else if (f.key === 'C') { p.root.rotation.y = Math.PI; p.play('crouch'); }
    else { faceTo(p, 0, 0); p.play('ready', { fade: 0 }); p.mixer.update(Math.random()); }
    cast.fielders.push(p);
  });
  cast.pitcher = cast.fielders[0];
  cast.catcher = cast.fielders[1];
  cast.catcher.root.visible = cam.mode !== 'bat';
  if (!cast.umpire) cast.umpire = new W.Player(assets, null, 'umpire');
  cast.umpire.root.traverse((o) => {                               // 심판: 남색 셔츠·회색 바지
    if (!o.isMesh) return;
    const n = o.material.name;
    if (n === 'bb_jersey' || n === 'bb_cap' || n === 'bb_accent' || n === 'bb_number' || n === 'bb_sock') { o.material = o.material.clone(); o.material.color.set(n === 'bb_jersey' ? '#1c2a44' : '#121a2b'); }
    if (n === 'bb_pants') { o.material = o.material.clone(); o.material.color.set('#5c6370'); }
  });
  cast.umpire.root.position.set(0, 0, 2.05);
  cast.umpire.root.rotation.y = Math.PI;
  cast.umpire.play('ready');
  scene.add(cast.umpire.root);
  newBatter();
  placeRunners();
}
function newBatter() {
  removePlayer(cast.batter);
  const p = new W.Player(assets, teamOf(R.battingSide(state)), 'batter');
  p.root.position.copy(BATTER_POS);
  p.root.rotation.y = Math.PI / 2;
  p.play('stance', { fade: 0 });
  scene.add(p.root);
  cast.batter = p;
}
function basePos(b, lead) {
  const a = R.BASES[b % 4], n = R.BASES[(b + 1) % 4];
  const dx = n[0] - a[0], dz = n[1] - a[1], l = Math.hypot(dx, dz);
  return new THREE.Vector3(a[0] + dx / l * (lead || 0), 0, a[1] + dz / l * (lead || 0));
}
function placeRunners() {
  cast.runners.forEach(removePlayer);
  cast.runners = [null, null, null];
  for (let b = 1; b <= 3; b++) {
    if (!state.bases[b - 1]) continue;
    const p = new W.Player(assets, teamOf(R.battingSide(state)), 'runner');
    p.root.position.copy(basePos(b, b === 3 ? 1.5 : 2.5));
    faceTo(p, R.BASES[(b + 1) % 4][0], R.BASES[(b + 1) % 4][1]);
    p.play('ready', { fade: 0 });
    scene.add(p.root);
    cast.runners[b - 1] = p;
  }
}
function resetFielders() {
  cast.fielders.forEach((p, i) => {
    p.root.position.copy(FIELD_HOME[i]);
    if (i === 0) { p.root.rotation.y = 0; p.play('idle'); }
    else if (i === 1) { p.root.rotation.y = Math.PI; p.play('crouch'); }
    else { faceTo(p, 0, 0); p.play('ready'); }
  });
}

// ---------- 카메라 ----------
const cam = { pos: new THREE.Vector3(0, 30, 60), look: new THREE.Vector3(0, 0, -40), wantPos: new THREE.Vector3(), wantLook: new THREE.Vector3(), speed: 3 };
const VIEWS = {
  bat: { pos: [0.05, 1.32, 3.55], look: [0, 1.0, -18.4] },        // 포수 뒤(타격 화면)
  pitch: { pos: [0.55, 2.45, -24.6], look: [0, 0.85, 0] },        // 투수 뒤(투구 화면)
  menu: null,
};
function setView(name, snap) {
  const v = VIEWS[name];
  if (!v) return;
  cam.mode = name;
  // 타격 화면은 포수 뒤에서 보므로 심판·포수가 공을 가린다 → 이 화면에서만 숨긴다(실제 야구 게임들처럼)
  if (cast.umpire) cast.umpire.root.visible = name !== 'bat';
  if (cast.catcher) cast.catcher.root.visible = name !== 'bat';
  cam.wantPos.set(...v.pos); cam.wantLook.set(...v.look);
  if (snap) { cam.pos.copy(cam.wantPos); cam.look.copy(cam.wantLook); }
}
let menuT = 0;
function updateCamera(dt) {
  if (cam.mode === 'menu') {                                       // 메뉴: 경기장을 천천히 돈다
    menuT += dt * 0.05;
    cam.wantPos.set(Math.sin(menuT) * 95, 32, -45 + Math.cos(menuT) * 95);
    cam.wantLook.set(0, 2, -45);
  } else if (cam.mode === 'follow') {                             // 타구 따라가기(심판·포수 다시 보이기)
    if (cast.umpire && !cast.umpire.root.visible) { cast.umpire.root.visible = true; cast.catcher.root.visible = true; }
    const b = ball.mesh.position;
    cam.wantLook.lerp(b, 1 - Math.exp(-dt * 6));
    const back = Math.max(18, -b.z * 0.4 + 18);
    cam.wantPos.set(b.x * 0.45, Math.max(9, b.y * 0.7 + 7 + -b.z * 0.08), b.z + back);
  }
  const k = 1 - Math.exp(-dt * (cam.mode === 'follow' ? 2.6 : 4));
  cam.pos.lerp(cam.wantPos, k);
  cam.look.lerp(cam.wantLook, k);
  camera.position.copy(cam.pos);
  camera.lookAt(cam.look);
}

// ---------- 조준(마우스·손가락·방향키) ----------
const aim = { x: 0, y: 0.78 };
const raycaster = new THREE.Raycaster();
const platePlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
const _ndc = new THREE.Vector2(), _hit = new THREE.Vector3();
function aimFromScreen(cx, cy) {
  const r = canvas.getBoundingClientRect();
  _ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  if (raycaster.ray.intersectPlane(platePlane, _hit)) {
    aim.x = Math.max(-0.75, Math.min(0.75, _hit.x));
    aim.y = Math.max(0.15, Math.min(1.65, _hit.y));
  }
}
canvas.addEventListener('pointermove', (e) => aimFromScreen(e.clientX, e.clientY));
canvas.addEventListener('pointerdown', (e) => {
  unlockAudio();
  aimFromScreen(e.clientX, e.clientY);
  if (e.pointerType === 'mouse') { if (e.button === 0) action(); }
  else canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse') action(); });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
window.addEventListener('keydown', (e) => {
  if (document.activeElement && ['INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;
  const k = e.key;
  if (k === ' ' || k === 'Enter') { e.preventDefault(); unlockAudio(); action(); }
  else if (k === 'ArrowLeft') aim.x = Math.max(-0.75, aim.x - 0.03);
  else if (k === 'ArrowRight') aim.x = Math.min(0.75, aim.x + 0.03);
  else if (k === 'ArrowUp') aim.y = Math.min(1.65, aim.y + 0.03);
  else if (k === 'ArrowDown') aim.y = Math.max(0.15, aim.y - 0.03);
  else if (['1', '2', '3', '4'].includes(k)) choosePitchType(R.PITCH_KEYS[+k - 1]);
});

// ---------- 경기 상태 ----------
let state = null;              // 혼자: rules.js 경기 상태 / 친구: 서버가 보낸 요약(같은 모양)
let mode = 'menu';             // 'menu' | 'solo' | 'multi'
let mySide = 'away';           // 혼자 할 때 내 쪽, 친구 대결에선 내 자리(관전이면 null)
let phase = 'idle';            // 'idle' | 'aim' | 'meter' | 'pitch' | 'after' | 'play'
let cur = null;                // 지금 던진 공 하나의 진행 정보
let pitchType = 'fastball';
let meter = null;
let lastHalfKey = '';
let clock = 0;

function userBatting() { return mode !== 'menu' && mySide && R.battingSide(state) === mySide; }
function userPitching() { return mode !== 'menu' && mySide && R.fieldingSide(state) === mySide; }

function choosePitchType(t) {
  if (!R.PITCHES[t]) return;
  pitchType = t;
  document.querySelectorAll('#pitchPanel button').forEach((b) => b.classList.toggle('on', b.dataset.p === t));
}
document.querySelectorAll('#pitchPanel button').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); choosePitchType(b.dataset.p); }));

// 클릭(또는 스페이스·손가락 떼기) 하나로 하는 일
function action() {
  if (phase === 'pitch' && cur && cur.userBatting && cur.swingAt == null) {
    swing();
  } else if (phase === 'aim' && userPitching()) {
    meter = { x: aim.x, y: aim.y, t0: clock };                     // 코스 확정 → 제구 고리 시작
    phase = 'meter';
    showAimTools('meter');
    hint('🎯 줄어드는 하얀 고리가 초록 원에 겹칠 때 다시 클릭!');
  } else if (phase === 'meter' && meter) {
    finishMeter();
  }
}
const METER_TIME = 1.05;
function meterRadius(t) { return Math.max(0, 0.45 * (1 - t / METER_TIME)); }
function finishMeter() {
  const r = meterRadius(clock - meter.t0);
  const acc = Math.max(0, 1 - Math.abs(r - 0.08) / 0.22);           // 1 = 딱 맞음
  const target = { x: meter.x, y: meter.y };
  meter = null;
  showAimTools(null);
  $('pitchPanel').hidden = true;
  hint('');
  const control = 0.015 + (1 - acc) * 0.13;                       // 제구 흔들림(m)
  if (acc > 0.9) showCall('완벽한 제구!', false);
  if (mode === 'solo') {
    const pitch = R.makePitch(pitchType, target, control, state.rand);
    const aiSw = R.aiSwing(state, pitch, state.rand);
    startPitch(pitch, { aiSwing: aiSw });
  } else if (mode === 'multi') {
    net.socket.emit('bb:pitch', { type: pitchType, target, acc });
    phase = 'idle';
    hint('공을 던지는 중…');
  }
}

function swing() {
  cur.swingAt = clock;
  cur.swingPos = { x: aim.x, y: aim.y };
  cast.batter.play('swing', { loop: false, fade: 0.05, speed: (12 / 30) / R.SWING_DELAY });
  sfx.whoosh();
}

// ---------- 공 하나 ----------
function startPitch(pitch, opts = {}) {
  phase = 'pitch';
  cur = {
    pitch, path: R.pitchPath(pitch, 1 / 240), t0: clock,
    releaseAt: clock + R.PITCH_RELEASE, crossAt: clock + R.PITCH_RELEASE + pitch.cross.t,
    userBatting: userBatting(), aiSwing: opts.aiSwing || null, swingAt: null, swingPos: null,
    aiSwingStarted: false, resolved: false, result: null,
  };
  cast.pitcher.root.position.copy(FIELD_HOME[0]);
  cast.pitcher.play('pitch', { loop: false, fade: 0.15 });
  ball.mesh.visible = false;
  ball.clearTrail();
  $('pitchInfo').hidden = true;
  showAimTools(cur.userBatting ? 'bat' : null);
  setView(cur.userBatting || !userPitching() ? 'bat' : 'pitch');
  hint(cur.userBatting ? '🏏 공이 올 곳에 노란 원을 두고, 홈에 올 때 클릭!' : '');
}

function updatePitch() {
  const c = cur;
  if (c.aiSwing && !c.aiSwingStarted && clock >= c.crossAt + c.aiSwing.dt - R.SWING_DELAY) {   // 컴퓨터 타자 스윙
    c.aiSwingStarted = true;
    cast.batter.play('swing', { loop: false, fade: 0.05, speed: (12 / 30) / R.SWING_DELAY });
  }
  if (clock >= c.releaseAt) {
    const t = clock - c.releaseAt;
    const s = sampleUntil(c.path, t, c.result && c.result.kind !== 'inplay' ? 1.0 : 1.6);
    ball.mesh.visible = true;
    ball.set(s[1], s[2], s[3], true);
    if (!c.shownInfo && t > 0.05) {
      c.shownInfo = true;
      if (!c.userBatting) { $('pitchInfo').hidden = false; $('pitchInfo').innerHTML = ''; setPitchInfo(c.pitch); }
    }
  } else {
    const hand = cast.pitcher.handPos('bat', new THREE.Vector3());
    ball.set(hand.x, hand.y, hand.z, false);
    ball.mesh.visible = clock - c.t0 > 0.3;
  }
  if (!c.resolved && clock >= c.crossAt + 0.06) {
    c.resolved = true;
    const sw = c.userBatting ? (c.swingAt == null ? null : { dt: c.swingAt + R.SWING_DELAY - c.crossAt, x: c.swingPos.x, y: c.swingPos.y }) : c.aiSwing;
    showAimTools(null);
    hint('');
    if (mode === 'solo') {
      const res = R.resolveSwing(c.pitch, sw, state.rand);
      const out = R.applyPitch(state, c.pitch, res, state.rand);
      showOutcome(out);
    } else if (mode === 'multi') {
      if (c.userBatting) net.socket.emit('bb:swing', sw ? { dt: sw.dt, x: sw.x, y: sw.y } : { none: true });
      if (net.pendingResult) { const r = net.pendingResult; net.pendingResult = null; showOutcome(r.out, r.state); }
      else c.waiting = true;
    }
  }
}
function setPitchInfo(p) {
  const el = $('pitchInfo');
  el.textContent = p.kmh + 'km/h ' + p.name;
  const sm = document.createElement('small');
  sm.textContent = '홈에서 ' + p.plateKmh + 'km/h';
  el.appendChild(sm);
  el.hidden = false;
}
function sampleUntil(path, t, maxZ) {
  let s = path[path.length - 1];
  for (let i = 1; i < path.length; i++) {
    if (path[i][0] >= t) {
      const a = path[i - 1], b = path[i], k = (t - a[0]) / Math.max(1e-6, b[0] - a[0]);
      s = [t, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
      break;
    }
  }
  if (s[3] > maxZ) {                                              // 포수 글러브에서 멈춤
    for (let i = 0; i < path.length; i++) if (path[i][3] >= maxZ) return path[i];
  }
  return s;
}

// 판정 결과 보여 주기(혼자·친구 공통). serverState: 친구 대결에서 서버가 보낸 새 상태
function showOutcome(out, serverState) {
  const c = cur;
  c.result = out.swing;
  setPitchInfo(c.pitch);
  if (c.userBatting && c.swingAt != null) {
    const dt = c.swingAt + R.SWING_DELAY - c.crossAt;
    const tip = Math.abs(dt) < 0.015 ? '타이밍 완벽!' : dt < 0 ? '조금 빨랐어요 (' + Math.round(-dt * 1000) + 'ms)' : '조금 늦었어요 (' + Math.round(dt * 1000) + 'ms)';
    hint(tip);
  }
  if (serverState) state = serverState;
  if (out.play) {
    sfx.crack(out.swing.q || 0.5);
    startPlay(out);
    return;
  }
  if (out.swing.kind === 'foul') sfx.crack(0.1); else sfx.pop();
  const big = out.event === 'k' || out.event === 'walk';
  showCall(out.call + (big ? '!' : ''), big);
  if (out.swing.called && out.swing.kind === 'strike') cast.umpire.play('call', { loop: false });
  if (out.event === 'walk' || out.event === 'k') sfx.cheer(false);
  phase = 'after';
  renderHud();
  after(out.halfOver || out.event ? 1.9 : 1.25, () => {
    if (out.event) { newBatter(); placeRunners(); }
    cast.umpire.play('ready');
    nextTurn();
  });
}

// ---------- 타구 연출 ----------
let playView = null;
function startPlay(out) {
  const play = out.play;
  phase = 'play';
  const pv = { out, play, t0: cur.crossAt, movers: [], runnerMoves: [], done: false };
  // 공을 잡는 수비수 + 베이스 커버
  const fi = play.fielded ? play.fielded.fielder : nearestFielder(play.landed.x, play.landed.z, true);
  const target = play.fielded ? [play.fielded.x, play.fielded.z] : [play.landed.x * 0.97, play.landed.z * 0.97];
  const arriveAt = play.fielded ? play.fielded.t : play.landed.t + 0.6;
  pv.fielder = fi;
  addMover(pv, fi, target[0], target[1], 0.25, arriveAt);
  const covered = new Set([fi]);
  play.throws.forEach((th) => {
    const ci = coverFor(th.to, covered);
    covered.add(ci);
    const b = R.BASES[th.to];
    addMover(pv, ci, b[0] + (th.to === 1 ? -0.4 : 0), b[1], 0.3, Math.max(0.6, th.arrive - 0.3));
    th.coverer = ci;
  });
  // 주자: 0 = 타자
  play.runners.forEach((r) => {
    const fig = r.from === 0 ? cast.batter : cast.runners[r.from - 1];
    if (!fig) return;
    if (r.from === 0) { fig.setRole('runner'); }
    pv.runnerMoves.push({ fig, from: r.from, to: r.to, out: r.out, speed: play.result === 'hr' ? 11 : 7.6, start: r.from === 0 ? 0.35 : 0.1, running: false });
  });
  cam.mode = 'follow';
  if (play.result === 'hr') { showCall('홈런!!', true); sfx.cheer(true); }
  playView = pv;
}
function nearestFielder(x, z, outfieldOk) {
  let best = 2, bd = Infinity;
  cast.fielders.forEach((p, i) => { if (i === 1) return; const d = Math.hypot(FIELD_HOME[i].x - x, FIELD_HOME[i].z - z); if (d < bd) { bd = d; best = i; } });
  return best;
}
function coverFor(base, used) {
  const pref = base === 1 ? [2, 0, 3] : base === 2 ? [5, 3, 0] : base === 3 ? [4, 5, 0] : [1, 0];
  return pref.find((i) => !used.has(i)) ?? pref[0];
}
function addMover(pv, i, x, z, start, arrive) {
  const p = cast.fielders[i];
  const from = p.root.position.clone();
  const dist = Math.hypot(x - from.x, z - from.z);
  const spd = R.FIELDERS[i].speed;
  const dur = Math.max(dist / spd, 0.01);
  pv.movers.push({ i, from, to: new THREE.Vector3(x, 0, z), start: Math.max(start, Math.min(arrive - dur, start + 0.2)), dur, running: false });
}
const BASE_PATH = [0, 1, 2, 3, 4].map((b) => new THREE.Vector3(R.BASES[b % 4][0], 0, R.BASES[b % 4][1]));
function alongBases(from, dist) {                                  // from 베이스에서 dist m 달린 곳
  let b = from, d = dist;
  while (b < 4) {
    const seg = BASE_PATH[b].distanceTo(BASE_PATH[b + 1]);
    if (d <= seg) return BASE_PATH[b].clone().lerp(BASE_PATH[b + 1], d / seg);
    d -= seg; b += 1;
  }
  return BASE_PATH[4].clone();
}

function updatePlay() {
  const pv = playView, play = pv.play, t = clock - pv.t0;
  // 수비수 움직이기
  pv.movers.forEach((m) => {
    const p = cast.fielders[m.i];
    if (t < m.start) return;
    const k = Math.min(1, (t - m.start) / m.dur);
    if (k < 1) {
      if (!m.running) { m.running = true; p.play('run', { speed: 1.25 }); }
      p.root.position.lerpVectors(m.from, m.to, k);
      faceTo(p, m.to.x, m.to.z);
    } else if (m.running) {
      m.running = false;
      p.root.position.copy(m.to);
      faceTo(p, ball.mesh.position.x, ball.mesh.position.z);
      p.play('ready');
    }
  });
  // 공
  const fielded = play.fielded;
  let thrown = null;
  if (!fielded || t < fielded.t) {
    const s = R.sampleAt(play.path, t);
    ball.set(s[1], s[2], s[3], true);
    if (play.hr && t > play.landed.t + 0.2) ball.mesh.visible = false;
  } else {
    if (!pv.caughtSound) { pv.caughtSound = true; sfx.pop(); if (fielded.air) showCall(pv.out.call, false); }
    for (const th of play.throws) if (t >= th.t) thrown = th;
    if (!thrown) {
      const g = cast.fielders[pv.fielder].handPos('glove', new THREE.Vector3());
      ball.set(g.x, g.y, g.z, false);
      const nextTh = play.throws.find((th) => t < th.t);
      if (nextTh && !nextTh.anim && t > nextTh.t - 0.4) { nextTh.anim = true; const thrower = cast.fielders[pv.fielder]; faceTo(thrower, R.BASES[nextTh.to][0], R.BASES[nextTh.to][1]); thrower.play('throw', { loop: false }); }
    } else {
      const k = Math.min(1, (t - thrown.t) / Math.max(0.1, thrown.arrive - thrown.t));
      const to = R.BASES[thrown.to];
      const x = thrown.from[0] + (to[0] - thrown.from[0]) * k, z = thrown.from[1] + (to[1] - thrown.from[1]) * k;
      const y = 1.6 + (1.3 - 1.6) * k + Math.sin(k * Math.PI) * Math.min(4, Math.hypot(to[0] - thrown.from[0], to[1] - thrown.from[1]) * 0.06);
      ball.set(x, y, z, true);
      if (k >= 1 && !thrown.popped) { thrown.popped = true; sfx.pop(); }
      // 다음 송구(병살 연결)는 받은 사람이 던진다
      const idx = play.throws.indexOf(thrown), nx = play.throws[idx + 1];
      if (nx && !nx.anim && t > nx.t - 0.4 && thrown.coverer != null) { nx.anim = true; const tr = cast.fielders[thrown.coverer]; faceTo(tr, R.BASES[nx.to][0], R.BASES[nx.to][1]); tr.play('throw', { loop: false }); }
    }
  }
  // 주자
  pv.runnerMoves.forEach((r) => {
    if (r.to === r.from || t < r.start) return;
    const total = BASE_PATH[r.from].distanceTo(BASE_PATH[r.from]) + basesDist(r.from, r.to);
    const d = Math.min(total, (t - r.start) * r.speed);
    if (!r.running && d < total) { r.running = true; r.fig.play('run', { speed: 1.3 }); }
    const p = alongBases(r.from, d);
    const ahead = alongBases(r.from, Math.min(total, d + 1));
    r.fig.root.position.copy(p);
    if (d < total) faceTo(r.fig, ahead.x, ahead.z);
    else if (r.running) { r.running = false; r.fig.play(r.out ? 'idle' : 'ready'); if (r.out && !r.gone) { r.gone = true; setTimeout(() => { r.fig.root.visible = false; }, 700); } }
  });
  if (t >= play.duration) endPlay();
}
function basesDist(from, to) { let d = 0; for (let b = from; b < to; b++) d += BASE_PATH[b].distanceTo(BASE_PATH[b + 1]); return d; }

function endPlay() {
  const out = playView.out;
  playView = null;
  if (!out.play.hr && !out.play.fielded?.air) showCall(out.call, out.play.result === 'triple' || out.play.result === 'dp');
  if (out.play.hit) sfx.cheer(out.play.result !== 'single');
  if (out.runs) setTimeout(() => showCall(out.runs + '점 득점!', true), 900);
  renderHud();
  phase = 'after';
  after(out.runs ? 2.2 : 1.4, () => {
    ball.mesh.visible = false;
    ball.clearTrail();
    if (state.over || out.halfOver) { nextTurn(); return; }
    resetFielders();
    newBatter();
    placeRunners();
    nextTurn();
  });
}

// 잠깐 뒤에 할 일(게임 시계 기준)
const timers = [];
function after(sec, fn) { timers.push({ at: clock + sec, fn }); }

// ---------- 차례 넘기기 ----------
function halfKey() { return state.inning + state.half; }
function nextTurn() {
  if (!state) return;
  renderHud();
  if (state.over) { finish(); return; }
  if (halfKey() !== lastHalfKey) {                                // 공수 교대
    const first = !lastHalfKey;
    lastHalfKey = halfKey();
    setupHalf();
    const bt = teamOf(R.battingSide(state));
    showCall(state.inning + '회 ' + (state.half === 'top' ? '초' : '말') + ' · ' + bt.short + ' 공격', true);
    if (!first) { after(1.8, nextTurn); phase = 'after'; setView(userPitching() ? 'pitch' : 'bat'); return; }
  }
  $('who').hidden = false;
  $('who').textContent = (userBatting() ? '🏏 내가 칠 차례' : userPitching() ? '🎯 내가 던질 차례' : '👀 관전 중') + ' · ' + (state.battingOrder[R.battingSide(state)] + 1) + '번 타자';
  if (mode === 'solo') {
    if (userBatting()) {
      setView('bat');
      phase = 'idle';
      showAimTools('bat');
      hint('🏏 노란 원을 움직여 준비하세요');
      after(1.1, () => {
        const c = R.aiChoosePitch(state, state.rand);
        startPitch(R.makePitch(c.type, c.target, c.control, state.rand));
      });
    } else beginAim();
  } else if (mode === 'multi') {
    if (!net.turn || net.turn.seq <= net.handledSeq) {             // 서버의 새 차례를 기다린다
      phase = 'idle';
      hint('⏳ 다음 공을 기다리는 중…');
      return;
    }
    net.handledSeq = net.turn.seq;
    if (net.turn.pitcherId === net.myId) beginAim();
    else {
      phase = 'idle';
      setView(userPitching() ? 'pitch' : 'bat');
      showAimTools(userBatting() ? 'bat' : null);
      hint(userBatting() ? '🏏 상대가 공을 고르는 중… 노란 원을 준비하세요' : '상대가 공을 고르는 중…');
    }
  }
}
function beginAim() {
  phase = 'aim';
  setView('pitch');
  showAimTools('aim');
  $('pitchPanel').hidden = false;
  choosePitchType(pitchType);
  hint('🎯 구종(1~4)을 고르고, 던질 곳을 클릭하세요');
}

// ---------- 시작·끝 ----------
let selTeam = store.get('baseball:team') || 'whales';
function buildTeamGrid() {
  const grid = $('teamGrid');
  grid.textContent = '';
  R.TEAMS.forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'team' + (t.id === selTeam ? ' on' : '');
    const uni = document.createElement('span'); uni.className = 'uni';
    [t.cap, t.jersey, t.accent, t.pants].forEach((c) => { const i = document.createElement('i'); i.style.background = c; uni.appendChild(i); });
    const name = document.createElement('span'); name.textContent = t.emoji + ' ' + t.name;
    b.append(uni, name);
    b.addEventListener('click', () => { selTeam = t.id; store.set('baseball:team', t.id); buildTeamGrid(); });
    grid.appendChild(b);
  });
}
buildTeamGrid();

function startSolo() {
  unlockAudio();
  const others = R.TEAMS.filter((t) => t.id !== selTeam);
  const opp = others[(Math.random() * others.length) | 0].id;
  mySide = $('optOrder').value;
  const teams = mySide === 'away' ? { away: selTeam, home: opp } : { away: opp, home: selTeam };
  state = R.createGame({ away: teams.away, home: teams.home, innings: +$('optInnings').value, level: $('optLevel').value });
  mode = 'solo';
  beginGame();
}
function beginGame() {
  lastHalfKey = '';
  timers.length = 0;
  playView = null; cur = null;
  showPanel(null);
  $('bug').hidden = false;
  $('who').hidden = false;
  setView('bat', false);
  nextTurn();
}
function finish() {
  phase = 'idle';
  showAimTools(null);
  $('pitchPanel').hidden = true;
  hint('');
  $('who').hidden = true;
  const me = mySide;
  const win = state.winner;
  $('resultTitle').textContent = !win ? '무승부!' : me && win === me ? '🏆 승리!' : me ? '아쉬운 패배…' : teamOf(win).short + ' 승리!';
  const tbl = $('lineScore');
  tbl.textContent = '';
  const n = Math.max(state.innings, state.inning);
  const head = document.createElement('tr');
  ['팀', ...Array.from({ length: n }, (_, i) => String(i + 1)), 'R', 'H'].forEach((h) => { const th = document.createElement('th'); th.textContent = h; head.appendChild(th); });
  tbl.appendChild(head);
  ['away', 'home'].forEach((side) => {
    const tr = document.createElement('tr');
    const t = teamOf(side);
    const cells = [t.emoji + ' ' + t.short, ...Array.from({ length: n }, (_, i) => state.line[side][i] == null ? '-' : String(state.line[side][i])), String(state.score[side]), String(state.hits[side])];
    cells.forEach((v, i) => { const td = document.createElement('td'); td.textContent = v; if (i >= n + 1) td.className = 'tot'; tr.appendChild(td); });
    tbl.appendChild(tr);
  });
  const score = mode === 'solo' ? R.soloScore(state, me) : 0;
  $('resultLine').textContent = mode === 'solo' ? '순위 점수 ' + score.toLocaleString('ko-KR') + '점 (득점×100 + 안타×20 + 승리 500)' : '친구 대결 끝!';
  $('submitBtn').hidden = mode !== 'solo';
  $('submitBtn').onclick = () => ranking.show(score);
  $('againBtn').textContent = mode === 'multi' ? '🏠 방으로' : '🔁 다시 하기';
  showPanel('resultPanel');
  if (win && win === me) sfx.cheer(true);
}
$('againBtn').addEventListener('click', () => {
  if (mode === 'multi') { showPanel(net.room ? 'roomPanel' : 'lobbyPanel'); renderRoom(); toMenuView(); return; }
  showPanel('menuPanel'); toMenuView();
});
$('rankBtn').addEventListener('click', () => ranking.show(0));
$('soloBtn').addEventListener('click', startSolo);
function toMenuView() {
  mode = mode === 'multi' ? 'multi' : 'menu';
  $('bug').hidden = true; $('who').hidden = true; $('pitchInfo').hidden = true;
  showAimTools(null); hint(''); cam.mode = 'menu';
}

// ================= 👫 친구와 경기 =================
const net = { socket: null, room: null, myId: null, turn: null, handledSeq: 0, pendingResult: null };
const myName = () => ($('nameInput').value || '').trim().slice(0, 12);
function setMsg(id, text, good) { $(id).textContent = text || ''; $(id).classList.toggle('ok', Boolean(good)); }
$('nameInput').value = (store.get('baseball:name') || '').slice(0, 12);
function connect() {
  if (net.socket) return net.socket;
  if (!window.io) { setMsg('menuMsg', '서버에 연결할 수 없어요. 새로고침 해 주세요.'); return null; }
  const s = window.io();
  net.socket = s;
  s.on('bb:room', (room) => { net.room = room; renderRoom(); });
  s.on('bb:start', (d) => {
    state = d.state;
    mode = 'multi';
    mySide = d.seats.away === net.myId ? 'away' : d.seats.home === net.myId ? 'home' : null;
    net.turn = null; net.handledSeq = 0; net.pendingResult = null;
    beginGame();
  });
  s.on('bb:turn', (d) => {
    if (mode !== 'multi') return;
    net.turn = d;
    if (phase === 'play' || phase === 'after' || phase === 'pitch') return;   // 연출이 끝나면 nextTurn이 알아서 부름
    state = d.state;
    nextTurn();
  });
  s.on('bb:pitch', (d) => { if (mode === 'multi') startPitch(d.pitch); });
  s.on('bb:result', (d) => {
    if (mode !== 'multi') return;
    if (cur && cur.waiting) { cur.waiting = false; showOutcome(d.out, d.state); }
    else net.pendingResult = d;
  });
  s.on('bb:over', (d) => { if (mode === 'multi') { state = d.state; } });
  s.on('bb:stopped', (d) => {
    if (mode !== 'multi') return;
    showCall(d.reason || '경기가 멈췄어요', false);
    toMenuView(); showPanel(net.room ? 'roomPanel' : 'lobbyPanel');
  });
  s.on('disconnect', () => { if (mode === 'multi') { toMenuView(); showPanel('lobbyPanel'); setMsg('lobbyMsg', '서버와 연결이 끊겼어요.'); } net.room = null; });
  return s;
}
function openLobby() {
  if (!connect()) return;
  setMsg('lobbyMsg', '');
  showPanel('lobbyPanel');
  refreshRooms();
}
function refreshRooms() {
  net.socket.emit('bb:rooms', null, (res) => {
    const ul = $('roomList');
    ul.textContent = '';
    const list = (res && res.rooms) || [];
    if (!list.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = '아직 열린 방이 없어요. 방을 만들어 보세요!'; ul.appendChild(li); return; }
    list.forEach((r) => {
      const li = document.createElement('li');
      const name = document.createElement('span'); name.textContent = r.title;
      const info = document.createElement('small'); info.textContent = r.count + '명' + (r.state === 'playing' ? ' · 경기 중(관전)' : '');
      const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = r.state === 'playing' ? '관전' : '입장';
      btn.addEventListener('click', () => joinRoom(r.code));
      li.append(name, info, btn); ul.appendChild(li);
    });
  });
}
function needName() {
  if (myName()) { store.set('baseball:name', myName()); return true; }
  setMsg('lobbyMsg', '먼저 내 이름을 써 주세요.'); $('nameInput').focus(); return false;
}
function afterEnter(res) {
  if (!res || !res.ok) { setMsg('lobbyMsg', (res && res.error) || '들어가지 못했어요.'); return; }
  net.myId = res.me; net.room = res.room;
  if (res.room.state === 'playing' && res.state) {                 // 경기 중인 방: 관전으로 바로
    state = res.state; mode = 'multi'; mySide = null; beginGame(); return;
  }
  showPanel('roomPanel'); renderRoom();
}
function joinRoom(code) {
  if (!needName()) return;
  const c = String(code || $('codeInput').value || '').trim().toUpperCase();
  if (c.length !== 4) { setMsg('lobbyMsg', '방 코드 4글자를 써 주세요.'); return; }
  net.socket.emit('bb:join', { nickname: myName(), code: c }, afterEnter);
}
function renderRoom() {
  const room = net.room;
  if (!room || $('roomPanel').hidden) return;
  $('roomTitle').textContent = room.title;
  $('roomCode').textContent = room.code;
  const host = room.hostId === net.myId;
  for (const side of ['away', 'home']) {
    const box = $(side === 'away' ? 'sideAway' : 'sideHome');
    const seat = room.seats[side];
    box.classList.toggle('me', seat && seat.id === net.myId);
    box.querySelector('.side-who').textContent = seat ? seat.nickname + (seat.id === net.myId ? ' (나)' : '') : '(비어 있음)';
    const sel = box.querySelector('select');
    if (!sel.options.length) R.TEAMS.forEach((t) => { const o = document.createElement('option'); o.value = t.id; o.textContent = t.emoji + ' ' + t.name; sel.appendChild(o); });
    sel.value = room.teams[side];
    sel.disabled = !(seat && seat.id === net.myId);
    const btn = box.querySelector('button');
    btn.hidden = Boolean(seat);
  }
  const spect = room.players.filter((p) => !(room.seats.away && room.seats.away.id === p.id) && !(room.seats.home && room.seats.home.id === p.id));
  $('spectators').textContent = spect.length ? '👀 관전: ' + spect.map((p) => p.nickname).join(', ') : '';
  $('roomInnings').value = String(room.innings);
  $('roomInnings').disabled = !host;
  $('roomStart').hidden = !host;
  const ready = room.seats.away && room.seats.home;
  $('roomStart').disabled = !ready || room.state === 'playing';
  setMsg('roomMsg', !ready ? '두 자리에 한 명씩 앉아야 시작할 수 있어요. 팀은 자리 주인이 골라요.' : host ? '준비 완료! 경기 시작을 눌러요.' : '방장이 시작하기를 기다리는 중…', Boolean(ready));
}
['away', 'home'].forEach((side) => {
  const box = $(side === 'away' ? 'sideAway' : 'sideHome');
  box.querySelector('button').addEventListener('click', () => net.socket.emit('bb:seat', { side }, (r) => { if (r && !r.ok) setMsg('roomMsg', r.error); }));
  box.querySelector('select').addEventListener('change', (e) => net.socket.emit('bb:team', { side, team: e.target.value }, (r) => { if (r && !r.ok) { setMsg('roomMsg', r.error); renderRoom(); } }));
});
$('roomInnings').addEventListener('change', (e) => net.socket.emit('bb:innings', { innings: +e.target.value }));
$('multiBtn').addEventListener('click', openLobby);
$('createBtn').addEventListener('click', () => { if (needName()) net.socket.emit('bb:create', { nickname: myName() }, afterEnter); });
$('joinBtn').addEventListener('click', () => joinRoom());
$('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
$('refreshBtn').addEventListener('click', refreshRooms);
$('lobbyBack').addEventListener('click', () => { showPanel('menuPanel'); });
$('roomStart').addEventListener('click', () => net.socket.emit('bb:start', null, (r) => { if (r && !r.ok) setMsg('roomMsg', r.error); }));
$('roomLeave').addEventListener('click', () => { net.socket.emit('bb:leave', null, () => {}); net.room = null; showPanel('lobbyPanel'); refreshRooms(); });

// ---------- 매 화면 ----------
let last = performance.now();
const tmpV = new THREE.Vector3();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  clock += dt;
  for (let i = timers.length - 1; i >= 0; i--) if (clock >= timers[i].at) { const t = timers.splice(i, 1)[0]; t.fn(); }
  if (phase === 'pitch' && cur) updatePitch();
  if (phase === 'play' && playView) updatePlay();
  // 조준 도구 위치
  batRing.position.set(aim.x, aim.y, 0.02); batDot.position.copy(batRing.position);
  if (meter) {
    aimRing.position.set(meter.x, meter.y, 0.02); aimDot.position.copy(aimRing.position);
    const r = meterRadius(clock - meter.t0);
    meterRing.position.copy(aimRing.position); meterRing.scale.setScalar(Math.max(0.001, r));
    meterTarget.position.copy(aimRing.position);
    if (r <= 0) finishMeter();
  } else { aimRing.position.set(aim.x, aim.y, 0.02); aimDot.position.copy(aimRing.position); }
  // 선수 동작
  if (assets) {
    [cast.batter, cast.umpire, ...cast.fielders, ...cast.runners].forEach((p) => p && p.update(dt));
  }
  updateCamera(dt);
  renderer.render(scene, camera);
}

// ---------- 불러오기 ----------
cam.mode = 'menu';
requestAnimationFrame(frame);
W.loadAssets((d, n) => { $('soloBtn').textContent = '모형 불러오는 중… ' + d + '/' + n; })
  .then((a) => {
    assets = a;
    stadium = W.buildStadium(scene, assets);
    boardScreen = W.makeBoardScreen(stadium.board);
    $('soloBtn').disabled = false;
    $('soloBtn').textContent = '🤖 컴퓨터와 경기';
    $('multiBtn').disabled = false;
    // 메뉴 뒤 구경: 수비수 세워 두기
    state = R.createGame({ away: 'foxes', home: selTeam });
    setupHalf();
    drawBoard();
    state = null;
  })
  .catch((e) => { console.error(e); $('soloBtn').textContent = '모형을 못 불러왔어요 — 새로고침 해 주세요'; });

window.__baseball = { get state() { return state; }, get phase() { return phase; }, get cur() { return cur; }, get clock() { return clock; }, aim, action, choosePitchType, scene, camera, renderer, cast };
