// ===== gulp-hole/js/main.js =====
// 꿀꺽 구멍 3D 화면(Three.js). 규칙은 rules.js(window.GulpHole.Rules)가 맡고, 여기서는 그리기·조작·소리만 한다.
// 모형: 블렌더로 만든 models/<이름>.glb(tools/gulp-hole/models.py). 사람·차는 블렌더 동작(걷기·바퀴)을
//   처음에 24자세로 미리 계산해 두고(frames), 물건마다 anim(0~1) 값으로 자세를 골라 그린다.
// 같은 모형은 InstancedMesh 한 개로 한꺼번에 그린다(물건 1,400여 개를 빠르게).
// 구멍: "스텐실"(화면에 구멍 모양 표시를 찍어 두는 기능)로 땅을 구멍 모양만큼 그리지 않고,
//   그 자리에 안쪽 벽(어두운 원통)을 그린다. 땅 아래로 떨어지는 물건은 구멍으로만 보인다.
import * as THREE from 'three';
import { GLTFLoader } from '/shared/three/addons/loaders/GLTFLoader.js';

const R = window.GulpHole.Rules;
const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } },
};
const NAME_KEY = 'gulp-hole:nickname';
const SOUND_KEY = 'gulp-hole:sound';
const ranking = window.GroupRanking.create({ slug: 'gulp-hole', unit: '점', top: 50 });

// ---------- 렌더러·장면 ----------
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const SKY = new THREE.Color('#bfe3ff');
scene.background = SKY;
scene.fog = new THREE.Fog(SKY, 160, 420);
const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 900);

scene.add(new THREE.HemisphereLight('#e3f2ff', '#8b9b74', 1.5));
const sun = new THREE.DirectionalLight('#fff6e6', 2.3);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0006;
sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(1, h);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- 땅(도로·인도·잔디를 캔버스에 그려 붙임) ----------
const GROUND_STENCIL = { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.NotEqualStencilFunc,
  stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp };

function drawGroundTexture(city) {
  // 땅 그림 해상도: 넓은 맵(330m)이라 큰 화면은 4096칸, 휴대폰은 2048칸(그래픽 메모리 아끼기)
  const big = Math.min(window.innerWidth, window.innerHeight) > 700;
  const SIZE = R.MAP_MAX - R.MAP_MIN, PX = Math.min(big ? 4096 : 2048, renderer.capabilities.maxTextureSize), s = PX / SIZE;
  const c = document.createElement('canvas');
  c.width = c.height = PX;
  const g = c.getContext('2d');
  const X = (v) => (v - R.MAP_MIN) * s;
  g.fillStyle = '#50555d';
  g.fillRect(0, 0, PX, PX);
  // 아스팔트 얼룩
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = Math.random() < 0.5 ? '#ffffff08' : '#0000000c';
    g.fillRect(Math.random() * PX, Math.random() * PX, 2 + Math.random() * 6, 2 + Math.random() * 6);
  }
  const roads = [];
  for (let k = 0; k <= R.BLOCKS; k++) roads.push(k * R.CELL);
  // 가운데 노란 겹선(교차로 빼고)
  g.fillStyle = '#f2c94c';
  roads.forEach((at) => {
    for (let b = 0; b < R.BLOCKS; b++) {
      const a0 = b * R.CELL + R.ROAD / 2 + 1, a1 = (b + 1) * R.CELL - R.ROAD / 2 - 1;
      for (const off of [-0.22, 0.08]) {
        g.fillRect(X(a0), X(at + off), (a1 - a0) * s, 0.14 * s);
        g.fillRect(X(at + off), X(a0), 0.14 * s, (a1 - a0) * s);
      }
    }
  });
  // 차선 가장자리 흰 점선 + 횡단보도
  g.fillStyle = '#f1f3f5';
  roads.forEach((at) => {
    for (let b = 0; b < R.BLOCKS; b++) {
      const a0 = b * R.CELL + R.ROAD / 2, a1 = (b + 1) * R.CELL - R.ROAD / 2;
      for (let d = a0 + 6; d < a1 - 6; d += 3) {
        for (const off of [-4.4, 4.25]) {
          g.fillRect(X(d), X(at + off), 1.6 * s, 0.15 * s);
          g.fillRect(X(at + off), X(d), 0.15 * s, 1.6 * s);
        }
      }
      for (const edge of [a0 + 0.6, a1 - 3.6]) {          // 교차로 바로 옆 얼룩말 줄
        for (let w = -4.2; w < 4.2; w += 0.9) {
          g.fillRect(X(edge), X(at + w), 3 * s, 0.45 * s);
          g.fillRect(X(at + w), X(edge), 0.45 * s, 3 * s);
        }
      }
    }
  });
  // 블록: 인도·연석·안쪽(잔디/광장)
  city.blocks.forEach((b) => {
    const x = X(b.x0), z = X(b.z0), w = b.size * s, ws = R.WALK * s;
    g.fillStyle = '#9b958b';
    g.fillRect(x - 0.25 * s, z - 0.25 * s, w + 0.5 * s, w + 0.5 * s);   // 연석
    g.fillStyle = '#d3cdc2';
    g.fillRect(x, z, w, w);
    g.strokeStyle = '#bdb6aa';
    g.lineWidth = 1;
    for (let t = 1; t < b.size; t += 1) {                  // 보도블록 줄
      g.beginPath(); g.moveTo(x + t * s, z); g.lineTo(x + t * s, z + ws); g.moveTo(x + t * s, z + w - ws); g.lineTo(x + t * s, z + w); g.stroke();
      g.beginPath(); g.moveTo(x, z + t * s); g.lineTo(x + ws, z + t * s); g.moveTo(x + w - ws, z + t * s); g.lineTo(x + w, z + t * s); g.stroke();
    }
    const ix = x + ws, iz = z + ws, iw = w - 2 * ws;
    if (b.kind === 'downtown') {
      g.fillStyle = '#e2dccf';
      g.fillRect(ix, iz, iw, iw);
      g.strokeStyle = '#cfc7b7';
      for (let t = 0; t < iw; t += 2 * s) {
        g.beginPath(); g.moveTo(ix + t, iz); g.lineTo(ix + t, iz + iw); g.moveTo(ix, iz + t); g.lineTo(ix + iw, iz + t); g.stroke();
      }
    } else {
      g.fillStyle = '#7fc46a';
      g.fillRect(ix, iz, iw, iw);
      for (let t = 0; t < iw; t += 1.6 * s) {              // 잔디 깎은 줄무늬
        g.fillStyle = (t / (1.6 * s)) % 2 < 1 ? '#86cb70' : '#78bb63';
        g.fillRect(ix + t, iz, 1.6 * s, iw);
      }
      if (b.kind === 'park') {
        const cx = x + w / 2, cz = z + w / 2;
        g.strokeStyle = '#e6d6b0';
        g.lineWidth = 2.2 * s;
        g.beginPath(); g.arc(cx, cz, 6.5 * s, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(ix, cz); g.lineTo(ix + iw, cz); g.moveTo(cx, iz); g.lineTo(cx, iz + iw); g.stroke();
      }
    }
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

let ground = null;
function makeGround(city) {
  if (ground) { scene.remove(ground); ground.traverse((o) => { if (o.material) { o.material.map?.dispose(); o.material.dispose(); o.geometry.dispose(); } }); }
  ground = new THREE.Group();
  const SIZE = R.MAP_MAX - R.MAP_MIN, mid = (R.MAP_MAX + R.MAP_MIN) / 2;
  const top = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), new THREE.MeshLambertMaterial({ map: drawGroundTexture(city), ...GROUND_STENCIL }));
  top.rotation.x = -Math.PI / 2;
  top.position.set(mid, 0, mid);
  top.receiveShadow = true;
  // 바깥 풀밭(도시 밖) — 구멍이 가장자리에 걸쳐도 뚫려 보이게 같은 스텐실을 쓴다
  const outer = new THREE.Mesh(new THREE.RingGeometry(SIZE * 0.705, 900, 4, 1), new THREE.MeshLambertMaterial({ color: '#7cb86a', ...GROUND_STENCIL }));
  outer.rotation.x = -Math.PI / 2;
  outer.rotation.z = Math.PI / 4;
  outer.position.set(mid, -0.01, mid);
  outer.receiveShadow = true;
  // 도시 둘레 낮은 담장
  const wallMat = new THREE.MeshLambertMaterial({ color: '#c9c3b8' });
  for (let i = 0; i < 4; i++) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(SIZE + 2, 1.2, 1), wallMat);
    const out = SIZE / 2 + 0.5;
    wall.position.set(mid + (i === 0 ? 0 : i === 1 ? 0 : i === 2 ? -out : out), 0.6, mid + (i === 0 ? -out : i === 1 ? out : 0));
    if (i >= 2) wall.rotation.y = Math.PI / 2;
    wall.castShadow = wall.receiveShadow = true;
    ground.add(wall);
  }
  ground.add(top, outer);
  scene.add(ground);
}

// ---------- 모형 불러오기(블렌더 GLB) ----------
const FRAMES = 24;
const objectMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
const templates = {};

function makeTemplate(gltf) {
  const root = gltf.scene;
  const meshes = [];
  root.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const moving = gltf.animations.length > 0;
  const frames = [];
  let mixer = null;
  if (moving) {
    mixer = new THREE.AnimationMixer(root);
    gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
  }
  for (let k = 0; k < (moving ? FRAMES : 1); k++) {
    if (mixer) mixer.setTime(k / FRAMES);                // 블렌더 동작 1초 중 k번째 자세
    root.updateMatrixWorld(true);
    frames.push(meshes.map((m) => m.matrixWorld.clone()));
  }
  meshes.forEach((m) => {
    if (!m.geometry.attributes.color) {                   // 꼭짓점 색이 없으면 재료 색으로 채운다
      const col = (m.material && m.material.color) || new THREE.Color('#cccccc');
      const n = m.geometry.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
      m.geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    }
  });
  return { geometries: meshes.map((m) => m.geometry), frames, moving };
}

async function loadModels(onProgress) {
  const names = new Set();
  Object.values(R.TYPES).forEach((t) => t.models.forEach((m) => names.add(m)));
  const loader = new GLTFLoader();
  let done = 0;
  await Promise.all([...names].map(async (name) => {
    const gltf = await loader.loadAsync('models/' + name + '.glb');
    templates[name] = makeTemplate(gltf);
    done += 1;
    onProgress(done, names.size);
  }));
}

// ---------- 물건 그리기(인스턴싱) ----------
let batches = {};     // 모형 이름 -> { parts: [InstancedMesh], tpl }
function buildBatches(state) {
  Object.values(batches).forEach((b) => b.parts.forEach((m) => { scene.remove(m); m.dispose(); }));
  batches = {};
  const counts = {};
  state.objects.forEach((o) => { o.slot = counts[o.model] = (counts[o.model] || 0); counts[o.model] += 1; });
  Object.keys(counts).forEach((name) => {
    const tpl = templates[name];
    const parts = tpl.geometries.map((geo) => {
      const m = new THREE.InstancedMesh(geo, objectMaterial, counts[name]);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(m);
      return m;
    });
    batches[name] = { parts, tpl };
  });
}

const _m = new THREE.Matrix4(), _p = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qt = new THREE.Quaternion();
const _v = new THREE.Vector3(), _axis = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const UP = new THREE.Vector3(0, 1, 0);
let clock = 0;

function writeObject(o) {
  const b = batches[o.model];
  if (o.state === 'gone') {
    b.parts.forEach((m) => m.setMatrixAt(o.slot, HIDDEN));
    return;
  }
  _q.setFromAxisAngle(UP, o.rot);
  if (o.wobble > 0) {                                    // 너무 커서 덜덜
    _qt.setFromAxisAngle(_axis.set(1, 0, 0), Math.sin(clock * 55 + o.id) * 0.06 * (o.wobble / 0.25));
    _q.premultiply(_qt);
  }
  if (o.tilt > 0) {
    // 구멍 가운데 쪽으로 넘어지기: 가운데 방향 c = -(cos, sin), 회전축 = 위 × c = (-sin, 0, cos)
    _axis.set(-Math.sin(o.tiltDir), 0, Math.cos(o.tiltDir));
    _qt.setFromAxisAngle(_axis, o.tilt);
    _q.premultiply(_qt);
  }
  _m.compose(_v.set(o.x, o.y, o.z), _q, _one);
  const frames = b.tpl.frames;
  const f = frames[b.tpl.moving ? Math.floor(o.anim * FRAMES) % FRAMES : 0];
  for (let i = 0; i < b.parts.length; i++) {
    _p.multiplyMatrices(_m, f[i]);
    b.parts[i].setMatrixAt(o.slot, _p);
  }
}

function flushObjects(state) {
  if (!state.changed.length) return;
  for (const o of state.changed) { writeObject(o); o._c = false; }
  state.changed.length = 0;
  Object.values(batches).forEach((b) => b.parts.forEach((m) => { m.instanceMatrix.needsUpdate = true; }));
}

// ---------- 구멍 그리기 ----------
const discGeo = new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2);
const wallGeo = (() => {
  const geo = new THREE.CylinderGeometry(1, 1, 1, 64, 6, true).translate(0, -0.5, 0);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const depth = -pos.getY(i);                              // 0(위) ~ 1(아래)
    const v = Math.max(0, 0.03 - depth * 0.12);              // 선형 색이라 아주 작은 값이어야 어둡게 보인다
    col[i * 3] = v * 0.85; col[i * 3 + 1] = v * 0.75; col[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
})();
const rimGeo = new THREE.RingGeometry(1, 1.07, 64).rotateX(-Math.PI / 2);
const STENCIL_MARK = { colorWrite: false, depthWrite: false, stencilWrite: true, stencilRef: 1,
  stencilFunc: THREE.AlwaysStencilFunc, stencilZPass: THREE.ReplaceStencilOp };
const STENCIL_INSIDE = { stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc,
  stencilFail: THREE.KeepStencilOp, stencilZFail: THREE.KeepStencilOp, stencilZPass: THREE.KeepStencilOp };
const discMat = new THREE.MeshBasicMaterial({ ...STENCIL_MARK });
// fog: false — 구멍 바닥은 아주 멀어서(70m 아래) 안개가 하늘색으로 칠해 버리므로 안개를 끈다
const wallMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, ...STENCIL_INSIDE });
const floorMat = new THREE.MeshBasicMaterial({ color: '#000000', fog: false, ...STENCIL_INSIDE });
const DEPTH = 70;

function labelSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = '900 56px Pretendard, "Noto Sans KR", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(500, g.measureText(text).width + 60);
  g.fillStyle = '#1f2330cc';
  g.beginPath(); g.roundRect((512 - w) / 2, 22, w, 84, 42); g.fill();
  g.fillStyle = color;
  g.beginPath(); g.arc((512 - w) / 2 + 34, 64, 13, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff';
  g.fillText(text, 256 + 12, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.renderOrder = 10;
  return sp;
}

let holeViews = [];
function buildHoles(state) {
  holeViews.forEach((v) => { scene.remove(v.group, v.label); v.label.material.map.dispose(); v.label.material.dispose(); v.rim.material.dispose(); });
  holeViews = state.holes.map((h) => {
    const group = new THREE.Group();
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.position.y = 0.02;
    disc.renderOrder = -10;                                  // 땅보다 먼저 "구멍 자리" 표시
    const wall = new THREE.Mesh(wallGeo, wallMat);
    const floor = new THREE.Mesh(discGeo, floorMat);
    floor.position.y = -DEPTH;
    const rim = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({ color: h.color, polygonOffset: true, polygonOffsetFactor: -2 }));
    rim.position.y = 0.04;
    group.add(disc, wall, floor, rim);
    const label = labelSprite(h.name, h.color);
    scene.add(group, label);
    return { group, wall, floor, rim, label };
  });
}

function updateHoles(state, visible) {
  state.holes.forEach((h, i) => {
    const v = holeViews[i];
    const show = visible !== false && h.alive;
    v.group.visible = v.label.visible = show;
    if (!show) return;
    v.group.position.set(h.x, 0, h.z);
    v.group.children[0].scale.setScalar(h.r);                // 표시 원판
    v.wall.scale.set(h.r, DEPTH, h.r);
    v.floor.scale.setScalar(h.r);
    v.rim.scale.setScalar(h.r);
    const sz = 1.6 + h.r * 0.4;
    v.label.scale.set(sz * 4, sz, 1);
    v.label.position.set(h.x, 0.6 + h.r * 0.3, h.z - h.r - sz * 0.6);   // 구멍 바로 위(북쪽 가장자리)
  });
}

// ---------- 조작 ----------
const keys = new Set();
const drag = { on: false, id: null, sx: 0, sy: 0, x: 0, y: 0 };
const stick = $('stick');
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(k)) {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    keys.add(k); e.preventDefault();
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => { keys.clear(); drag.on = false; stick.classList.remove('on'); });
canvas.addEventListener('pointerdown', (e) => {
  if (drag.on) return;
  drag.on = true; drag.id = e.pointerId;
  drag.sx = drag.x = e.clientX; drag.sy = drag.y = e.clientY;
  canvas.setPointerCapture(e.pointerId);
  const r = canvas.getBoundingClientRect();
  stick.style.left = (e.clientX - r.left) + 'px';
  stick.style.top = (e.clientY - r.top) + 'px';
  stick.firstElementChild.style.transform = '';
  stick.classList.add('on');
  unlockAudio();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag.on || e.pointerId !== drag.id) return;
  drag.x = e.clientX; drag.y = e.clientY;
  let dx = drag.x - drag.sx, dy = drag.y - drag.sy;
  const len = Math.hypot(dx, dy), max = 48;
  if (len > max) { dx *= max / len; dy *= max / len; }
  stick.firstElementChild.style.transform = `translate(${dx}px, ${dy}px)`;
});
function endDrag(e) {
  if (e.pointerId !== drag.id) return;
  drag.on = false; stick.classList.remove('on');
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function readInput() {
  let x = 0, z = 0;
  if (keys.has('arrowleft') || keys.has('a')) x -= 1;
  if (keys.has('arrowright') || keys.has('d')) x += 1;
  if (keys.has('arrowup') || keys.has('w')) z -= 1;
  if (keys.has('arrowdown') || keys.has('s')) z += 1;
  if (drag.on) {
    const dx = drag.x - drag.sx, dy = drag.y - drag.sy, len = Math.hypot(dx, dy);
    if (len > 6) { const k = Math.min(1, len / 48) / len; x = dx * k; z = dy * k; }  // 화면 위 = 도시 북쪽(-z)
  }
  return { x, z };
}

// ---------- 소리(WebAudio로 직접 만든 "꿀꺽") ----------
let audio = null;
let soundOn = store.get(SOUND_KEY) !== 'off';
function unlockAudio() {
  if (!soundOn) return;
  if (!audio) { try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; } }
  if (audio && audio.state === 'suspended') audio.resume();
}
function gulpSound(size) {
  if (!soundOn || !audio) return;
  const t = audio.currentTime;
  const o = audio.createOscillator(), g = audio.createGain();
  const top = 900 / Math.sqrt(1 + size * 0.6);
  o.type = 'sine';
  o.frequency.setValueAtTime(top, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(60, top * 0.3), t + 0.16 + size * 0.004);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.min(0.35, 0.08 + size * 0.003), t + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22 + size * 0.004);
  o.connect(g).connect(audio.destination);
  o.start(t); o.stop(t + 0.3 + size * 0.004);
}
function soundLabel() { $('soundBtn').textContent = soundOn ? '🔊' : '🔇'; }
$('soundBtn').addEventListener('click', () => {
  soundOn = !soundOn; store.set(SOUND_KEY, soundOn ? 'on' : 'off'); soundLabel();
  if (soundOn) unlockAudio();
});
soundLabel();

// ---------- 글자 표시(HUD) ----------
const WHAT = { person: '사람', cone: '고깔', hydrant: '소화전', trashcan: '쓰레기통', mailbox: '우체통', bench: '벤치', lamp: '가로등',
  tree_round: '나무', tree_pine: '소나무', fountain: '분수대', car: '자동차', truck: '트럭', bus: '버스', house: '주택', shop: '가게',
  apartment: '아파트', tower: '고층 빌딩' };
function popup(text, big) {
  const el = document.createElement('div');
  el.className = 'pop' + (big ? ' big' : '');
  el.textContent = text;
  el.style.left = ((Math.random() - 0.5) * 160) + 'px';
  el.style.top = ((Math.random() - 0.5) * 50) + 'px';
  $('popups').appendChild(el);
  setTimeout(() => el.remove(), 950);
}
function renderBoard(state) {
  const list = R.standings(state).slice(0, 5);
  const me = state.holes[0];
  const ol = $('board');
  ol.textContent = '';
  const rows = list.includes(me) ? list : list.slice(0, 4).concat(me);
  rows.forEach((h) => {
    const li = document.createElement('li');
    if (h === me) li.className = 'me';
    const dot = document.createElement('i'); dot.style.background = h.color;
    const name = document.createElement('span'); name.textContent = (R.standings(state).indexOf(h) + 1) + '. ' + h.name;
    const sc = document.createElement('b'); sc.textContent = h.score.toLocaleString('ko-KR');
    li.append(dot, name, sc);
    ol.appendChild(li);
  });
}
function renderHud(state) {
  const left = Math.max(0, Math.ceil(state.duration - state.time));
  $('timeText').textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  $('timeText').parentElement.classList.toggle('low', left <= 15);
  const me = state.holes[0];
  $('scoreText').textContent = me.score.toLocaleString('ko-KR');
  $('sizeText').textContent = (me.r * 2).toFixed(1);
  renderBoard(state);
}

// ---------- 카메라 ----------
const MID = (R.MAP_MIN + R.MAP_MAX) / 2;
const camAt = new THREE.Vector3(MID, 0, MID);
let camR = 1;
function updateCamera(state, dt, snap) {
  const me = state.holes[0];
  const k = snap ? 1 : 1 - Math.exp(-dt * 5);
  camAt.x += (me.x - camAt.x) * k;
  camAt.z += (me.z - camAt.z) * k;
  const wantR = running || !$('resultPanel').hidden ? me.r : 7;   // 시작 화면은 높이서 도시 구경
  camR += (wantR - camR) * (snap ? 1 : 1 - Math.exp(-dt * 2));
  const narrow = camera.aspect < 0.8 ? 1.35 : 1;           // 휴대폰 세로 화면은 조금 더 멀리
  camera.position.set(camAt.x, (15 + camR * 3.4) * narrow, camAt.z + (12 + camR * 2.7) * narrow);
  camera.lookAt(camAt.x, 0, camAt.z - 1.5);
  const span = 45 + camR * 4;
  sun.position.set(camAt.x + 40, 90, camAt.z + 30);
  sun.target.position.set(camAt.x, 0, camAt.z);
  const sc = sun.shadow.camera;
  if (sc.right !== span) { sc.left = sc.bottom = -span; sc.right = sc.top = span; sc.near = 10; sc.far = 220; sc.updateProjectionMatrix(); }
}

// ---------- 게임 흐름 ----------
let state = null;
let running = false;
let showcase = 0;
let hudTimer = 0;
let lastEaten = false;

function newGame() {
  const name = ($('nameInput').value || '').trim().slice(0, 12) || '나';
  store.set(NAME_KEY, name);
  state = R.createGame({ seed: (Math.random() * 1e9) | 0, playerName: name });
  makeGround(state.city);
  buildBatches(state);
  buildHoles(state);
  flushObjects(state);
  updateHoles(state, false);
  updateCamera(state, 0, true);
}

function handleEvents() {
  for (const e of state.events) {
    if (e.type === 'eat') {
      if (e.hole === 0) { popup('+' + e.pts + ' ' + WHAT[e.what], e.pts >= 100); gulpSound(e.pts); }
    } else if (e.type === 'hole') {
      if (e.hole === 0) { popup('🕳️ ' + state.holes[e.victim].name + ' 꿀꺽! +' + e.pts, true); gulpSound(80); }
      if (e.victim === 0) { $('eatenText').textContent = '😵 ' + state.holes[e.hole].name + '에게 먹혔어요!'; gulpSound(120); }
    } else if (e.type === 'over') {
      finish();
    }
  }
  state.events.length = 0;
  const eaten = !state.holes[0].alive;
  if (eaten !== lastEaten) { $('eaten').hidden = !eaten; lastEaten = eaten; }
}

function finish() {
  running = false;
  drag.on = false; stick.classList.remove('on');
  const list = R.standings(state);
  const me = state.holes[0];
  const place = list.indexOf(me) + 1;
  $('resultTitle').textContent = place === 1 ? '🏆 1등! 도시를 다 삼켰어요' : place <= 3 ? '🥈 ' + place + '등! 아주 잘했어요' : '경기 끝! ' + place + '등';
  $('resultLine').textContent = '내 점수 ' + me.score.toLocaleString('ko-KR') + '점 · 구멍 지름 ' + (me.r * 2).toFixed(1) + 'm';
  const ol = $('resultList');
  ol.textContent = '';
  list.forEach((h, i) => {
    const li = document.createElement('li');
    if (h === me) li.className = 'me';
    const rank = document.createElement('em'); rank.textContent = (i + 1) + '등';
    const dot = document.createElement('i'); dot.style.background = h.color;
    const name = document.createElement('span'); name.textContent = h.name;
    const sc = document.createElement('b'); sc.textContent = h.score.toLocaleString('ko-KR') + '점';
    li.append(rank, dot, name, sc);
    ol.appendChild(li);
  });
  $('hud').hidden = $('board').hidden = true;
  $('eaten').hidden = true;
  $('resultPanel').hidden = false;
}

function start() {
  unlockAudio();
  newGame();
  running = true;
  hudTimer = 0;
  lastEaten = false;
  $('startPanel').hidden = $('resultPanel').hidden = true;
  $('hud').hidden = $('board').hidden = false;
  renderHud(state);
}

let last = performance.now(), acc = 0;
const STEP = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  clock += dt;
  if (!state) return;
  if (running) {
    acc += dt;
    const input = readInput();
    let n = 0;
    while (acc >= STEP && n < 6) { R.step(state, input, STEP); acc -= STEP; n += 1; }
    if (n === 6) acc = 0;
    handleEvents();
    hudTimer -= dt;
    if (hudTimer <= 0 && running) { renderHud(state); hudTimer = 0.2; }
  } else if (!$('startPanel').hidden) {
    // 시작 화면 뒤: 사람·차만 움직이고 카메라가 천천히 도시를 돈다
    showcase += dt;
    R.animateCity(state, Math.min(dt, 0.05));
    const p = state.holes[0];
    p.x = MID + Math.cos(showcase * 0.06) * MID * 0.6;
    p.z = MID + Math.sin(showcase * 0.06) * MID * 0.6;
  }
  flushObjects(state);
  updateHoles(state, running || !$('resultPanel').hidden);
  updateCamera(state, dt, false);
  renderer.render(scene, camera);
}

// ---------- 시작 ----------
$('nameInput').value = (store.get(NAME_KEY) || '').slice(0, 12);
$('startBtn').addEventListener('click', start);
$('againBtn').addEventListener('click', start);
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('startBtn').disabled) start(); });
$('submitBtn').addEventListener('click', () => ranking.show(state ? state.holes[0].score : 0));
$('rankBtn').addEventListener('click', () => ranking.show(0));

loadModels((done, total) => { $('startBtn').textContent = '모형 불러오는 중… ' + done + '/' + total; })
  .then(() => {
    newGame();
    $('startBtn').disabled = false;
    $('startBtn').textContent = '▶ 시작하기';
    requestAnimationFrame(frame);
  })
  .catch((err) => {
    console.error(err);
    $('startBtn').textContent = '모형을 못 불러왔어요 — 새로고침 해 주세요';
  });

// 시험(브라우저 자동 점검)용 엿보기 창
window.__gulpHole = { get state() { return state; }, renderer, scene, camera, templates };
