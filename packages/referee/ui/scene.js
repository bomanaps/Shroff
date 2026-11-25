import * as THREE from "https://cdnjs.cloudflare.com/ajax/libs/three.js/0.182.0/three.module.min.js";

const GOLD = 0xe09a4e;
const GOLD_DEEP = 0x9a6a33;
const OK = 0x30a46c;
const BAD = 0xe5484d;

/* ---------------- chapter ledger ---------------- */

const CHAPTERS = [
  {
    id: "threshold",
    camera: { position: [2.9, 0.5, 6.6], target: [1.7, 0.1, 0], fov: 38 },
    world: { key: 60, fog: 0.045, rim: 26, coinX: 1.8, coinY: 0, coinZ: 0, coinS: 1, coinTiltX: 0.42, labels: 1 },
  },
  {
    id: "judge",
    camera: { position: [-2.4, 0.6, 5.6], target: [-1.2, 0.2, 0], fov: 42 },
    world: { key: 70, fog: 0.05, rim: 34, coinX: 2.9, coinY: 0.9, coinZ: -2.4, coinS: 0.62, coinTiltX: 0.15, labels: 0 },
  },
  {
    id: "weighing",
    camera: { position: [2.8, 0.9, 6.2], target: [1.4, 0, 0], fov: 42 },
    world: { key: 64, fog: 0.06, rim: 30, coinX: 0.4, coinY: -0.3, coinZ: -4.2, coinS: 1.15, coinTiltX: 0.55, labels: 0 },
  },
  {
    id: "ledger",
    camera: { position: [0, 2.6, 5.2], target: [0, -0.6, 0], fov: 44 },
    world: { key: 44, fog: 0.055, rim: 20, coinX: 2.7, coinY: -0.7, coinZ: -1.2, coinS: 0.85, coinTiltX: 1.3, labels: 0 },
  },
  {
    id: "oath",
    camera: { position: [0, 0.4, 9.5], target: [0, 0.1, 0], fov: 36 },
    world: { key: 50, fog: 0.07, rim: 22, coinX: 0, coinY: 0.1, coinZ: -2.5, coinS: 0.7, coinTiltX: 0.3, labels: 0 },
  },
];

/* ---------------- module state ---------------- */

let renderer, scene, camera;
let coinGroup, coinMesh, scanRing, scanBeam, dust, folds;
let settledStack, refusedPile;
let keyLight, rimLight, flashLight;
let scanning = false;
let flash = { color: 0xffffff, strength: 0 };
let coins = [], shards = [];
let mouseX = 0, mouseY = 0;
let running = false, visible = true;
let progressTarget = 0, progressSmooth = 0;
let t = 0;
let labelAnchors = [];

/* ---------------- helpers ---------------- */

function glowTexture(hex) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  const col = `#${hex.toString(16).padStart(6, "0")}`;
  grad.addColorStop(0, col + "cc");
  grad.addColorStop(0.35, col + "44");
  grad.addColorStop(1, col + "00");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function coinFaceTexture(fingerprint) {
  const size = 1024;
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const cx = size / 2;

  g.fillStyle = "#c08a4a";
  g.fillRect(0, 0, size, size);

  const grad = g.createRadialGradient(cx, cx, 0, cx, cx, cx);
  grad.addColorStop(0, "rgba(255,240,205,0.5)");
  grad.addColorStop(0.55, "rgba(201,169,106,0.1)");
  grad.addColorStop(1, "rgba(80,62,34,0.55)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);

  g.strokeStyle = "rgba(90,70,38,0.75)";
  for (const r of [470, 440, 300, 170]) {
    g.lineWidth = r > 400 ? 10 : 5;
    g.beginPath();
    g.arc(cx, cx, r, 0, Math.PI * 2);
    g.stroke();
  }

  g.save();
  g.translate(cx, cx);
  g.fillStyle = "rgba(90,70,38,0.8)";
  g.font = "600 46px 'Geist Mono', monospace";
  const motto = "· VERIFIED DELIVERY · KANE IS THE JUDGE ";
  for (let i = 0; i < motto.length; i++) {
    g.save();
    g.rotate((i / motto.length) * Math.PI * 2);
    g.fillText(motto[i], -14, -370);
    g.restore();
  }
  g.restore();

  const bytes = [];
  for (let i = 0; i < fingerprint.length - 1; i += 2) {
    bytes.push(parseInt(fingerprint.slice(i, i + 2), 16) || 0);
  }
  const cells = 5, cell = 52;
  g.fillStyle = "rgba(96,74,40,0.9)";
  let bit = 0;
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < cells; row++) {
      const on = ((bytes[(bit >> 3) % bytes.length] >> (bit % 8)) & 1) === 1;
      bit++;
      if (!on) continue;
      const x0 = cx + (col - 2) * cell + cell * 0.08;
      const y0 = cx + (row - 2.5) * cell + cell * 0.08;
      g.fillRect(x0, y0, cell * 0.84, cell * 0.84);
      const mirror = cx + (2 - col - 1) * cell + cell * 0.08 + cell;
      if (col !== 2) g.fillRect(mirror, y0, cell * 0.84, cell * 0.84);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function metal(color, emissive, intensity, roughness = 0.32) {
  return new THREE.MeshStandardMaterial({
    color, metalness: 0.9, roughness, emissive, emissiveIntensity: intensity,
  });
}

function buildHeroCoin(fingerprint) {
  const group = new THREE.Group();
  const R = 1.55, H = 0.22;

  const face = coinFaceTexture(fingerprint);
  const faceMat = new THREE.MeshStandardMaterial({
    map: face, metalness: 0.92, roughness: 0.38, color: 0xffffff,
    emissive: GOLD_DEEP, emissiveIntensity: 0.12,
  });
  const edgeMat = metal(GOLD_DEEP, GOLD_DEEP, 0.15, 0.45);
  coinMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(R, R, H, 96, 1, false),
    [edgeMat, faceMat, faceMat],
  );
  group.add(coinMesh);

  const knurls = 110;
  const knurlGeo = new THREE.BoxGeometry(0.02, H * 1.06, 0.05);
  const knurlMat = metal(GOLD, GOLD_DEEP, 0.2, 0.5);
  const knurlMesh = new THREE.InstancedMesh(knurlGeo, knurlMat, knurls);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let i = 0; i < knurls; i++) {
    const a = (i / knurls) * Math.PI * 2;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a);
    m.compose(
      new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R),
      q,
      new THREE.Vector3(1, 1, 1),
    );
    knurlMesh.setMatrixAt(i, m);
  }
  group.add(knurlMesh);

  const rimTorus = new THREE.Mesh(
    new THREE.TorusGeometry(R * 0.985, 0.024, 12, 90),
    metal(GOLD, GOLD, 0.35, 0.28),
  );
  rimTorus.rotation.x = Math.PI / 2;
  rimTorus.position.y = H / 2;
  group.add(rimTorus);
  const rimTorus2 = rimTorus.clone();
  rimTorus2.position.y = -H / 2;
  group.add(rimTorus2);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(GOLD), transparent: true, depthWrite: false, opacity: 0.55,
    }),
  );
  glow.scale.setScalar(6.5);
  group.add(glow);

  return group;
}

function makeMiniCoin() {
  const coin = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 0.07, 32),
    metal(GOLD, GOLD, 0.4),
  );
  return coin;
}

function makeShard() {
  const shard = new THREE.Mesh(new THREE.TetrahedronGeometry(0.2), metal(BAD, BAD, 0.45));
  shard.rotation.set(Math.random() * 3, Math.random() * 3, 0);
  return shard;
}

function makeFolds() {
  const group = new THREE.Group();
  const tex = glowTexture(GOLD_DEEP);
  for (let i = 0; i < 5; i++) {
    const fold = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 15),
      new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.045 + Math.random() * 0.05,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    fold.position.set((i - 2) * 3.4 + Math.random(), 0, -6 - Math.random() * 4);
    fold.userData.phase = Math.random() * 6;
    group.add(fold);
  }
  return group;
}

/* ---------------- init ---------------- */

export function initScene(canvas, fingerprint = "c9a96a8a754930a4") {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return false;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x0a0b0d, CHAPTERS[0].world.fog);

  camera = new THREE.PerspectiveCamera(38, 2, 0.1, 60);

  scene.add(new THREE.AmbientLight(0x2e323c, 1.2));
  keyLight = new THREE.PointLight(0xfff2d8, 60, 30);
  keyLight.position.set(4, 4, 4);
  scene.add(keyLight);
  rimLight = new THREE.PointLight(0x7a89a8, 26, 22);
  rimLight.position.set(-5, -1, -3);
  scene.add(rimLight);
  const fill = new THREE.PointLight(GOLD, 14, 16);
  fill.position.set(-2, -3, 3);
  scene.add(fill);
  flashLight = new THREE.PointLight(0xffffff, 0, 18);
  flashLight.position.set(0, 1, 3);
  scene.add(flashLight);

  coinGroup = buildHeroCoin(fingerprint);
  const wire = new THREE.Mesh(
    new THREE.IcosahedronGeometry(2.6, 1),
    new THREE.MeshBasicMaterial({ color: GOLD, wireframe: true, transparent: true, opacity: 0.1 }),
  );
  wire.name = "wire";
  coinGroup.add(wire);
  coinGroup.position.set(1.8, 0, 0);
  coinGroup.updateMatrixWorld();
  scene.add(coinGroup);

  scanRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.85, 0.015, 10, 80),
    new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.8 }),
  );
  scanRing.visible = false;
  scene.add(scanRing);

  scanBeam = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 0.05),
    new THREE.MeshBasicMaterial({
      color: GOLD, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    }),
  );
  scanBeam.visible = false;
  scene.add(scanBeam);

  settledStack = new THREE.Group();
  settledStack.position.set(3.4, -1.4, -0.6);
  scene.add(settledStack);
  refusedPile = new THREE.Group();
  refusedPile.position.set(-0.6, -1.4, -0.8);
  scene.add(refusedPile);

  const dustGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(420 * 3);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (Math.random() - 0.5) * 22;
    positions[i + 1] = (Math.random() - 0.5) * 12;
    positions[i + 2] = (Math.random() - 0.5) * 14 - 3;
  }
  dustGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({ color: GOLD_DEEP, size: 0.02, transparent: true, opacity: 0.5 }),
  );
  scene.add(dust);

  folds = makeFolds();
  scene.add(folds);

  labelAnchors = [
    { el: document.querySelector('[data-anchor="seal"]'), offset: new THREE.Vector3(0.6, 1.25, 0.4) },
    { el: document.querySelector('[data-anchor="hash"]'), offset: new THREE.Vector3(-1.7, 0.05, 0.6) },
    { el: document.querySelector('[data-anchor="evidence"]'), offset: new THREE.Vector3(0.5, -1.5, 0.5) },
  ].filter((a) => a.el !== null);

  addEventListener("mousemove", (e) => {
    mouseX = (e.clientX / innerWidth - 0.5) * 2;
    mouseY = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });
  addEventListener("scroll", readScroll, { passive: true });
  document.addEventListener("visibilitychange", () => {
    visible = !document.hidden;
    if (visible && running) requestAnimationFrame(tick);
  });

  readScroll();
  running = true;
  requestAnimationFrame(tick);
  return true;
}

/* ---------------- scroll conductor ---------------- */

function readScroll() {
  const max = document.documentElement.scrollHeight - innerHeight;
  progressTarget = max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0;
}

function segmentState(progress) {
  const scaled = progress * (CHAPTERS.length - 1);
  const i = Math.min(CHAPTERS.length - 2, Math.floor(scaled));
  return { a: CHAPTERS[i], b: CHAPTERS[i + 1], t: scaled - i };
}

const lerp = (a, b, k) => a + (b - a) * k;
const lerp3 = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
const ease = (k) => k * k * (3 - 2 * k);

/* ---------------- frame loop ---------------- */

function resize() {
  const canvas = renderer.domElement;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

const project = new THREE.Vector3();

function tick() {
  if (!running || !visible) return;
  t += 0.016;
  resize();

  progressSmooth += (progressTarget - progressSmooth) * 0.065;
  const { a, b, t: k0 } = segmentState(progressSmooth);
  const k = ease(k0);

  const pos = lerp3(a.camera.position, b.camera.position, k);
  const tgt = lerp3(a.camera.target, b.camera.target, k);
  camera.position.set(pos[0] + mouseX * 0.25, pos[1] + mouseY * -0.15, pos[2]);
  camera.lookAt(tgt[0], tgt[1], tgt[2]);
  camera.fov = lerp(a.camera.fov, b.camera.fov, k);
  camera.updateProjectionMatrix();

  scene.fog.density = lerp(a.world.fog, b.world.fog, k);
  keyLight.intensity = lerp(a.world.key, b.world.key, k);
  rimLight.intensity = lerp(a.world.rim, b.world.rim, k);

  coinGroup.position.x = lerp(a.world.coinX, b.world.coinX, k);
  coinGroup.position.z = lerp(a.world.coinZ, b.world.coinZ, k);
  coinGroup.position.y = lerp(a.world.coinY, b.world.coinY, k) + Math.sin(t * 0.9) * 0.08;
  coinGroup.scale.setScalar(lerp(a.world.coinS, b.world.coinS, k));
  coinGroup.rotation.x = lerp(a.world.coinTiltX, b.world.coinTiltX, k);
  coinGroup.rotation.y = t * (scanning ? 0.5 : 0.18);
  const wire = coinGroup.getObjectByName("wire");
  if (wire) { wire.rotation.y = -t * 0.1; wire.rotation.z = t * 0.06; }

  const labelVis = lerp(a.world.labels, b.world.labels, k);
  for (const anchor of labelAnchors) {
    project.copy(anchor.offset).applyMatrix4(coinGroup.matrixWorld);
    project.project(camera);
    const x = (project.x * 0.5 + 0.5) * innerWidth;
    const y = (-project.y * 0.5 + 0.5) * innerHeight;
    anchor.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    anchor.el.style.opacity = (project.z < 1 ? labelVis : 0).toFixed(2);
  }

  if (scanning) {
    scanRing.visible = true;
    scanRing.position.copy(coinGroup.position);
    scanRing.rotation.x = coinGroup.rotation.x + Math.PI / 2;
    scanRing.scale.setScalar(1 + Math.sin(t * 3) * 0.04);
    scanBeam.visible = true;
    scanBeam.position.set(
      coinGroup.position.x,
      coinGroup.position.y + Math.sin(t * 2.4) * 1.6,
      coinGroup.position.z + 0.3,
    );
  } else {
    scanRing.visible = false;
    scanBeam.visible = false;
  }

  if (flash.strength > 0.01) {
    flash.strength *= 0.94;
    flashLight.intensity = flash.strength * 90;
    flashLight.color.setHex(flash.color);
  } else {
    flashLight.intensity = 0;
  }

  for (const fold of folds.children) {
    fold.position.x += Math.sin(t * 0.1 + fold.userData.phase) * 0.0015;
  }
  dust.rotation.y = t * 0.01;

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

/* ---------------- live API ---------------- */

export const shroffScene = {
  setCounts(settled, refused) {
    while (coins.length < Math.min(settled, 14)) {
      const coin = makeMiniCoin();
      const n = coins.length;
      coin.position.set((Math.random() - 0.5) * 0.1, n * 0.085, (Math.random() - 0.5) * 0.1);
      coin.rotation.y = Math.random() * 3;
      coins.push(coin);
      settledStack.add(coin);
    }
    while (shards.length < Math.min(refused, 14)) {
      const shard = makeShard();
      const n = shards.length;
      shard.position.set(
        (Math.random() - 0.5) * 0.5,
        0.08 + n * 0.07,
        (Math.random() - 0.5) * 0.5,
      );
      shards.push(shard);
      refusedPile.add(shard);
    }
  },
  startScan() {
    scanning = true;
  },
  verdict(ok) {
    scanning = false;
    flash = { color: ok ? OK : BAD, strength: 1 };
  },
};
