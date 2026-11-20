// ===== baseball/js/world.js =====
// 풀카운트 야구의 3D 세상: 렌더러·하늘·경기장(잔디·흙·라인·담장·관중석·관중·조명탑·전광판)·선수·공.
// 규칙은 rules.js(window.Baseball.Rules)가 맡고, 여기서는 "보이는 것"만 만든다.
// 모형은 블렌더로 직접 만든 models/*.glb(tools/baseball/models.py). 선수는 관절 인형 + 동작 파일(anim_*.glb).
// 좌표: 홈플레이트 (0,0,0), y 위, 중견수 쪽 -z, 1루 +x.
import * as THREE from 'three';
import { GLTFLoader } from '/shared/three/addons/loaders/GLTFLoader.js';
import { Sky } from '/shared/three/addons/objects/Sky.js';

const R = window.Baseball.Rules;
const MOBILE = Math.min(window.innerWidth, window.innerHeight) < 700;

// ---------- 렌더러 ----------
export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;          // 영화처럼 밝은 곳·어두운 곳을 부드럽게
  renderer.toneMappingExposure = 0.62;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  return renderer;
}

// ---------- 하늘 + 햇빛 + 주변 반사 ----------
export function buildSky(scene, renderer) {
  const sky = new Sky();
  sky.scale.setScalar(4000);
  const u = sky.material.uniforms;
  u.turbidity.value = 2.8;
  u.rayleigh.value = 2.4;                                       // 하늘을 조금 더 파랗게
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.8;
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(-145));
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);
  // 하늘을 주변 반사(환경맵)로: 금속·유리·헬멧이 하늘을 비춘다
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(sky.clone());
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.55;

  const hemi = new THREE.HemisphereLight('#cfe6ff', '#4d6b35', 0.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff3dd', 3.2);
  sun.position.copy(sunDir).multiplyScalar(160).add(new THREE.Vector3(0, 0, -30));
  sun.target.position.set(0, 0, -30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(MOBILE ? 2048 : 4096, MOBILE ? 2048 : 4096);
  const sc = sun.shadow.camera;
  sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 20; sc.far = 400;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  scene.fog = new THREE.Fog('#c9dcef', 260, 900);
  return { sky, sun };
}

// ---------- 경기장 바닥(잔디·흙·라인을 캔버스에 그림) ----------
const FIELD = { cx: 0, cz: -55, size: 330 };                 // 큰 바닥: 가운데 (0,-55), 330m
const INFIELD = { cx: 0, cz: -20, size: 64 };                 // 내야 자세히: 64m를 따로 고해상도로

function noiseFill(g, w, h, colors, count, sizeMax) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = colors[(Math.random() * colors.length) | 0];
    const s = 1 + Math.random() * sizeMax;
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

// area: { cx, cz, size }, px: 그림 크기. 세상 좌표(x, z) → 그림 좌표
function drawField(area, px) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  const s = px / area.size;
  const X = (x) => (x - area.cx + area.size / 2) * s;
  const Z = (z) => (z - area.cz + area.size / 2) * s;
  const M = (m) => m * s;
  // 잔디 + 깎은 줄무늬(가운데로 향하는 띠, 체크무늬)
  g.fillStyle = '#4c8a37';
  g.fillRect(0, 0, px, px);
  const band = 6;
  for (let k = -40; k < 40; k++) {
    for (let j = -40; j < 40; j++) {
      if ((k + j) % 2 === 0) continue;
      g.fillStyle = 'rgba(255,255,255,0.045)';
      g.fillRect(X(k * band), Z(j * band), M(band), M(band));
    }
  }
  noiseFill(g, px, px, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.035)', 'rgba(40,90,20,0.08)'], px * 6, Math.max(1, s * 0.25));
  const dirt = '#a8744a', dirtDark = '#9a6740';
  // 경고 트랙(담장 앞 흙길)
  g.fillStyle = dirtDark;
  g.beginPath();
  for (let a = -46; a <= 46; a += 1) {
    const d = R.fenceDist(a), r = a * Math.PI / 180;
    g.lineTo(X(Math.sin(r) * d), Z(-Math.cos(r) * d));
  }
  for (let a = 46; a >= -46; a -= 1) {
    const d = R.fenceDist(a) - 4.6, r = a * Math.PI / 180;
    g.lineTo(X(Math.sin(r) * d), Z(-Math.cos(r) * d));
  }
  g.closePath(); g.fill();
  // 내야 흙: 투수판 앞을 중심으로 반지름 29m 부채꼴 + 파울라인 양쪽 조금
  g.fillStyle = dirt;
  g.beginPath();
  g.moveTo(X(0), Z(0));
  const rc = -18.44 + 0.3;
  for (let a = -50; a <= 50; a += 1) {
    const r = a * Math.PI / 180;
    g.lineTo(X(Math.sin(r) * 29), Z(rc - Math.cos(r) * 29 + 0));
  }
  g.closePath(); g.fill();
  // 내야 잔디(다이아몬드 안쪽)
  const inset = 1.0;
  const b1 = R.BASES[1], b2 = R.BASES[2], b3 = R.BASES[3];
  g.save();
  g.beginPath();
  g.moveTo(X(0), Z(-inset * 2.2));
  g.lineTo(X(b1[0] - inset * 1.6), Z(b1[1]));
  g.lineTo(X(0), Z(b2[1] + inset * 1.6));
  g.lineTo(X(b3[0] + inset * 1.6), Z(b3[1]));
  g.closePath();
  g.fillStyle = '#4f8f3a';
  g.fill();
  g.clip();                                                     // 다이아몬드 안쪽에만 줄무늬
  for (let k = -8; k < 8; k++) {
    g.fillStyle = k % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.035)';
    g.fillRect(X(k * 3), Z(-45), M(3), M(50));
  }
  g.restore();
  // 베이스 둘레 흙, 홈 둘레 흙, 마운드 흙, 1루·3루 주로(흙 길)
  g.fillStyle = dirt;
  const circle = (x, z, r) => { g.beginPath(); g.arc(X(x), Z(z), M(r), 0, Math.PI * 2); g.fill(); };
  circle(0, -0.3, 4.0);
  circle(b1[0], b1[1], 2.7); circle(b2[0], b2[1], 2.7); circle(b3[0], b3[1], 2.7);
  circle(0, -18.44, 2.74);
  g.lineWidth = M(1.8); g.strokeStyle = dirt; g.lineCap = 'round';
  g.beginPath(); g.moveTo(X(0), Z(0)); g.lineTo(X(b1[0]), Z(b1[1])); g.stroke();
  g.beginPath(); g.moveTo(X(0), Z(0)); g.lineTo(X(b3[0]), Z(b3[1])); g.stroke();
  // 흙 결(작은 점)
  g.save();
  g.beginPath();
  g.rect(X(-35), Z(-50), M(70), M(55));
  g.clip();
  for (let i = 0; i < px * 3; i++) {
    const x = Math.random() * px, z = Math.random() * px;
    g.fillStyle = Math.random() < 0.5 ? 'rgba(80,50,25,0.07)' : 'rgba(255,230,200,0.05)';
    g.fillRect(x, z, Math.max(1, s * 0.05), Math.max(1, s * 0.05));
  }
  g.restore();
  // 흰 선: 파울라인, 타자석, 포수석, 대기 타석 원
  g.strokeStyle = '#f4f2ea'; g.fillStyle = '#f4f2ea';
  g.lineWidth = Math.max(1, M(0.1));
  for (const sgn of [-1, 1]) {
    const d = R.fenceDist(45), r = sgn * Math.PI / 4;
    g.beginPath(); g.moveTo(X(sgn * 0.3), Z(-0.3)); g.lineTo(X(Math.sin(r) * d), Z(-Math.cos(r) * d)); g.stroke();
    g.strokeRect(X(sgn * 0.15 + (sgn < 0 ? -1.22 : 0)), Z(-0.9), M(1.22), M(1.83));   // 타자석
  }
  g.strokeRect(X(-0.55), Z(0.95), M(1.1), M(2.4));             // 포수석
  for (const sgn of [-1, 1]) { g.beginPath(); g.arc(X(sgn * 11), Z(9), M(0.76), 0, Math.PI * 2); g.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function groundMaterial(map) {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.95, metalness: 0 });
}

export function buildField(scene, renderer) {
  const group = new THREE.Group();
  const big = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.size, FIELD.size), groundMaterial(drawField(FIELD, MOBILE ? 2048 : 4096)));
  big.rotation.x = -Math.PI / 2;
  big.position.set(FIELD.cx, 0, FIELD.cz);
  big.receiveShadow = true;
  const inf = new THREE.Mesh(new THREE.PlaneGeometry(INFIELD.size, INFIELD.size), groundMaterial(drawField(INFIELD, 2048)));
  inf.rotation.x = -Math.PI / 2;
  inf.position.set(INFIELD.cx, 0.01, INFIELD.cz);
  inf.receiveShadow = true;
  inf.material.polygonOffset = true; inf.material.polygonOffsetFactor = -1;
  big.material.map.anisotropy = inf.material.map.anisotropy = renderer.capabilities.getMaxAnisotropy();
  group.add(big, inf);
  // 마운드: 지름 5.5m, 높이 25cm 흙 언덕
  const pts = [];
  for (let i = 0; i <= 16; i++) { const r = 2.8 * i / 16; pts.push(new THREE.Vector2(r, 0.254 * Math.cos(Math.min(1, r / 2.8) * Math.PI / 2) ** 1.4)); }
  pts.reverse();
  const mound = new THREE.Mesh(new THREE.LatheGeometry(pts, 40), new THREE.MeshStandardMaterial({ color: '#a8744a', roughness: 1 }));
  mound.position.set(0, 0.005, -18.44);
  mound.receiveShadow = true;
  group.add(mound);
  // 담장(푹신한 초록 패드 + 노란 홈런 선 + 거리 표시)
  const padMat = new THREE.MeshStandardMaterial({ color: '#1d4a2c', roughness: 0.85 });
  const yellow = new THREE.MeshStandardMaterial({ color: '#ffd60a', roughness: 0.5 });
  for (let a = -45; a < 45; a += 1.5) {
    const a2 = a + 1.5, r1 = a * Math.PI / 180, r2 = a2 * Math.PI / 180;
    const p1 = new THREE.Vector3(Math.sin(r1) * R.fenceDist(a), 0, -Math.cos(r1) * R.fenceDist(a));
    const p2 = new THREE.Vector3(Math.sin(r2) * R.fenceDist(a2), 0, -Math.cos(r2) * R.fenceDist(a2));
    const len = p1.distanceTo(p2) + 0.05, mid = p1.clone().add(p2).multiplyScalar(0.5);
    const ang = Math.atan2(p2.x - p1.x, p2.z - p1.z);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.5, R.FENCE_H, len), padMat);
    seg.position.set(mid.x, R.FENCE_H / 2, mid.z);
    seg.rotation.y = ang;
    seg.castShadow = seg.receiveShadow = true;
    const top = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.12, len), yellow);
    top.position.set(mid.x, R.FENCE_H + 0.06, mid.z);
    top.rotation.y = ang;
    group.add(seg, top);
  }
  // 백스톱(홈 뒤 보호벽): 홈에서 20m, 홈 뒤쪽 반원 + 위로 그물
  const netMat = new THREE.MeshStandardMaterial({ color: '#1b1f24', roughness: 0.6, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
  for (let a = -70; a < 70; a += 5) {
    const r1 = a * Math.PI / 180, r2 = (a + 5) * Math.PI / 180, rad = 20;
    const p1 = new THREE.Vector3(Math.sin(r1) * rad, 0, Math.cos(r1) * rad), p2 = new THREE.Vector3(Math.sin(r2) * rad, 0, Math.cos(r2) * rad);
    const len = p1.distanceTo(p2) + 0.05, mid = p1.clone().add(p2).multiplyScalar(0.5), ang = Math.atan2(p2.x - p1.x, p2.z - p1.z);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.6, len), padMat);
    wall.position.set(mid.x, 1.3, mid.z); wall.rotation.y = ang; wall.castShadow = wall.receiveShadow = true;
    const net = new THREE.Mesh(new THREE.PlaneGeometry(len, 9), netMat);
    net.position.set(mid.x, 7.1, mid.z); net.rotation.y = ang + Math.PI / 2;
    group.add(wall, net);
  }
  for (const a of [-45, -22.5, 0, 22.5, 45]) {                 // 거리 숫자 판
    const d = R.fenceDist(a), r = a * Math.PI / 180;
    const label = textPlane(Math.round(d) + 'm', 3.2, 1.2, '#1d4a2c', '#ffffff');
    label.position.set(Math.sin(r) * (d - 0.3), 2.0, -Math.cos(r) * (d - 0.3));
    label.rotation.y = Math.atan2(-Math.sin(r), Math.cos(r));
    group.add(label);
  }
  scene.add(group);
  return group;
}

export function textPlane(text, w, h, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = Math.round(256 * h / w);
  const g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = fg; g.font = `900 ${Math.round(c.height * 0.62)}px Pretendard, "Noto Sans KR", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
}

// ---------- 모형 불러오기 ----------
const loader = new GLTFLoader();
export const ANIMS = ['idle', 'ready', 'crouch', 'run', 'pitch', 'stance', 'swing', 'throw', 'call'];
const PROPS = ['base', 'home_plate', 'rubber', 'light_tower', 'scoreboard', 'foul_pole', 'dugout', 'stand_block', 'crowd'];

export async function loadAssets(onProgress) {
  const total = 1 + ANIMS.length + PROPS.length;
  let done = 0;
  const tick = () => { done += 1; onProgress && onProgress(done, total); };
  const load = (name) => loader.loadAsync('models/' + name + '.glb').then((g) => { tick(); return g; });
  const [player, ...rest] = await Promise.all([load('player'), ...ANIMS.map((a) => load('anim_' + a)), ...PROPS.map(load)]);
  const clips = {};
  ANIMS.forEach((a, i) => {
    const g = rest[i];
    const tracks = [];
    g.animations.forEach((clip) => tracks.push(...clip.tracks));           // 블렌더가 관절마다 나눈 동작을 하나로 합친다
    clips[a] = new THREE.AnimationClip(a, -1, tracks);
  });
  const props = {};
  PROPS.forEach((p, i) => { props[p] = rest[ANIMS.length + i].scene; });
  player.scene.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { player: player.scene, clips, props };
}

// ---------- 경기장 시설(소품 놓기) ----------
function place(scene, src, x, y, z, rotY, scale = 1) {
  const o = src.clone(true);
  o.position.set(x, y, z);
  o.rotation.y = rotY;
  o.scale.setScalar(scale);
  o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  scene.add(o);
  return o;
}

// 관중석 줄(관중석 조각을 줄줄이 놓을 자리): 앞 가장자리 점들과 경기장 쪽 방향
function standSpots() {
  const spots = [];
  const push = (x, z, nx, nz) => spots.push({ x, z, rot: Math.atan2(nx, nz) });
  // 3루·1루 쪽: 파울라인에서 바깥으로 16m 떨어져 나란히
  for (const sgn of [-1, 1]) {
    const ux = sgn / Math.SQRT2, uz = -1 / Math.SQRT2;           // 파울라인 방향
    const ox = sgn / Math.SQRT2, oz = 1 / Math.SQRT2;             // 바깥(파울 지역) 방향
    for (let d = 26; d <= 98; d += 4) {
      const x = ux * d + ox * 17, z = uz * d + oz * 17;
      push(x, z, -ox, -oz);
    }
  }
  // 홈 뒤: 반지름 24m 둥근 줄
  for (let a = -38; a <= 38; a += 9.5) {
    const r = a * Math.PI / 180, rad = 24;
    push(Math.sin(r) * rad, Math.cos(r) * rad, -Math.sin(r), -Math.cos(r));
  }
  // 외야 관중석: 담장 뒤 3m
  for (let a = -42; a <= 42; a += 2.1) {
    if (Math.abs(a) < 7) continue;                                 // 가운데는 전광판 자리(타자 눈 보호)
    const r = a * Math.PI / 180, d = R.fenceDist(a) + 3;
    push(Math.sin(r) * d, -Math.cos(r) * d, -Math.sin(r), Math.cos(r));
  }
  return spots;
}

// 블렌더 관중석 조각 속 좌석 자리(models.py prop_stand_block와 같은 숫자): 16줄 × 7자리
function seatLocal() {
  const out = [];
  for (let r = 0; r < 16; r++) {
    for (let s = 0; s < 7; s++) {
      const bx = -2 + 0.25 + 0.5 * s, by = r * 0.85 + 0.42, bz = 1.2 + r * 0.42;   // 블렌더 좌표
      out.push(new THREE.Vector3(bx, bz, -by));                     // 블렌더(x, y, z) → three(x, z, -y)
    }
  }
  return out;
}

// 같은 모형을 여러 번 → InstancedMesh(한 번에 그리기)
function instanceMeshes(src, matrices, scene, opts = {}) {
  const meshes = [];
  src.updateMatrixWorld(true);
  src.traverse((m) => {
    if (!m.isMesh) return;
    const im = new THREE.InstancedMesh(m.geometry, m.material, matrices.length);
    const local = m.matrixWorld.clone();
    const tmp = new THREE.Matrix4();
    matrices.forEach((mx, i) => { tmp.multiplyMatrices(mx, local); im.setMatrixAt(i, tmp); });
    im.castShadow = opts.shadow !== false;
    im.receiveShadow = true;
    im.frustumCulled = false;
    scene.add(im);
    meshes.push(im);
  });
  return meshes;
}

export function buildStadium(scene, assets) {
  const P = assets.props;
  // 베이스·홈·투수판
  place(scene, P.home_plate, 0, 0.012, 0, Math.PI);
  place(scene, P.rubber, 0, 0.25, -18.44, 0);
  for (let b = 1; b <= 3; b++) place(scene, P.base, R.BASES[b][0], 0.01, R.BASES[b][1], Math.PI / 4);
  // 폴대·조명탑·더그아웃·전광판
  for (const sgn of [-1, 1]) {
    const d = R.fenceDist(45) + 0.6;
    place(scene, P.foul_pole, sgn * d / Math.SQRT2, 0, -d / Math.SQRT2, sgn > 0 ? -Math.PI / 4 : Math.PI / 4);
    // 더그아웃: 파울라인을 따라 홈에서 30m, 바깥으로 12m. 앞(로컬 +Z)이 경기장을 보게
    const ux = sgn / Math.SQRT2, uz = -1 / Math.SQRT2, ox = sgn / Math.SQRT2, oz = 1 / Math.SQRT2;
    place(scene, P.dugout, ux * 30 + ox * 12, 0.05, uz * 30 + oz * 12, Math.atan2(-ox, -oz));
  }
  const towers = [[-82, 18], [82, 18], [-128, -78], [128, -78], [-70, -150], [70, -150]];
  towers.forEach(([x, z]) => place(scene, P.light_tower, x, 0, z, Math.atan2(-x, -z - 40)));
  const board = place(scene, P.scoreboard, 0, 6, -R.fenceDist(0) - 16, 0);
  // 관중석 조각 + 관중
  const spots = standSpots();
  const blockMats = spots.map((s) => new THREE.Matrix4().compose(new THREE.Vector3(s.x, 0, s.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), s.rot), new THREE.Vector3(1, 1, 1)));
  instanceMeshes(P.stand_block, blockMats, scene);
  const seats = seatLocal();
  const crowdMats = [];
  const tmp = new THREE.Vector3();
  blockMats.forEach((bm, bi) => {
    seats.forEach((sp, si) => {
      if (Math.random() < 0.22) return;                            // 빈자리
      tmp.copy(sp).applyMatrix4(bm);
      const q = new THREE.Quaternion().setFromRotationMatrix(bm);
      crowdMats.push(new THREE.Matrix4().compose(tmp.clone(), q, new THREE.Vector3(1, 1, 1)));
    });
  });
  const crowd = instanceMeshes(P.crowd, crowdMats, scene, { shadow: false });
  // 관중 옷 색: 팀 색 섞인 알록달록
  const shirtCols = ['#e03131', '#1971c2', '#f8f9fa', '#ffd43b', '#2b8a3e', '#7048e8', '#f76707', '#212529', '#e64980', '#15aabf'];
  const col = new THREE.Color();
  crowd.forEach((im) => {
    const name = im.material.name || '';
    if (name.includes('shirt') || name.includes('hair') || name.includes('skin')) {
      for (let i = 0; i < im.count; i++) {
        if (name.includes('shirt')) col.set(shirtCols[(Math.random() * shirtCols.length) | 0]);
        else if (name.includes('hair')) col.setHSL(0.07, 0.4, 0.05 + Math.random() * 0.2);
        else col.setHSL(0.07, 0.45, 0.55 + Math.random() * 0.2);
        im.setColorAt(i, col);
      }
      im.instanceColor.needsUpdate = true;
    }
  });
  return { board, crowd, crowdBase: crowdMats };
}

// 전광판 화면(점수판)을 캔버스로 그려 붙인다
export function makeBoardScreen(board) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 400;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  board.traverse((m) => {
    if (m.isMesh && m.material && m.material.name === 'bb_screen') {
      m.material = new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
      // 블렌더 상자의 앞면 UV는 상자 전체에 늘어나므로, 앞면에 판 하나를 따로 붙인다
    }
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(26, 10), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  screen.position.set(0, 16, 0.7);
  board.add(screen);
  return { canvas: c, tex };
}

// ---------- 선수 ----------
const teamMaterialCache = new Map();
function teamMaterial(src, team) {
  const key = (team ? team.id : '_') + ':' + src.name;
  if (teamMaterialCache.has(key)) return teamMaterialCache.get(key);
  const m = src.clone();
  const set = (hex) => { m.color = new THREE.Color(hex); };
  if (team) {
    if (src.name === 'bb_jersey') set(team.jersey);
    else if (src.name === 'bb_pants') set(team.pants);
    else if (src.name === 'bb_cap' || src.name === 'bb_helmet') set(team.cap);
    else if (src.name === 'bb_accent') set(team.accent);
    else if (src.name === 'bb_sock') set(team.sock);
    else if (src.name === 'bb_number') set(team.number);
  }
  if (src.name === 'bb_jersey' || src.name === 'bb_pants') { m.roughness = 0.78; m.sheen = 0; }
  if (src.name === 'bb_skin') { m.roughness = 0.6; }
  teamMaterialCache.set(key, m);
  return m;
}

const SKINS = ['#e9b996', '#d9a27c', '#c58c63', '#f0c8a8', '#a8704a'];
export class Player {
  constructor(assets, team, role) {
    this.root = assets.player.clone(true);
    const skin = SKINS[(Math.random() * SKINS.length) | 0];
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.material = teamMaterial(o.material, team);
      if (o.material.name === 'bb_skin') {
        const key = 'skin:' + skin;
        if (!teamMaterialCache.has(key)) { const m = o.material.clone(); m.color = new THREE.Color(skin); teamMaterialCache.set(key, m); }
        o.material = teamMaterialCache.get(key);
      }
      o.castShadow = true;
    });
    this.parts = {};
    this.root.traverse((o) => { const k = (o.name || '').split('__')[1]; if (k) this.parts[k.replace(/\.\d+$/, '')] = o; });
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const [name, clip] of Object.entries(assets.clips)) this.actions[name] = this.mixer.clipAction(clip);
    this.current = null;
    this.setRole(role);
  }
  setRole(role) {
    this.role = role;
    if (this.parts.bat) this.parts.bat.visible = role === 'batter';
    if (this.parts.glove) this.parts.glove.visible = role !== 'batter' && role !== 'runner' && role !== 'umpire';
  }
  play(name, { loop = true, fade = 0.18, speed = 1, clamp = true } = {}) {
    const a = this.actions[name];
    if (!a) return;
    a.reset();
    a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = clamp;
    a.timeScale = speed;
    a.enabled = true;
    if (this.current && this.current !== a) a.crossFadeFrom(this.current, fade, false);
    a.play();
    this.current = a;
    this.currentName = name;
  }
  update(dt) { this.mixer.update(dt); }
  // 오른손(배트)·왼손(글러브) 세상 위치
  handPos(which, out) {
    const p = which === 'glove' ? this.parts.glove : this.parts.bat;
    return (p || this.root).getWorldPosition(out);
  }
}

// ---------- 공 ----------
export function makeBall(scene) {
  const mat = new THREE.MeshStandardMaterial({ color: '#fbfbf6', roughness: 0.45 });
  const ball = new THREE.Mesh(new THREE.SphereGeometry(R.R_BALL * 1.6, 20, 14), mat);  // 보이게 1.6배
  ball.castShadow = true;
  scene.add(ball);
  // 꼬리(지나온 길): 빠른 공이 잘 보이게
  const N = 18;
  const pos = new Float32Array(N * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const trail = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.55 }));
  trail.frustumCulled = false;
  scene.add(trail);
  const hist = [];
  return {
    mesh: ball, trail,
    set(x, y, z, showTrail) {
      ball.position.set(x, y, z);
      hist.unshift([x, y, z]);
      if (hist.length > N) hist.pop();
      for (let i = 0; i < N; i++) { const h = hist[Math.min(i, hist.length - 1)]; pos[i * 3] = h[0]; pos[i * 3 + 1] = h[1]; pos[i * 3 + 2] = h[2]; }
      geo.attributes.position.needsUpdate = true;
      trail.visible = Boolean(showTrail);
    },
    clearTrail() { hist.length = 0; trail.visible = false; },
  };
}
