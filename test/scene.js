// Test Lab — the 3D line: one probe-card PCB with its MLO carried through six test stations.
// Drawing only; what each station measures comes from model.js through main.js.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/* ---------- layout (world units; 1 unit is about 50 mm, thicknesses and balls exaggerated) ---------- */
export const SP = 26, NST = 6;                           // station spacing along the line, number of stations
export const STX = (k) => (k < 3 ? k : 5 - k) * SP;          // a U-shaped line: three stations out, three back
export const STZ = (k) => (k < 3 ? 0 : -30);
export const ROW_Z = -30;
export const BR = 4.5, BT = 0.22;                        // board radius and thickness
export const ML = 2.0, MT = 0.16;                        // MLO side and thickness
export const BG = 14, BPI = 0.13, BRAD = 0.052;          // ball grid under the MLO
export const GAP = 0.085;                                // PCB-to-MLO gap (ball height)
export const TOP = BT / 2, MLO_Y0 = TOP + GAP, MLO_Y1 = MLO_Y0 + MT;
export const BOARD_Y = [2.25, 2.6, 2.6, 2.75, 2.05, 3.55]; // board centre height at each station
const TRANSIT_Y = 4.15;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const ease5 = (t) => { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); };
export function hash(i) { let x = Math.imul(i ^ 0x9e3779b9, 2654435761) >>> 0; x ^= x >>> 16; x = Math.imul(x, 0x45d9f3b) >>> 0; x ^= x >>> 16; return (x >>> 0) / 4294967296; }
export const ballXZ = (i, k) => [(i - (BG - 1) / 2) * BPI, (k - (BG - 1) / 2) * BPI];

/* ---------- what sits where on the board (board-local coordinates, y up, probe side on top) ---------- */
function layout() {
  const relays = [], diodes = [], res = [], caps = [], bulk = [], pogo = [];
  for (let i = 0; i < 20; i++) {                          // relay ring, each with its flyback diode
    const a = (i + 0.5) / 20 * Math.PI * 2;
    relays.push({ x: Math.cos(a) * 3.45, z: Math.sin(a) * 3.45, rot: -a, id: i });
    diodes.push({ x: Math.cos(a) * 2.98, z: Math.sin(a) * 2.98, rot: -a + Math.PI / 2, id: i });
  }
  for (let i = 0; i < 40; i++) {                          // resistor networks between the relays and the MLO
    const a = (i + 0.25) / 40 * Math.PI * 2 + 0.04, r = 2.62 + (i % 2) * 0.16;
    res.push({ x: Math.cos(a) * r, z: Math.sin(a) * r, rot: -a + Math.PI / 2, id: i });
  }
  // decoupling bank: two square rings of small capacitors around the MLO
  let n = 0;
  for (const s of [1.42, 1.62]) for (let e = 0; e < 4; e++) for (let k = 0; k < 13; k++) {
    const t = (k - 6) * 0.2, nx = [1, 0, -1, 0][e], nz = [0, 1, 0, -1][e];
    caps.push({ x: nx * s + (nz ? t : 0) * 1, z: nz * s + (nx ? t : 0), rot: e % 2 ? 0 : Math.PI / 2, id: n++ });
  }
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; bulk.push({ x: Math.cos(a) * 2.25, z: Math.sin(a) * 2.25, rot: -a, id: i }); }
  // tester side: rings of pogo pads
  for (const [r, m] of [[2.9, 72], [3.3, 84], [3.7, 96], [4.1, 108]]) for (let i = 0; i < m; i++) { const a = (i + (r * 7) % 1) / m * Math.PI * 2; pogo.push({ x: Math.cos(a) * r, z: Math.sin(a) * r }); }
  return { relays, diodes, res, caps, bulk, pogo };
}
export const L = layout();

/* ---------- the planted defects: where each one sits on the board ---------- */
const by = (o, y) => [o.x, y, o.z];
export const SPOT = {
  missingC: by(L.caps[31], TOP + 0.04),
  wrongR: by(L.res[13], TOP + 0.04),
  revDiode: by(L.diodes[6], TOP + 0.05),
  bridge: [...(() => { const [a, b] = [ballXZ(BG - 1, 4), ballXZ(BG - 1, 5)]; return [(a[0] + b[0]) / 2, TOP + GAP / 2, (a[1] + b[1]) / 2]; })()],
  void: [ballXZ(3, BG - 1)[0], TOP + GAP / 2, ballXZ(3, BG - 1)[1]],
  hip: [ballXZ(0, 8)[0], TOP + GAP / 2, ballXZ(0, 8)[1]],
  viaOpen: [0.62, MLO_Y1, -0.55],
  leak: [-0.72, MLO_Y1, 0.4],
  warp: [0, MLO_Y1 + 0.05, 0],
  relay: by(L.relays[14], TOP + 0.2),
  pogo: [L.pogo[150].x, -TOP, L.pogo[150].z],
  openNet: [-2.15, TOP, -1.05],
};
export const HIP_BALL = [0, 8], VOID_BALL = [3, BG - 1], BRIDGE_BALLS = [[BG - 1, 4], [BG - 1, 5]];

export function createStage(canvas, { record = false, dpr = 1 } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: record, powerPreference: 'high-performance' });
  renderer.setPixelRatio(record ? dpr : Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x05070b, 70, 210);
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;
  const camera = new THREE.PerspectiveCamera(34, 1, 0.03, 500);
  camera.position.set(20, 14, 26);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 2, 0); controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 1.5; controls.maxDistance = 180; controls.maxPolarAngle = Math.PI * 0.6;
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x10141c, 0.55));
  const key = new THREE.DirectionalLight(0xffffff, 2.0); key.position.set(30, 40, 30); scene.add(key);
  const rim = new THREE.DirectionalLight(0x4cc9f0, 0.7); rim.position.set(-20, 26, -30); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xa8bdd8, 0.5); fill.position.set(10, -8, 20); scene.add(fill);

  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); if (draw) draw(g, w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = maxAniso; t.userData = { c, g }; return t;
  }
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1, ...o });
  const M = {
    body: std({ color: 0x2a313c, roughness: 0.5, metalness: 0.35 }),
    bodyDk: std({ color: 0x171c24, roughness: 0.6, metalness: 0.3 }),
    white: std({ color: 0xd9dee5, roughness: 0.42, metalness: 0.05 }),
    alu: std({ color: 0xb8c0ca, roughness: 0.32, metalness: 0.85 }),
    steel: std({ color: 0x8b95a3, roughness: 0.38, metalness: 0.9 }),
    black: std({ color: 0x0c0f14, roughness: 0.5, metalness: 0.2 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9fd8ff, roughness: 0.05, metalness: 0, transmission: 0.0, transparent: true, opacity: 0.12, depthWrite: false }),
    accent: std({ color: 0x4cc9f0, emissive: 0x4cc9f0, emissiveIntensity: 0.9 }),
    amber: std({ color: 0xffb224, emissive: 0xffb224, emissiveIntensity: 0.9 }),
    gold: std({ color: 0xe9c46a, roughness: 0.28, metalness: 0.95 }),
    solder: std({ color: 0xd3d8de, roughness: 0.22, metalness: 0.95 }),
    needle: std({ color: 0xe8edf2, roughness: 0.2, metalness: 1.0 }),
    granite: null,
  };
  const box = (w, h, d, m, r = 0) => new THREE.Mesh(r ? new RoundedBoxGeometry(w, h, d, 3, r) : new THREE.BoxGeometry(w, h, d), m);
  const cyl = (rt, rb, h, m, seg = 32) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  const at = (o, x, y, z) => { o.position.set(x, y, z); return o; };

  /* ---------- floor and the line ---------- */
  {
    const tex = canvasTex(2048, 512, (g, w, h) => {
      g.fillStyle = '#0a0f17'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(120,160,200,.06)'; g.lineWidth = 1;
      for (let i = 0; i <= w; i += 24) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); }
      for (let i = 0; i <= h; i += 24) { g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
      g.fillStyle = 'rgba(255,190,60,.10)'; g.fillRect(0, h * 0.5 - 12, w, 2); g.fillRect(0, h * 0.5 + 10, w, 2);       // walkway lines
      const vg = g.createLinearGradient(0, 0, 0, h); vg.addColorStop(0, 'rgba(5,7,11,1)'); vg.addColorStop(0.25, 'rgba(5,7,11,0)'); vg.addColorStop(0.75, 'rgba(5,7,11,0)'); vg.addColorStop(1, 'rgba(5,7,11,1)');
      g.fillStyle = vg; g.fillRect(0, 0, w, h);
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(420, 200).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85, metalness: 0.05 }));
    floor.position.set(SP, 0, ROW_Z / 2); scene.add(floor);
    // the board's route painted on the floor: in along the front row, round the corner, out along the back row
    const route = [[-16, 0], [2 * SP, 0], [2 * SP, ROW_Z], [-16, ROW_Z]];
    const lineM = new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.35, toneMapped: false });
    for (let i = 1; i < route.length; i++) {
      const [x0, z0] = route[i - 1], [x1, z1] = route[i], len = Math.hypot(x1 - x0, z1 - z0);
      for (const off of [-0.5, 0.5]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(len + (i === 2 ? 0 : 13), 0.08).rotateX(-Math.PI / 2), lineM); m.rotation.y = -Math.atan2(z1 - z0, x1 - x0); const nx = -(z1 - z0) / len, nz = (x1 - x0) / len; m.position.set((x0 + x1) / 2 + nx * off * 13, 0.015, (z0 + z1) / 2 + nz * off * 13); scene.add(m); }
    }
    const chev = new THREE.Shape(); chev.moveTo(-0.5, -0.7); chev.lineTo(0.35, 0); chev.lineTo(-0.5, 0.7); chev.lineTo(-0.15, 0); chev.closePath();
    const chevG = new THREE.ShapeGeometry(chev).rotateX(-Math.PI / 2), chevM = new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.5, toneMapped: false });
    const chevs = [];
    for (let i = 1; i < route.length; i++) {
      const [x0, z0] = route[i - 1], [x1, z1] = route[i], len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0);
      for (let d = 3; d < len - 1; d += 4) { const m = new THREE.Mesh(chevG, chevM); m.rotation.y = -a; m.position.set(x0 + (x1 - x0) * d / len, 0.02, z0 + (z1 - z0) * d / len); m.userData.d = d; scene.add(m); chevs.push(m); }
    }
    // keep the chevrons that sit under a machine hidden
    for (const c of chevs) for (let k = 0; k < NST; k++) if (Math.abs(c.position.x - STX(k)) < 6.5 && Math.abs(c.position.z - STZ(k)) < 6) c.visible = false;
    scene.userData.chevs = chevs;
  }

  /* ---------- the board: probe-card PCB, MLO on top, tester pads underneath ---------- */
  const board = new THREE.Group(); scene.add(board);
  const boardTop = canvasTex(2048, 2048, (g, w) => {
    const c = w / 2, s = w / (2 * BR);
    const P = (x, z) => [c + z * s, c - x * s];                 // cylinder cap UVs: canvas x follows board z, canvas y follows -x
    const mv = (x, z) => g.moveTo(...P(x, z)), ln = (x, z) => g.lineTo(...P(x, z));
    g.fillStyle = '#0e3b28'; g.fillRect(0, 0, w, w);
    const gr = g.createRadialGradient(c, c, 0, c, c, c); gr.addColorStop(0, 'rgba(40,110,70,.35)'); gr.addColorStop(1, 'rgba(0,0,0,.25)'); g.fillStyle = gr; g.fillRect(0, 0, w, w);
    // traces under the mask, fanning out from the MLO to the relay ring
    g.strokeStyle = 'rgba(70,150,95,.55)'; g.lineWidth = 2.2;
    for (let i = 0; i < 260; i++) {
      const a = (i / 260) * Math.PI * 2, r0 = 1.05 + 0.05 * (i % 4), r1 = 2.4 + 0.9 * hash(i * 3), bend = 0.12 * (hash(i * 5) - 0.5);
      g.beginPath(); mv(Math.cos(a) * r0, Math.sin(a) * r0);
      ln(Math.cos(a) * (r0 + 0.3), Math.sin(a) * (r0 + 0.3));
      ln(Math.cos(a + bend) * r1, Math.sin(a + bend) * r1); g.stroke();
    }
    g.strokeStyle = 'rgba(70,150,95,.4)'; g.lineWidth = 5;
    for (let i = 0; i < 20; i++) { const a = (i + 0.5) / 20 * Math.PI * 2; g.beginPath(); mv(Math.cos(a) * 2.98, Math.sin(a) * 2.98); ln(Math.cos(a) * 4.3, Math.sin(a) * 4.3); g.stroke(); }
    // pads for every part (silver ENIG look) and refdes silkscreen
    g.fillStyle = '#c9c39a';
    const pad2 = (o, l, wd, gap) => { const ca = Math.cos(o.rot), sa = Math.sin(o.rot); for (const sg of [-1, 1]) { const [px, py] = P(o.x + ca * sg * gap, o.z - sa * sg * gap); g.beginPath(); g.arc(px, py, Math.max(l, wd) * s * 0.55, 0, 7); g.fill(); } };
    L.caps.forEach((o) => pad2(o, 0.05, 0.07, 0.06)); L.res.forEach((o) => pad2(o, 0.045, 0.06, 0.05)); L.diodes.forEach((o) => pad2(o, 0.05, 0.07, 0.07));
    L.bulk.forEach((o) => pad2(o, 0.12, 0.16, 0.13));
    L.relays.forEach((o) => { for (let k = 0; k < 8; k++) { const u = (k % 4 - 1.5) * 0.1, v = (k < 4 ? -1 : 1) * 0.15, ca = Math.cos(o.rot), sa = Math.sin(o.rot); g.beginPath(); g.arc(...P(o.x + ca * u + sa * v, o.z - sa * u + ca * v), 0.025 * s, 0, 7); g.fill(); } });
    g.fillStyle = 'rgba(235,240,235,.85)'; g.font = `600 ${Math.round(0.07 * s)}px "JetBrains Mono", monospace`; g.textAlign = 'center'; g.textBaseline = 'middle';
    L.relays.forEach((o, i) => { const a = Math.atan2(o.z, o.x); g.fillText(`K${i + 1}`, ...P(Math.cos(a) * 3.84, Math.sin(a) * 3.84)); });
    L.res.forEach((o, i) => { if (i % 2) return; const a = Math.atan2(o.z, o.x); g.fillText(`R${i + 1}`, ...P(Math.cos(a) * 2.4, Math.sin(a) * 2.4)); });
    // MLO footprint outline and fiducials
    g.strokeStyle = 'rgba(235,240,235,.8)'; g.lineWidth = 3; g.strokeRect(c - (ML / 2 + 0.08) * s, c - (ML / 2 + 0.08) * s, (ML + 0.16) * s, (ML + 0.16) * s);
    g.fillStyle = '#d8cfa0'; for (const [x, z] of [[-1.3, -1.3], [1.3, 1.3], [1.3, -1.3]]) { g.beginPath(); g.arc(...P(x, z), 0.05 * s, 0, 7); g.fill(); }
    // carrier notches and edge plating
    g.strokeStyle = 'rgba(210,200,150,.6)'; g.lineWidth = 6; g.beginPath(); g.arc(c, c, c - 8, 0, 7); g.stroke();
    g.fillStyle = 'rgba(235,240,235,.75)'; g.font = `700 ${Math.round(0.11 * s)}px "JetBrains Mono", monospace`;
    g.fillText('PROBE CARD PCB', c, c - 4.02 * s); g.font = `500 ${Math.round(0.075 * s)}px "JetBrains Mono", monospace`; g.fillText('PROBE SIDE  ·  TEST LAB DEMO', c, c + 4.02 * s);
  });
  const boardBot = canvasTex(2048, 2048, (g, w) => {
    const c = w / 2, s = w / (2 * BR);
    g.fillStyle = '#0e3b28'; g.fillRect(0, 0, w, w);
    g.fillStyle = '#e2c26a';
    L.pogo.forEach((p) => { g.beginPath(); g.arc(c + p.z * s, c + p.x * s, 0.042 * s, 0, 7); g.fill(); });
    g.strokeStyle = 'rgba(235,240,235,.55)'; g.lineWidth = 3; g.beginPath(); g.arc(c, c, 2.6 * s, 0, 7); g.stroke();
    g.fillStyle = 'rgba(235,240,235,.75)'; g.font = `700 ${Math.round(0.11 * s)}px "JetBrains Mono", monospace`; g.textAlign = 'center';
    g.fillText('TESTER SIDE', c, c + 4.3 * s);
  });
  {
    const edge = std({ color: 0x8a7f55, roughness: 0.7 });
    const pcb = new THREE.Mesh(new THREE.CylinderGeometry(BR, BR, BT, 128, 1), [edge, std({ map: boardTop, roughness: 0.38, metalness: 0.08 }), std({ map: boardBot, roughness: 0.42, metalness: 0.1 })]);
    // cylinder cap UVs map the disc onto the square texture; flip the bottom so the pads read correctly
    board.add(pcb);
    // stiffener under the board (tester side), a ring with spokes
    const stf = std({ color: 0x9aa4b0, roughness: 0.3, metalness: 0.9 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.1, 10, 72).rotateX(Math.PI / 2), stf); ring.scale.y = 1.6; ring.position.y = -TOP - 0.13; board.add(ring);
    for (let i = 0; i < 4; i++) { const sp = box(4.4, 0.18, 0.28, stf); sp.rotation.y = i * Math.PI / 4; sp.position.y = -TOP - 0.13; board.add(sp); }
    const hub = cyl(0.6, 0.6, 0.22, stf); hub.position.y = -TOP - 0.13; board.add(hub);
  }
  // the fixture ring and its four clamps, carried from station to station
  {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(BR + 0.12, 0.07, 10, 128).rotateX(Math.PI / 2), M.alu); board.add(ring);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4, cl = box(0.5, 0.36, 0.34, M.bodyDk, 0.05); cl.position.set(Math.cos(a) * (BR + 0.12), 0, Math.sin(a) * (BR + 0.12)); cl.rotation.y = -a; board.add(cl); }
  }
  // parts
  const partM = { relay: std({ color: 0x1b2a4a, roughness: 0.45 }), relayTop: null, cap: std({ color: 0xb08a5a, roughness: 0.55 }), capEnd: std({ color: 0xd8dde3, roughness: 0.25, metalness: 0.9 }), res: std({ color: 0x15171b, roughness: 0.5 }), dio: std({ color: 0x15171b, roughness: 0.45 }), band: std({ color: 0xc9cdd3, roughness: 0.4 }), tant: std({ color: 0xd6a43a, roughness: 0.5 }) };
  const relayTex = canvasTex(256, 160, (g, w, h) => { g.fillStyle = '#1b2a4a'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(230,236,245,.85)'; g.font = '700 30px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.fillText('RELAY', w / 2, 62); g.font = '500 20px "JetBrains Mono", monospace'; g.fillText('5V  1A', w / 2, 100); g.fillRect(16, 120, 22, 22); });
  partM.relayTop = std({ map: relayTex, roughness: 0.45 });
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), s4 = new THREE.Vector3(), p4 = new THREE.Vector3();
  function inst(geo, mat, list, y, sx = 1, sy = 1, sz = 1) {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((o, i) => { e4.set(0, o.rot || 0, 0); q4.setFromEuler(e4); m.setMatrixAt(i, m4.compose(p4.set(o.x, y, o.z), q4, s4.set(sx, sy, sz))); });
    m.userData.list = list; m.userData.y = y; m.userData.s = [sx, sy, sz]; board.add(m); return m;
  }
  const relays = inst(new THREE.BoxGeometry(0.42, 0.24, 0.27), [partM.relay, partM.relay, partM.relayTop, partM.relay, partM.relay, partM.relay], L.relays, TOP + 0.12);
  const caps = inst(new THREE.BoxGeometry(0.1, 0.055, 0.06), partM.cap, L.caps, TOP + 0.028);
  const capEnds = inst(new THREE.BoxGeometry(0.11, 0.057, 0.04), partM.capEnd, L.caps, TOP + 0.028);
  const ress = inst(new THREE.BoxGeometry(0.09, 0.035, 0.05), partM.res, L.res, TOP + 0.018);
  const dios = inst(new THREE.BoxGeometry(0.12, 0.05, 0.065), partM.dio, L.diodes, TOP + 0.025);
  const bands = new THREE.InstancedMesh(new THREE.BoxGeometry(0.022, 0.052, 0.067), partM.band, L.diodes.length); board.add(bands);
  function placeBands(revId) {
    L.diodes.forEach((o, i) => { const sg = i === revId ? -1 : 1, ca = Math.cos(o.rot), sa = Math.sin(o.rot); e4.set(0, o.rot, 0); q4.setFromEuler(e4); bands.setMatrixAt(i, m4.compose(p4.set(o.x + ca * 0.04 * sg, TOP + 0.026, o.z - sa * 0.04 * sg), q4, s4.set(1, 1, 1))); });
    bands.instanceMatrix.needsUpdate = true;
  }
  placeBands(-1);
  inst(new THREE.BoxGeometry(0.26, 0.16, 0.18), partM.tant, L.bulk, TOP + 0.08);
  function hideInst(mesh, id, hide) {
    const o = mesh.userData.list[id], [sx, sy, sz] = mesh.userData.s; e4.set(0, o.rot || 0, 0); q4.setFromEuler(e4);
    mesh.setMatrixAt(id, m4.compose(p4.set(o.x, hide ? -50 : mesh.userData.y, o.z), q4, s4.set(sx, sy, sz))); mesh.instanceMatrix.needsUpdate = true;
  }

  // MLO: build-up laminate with the probe-pad field on top
  const mloTex = canvasTex(1024, 1024, (g, w) => {
    g.fillStyle = '#7a6f3e'; g.fillRect(0, 0, w, w);
    const gr = g.createLinearGradient(0, 0, w, w); gr.addColorStop(0, 'rgba(255,240,200,.12)'); gr.addColorStop(1, 'rgba(0,0,0,.15)'); g.fillStyle = gr; g.fillRect(0, 0, w, w);
    g.fillStyle = '#e8c878'; const n = 40, p = w * 0.62 / n, o = (w - p * (n - 1)) / 2;
    for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) g.fillRect(o + i * p - p * 0.28, o + k * p - p * 0.28, p * 0.56, p * 0.56);
    g.strokeStyle = 'rgba(232,200,120,.6)'; g.lineWidth = 2; g.strokeRect(24, 24, w - 48, w - 48);
    g.fillStyle = '#e8c878'; for (const [x, y] of [[50, 50], [w - 50, w - 50], [w - 50, 50]]) { g.beginPath(); g.arc(x, y, 12, 0, 7); g.fill(); }
  });
  const mloM = std({ map: mloTex, roughness: 0.4, metalness: 0.25 }), mloSide = std({ color: 0x6d6238, roughness: 0.6 });
  const U = { uBow: { value: 0 }, uTilt: { value: 0 } };
  for (const m of [mloM, mloSide]) {
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uBow; uniform float uTilt;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed.y += uBow * (1.0 - dot(transformed.xz, transformed.xz) / ${(ML * ML / 2).toFixed(3)}) + uTilt * transformed.x;`);
    };
    m.customProgramCacheKey = () => 'mlo-bow';
  }
  const mlo = new THREE.Mesh(new THREE.BoxGeometry(ML, MT, ML, 24, 1, 24), [mloSide, mloSide, mloM, mloSide, mloSide, mloSide]);
  mlo.position.y = MLO_Y0 + MT / 2; board.add(mlo);
  // solder balls, plus the defect versions
  const ballList = []; for (let k = 0; k < BG; k++) for (let i = 0; i < BG; i++) ballList.push({ i, k });
  const balls = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), M.solder, ballList.length); board.add(balls);
  const placeBalls = (hipOn) => ballList.forEach((b, n) => {
    const [x, z] = ballXZ(b.i, b.k), hip = hipOn && b.i === HIP_BALL[0] && b.k === HIP_BALL[1];
    balls.setMatrixAt(n, m4.compose(p4.set(x, TOP + GAP * (hip ? 0.62 : 0.5), z), q4.identity(), s4.set(BRAD, GAP * (hip ? 0.38 : 0.56), BRAD)));
  });
  placeBalls(false); balls.instanceMatrix.needsUpdate = true;
  const bridgeM = new THREE.Mesh(new THREE.CapsuleGeometry(BRAD * 0.75, BPI, 6, 12).rotateX(Math.PI / 2), M.solder);
  { const [a] = BRIDGE_BALLS, [x, z] = ballXZ(a[0], a[1]); bridgeM.position.set(x, TOP + GAP / 2, z + BPI / 2); bridgeM.scale.set(1, GAP / (BRAD * 1.5) * 0.8, 1); bridgeM.visible = false; board.add(bridgeM); }
  const hipPaste = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), M.solder);
  { const [x, z] = ballXZ(HIP_BALL[0], HIP_BALL[1]); hipPaste.position.set(x, TOP + GAP * 0.1, z); hipPaste.scale.set(BRAD * 0.9, GAP * 0.14, BRAD * 0.9); hipPaste.visible = false; board.add(hipPaste); }
  // contamination on one tester-side pad
  const grime = new THREE.Mesh(new THREE.CircleGeometry(0.075, 20).rotateX(Math.PI / 2), std({ color: 0x3a2a12, roughness: 0.95, transparent: true, opacity: 0.9 }));
  grime.position.set(SPOT.pogo[0], -TOP - 0.003, SPOT.pogo[2]); grime.visible = false; board.add(grime);

  /* ---------- defect markers ---------- */
  const markG = new THREE.Group(); board.add(markG);
  const marks = {};
  for (const [id, p] of Object.entries(SPOT)) {
    const g = new THREE.Group(); g.position.set(...p);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(id === 'warp' ? 1.2 : 0.16, id === 'warp' ? 0.025 : 0.014, 8, 48).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5d5d, transparent: true, depthTest: false, toneMapped: false }));
    ring.renderOrder = 10; g.add(ring); g.visible = false; g.userData = { ring }; markG.add(g); marks[id] = g;
  }

  /* ---------- a probe: carriage block, slim body, needle ---------- */
  function probe(mat = M.alu, len = 1.6, tilt = 0.18) {
    const g = new THREE.Group();
    const car = box(0.5, 0.42, 0.4, mat, 0.05); car.position.y = len + 0.5; g.add(car);
    const arm = new THREE.Group(); arm.position.y = len + 0.3; arm.rotation.z = tilt; g.add(arm);
    const body = cyl(0.06, 0.06, len * 0.75, M.black, 12); body.position.y = -len * 0.375; arm.add(body);
    const nd = cyl(0.008, 0.002, len * 0.32, M.needle, 8); nd.position.y = -len * 0.75 - len * 0.15; arm.add(nd);
    const tipL = new THREE.PointLight(0x7fe3ff, 0, 1.2, 2); tipL.position.y = -len * 1.05; arm.add(tipL);
    g.userData = { arm, tipL, len, tilt };
    return g;
  }
  // world position of a probe tip for a probe group placed so its tip lands on (x, y, z)
  function aimProbe(pg, x, y, z, lift) {
    const { len, tilt } = pg.userData, L1 = len * 1.06;
    pg.position.set(x - Math.sin(tilt) * L1, y + lift - (len + 0.3) + Math.cos(tilt) * L1, z);
  }
  // same for a probe mounted upside down (rotation.x = π) reaching the tester side from below
  function aimProbeDown(pg, x, y, z, lift) {
    const { len, tilt } = pg.userData, L1 = len * 1.06;
    pg.position.set(x - Math.sin(tilt) * L1, y - lift + (len + 0.3) - Math.cos(tilt) * L1, z);
  }

  /* ---------- stations ---------- */
  const stations = [];
  const glowLine = (col) => { const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.95, toneMapped: false, depthTest: false })); m.renderOrder = 9; return m; };
  function setTube(mesh, pts, r = 0.025) { mesh.geometry.dispose(); mesh.geometry = pts.length > 1 ? new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.0), Math.max(8, pts.length * 12), r, 6, false) : new THREE.BufferGeometry(); }
  const glowM = new THREE.MeshBasicMaterial({ color: 0x4cc9f0, transparent: true, opacity: 0.55, toneMapped: false });
  function plinth(x, z, w, d, h, m = M.body) {
    const p = box(w, h, d, m, Math.min(0.12, h / 2 - 0.01)); at(p, x, h / 2, z); scene.add(p);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.16, 0.035, d + 0.16), glowM); rim.position.set(x, 0.02, z); scene.add(rim);
    return p;
  }

  // 0 · AOI: hooded machine with a camera on a gantry and a ring light
  {
    const x = STX(0), z = STZ(0), G = new THREE.Group(); G.position.set(x, 0, z); scene.add(G);
    plinth(x, z, 11, 10, 1.2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const post = box(0.4, 5.2, 0.4, M.white, 0.06); at(post, sx * 5.1, 3.8, sz * 4.6); G.add(post); }
    const roof = box(10.8, 0.5, 9.8, M.white, 0.12); at(roof, 0, 6.5, 0); G.add(roof);
    const beam = box(10.2, 0.35, 0.6, M.alu, 0.05); at(beam, 0, 5.8, 0); G.add(beam);
    const cam = new THREE.Group(); G.add(cam);
    const camBody = box(0.7, 1.1, 0.7, M.bodyDk, 0.08); camBody.position.y = 0.9; cam.add(camBody);
    const lens = cyl(0.22, 0.26, 0.6, M.black); lens.position.y = 0.1; cam.add(lens);
    const ringL = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 10, 40).rotateX(Math.PI / 2), std({ color: 0xffffff, emissive: 0xdff4ff, emissiveIntensity: 1.6 })); ringL.position.y = -0.2; cam.add(ringL);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.0, 2.2, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    cone.position.y = -1.3; cam.add(cone);
    const spot = new THREE.Mesh(new THREE.CircleGeometry(1.0, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending })); G.add(spot);
    stations.push({ G, update(v, t, by) {
      // raster the camera over the board while the station runs
      const u = v.on ? v.u : 0, row = Math.floor(u * 6), f = u * 6 - row, dir = row % 2 ? -1 : 1;
      const cx = v.on ? (-3.6 + 7.2 * (dir > 0 ? ease(f) : 1 - ease(f))) : 0, cz = v.on ? -3.6 + 1.44 * Math.min(5, row) + 1.44 * ease(clamp((f - 0.85) / 0.15, 0, 1)) : 0;
      cam.position.set(cx, 5.0, cz); beam.position.z = cz;
      cone.visible = spot.visible = v.on; spot.position.set(cx, by + TOP + 0.03, cz);
      ringL.material.emissiveIntensity = v.on ? 1.6 + 0.4 * Math.sin(t * 20) : 0.3;
    } });
  }

  // 1 · flying probe: two top heads and two bottom heads, each on its own beam
  {
    const x = STX(1), z = STZ(1), G = new THREE.Group(); G.position.set(x, 0, z); scene.add(G);
    plinth(x, z, 12, 10.5, 0.35, M.bodyDk);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const post = box(0.5, 6.2, 0.5, M.body, 0.08); at(post, sx * 5.7, 3.4, sz * 4.8); G.add(post); const strip = box(0.06, 5.4, 0.06, M.amber); at(strip, sx * 5.7 - sx * 0.27, 3.4, sz * 4.8); G.add(strip); }
    for (const sz of [-1, 1]) { const rail = box(12, 0.35, 0.4, M.body, 0.06); at(rail, 0, 6.4, sz * 4.8); G.add(rail); }
    const beams = [], heads = [];
    for (let k = 0; k < 4; k++) {
      const top = k < 2, b = box(11.2, 0.3, 0.45, M.alu, 0.05); b.position.set(0, top ? 5.3 : -0.2, 0); G.add(b); beams.push(b);
      const p = probe(top ? M.amber : M.alu, top ? 1.5 : 1.1, (k % 2 ? -1 : 1) * 0.2);
      if (!top) p.rotation.x = Math.PI; G.add(p); heads.push(p);
    }
    const loop = glowLine(0x7fe3ff); G.add(loop);
    stations.push({ G, heads, beams, loop, update(v, t, by) {
      const tg = v.targets || [], top = by + TOP + 0.05;
      heads.forEach((h, k) => {
        const T = tg[k % 2] && k < 2 ? tg[k % 2] : null, lift = v.on ? v.lift : 2.2;
        const tx = T ? T[0] : (k % 2 ? 2.5 : -2.5), tz = T ? T[1] : (k < 2 ? -1.5 : 1.5);
        if (k < 2) { aimProbe(h, tx, top + (T ? T[2] || 0 : 0), tz, lift); beams[k].position.z = tz; beams[k].position.y = h.position.y + h.userData.len + 0.5; }
        else { aimProbeDown(h, k % 2 ? 2.4 : -2.4, by - TOP - 0.27, k % 2 ? 1.6 : -1.6, v.on ? 0.25 : 0.45); beams[k].position.z = h.position.z; beams[k].position.y = h.position.y - h.userData.len - 0.5; }
        h.userData.tipL.intensity = v.on && v.contact && k < 2 ? 2.5 : 0;
      });
      loop.visible = v.on && v.contact && tg.length >= 2;
      if (loop.visible && loop.userData.key !== v.step) { loop.userData.key = v.step; const a = tg[0], b = tg[1]; setTube(loop, [new THREE.Vector3(a[0], top + 0.02, a[1]), new THREE.Vector3((a[0] + b[0]) / 2, top + 0.12, (a[1] + b[1]) / 2), new THREE.Vector3(b[0], top + 0.02, b[1])], 0.012); }
      if (loop.visible) loop.material.opacity = 0.6 + 0.4 * Math.sin(t * 30);
    } });
  }

  // 2 · net test: fine-pitch Kelvin probes on the MLO pads and the tester-side pads, plus the net path
  {
    const x = STX(2), z = STZ(2), G = new THREE.Group(); G.position.set(x, 0, z); scene.add(G);
    plinth(x, z, 12, 10.5, 0.35, M.body);
    const frame = box(11.6, 0.5, 0.7, M.white, 0.1); at(frame, 0, 6.1, -4.6); G.add(frame);
    for (const sx of [-1, 1]) { const post = box(0.7, 5.6, 0.7, M.white, 0.1); at(post, sx * 5.4, 3.6, -4.6); G.add(post); }
    const heads = [];
    for (let k = 0; k < 4; k++) {
      const top = k < 2, p = new THREE.Group();
      const kp1 = probe(M.accent, 1.3, 0.16), kp2 = probe(M.accent, 1.3, 0.16); kp2.position.z = 0.045; kp2.children[0].visible = false; p.add(kp1, kp2);
      if (!top) p.rotation.x = Math.PI; G.add(p); heads.push(p);
      p.userData = { len: 1.3, tilt: 0.16, tips: [kp1.userData.tipL, kp2.userData.tipL] };
    }
    const camHead = new THREE.Group(); G.add(camHead);
    { const c = box(0.6, 0.9, 0.6, M.bodyDk, 0.06); c.position.y = 0.5; camHead.add(c); const l = cyl(0.16, 0.2, 0.5, M.black); camHead.add(l); }
    const net = glowLine(0x4cc9f0), net2 = glowLine(0xff5dd2); G.add(net, net2);
    const spark = new THREE.PointLight(0xff5dd2, 0, 2, 2); G.add(spark);
    stations.push({ G, heads, update(v, t, by) {
      const lift = v.on ? v.lift : 2.0, A = v.a || [0.5, 0.4], B = v.b || [3.3, 1.2];
      aimProbe(heads[0], A[0], by + MLO_Y1 + (v.bowY || 0), A[1], lift);
      aimProbe(heads[1], A[0] + 0.8, by + MLO_Y1 + (v.bowY || 0), A[1] - 0.7, lift + 0.6);
      aimProbeDown(heads[2], B[0], by - TOP - 0.24, B[1], lift);
      aimProbeDown(heads[3], B[0] + 0.7, by - TOP - 0.24, B[1] - 0.7, lift + 0.6);
      camHead.position.set(A[0] - 1.2, by + 3.3, A[1] + 0.6);
      heads.forEach((h, k) => h.userData.tips.forEach((tl) => (tl.intensity = v.on && v.contact && (k === 0 || k === 2) ? 1.8 : 0)));
      net.visible = v.on && v.contact && !!v.path; net2.visible = v.on && v.contact && !!v.path2;
      if (net.visible && net.userData.key !== v.pathKey) { net.userData.key = v.pathKey; setTube(net, v.path.map((p) => new THREE.Vector3(p[0], p[1] + by, p[2])), 0.03); }
      if (net2.visible && net2.userData.key !== v.pathKey) { net2.userData.key = v.pathKey; setTube(net2, v.path2.map((p) => new THREE.Vector3(p[0], p[1] + by, p[2])), 0.03); }
      net.material.opacity = 0.75 + 0.25 * Math.sin(t * 9); net2.material.opacity = 0.75 + 0.25 * Math.sin(t * 9 + 1);
      spark.intensity = v.on && v.leak ? 2 + 2 * Math.abs(Math.sin(t * 37)) * (Math.sin(t * 5.3) > 0.3 ? 1 : 0) : 0;
      if (v.leakAt) spark.position.set(v.leakAt[0], by + v.leakAt[1] + 0.1, v.leakAt[2]);
    } });
  }

  // 3 · X-ray: shielded cabinet, tube below, flat-panel detector on a tilting arm above
  const xrTex = canvasTex(512, 512, (g, w) => { g.fillStyle = '#111'; g.fillRect(0, 0, w, w); });
  {
    const x = STX(3), z = STZ(3), G = new THREE.Group(); G.position.set(x, 0, z); scene.add(G);
    plinth(x, z, 12, 11, 0.8, M.bodyDk);
    const shell = std({ color: 0xc9ced6, roughness: 0.45, metalness: 0.2, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    const back = box(11, 7.6, 0.4, M.white, 0.1); at(back, 0, 4.6, -5.0); G.add(back);
    const roof = box(11, 0.4, 10.4, M.white, 0.1); at(roof, 0, 8.4, 0); G.add(roof);
    for (const sx of [-1, 1]) { const side = box(0.4, 7.6, 10.4, shell); at(side, sx * 5.3, 4.6, 0); G.add(side); }
    const front = box(11, 7.6, 0.2, shell); at(front, 0, 4.6, 5.0); G.add(front);
    const warn = canvasTex(256, 256, (g, w) => { g.fillStyle = '#ffd23a'; g.beginPath(); g.moveTo(w / 2, 12); g.lineTo(w - 12, w - 20); g.lineTo(12, w - 20); g.closePath(); g.fill(); g.fillStyle = '#111'; g.beginPath(); g.arc(w / 2, w * 0.6, 18, 0, 7); g.fill(); for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(w / 2, w * 0.6); g.arc(w / 2, w * 0.6, 62, -Math.PI / 2 + i * 2.094 - 0.5, -Math.PI / 2 + i * 2.094 + 0.5); g.closePath(); g.fill(); } });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ map: warn, transparent: true })); sign.position.set(4.4, 7.8, 5.12); G.add(sign);
    const tube = new THREE.Group(); G.add(tube);
    { const body = cyl(0.55, 0.55, 1.6, M.steel); body.rotation.z = Math.PI / 2; tube.add(body); const nose = cyl(0.25, 0.4, 0.5, M.black); nose.position.y = 0.4; tube.add(nose); }
    const arm = new THREE.Group(); G.add(arm);
    const det = box(3.6, 0.35, 3.6, M.bodyDk, 0.08); arm.add(det);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: xrTex, toneMapped: false })); face.position.y = -0.18; arm.add(face);
    const arc = new THREE.Mesh(new THREE.TorusGeometry(3.55, 0.1, 10, 60, Math.PI * 2 / 3), M.alu); arc.rotation.z = Math.PI / 6; G.add(arc);
    const beamGeo = new THREE.BufferGeometry(); beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(18 * 3), 3));
    const beamM = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0x9be7ff, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false })); G.add(beamM);
    const focal = new THREE.PointLight(0x9be7ff, 0, 4, 2); G.add(focal);
    stations.push({ G, update(v, t, by) {
      const th = (v.tilt || 0) * Math.PI / 180, R0 = 2.6, R1 = 3.1, cx = 0, cy = by + MLO_Y0;
      arc.position.set(0, cy, 0);
      // tube and detector sit on opposite ends of a line through the MLO, tilted about the z axis
      const dx = Math.sin(th), dy = Math.cos(th);
      tube.position.set(cx - dx * R0, cy - dy * R0, 0); tube.rotation.z = -th;
      arm.position.set(cx + dx * R1, cy + dy * R1, 0); arm.rotation.z = -th;
      const on = v.on; focal.intensity = on ? 3 : 0; focal.position.copy(tube.position).y += 0.6 * dy;
      beamM.visible = on;
      if (on) {
        const f = new THREE.Vector3(tube.position.x + dx * 0.6, tube.position.y + dy * 0.6, 0), pos = beamGeo.attributes.position.array;
        const c = [[-1.6, -1.6], [1.6, -1.6], [1.6, 1.6], [-1.6, 1.6]].map(([a, b]) => new THREE.Vector3(a, -0.18, b).applyAxisAngle(new THREE.Vector3(0, 0, 1), -th).add(arm.position));
        for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; pos.set([f.x, f.y, f.z, a.x, a.y, a.z, b.x, b.y, b.z], i * 9); }
        beamGeo.attributes.position.needsUpdate = true; beamGeo.computeBoundingSphere();
        beamM.material.opacity = 0.09 + 0.03 * Math.sin(t * 40);
      }
      face.material.color.setScalar(on ? 1 : 0.15);
    } });
  }

  // 4 · flatness: granite table, bridge, optical head with autofocus spot; measured points float above the MLO
  const hp = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ toneMapped: false }), 15 * 15);
  {
    const x = STX(4), z = STZ(4), G = new THREE.Group(); G.position.set(x, 0, z); scene.add(G);
    const graniteTex = canvasTex(512, 512, (g, w) => { g.fillStyle = '#23272e'; g.fillRect(0, 0, w, w); for (let i = 0; i < 9000; i++) { const v = 30 + hash(i) * 70; g.fillStyle = `rgba(${v},${v},${v + 6},.5)`; g.fillRect(hash(i * 3) * w, hash(i * 7) * w, 1 + hash(i * 11) * 2.5, 1 + hash(i * 13) * 2.5); } });
    const slab = box(11, 1.4, 9.5, std({ map: graniteTex, roughness: 0.35, metalness: 0.05 }), 0.1); at(slab, 0, 0.7, 0); G.add(slab);
    for (const sx of [-1, 1]) { const col = box(0.9, 5.2, 1.0, M.white, 0.1); at(col, sx * 5.0, 4.0, -5.0); G.add(col); }
    const br = box(11, 0.8, 1.2, M.white, 0.1); at(br, 0, 6.6, -5.0); G.add(br);
    const head = new THREE.Group(); G.add(head);
    { const zc = box(0.9, 2.2, 0.9, M.white, 0.08); zc.position.y = 1.4; head.add(zc); const lensB = cyl(0.3, 0.3, 0.9, M.black); lensB.position.y = -0.1; head.add(lensB);
      const rl = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.05, 8, 30).rotateX(Math.PI / 2), std({ color: 0xffffff, emissive: 0xfff2d6, emissiveIntensity: 1.2 })); rl.position.y = -0.55; head.add(rl); }
    const arm = box(0.5, 0.4, 3.4, M.alu); G.add(arm);   // reaches from the bridge to the head
    const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1, 6), new THREE.MeshBasicMaterial({ color: 0xff3a3a, toneMapped: false })); G.add(laser);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff5050, toneMapped: false, depthTest: false })); dot.renderOrder = 8; G.add(dot);
    { const w = new THREE.Color(1, 1, 1); for (let i = 0; i < 15 * 15; i++) hp.setColorAt(i, w); }
    G.add(hp); hp.count = 0;
    stations.push({ G, update(v, t, by) {
      const p = v.spot || [0, 0], y0 = by + MLO_Y1 + (v.spotY || 0), up = v.on ? 0 : 2.4;
      head.position.set(p[0], y0 + 1.7 + up, p[1]); arm.position.set(p[0], 6.3, (p[1] - 5.0) / 2); arm.scale.z = Math.max(0.1, (p[1] + 5.0) / 3.4);
      laser.visible = dot.visible = v.on; laser.position.set(p[0], y0 + 0.55, p[1]); laser.scale.y = 1.1; dot.position.set(p[0], y0 + 0.004, p[1]);
      hp.visible = !!v.pts; if (v.pts) {
        const n = v.pts.length; hp.count = n; const col = new THREE.Color();
        v.pts.forEach((q, i) => { hp.setMatrixAt(i, m4.makeTranslation(q[0], by + MLO_Y1 + 0.35 + q[1], q[2])); col.setRGB(q[3][0], q[3][1], q[3][2]); hp.setColorAt(i, col); });
        hp.instanceMatrix.needsUpdate = true; if (hp.instanceColor) hp.instanceColor.needsUpdate = true;
      }
    } });
  }

  // 5 · on-tester diagnostics: test head with the board docked, mainframe with instrument cards
  const cardLeds = [];
  {
    const x = STX(5), z = STZ(5), G = new THREE.Group(); G.position.set(x, 0, z); scene.add(G);
    const head = box(8, 2.4, 8, M.body, 0.25); at(head, 0, 1.75, 0); G.add(head);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 0.2, 96), M.alu); plate.position.y = 3.0; G.add(plate);
    const tower = new THREE.Mesh(new THREE.TorusGeometry(3.5, 0.5, 12, 96).rotateX(Math.PI / 2), M.bodyDk); tower.scale.y = 0.35; tower.position.y = 3.27; G.add(tower);
    const base = box(3, 0.55, 3, M.bodyDk); at(base, 0, 0.27, 0); G.add(base);
    const cab = box(5.2, 7.5, 3.2, M.bodyDk, 0.15); at(cab, 0, 3.75, -8.2); G.add(cab);
    const ledG = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), new THREE.MeshBasicMaterial({ toneMapped: false }), 12 * 16);
    { const w = new THREE.Color(0x1a222c); for (let i = 0; i < 12 * 16; i++) ledG.setColorAt(i, w); }
    for (let s = 0; s < 12; s++) {
      const card = box(0.32, 5.6, 0.1, M.body); at(card, -1.98 + s * 0.36, 3.9, -6.55); G.add(card);
      for (let k = 0; k < 16; k++) { ledG.setMatrixAt(s * 16 + k, m4.makeTranslation(-1.98 + s * 0.36, 1.6 + k * 0.32, -6.49)); cardLeds.push([s, k]); }
    }
    G.add(ledG);
    const cables = new THREE.Group(); G.add(cables);
    for (let i = 0; i < 6; i++) { const c = new THREE.CatmullRomCurve3([new THREE.Vector3(-1.5 + i * 0.6, 1.0, -4.0), new THREE.Vector3(-1.5 + i * 0.6, 0.25, -5.2), new THREE.Vector3(-1.5 + i * 0.6, 0.6, -6.6)]); cables.add(new THREE.Mesh(new THREE.TubeGeometry(c, 20, 0.13, 8), M.black)); }
    const status = new THREE.Mesh(new THREE.TorusGeometry(4.65, 0.05, 8, 96).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x4cc9f0, toneMapped: false })); status.position.y = 3.1; G.add(status);
    stations.push({ G, update(v, t) {
      const col = new THREE.Color(), cfg = v.slots || [];
      cardLeds.forEach(([s, k], i) => {
        const st = v.on ? (v.led ? v.led(s, k, t) : 0) : -1;
        col.set(st === 2 ? 0xff5d5d : st === 1 ? 0x48d38a : st === 3 ? 0xffb224 : st === 0 ? 0x2a3a4a : 0x1a222c);
        if (cfg[s] === 0) col.set(0x10151c);
        ledG.setColorAt(i, col);
      });
      if (ledG.instanceColor) ledG.instanceColor.needsUpdate = true;
      status.material.color.set(v.on ? (v.fail ? 0xff5d5d : 0x4cc9f0) : 0x2a3a4a);
    } });
  }

  /* ---------- per-frame ---------- */
  const xrDraw = { tex: xrTex };
  function frame(v, dt) {
    // board pose: either parked at a station or moving between two
    board.position.set(v.bx, v.by, v.bz || 0);
    board.rotation.y = v.brot || 0;
    U.uBow.value = v.bow || 0; U.uTilt.value = v.tilt || 0;
    // defects that show in the geometry
    const d = v.defects || {};
    if (frame.dKey !== JSON.stringify(d)) {
      frame.dKey = JSON.stringify(d);
      hideInst(caps, 31, !!d.missingC); hideInst(capEnds, 31, !!d.missingC);
      placeBands(d.revDiode ? 6 : -1);
      placeBalls(!!d.hip); balls.instanceMatrix.needsUpdate = true; hipPaste.visible = !!d.hip;
      bridgeM.visible = !!d.bridge; grime.visible = !!d.pogo;
    }
    for (const [id, g] of Object.entries(marks)) {
      const on = v.marks && v.marks[id]; g.visible = !!on;
      if (on) { const k = 1 + 0.25 * Math.sin(v.t * 6); g.userData.ring.scale.set(k, k, k); g.userData.ring.material.opacity = 0.65 + 0.35 * Math.sin(v.t * 6); g.userData.ring.material.color.set(on === 'warn' ? 0xffb224 : 0xff5d5d); if (id === 'warp') g.position.y = MLO_Y1 + 0.05 + (v.bow || 0); }
    }
    stations.forEach((s, k) => s.update(v.st[k] || {}, v.t, BOARD_Y[k]));
  }
  function resize(w, h) { renderer.setSize(w, h, false); }
  return { renderer, scene, camera, controls, frame, resize, render: () => renderer.render(scene, camera), board, xrDraw, marks, TRANSIT_Y };
}
