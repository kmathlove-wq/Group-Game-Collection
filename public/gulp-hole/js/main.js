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
// 🖱️ 컴퓨터 마우스: 누르지 않아도 마우스가 가리키는 땅 쪽으로 구멍이 따라간다(휴대폰 손가락은 아래 끌기 막대)
const mouse = { on: false, x: 0, y: 0 };
const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _ndc = new THREE.Vector2(), _hit = new THREE.Vector3();
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  mouse.on = true; mouse.x = e.clientX; mouse.y = e.clientY;
});
canvas.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') mouse.on = false; });
function mouseInput() {
  const r = canvas.getBoundingClientRect();
  _ndc.set(((mouse.x - r.left) / r.width) * 2 - 1, -((mouse.y - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(_ndc, camera);
  if (!raycaster.ray.intersectPlane(groundPlane, _hit)) return { x: 0, z: 0 };
  const me = state.holes[meIdx];
  const dx = _hit.x - me.x, dz = _hit.z - me.z, dist = Math.hypot(dx, dz);
  // 구멍 가운데 가까이면 멈추고, 멀수록 빠르게(구멍 크기 + 4m 떨어지면 최고 속도)
  const k = Math.max(0, Math.min(1, (dist - me.r * 0.25) / (me.r + 4)));
  return dist > 0.01 ? { x: dx / dist * k, z: dz / dist * k } : { x: 0, z: 0 };
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') { unlockAudio(); return; }   // 마우스는 끌 필요 없음
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
  if (x || z) return { x, z };                               // 방향키가 먼저
  if (drag.on) {
    const dx = drag.x - drag.sx, dy = drag.y - drag.sy, len = Math.hypot(dx, dy);
    if (len > 6) { const k = Math.min(1, len / 48) / len; x = dx * k; z = dy * k; }  // 화면 위 = 도시 북쪽(-z)
    return { x, z };
  }
  if (mouse.on) return mouseInput();
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
  const me = state.holes[meIdx];
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
  const me = state.holes[meIdx];
  $('scoreText').textContent = me.score.toLocaleString('ko-KR');
  $('sizeText').textContent = (me.r * 2).toFixed(1);
  renderBoard(state);
}

// ---------- 카메라 ----------
const MID = (R.MAP_MIN + R.MAP_MAX) / 2;
const camAt = new THREE.Vector3(MID, 0, MID);
let camR = 1;
function updateCamera(state, dt, snap) {
  const me = state.holes[meIdx];
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
let meIdx = 0;          // 내 구멍 번호(컴퓨터 대결은 0, 친구 대결은 서버가 정해 줌)
let mode = 'solo';     // 'solo' 컴퓨터와 대결, 'multi' 친구들과 대결
let running = false;
let showcase = 0;
let hudTimer = 0;
let lastEaten = false;

function newGame(multi) {
  const name = ($('nameInput').value || '').trim().slice(0, 12) || '나';
  store.set(NAME_KEY, name);
  if (multi) {                                             // 친구 대결: 서버가 준 씨앗·사람 목록으로 같은 도시
    mode = 'multi'; meIdx = multi.you;
    state = R.createGame({ seed: multi.seed, players: multi.players, duration: multi.duration });
  } else {
    mode = 'solo'; meIdx = 0;
    state = R.createGame({ seed: (Math.random() * 1e9) | 0, playerName: name });
  }
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
      if (e.hole === meIdx) { popup('+' + e.pts + ' ' + WHAT[e.what], e.pts >= 100); gulpSound(e.pts); }
    } else if (e.type === 'hole') {
      if (e.hole === meIdx) { popup('🕳️ ' + state.holes[e.victim].name + ' 꿀꺽! +' + e.pts, true); gulpSound(80); }
      if (e.victim === meIdx) { $('eatenText').textContent = '😵 ' + state.holes[e.hole].name + '에게 먹혔어요!'; gulpSound(120); }
    } else if (e.type === 'over') {
      finish();
    }
  }
  state.events.length = 0;
  const eaten = !state.holes[meIdx].alive;
  if (eaten !== lastEaten) { $('eaten').hidden = !eaten; lastEaten = eaten; }
}

function finish() {
  running = false;
  drag.on = false; stick.classList.remove('on');
  const list = R.standings(state);
  const me = state.holes[meIdx];
  const place = list.indexOf(me) + 1;
  $('againBtn').textContent = mode === 'multi' ? '🏠 방으로' : '🔁 다시 하기';
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

function start(multi) {
  unlockAudio();
  newGame(multi && multi.seed ? multi : null);
  running = true;
  hudTimer = 0;
  lastEaten = false;
  showPanel(null);
  $('hud').hidden = $('board').hidden = false;
  renderHud(state);
}

// 창 하나만 보이게(null이면 모두 숨김)
const PANELS = ['startPanel', 'lobbyPanel', 'roomPanel', 'resultPanel'];
function showPanel(id) { PANELS.forEach((p) => { $(p).hidden = p !== id; }); }

// ================= 👫 친구들과 대결(사람끼리, 서버가 판정) =================
// 서버가 초당 15번 보내는 위치(snap)를 0.11초 늦게 이어 그려서 부드럽게 보인다(보간 = 두 점 사이를 채우기).
// 내 구멍만은 기다리지 않고 내 화면에서 바로 움직이고(예측), 서버 위치와 조금씩 맞춘다(보정).
const INTERP_MS = 110;
const net = { socket: null, room: null, myId: null, snaps: [], sendT: 0, ping: 0.08, pingT: 0 };

function myName() { return ($('nameInput').value || '').trim().slice(0, 12); }
function setMsg(id, text, good) { $(id).textContent = text || ''; $(id).classList.toggle('ok', Boolean(good)); }

function connect() {
  if (net.socket) return net.socket;
  if (!window.io) { setMsg('startMsg', '서버에 연결할 수 없어요. 새로고침 해 주세요.'); return null; }
  const socket = window.io();
  net.socket = socket;
  socket.on('gh:room', (room) => { net.room = room; renderRoom(); });
  socket.on('gh:start', (data) => {
    net.snaps = [];
    start(data);
  });
  socket.on('gh:snap', (s) => {
    s.at = performance.now();
    net.snaps.push(s);
    if (net.snaps.length > 30) net.snaps.shift();
  });
  socket.on('gh:ev', (list) => { if (mode === 'multi' && running) list.forEach(netEvent); });
  socket.on('gh:over', (data) => {
    if (mode !== 'multi' || !state) return;
    data.standings.forEach(([id, score]) => { if (state.holes[id]) state.holes[id].score = score; });
    finish();
  });
  socket.on('disconnect', () => {
    if (mode === 'multi' && running) {
      running = false;
      $('hud').hidden = $('board').hidden = true;
      showPanel('lobbyPanel');
      setMsg('lobbyMsg', '서버와 연결이 끊겼어요. 방을 다시 만들거나 들어가 주세요.');
    }
    net.room = null;
  });
  return socket;
}

function openLobby() {
  if (!myName()) { setMsg('startMsg', '먼저 내 구멍 이름을 써 주세요.'); $('nameInput').focus(); return; }
  store.set(NAME_KEY, myName());
  if (!connect()) return;
  setMsg('startMsg', '');
  setMsg('lobbyMsg', '');
  showPanel('lobbyPanel');
  refreshRooms();
}

function refreshRooms() {
  net.socket.emit('gh:rooms', null, (res) => {
    const ul = $('roomList');
    ul.textContent = '';
    const list = (res && res.rooms) || [];
    if (!list.length) {
      const li = document.createElement('li'); li.className = 'empty'; li.textContent = '아직 열린 방이 없어요. 방을 만들어 보세요!';
      ul.appendChild(li); return;
    }
    list.forEach((r) => {
      const li = document.createElement('li');
      const name = document.createElement('span'); name.textContent = r.title;
      const info = document.createElement('small'); info.textContent = r.count + '/' + r.max + '명' + (r.state === 'playing' ? ' · 경기 중' : '');
      const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = '입장'; btn.disabled = !r.canJoin;
      btn.addEventListener('click', () => joinRoom(r.code));
      li.append(name, info, btn);
      ul.appendChild(li);
    });
  });
}

function afterEnter(res) {
  if (!res || !res.ok) { setMsg('lobbyMsg', (res && res.error) || '들어가지 못했어요.'); return; }
  net.myId = res.me;
  net.room = res.room;
  showPanel('roomPanel');
  renderRoom();
}
function createRoom() {
  net.socket.emit('gh:create', { nickname: myName(), isPublic: $('publicCheck').checked }, afterEnter);
}
function joinRoom(code) {
  const c = String(code || $('codeInput').value || '').trim().toUpperCase();
  if (c.length !== 4) { setMsg('lobbyMsg', '방 코드 4글자를 써 주세요.'); return; }
  net.socket.emit('gh:join', { nickname: myName(), code: c }, afterEnter);
}

function renderRoom() {
  const room = net.room;
  if (!room) return;
  $('roomTitle').textContent = room.title;
  $('roomCode').textContent = room.code;
  const ul = $('playerList');
  ul.textContent = '';
  room.players.forEach((p) => {
    const li = document.createElement('li');
    if (p.id === net.myId) li.className = 'me';
    const dot = document.createElement('i'); dot.style.background = p.color;
    const name = document.createElement('span'); name.textContent = (p.isHost ? '👑 ' : '') + p.nickname + (p.id === net.myId ? ' (나)' : '');
    li.append(dot, name);
    ul.appendChild(li);
  });
  const host = room.hostId === net.myId;
  $('roomStart').hidden = !host;
  $('roomStart').disabled = room.players.length < room.min || room.state === 'playing';
  if (room.state === 'playing') setMsg('roomMsg', '경기 중이에요…', true);
  else if (host) setMsg('roomMsg', room.players.length < room.min ? '친구가 한 명 이상 더 들어와야 시작할 수 있어요.' : '모두 모였으면 경기 시작을 눌러요!', room.players.length >= room.min);
  else setMsg('roomMsg', '방장이 시작하기를 기다리는 중…', true);
}

// 서버 알림: ['f', 물건, 구멍] 빠지기 시작 · ['e', 물건, 구멍, 점수] 다 먹음 · ['h', 구멍, 먹힌 구멍, 점수] · ['r', 구멍] 다시 나옴
function netEvent(e) {
  if (e[0] === 'f') R.startFallFor(state, e[1], e[2]);
  else if (e[0] === 'e') {
    const o = state.objects[e[1]];
    if (o && o.state === 'idle') R.removeObject(state, e[1]);     // 떨어지는 모습을 놓쳤으면 그냥 없앤다
    if (e[2] === meIdx && o) { popup('+' + e[3] + ' ' + WHAT[o.type], e[3] >= 100); gulpSound(e[3]); }
  } else if (e[0] === 'h') {
    if (e[1] === meIdx) { popup('🕳️ ' + state.holes[e[2]].name + ' 꿀꺽! +' + e[3], true); gulpSound(80); }
    if (e[2] === meIdx) { $('eatenText').textContent = '😵 ' + state.holes[e[1]].name + '에게 먹혔어요!'; gulpSound(120); }
  }
}

const lerp = (a, b, t) => a + (b - a) * t;
function lerpAngle(a, b, t) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; }

function netFrame(dt) {
  const input = readInput();
  net.sendT -= dt;
  if (net.sendT <= 0) {                                    // 방향은 초당 20번 보낸다
    net.socket.emit('gh:input', { x: Math.round(input.x * 100) / 100, z: Math.round(input.z * 100) / 100 });
    net.sendT = 0.05;
  }
  net.pingT -= dt;
  if (net.pingT <= 0) {                                    // 2초마다 왕복 시간 재기(보정에 씀)
    net.pingT = 2;
    const t0 = performance.now();
    net.socket.emit('gh:rooms', null, () => { net.ping = Math.min(0.5, (performance.now() - t0) / 1000); });
  }
  const snaps = net.snaps;
  if (!snaps.length) { R.clientStep(state, dt); return; }
  const latest = snaps[snaps.length - 1];
  const renderAt = performance.now() - INTERP_MS;
  let a = snaps[0], b = latest;
  for (let i = snaps.length - 1; i > 0; i--) {
    if (snaps[i - 1].at <= renderAt) { a = snaps[i - 1]; b = snaps[i]; break; }
  }
  const t = b.at > a.at ? Math.max(0, Math.min(1, (renderAt - a.at) / (b.at - a.at))) : 1;
  // 구멍들
  state.holes.forEach((h, i) => {
    const k = i * 5, L = latest.h;
    h.score = L[k + 3];
    const wasAlive = h.alive;
    h.alive = L[k + 4] === 1;
    if (i === meIdx) {
      if (h.alive) {
        if (wasAlive) R.moveHole(h, input.x, input.z, dt);   // 예측: 기다리지 않고 바로 움직임
        // 보정: 서버 위치(조금 옛날) + 그동안 움직였을 만큼 쪽으로 살짝 당긴다
        const lag = net.ping / 2 + 1 / 30;
        const sx = L[k] + h.vx * lag, sz = L[k + 1] + h.vz * lag;
        const err = Math.hypot(sx - h.x, sz - h.z);
        if (!wasAlive || err > 6) { h.x = L[k]; h.z = L[k + 1]; h.vx = h.vz = 0; }
        else { const c = Math.min(1, dt * 3); h.x += (sx - h.x) * c; h.z += (sz - h.z) * c; }
      }
      h.r = lerp(h.r, L[k + 2], Math.min(1, dt * 6));
    } else {
      h.x = lerp(a.h[k], b.h[k], t);
      h.z = lerp(a.h[k + 1], b.h[k + 1], t);
      h.r = lerp(a.h[k + 2], b.h[k + 2], t);
    }
  });
  // 차들
  state.drivers.forEach((o, i) => {
    if (o.state !== 'idle') return;
    const k = i * 3;
    if (b.c[k] == null || a.c[k] == null) return;
    const nx = lerp(a.c[k], b.c[k], t), nz = lerp(a.c[k + 1], b.c[k + 1], t);
    const moved = Math.hypot(nx - o.x, nz - o.z);
    if (moved > 15) o.anim = 0;
    else o.anim = (o.anim + moved / (2 * Math.PI * R.TYPES[o.type].wheel)) % 1;   // 움직인 만큼 바퀴가 돈다
    o.x = nx; o.z = nz;
    o.rot = lerpAngle(a.c[k + 2], b.c[k + 2], t);
    if (!o._c) { o._c = true; state.changed.push(o); }
  });
  state.time = latest.t;
  R.clientStep(state, dt);                                  // 걷는 사람·떨어지는 물건·덜덜
  const eaten = !state.holes[meIdx].alive;
  if (eaten !== lastEaten) { $('eaten').hidden = !eaten; lastEaten = eaten; }
}

let last = performance.now(), acc = 0;
const STEP = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  clock += dt;
  if (!state) return;
  if (running && mode === 'multi') {
    netFrame(dt);
    hudTimer -= dt;
    if (hudTimer <= 0 && running) { renderHud(state); hudTimer = 0.2; }
  } else if (running) {
    acc += dt;
    const input = readInput();
    let n = 0;
    while (acc >= STEP && n < 6) { R.step(state, input, STEP); acc -= STEP; n += 1; }
    if (n === 6) acc = 0;
    handleEvents();
    hudTimer -= dt;
    if (hudTimer <= 0 && running) { renderHud(state); hudTimer = 0.2; }
  } else if ($('resultPanel').hidden) {
    // 시작 화면 뒤: 사람·차만 움직이고 카메라가 천천히 도시를 돈다
    showcase += dt;
    R.animateCity(state, Math.min(dt, 0.05));
    const p = state.holes[meIdx];
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
$('startBtn').addEventListener('click', () => start());
$('againBtn').addEventListener('click', () => {
  if (mode !== 'multi') { start(); return; }
  newGame();                                               // 친구 대결이 끝나면 방 대기실로(방장이 다시 시작)
  if (net.room) { showPanel('roomPanel'); renderRoom(); } else showPanel('lobbyPanel');
});
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('startBtn').disabled) start(); });
$('multiBtn').addEventListener('click', openLobby);
$('createBtn').addEventListener('click', createRoom);
$('joinBtn').addEventListener('click', () => joinRoom());
$('codeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') joinRoom(); });
$('refreshBtn').addEventListener('click', refreshRooms);
$('lobbyBack').addEventListener('click', () => showPanel('startPanel'));
$('roomStart').addEventListener('click', () => {
  net.socket.emit('gh:start', null, (res) => { if (!res || !res.ok) setMsg('roomMsg', (res && res.error) || '시작하지 못했어요.'); });
});
$('roomLeave').addEventListener('click', () => {
  net.socket.emit('gh:leave', null, () => {});
  net.room = null;
  showPanel('lobbyPanel');
  refreshRooms();
});
$('submitBtn').addEventListener('click', () => ranking.show(state ? state.holes[meIdx].score : 0));
$('rankBtn').addEventListener('click', () => ranking.show(0));

loadModels((done, total) => { $('startBtn').textContent = '모형 불러오는 중… ' + done + '/' + total; })
  .then(() => {
    newGame();
    $('startBtn').disabled = false;
    $('startBtn').textContent = '🤖 컴퓨터와 대결';
    $('multiBtn').disabled = false;
    requestAnimationFrame(frame);
  })
  .catch((err) => {
    console.error(err);
    $('startBtn').textContent = '모형을 못 불러왔어요 — 새로고침 해 주세요';
  });

// 시험(브라우저 자동 점검)용 엿보기 창
window.__gulpHole = { get state() { return state; }, renderer, scene, camera, templates };
