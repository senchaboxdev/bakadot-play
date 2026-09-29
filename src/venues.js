// ฉากรอบเวทีของแต่ละด่าน (เดินทางไปประลองที่ต่างๆ): ท้องฟ้า หมอก ไฟ สีผ้าใบ + ของประกอบฉาก
// ของประกอบสร้างจากรูปทรงง่ายๆ ให้เป็นเงาในหมอก/แสงไฟ; สิ่งที่ขยับ (หิ่งห้อย ประกายไฟ แฟลช ไฟมือถือ)
// คำนวณใน shader ทั้งหมด จึงไม่กิน CPU ที่ตัวจับท่าใช้อยู่
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const FLOOR_Y = -1.1; // พื้นรอบเวที
const Y0 = FLOOR_Y;
const FONT = '"Kanit", system-ui, sans-serif';

const std = (color, roughness = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
/** วัสดุเรืองแสง (ค่า > 1 จะติด bloom) */
const glow = (color, k = 2, extra = {}) => new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(k), ...extra });
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (list) => list[(Math.random() * list.length) | 0];

function add(g, mesh, x = 0, y = 0, z = 0, ry = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  g.add(mesh);
  return mesh;
}

export function canvasTexture(w, h, draw, renderer) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (renderer) tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const paint = () => { draw(canvas.getContext("2d"), w, h); tex.needsUpdate = true; };
  tex.userData.repaint = paint;
  paint();
  document.fonts?.load(`700 64px ${FONT}`).then(paint, () => {}); // วาดใหม่เมื่อฟอนต์ Kanit พร้อม
  return tex;
}

let glowTexture;
function glowTex() {
  glowTexture ??= canvasTexture(64, 64, (g, w) => {
    const grad = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.3, "rgba(255,255,255,0.45)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
  });
  return glowTexture;
}

// ---------- ท้องฟ้า (ทรงกลมไล่สี) ----------

export function makeSky() {
  const uniforms = { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() } };
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(48, 32, 16), new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      varying vec3 vDir;
      void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uTop, uHorizon, uBottom;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55)) : mix(uHorizon, uBottom, pow(clamp(-h, 0.0, 1.0), 0.35));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  }));
  mesh.renderOrder = -1;
  return {
    mesh,
    set([top, horizon, bottom]) {
      uniforms.uTop.value.set(top);
      uniforms.uHorizon.value.set(horizon);
      uniforms.uBottom.value.set(bottom);
    },
  };
}

// ---------- จุดแสง (หิ่งห้อย / ดาว / ประกายไฟ / แฟลช / ไฟมือถือ) ----------

/** uniforms ที่ทุกกลุ่มจุดแสงใช้ร่วมกัน: arena.update() ตั้งค่าให้ทุกเฟรม */
export const SPARK = { uTime: { value: 0 }, uScale: { value: 500 }, uBoost: { value: 0 } };

function sparkles(g, count, at, { color = "#ffffff", k = 2, size = 0.1, drift = 0, rise = 0, height = 1, twinkle = 0, flash = 0 } = {}) {
  const pos = new Float32Array(count * 3);
  const seed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos.set(at(i), i * 3);
    seed[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      ...SPARK,
      uColor: { value: new THREE.Color(color).multiplyScalar(k) },
      uSize: { value: size }, uDrift: { value: drift }, uRise: { value: rise }, uHeight: { value: height },
      uTwinkle: { value: twinkle }, uFlash: { value: flash },
    },
    vertexShader: `
      attribute float aSeed;
      uniform float uTime, uScale, uBoost, uSize, uDrift, uRise, uHeight, uTwinkle, uFlash;
      varying float vA;
      void main() {
        vec3 p = position;
        float t = uTime + aSeed * 97.0;
        p += vec3(sin(t * 0.61 + aSeed * 11.0), 0.5 * sin(t * 0.83 + aSeed * 5.0), cos(t * 0.47 + aSeed * 7.0)) * uDrift;
        float a = 1.0;
        if (uRise > 0.0) { float r = mod(t * uRise, uHeight); p.y += r; a *= 1.0 - r / uHeight; }
        if (uTwinkle > 0.0) a *= 0.3 + 0.7 * (0.5 + 0.5 * sin(t * uTwinkle + aSeed * 40.0));
        if (uFlash > 0.0) { float ph = fract(t * (0.07 + uBoost * 0.6) + aSeed * 13.0); a *= pow(max(0.0, 1.0 - ph * 30.0), 2.0); }
        vA = a;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = uSize * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float s = smoothstep(0.5, 0.0, d);
        gl_FragColor = vec4(uColor * s * s * vA, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  g.add(points);
  return points;
}

const inBox = (x0, x1, y0, y1, z0, z1) => () => [rand(x0, x1), rand(y0, y1), rand(z0, z1)];

function stars(g, count = 250) {
  sparkles(g, count, () => {
    const v = new THREE.Vector3(rand(-1, 1), rand(0.12, 1), rand(-1, 0.4)).normalize().multiplyScalar(44);
    return [v.x, v.y, v.z];
  }, { color: "#dfe8ff", k: 1.4, size: 0.28, twinkle: 1.3 });
}

/** ดวงจันทร์ / ดวงอาทิตย์: แผ่นกลม + แสงฟุ้งรอบๆ */
function celestial(g, dir, color, size, k = 1.8) {
  const p = new THREE.Vector3(...dir).normalize().multiplyScalar(44);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(size, 40), glow(color, k, { fog: false }));
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(size * 7, size * 7), new THREE.MeshBasicMaterial({
    map: glowTex(), color: new THREE.Color(color).multiplyScalar(0.8), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false,
  }));
  for (const m of [halo, disc]) {
    m.position.copy(p);
    m.lookAt(0, 1.6, 2);
    g.add(m);
  }
  disc.position.multiplyScalar(0.999);
}

/** สายไฟห้อยระหว่างจุด a-b พร้อมหลอดไฟเรืองแสง */
function bulbString(g, a, b, n, { sag = 0.5, colors = ["#ffd9a0"], k = 2.6, r = 0.06 } = {}) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b);
  const at = (t) => new THREE.Vector3().lerpVectors(A, B, t).setY(A.y + (B.y - A.y) * t - sag * 4 * t * (1 - t));
  const pts = [...Array(17)].map((_, i) => at(i / 16));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.008, 4), std("#111", 0.9)));
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ color: "#ffffff" }), n);
  const m = new THREE.Matrix4(), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const p = at((i + 0.5) / n);
    bulbs.setMatrixAt(i, m.makeTranslation(p.x, p.y - r, p.z));
    bulbs.setColorAt(i, c.set(colors[i % colors.length]).multiplyScalar(k));
  }
  g.add(bulbs);
}

/** จุดวางของที่ไม่บังเวทีและไม่อยู่หลังกล้อง */
function scatter(n, { minHalf = 9, xMax = 30, zMin = -32, zMax = 4 } = {}) {
  const out = [];
  while (out.length < n) {
    const x = rand(-xMax, xMax), z = rand(zMin, zMax);
    if (Math.abs(x) < minHalf && z > -minHalf) continue;
    out.push([x, z]);
  }
  return out;
}

function instances(g, geo, mat, spots, scale = [0.8, 1.4]) {
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  spots.forEach(([x, z], i) => {
    const k = rand(...scale);
    mesh.setMatrixAt(i, m.compose(new THREE.Vector3(x, Y0, z), q.setFromAxisAngle(up, rand(0, Math.PI * 2)), s.set(k, k * rand(0.9, 1.15), k)));
  });
  g.add(mesh);
  return mesh;
}

function signTexture(lines, { bg = null, w = 1024, h = 256, glowColor = null } = {}) {
  return canvasTexture(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
    g.textAlign = "center";
    g.textBaseline = "middle";
    lines.forEach(({ text, color, size, y }) => {
      g.font = `700 ${size}px ${FONT}`;
      if (glowColor) { g.shadowColor = glowColor; g.shadowBlur = 24; }
      g.fillStyle = color;
      g.fillText(text, w / 2, y * h);
    });
  });
}

// ---------- ด่าน 1: ค่ายมวยตอนพระอาทิตย์ตก ----------

function buildCamp(g) {
  celestial(g, [0.15, 0.07, -1], "#ffb060", 3.4, 1.6);
  const dark = std("#1c110c", 0.9, { side: THREE.DoubleSide });

  // ต้นมะพร้าว (เงาดำตัดท้องฟ้าส้ม)
  const leaf = new THREE.PlaneGeometry(3, 0.55, 10, 1);
  const lp = leaf.attributes.position;
  for (let i = 0; i < lp.count; i++) {
    const u = (lp.getX(i) + 1.5) / 3;
    lp.setXYZ(i, u * 3, lp.getY(i) * Math.sin(Math.PI * Math.min(1, u * 1.15)), -u * u * 1.5);
  }
  leaf.rotateX(-Math.PI / 2);
  leaf.computeVertexNormals();
  const palm = (x, z, h) => {
    const top = new THREE.Vector3(x + rand(-1.2, 1.2), Y0 + h, z + rand(-0.8, 0.8));
    const mid = new THREE.Vector3((x + top.x) / 2 + rand(-0.8, 0.8), Y0 + h * 0.5, (z + top.z) / 2);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(x, Y0, z), mid, top), 12, 0.2, 6), dark));
    for (let i = 0; i < 9; i++) {
      const f = new THREE.Mesh(leaf, dark);
      f.position.copy(top);
      f.rotation.set(0, (i / 9) * Math.PI * 2 + rand(-0.2, 0.2), rand(-0.25, 0.1));
      g.add(f);
    }
  };
  for (const [x, z, h] of [[-15, -20, 9], [-8, -25, 11], [4, -23, 10], [12, -19, 8.5], [19, -14, 9.5], [-20, -12, 8], [17, -27, 12], [-2, -30, 12], [-24, -24, 11]]) palm(x, z, h);

  // รั้วไม้ + ป้ายค่าย
  const wood = std("#5a3b25", 0.85);
  for (let x = -10; x <= 10; x += 2) add(g, new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), wood), x, Y0 + 1.1, -9);
  for (const y of [0.7, 1.6]) add(g, new THREE.Mesh(new THREE.BoxGeometry(20.4, 0.16, 0.08), wood), 0, Y0 + y, -9);
  for (const sx of [-1, 1]) {
    for (let z = -9; z <= 1; z += 2) add(g, new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.2, 0.18), wood), sx * 10, Y0 + 1.1, z);
    for (const y of [0.7, 1.6]) add(g, new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 10.2), wood), sx * 10, Y0 + y, -4);
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), std("#ffffff", 0.9, {
    map: signTexture([
      { text: "BAKADOT MUAY THAI CAMP", color: "#f4e3c1", size: 92, y: 0.36 },
      { text: "ค่ายมวยบากะดอท", color: "#f5c542", size: 70, y: 0.74 },
    ], { bg: "#4a2c18" }),
  }));
  add(g, sign, 0, Y0 + 3.1, -8.9);
  for (const x of [-2.9, 2.9]) add(g, new THREE.Mesh(new THREE.BoxGeometry(0.18, 3.9, 0.18), wood), x, Y0 + 1.95, -9);
  bulbString(g, [-10, Y0 + 2.3, -9], [10, Y0 + 2.3, -9], 22, { sag: 0.35 });
  for (const sx of [-1, 1]) bulbString(g, [sx * 10, Y0 + 2.3, -9], [sx * 10, Y0 + 2.3, 1], 12, { sag: 0.3 });

  // โครงแขวนกระสอบทราย + ยางรถ
  const bags = [];
  for (const sx of [-1, 1]) {
    const x = sx * 6.6;
    for (const z of [-5, 0.5]) add(g, new THREE.Mesh(new THREE.BoxGeometry(0.2, 3.4, 0.2), wood), x, Y0 + 1.7, z);
    add(g, new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 5.9), wood), x, Y0 + 3.4, -2.25);
    [-4, -2.2, -0.4].forEach((z, i) => {
      const pivot = add(g, new THREE.Group(), x, Y0 + 3.3, z);
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6), std("#333", 0.5, { metalness: 0.8 }));
      chain.position.y = -0.3;
      const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.95, 4, 12), std(pick(["#8e1b1b", "#1d1d1f", "#1d3f7a"]), 0.6));
      bag.position.y = -1.35;
      bag.castShadow = true;
      pivot.add(chain, bag);
      bags.push({ pivot, phase: i * 1.7 + sx });
    });
  }
  const tire = new THREE.TorusGeometry(0.42, 0.17, 10, 20).rotateX(Math.PI / 2);
  for (const [x, z, n] of [[-8, -7, 3], [8.2, -6.5, 2], [-8.5, -1, 1]]) {
    for (let i = 0; i < n; i++) add(g, new THREE.Mesh(tire, std("#141414", 0.9)), x + rand(-0.05, 0.05), Y0 + 0.17 + i * 0.32, z);
  }

  sparkles(g, 70, inBox(-10, 10, Y0 + 0.5, Y0 + 3.5, -9, 2), { color: "#ffcf8a", k: 1.2, size: 0.03, drift: 0.5 }); // ฝุ่นลอยในแสงเย็น
  return (dt, t) => { for (const b of bags) b.pivot.rotation.z = Math.sin(t * 1.3 + b.phase) * 0.05; };
}

// ---------- ด่าน 2: ลานวัดเก่าตอนกลางคืน ----------

function thaiRoof(W, h, D) {
  const s = new THREE.Shape();
  s.moveTo(-W, 0);
  s.quadraticCurveTo(-W * 0.35, h * 0.3, 0, h);
  s.quadraticCurveTo(W * 0.35, h * 0.3, W, 0);
  s.lineTo(-W, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: D, bevelEnabled: false });
  geo.translate(0, 0, -D / 2);
  return geo;
}

function roofTrim(W, h, z) {
  const path = new THREE.CurvePath();
  path.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-W, 0, z), new THREE.Vector3(-W * 0.35, h * 0.3, z), new THREE.Vector3(0, h, z)));
  path.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, h, z), new THREE.Vector3(W * 0.35, h * 0.3, z), new THREE.Vector3(W, 0, z)));
  return new THREE.TubeGeometry(path, 40, 0.08, 6);
}

const GOLD = () => std("#d8a93c", 0.35, { metalness: 0.85, emissive: "#6a4a10", emissiveIntensity: 0.7 });

function chedi(g, x, z, s, mat) {
  const profile = [[0, 0], [1.5, 0], [1.5, 0.35], [1.25, 0.35], [1.25, 0.7], [1.05, 0.7], [1.05, 0.95], [1.15, 1.05], [1.12, 1.5],
    [1.0, 1.95], [0.78, 2.3], [0.5, 2.5], [0.42, 2.6], [0.42, 2.8], [0.32, 2.85], [0.28, 3.2], [0.2, 3.3], [0.14, 4.2],
    [0.07, 5.0], [0.02, 5.6], [0, 5.7]].map(([r, y]) => new THREE.Vector2(r * s, y * s));
  return add(g, new THREE.Mesh(new THREE.LatheGeometry(profile, 28), mat), x, Y0, z);
}

function buildTemple(g) {
  celestial(g, [0.35, 0.33, -1], "#e4ecff", 2.1, 1.7);
  stars(g);

  // โบสถ์: ฐาน ผนังขาว เสาหน้า หลังคาซ้อน 3 ชั้น ขอบทอง + ช่อฟ้า
  const hall = add(g, new THREE.Group(), 0, Y0, -19);
  const stone = std("#8d8a82", 0.95);
  add(hall, new THREE.Mesh(new THREE.BoxGeometry(17, 1.2, 12), stone), 0, 0.6, 0);
  add(hall, new THREE.Mesh(new THREE.BoxGeometry(11, 4.5, 8), std("#e6dfcf", 0.9)), 0, 3.45, 0);
  add(hall, new THREE.Mesh(new THREE.BoxGeometry(1.8, 3, 0.1), std("#5a1010", 0.6, { emissive: "#3a0806", emissiveIntensity: 0.6 })), 0, 2.7, 4.05);
  for (let i = -3; i <= 3; i++) if (i) add(hall, new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 4.5, 14), std("#efe8d8", 0.8)), i * 1.7, 3.45, 5.2);
  const roofMat = std("#8c2a1c", 0.75);
  const gold = GOLD();
  [[7.8, 3.2, 11.5, 5.7], [6.2, 2.7, 9, 7.0], [4.6, 2.2, 6.5, 8.2]].forEach(([W, h, D, y]) => {
    add(hall, new THREE.Mesh(thaiRoof(W, h, D), roofMat), 0, y, 0);
    for (const z of [D / 2 + 0.03, -D / 2 - 0.03]) add(hall, new THREE.Mesh(roofTrim(W, h, z), gold), 0, y, 0);
    const chofa = add(hall, new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 6), gold), 0, y + h + 0.3, D / 2);
    chofa.rotation.x = 0.55;
  });

  const white = std("#d6cfbd", 0.9);
  for (const [x, z, s] of [[-11, -14, 1.3], [11, -14, 1.3], [-19, -24, 2.2], [19, -25, 2.2], [-6, -29, 1.6]]) chedi(g, x, z, s, white);

  // ต้นไม้พุ่มกลม
  const tree = mergeGeometries([
    new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6).translate(0, 1.2, 0),
    new THREE.IcosahedronGeometry(1.7, 1).scale(1, 0.85, 1).translate(0, 3.3, 0),
    new THREE.IcosahedronGeometry(1.2, 1).translate(0.9, 4.1, 0.3),
  ]);
  instances(g, tree, std("#0e1a1c", 0.95), scatter(34, { minHalf: 10 }), [0.9, 1.6]);

  // เสา + โคมแดงรอบลาน
  const pole = std("#1a1414", 0.8);
  for (const [x, z] of [[-7.5, -7], [7.5, -7], [-7.5, 2], [7.5, 2]]) add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 4.4, 8), pole), x, Y0 + 2.2, z);
  const lanterns = { colors: ["#ff3b2a", "#ff8a2a"], k: 2.3, r: 0.13, sag: 0.6 };
  bulbString(g, [-7.5, Y0 + 4.3, -7], [7.5, Y0 + 4.3, -7], 11, lanterns);
  bulbString(g, [-7.5, Y0 + 4.3, -7], [-7.5, Y0 + 4.3, 2], 7, lanterns);
  bulbString(g, [7.5, Y0 + 4.3, -7], [7.5, Y0 + 4.3, 2], 7, lanterns);

  sparkles(g, 130, inBox(-14, 14, Y0 + 0.4, Y0 + 3.8, -16, 3), { color: "#ffe27a", k: 2.4, size: 0.06, drift: 0.7, twinkle: 1.6 }); // หิ่งห้อย
}

// ---------- ด่าน 3: ตลาดนัดกลางคืน ----------

function buildMarket(g, { renderer }) {
  stars(g, 90);
  const stripes = ["#d7263d", "#1f6fe5", "#f2b705", "#1c9a6c", "#8e3fd6"].map((c) => {
    const tex = canvasTexture(128, 32, (ctx, w, h) => {
      for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? "#f4f1ea" : c; ctx.fillRect((i * w) / 8, 0, w / 8, h); }
    }, renderer);
    return std("#ffffff", 0.8, { map: tex });
  });
  const wood = std("#5c3f28", 0.85), pole = std("#222", 0.6, { metalness: 0.6 });
  const stall = (x, z, ry) => {
    const s = add(g, new THREE.Group(), x, Y0, z, ry);
    add(s, new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.9, 1), wood), 0, 0.45, 0);
    for (const [px, pz] of [[-1.1, -0.55], [1.1, -0.55], [-1.1, 0.55], [1.1, 0.55]]) add(s, new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.4, 6), pole), px, 1.2, pz);
    const canopy = add(s, new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 1.7), pick(stripes)), 0, 2.45, 0);
    canopy.rotation.x = -0.18;
    add(s, new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), glow("#ffd9a0", 3)), 0, 2.2, 0);
    for (let i = 0; i < 5; i++) {
      add(s, new THREE.Mesh(new THREE.BoxGeometry(rand(0.2, 0.4), rand(0.1, 0.3), rand(0.2, 0.35)),
        std(pick(["#e85d3f", "#f2c14e", "#7cc26b", "#f28fb1", "#fff2d6"]), 0.7)), rand(-0.85, 0.85), 1.0, rand(-0.3, 0.3));
    }
  };
  for (let x = -12; x <= 12; x += 3) stall(x, -9.5, 0);
  for (const sx of [-1, 1]) for (let z = -6.5; z <= 1.5; z += 2.7) stall(sx * 8.8, z, -sx * Math.PI / 2);

  // ไฟประดับหลากสีพาดข้ามลาน
  const party = { colors: ["#ff4d6d", "#ffd166", "#06d6a0", "#4cc9f0", "#f72585"], k: 2.8, r: 0.07, sag: 0.9 };
  for (const x of [-11, 11]) add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6.2, 8), pole), x, Y0 + 3.1, -11);
  for (const x of [-9.5, 9.5]) add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 6.2, 8), pole), x, Y0 + 3.1, 3);
  bulbString(g, [-11, Y0 + 6, -11], [11, Y0 + 6, -11], 30, party);
  bulbString(g, [-11, Y0 + 6, -11], [-9.5, Y0 + 6, 3], 18, party);
  bulbString(g, [11, Y0 + 6, -11], [9.5, Y0 + 6, 3], 18, party);
  bulbString(g, [-9.5, Y0 + 6, 3], [5, Y0 + 6, -11], 26, { ...party, sag: 1.2 });
  bulbString(g, [9.5, Y0 + 6, 3], [-5, Y0 + 6, -11], 26, { ...party, sag: 1.2 });

  // ป้ายนีออน
  const neon = (text, color, size, x, y, z, w) => {
    const tex = signTexture([{ text, color: "#ffffff", size, y: 0.5 }], { w: 1024, h: 256, glowColor: color });
    add(g, new THREE.Mesh(new THREE.PlaneGeometry(w, w / 4), new THREE.MeshBasicMaterial({
      map: tex, color: new THREE.Color(color).multiplyScalar(2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })), x, y, z);
  };
  neon("ตลาดนัด", "#ff4fa0", 170, -6, Y0 + 3.7, -10.2, 4);
  neon("NIGHT MARKET", "#39d5ff", 130, 1, Y0 + 3.9, -10.2, 5);
  neon("ข้าวมันไก่", "#ffd23f", 160, 7.5, Y0 + 3.6, -10.2, 3.6);

  // ตึกเมืองไกลๆ มีไฟหน้าต่าง
  const windows = canvasTexture(64, 128, (ctx, w, h) => {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 10) for (let x = 4; x < w; x += 10) {
      if (Math.random() < 0.35) { ctx.fillStyle = pick(["#ffcf8a", "#ffe9c2", "#9fd3ff"]); ctx.fillRect(x, y, 5, 6); }
    }
  }, renderer);
  const city = std("#0b0c14", 0.8, { emissive: "#ffffff", emissiveMap: windows, emissiveIntensity: 0.9 });
  for (let x = -34; x < 34; x += rand(3.5, 6)) {
    const h = rand(6, 18), w = rand(3, 5.5);
    add(g, new THREE.Mesh(new THREE.BoxGeometry(w, h, 4), city), x, Y0 + h / 2, rand(-30, -24));
  }
}

// ---------- ด่าน 4: ป้อมปราการ ----------

function buildFortress(g, { renderer }) {
  const bricks = (rx, ry) => {
    const tex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = "#2a241f";
      ctx.fillRect(0, 0, w, h);
      for (let row = 0; row < 8; row++) for (let col = -1; col < 5; col++) {
        const v = rand(70, 105) | 0;
        ctx.fillStyle = `rgb(${v},${(v * 0.9) | 0},${(v * 0.8) | 0})`;
        ctx.fillRect(col * 64 + (row % 2) * 32 + 2, row * 32 + 2, 60, 28);
      }
    }, renderer);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);
    return std("#ffffff", 0.95, { map: tex });
  };
  const back = bricks(8, 2), side = bricks(5, 2);
  add(g, new THREE.Mesh(new THREE.BoxGeometry(30, 7, 1.5), back), 0, Y0 + 3.5, -13);
  for (const sx of [-1, 1]) add(g, new THREE.Mesh(new THREE.BoxGeometry(1.5, 7, 18), side), sx * 13, Y0 + 3.5, -4);
  // ใบเสมา (ฟันเฟือง) บนกำแพง
  const spots = [];
  for (let x = -14.5; x <= 14.5; x += 1.8) spots.push([x, -13]);
  for (const sx of [-1, 1]) for (let z = -11.5; z <= 4.5; z += 1.8) spots.push([sx * 13, z]);
  const merlon = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), bricks(1, 1), spots.length);
  const m = new THREE.Matrix4();
  spots.forEach(([x, z], i) => merlon.setMatrixAt(i, m.makeTranslation(x, Y0 + 7.45, z)));
  g.add(merlon);
  // หอคอยมุม
  for (const sx of [-1, 1]) {
    add(g, new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 11, 20), bricks(6, 3)), sx * 13, Y0 + 5.5, -13);
    add(g, new THREE.Mesh(new THREE.ConeGeometry(3, 3.6, 20), std("#3a1712", 0.8)), sx * 13, Y0 + 12.8, -13);
  }
  // ประตู + ซี่เหล็ก
  add(g, new THREE.Mesh(new THREE.BoxGeometry(4.6, 5.6, 0.3), std("#070504", 1)), 0, Y0 + 2.8, -12.2);
  const iron = std("#2a2622", 0.5, { metalness: 0.7 });
  for (let x = -2; x <= 2; x += 0.5) add(g, new THREE.Mesh(new THREE.BoxGeometry(0.08, 5.4, 0.08), iron), x, Y0 + 2.75, -12);
  for (let y = 0.8; y < 5.5; y += 1.1) add(g, new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.08, 0.08), iron), 0, Y0 + y, -12);
  // ธงแดง
  const banner = std("#ffffff", 0.8, {
    side: THREE.DoubleSide,
    map: canvasTexture(128, 384, (ctx, w, h) => {
      ctx.fillStyle = "#7d1414"; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#d8a93c"; ctx.lineWidth = 6; ctx.strokeRect(8, 8, w - 16, h - 40);
      ctx.fillStyle = "#d8a93c";
      ctx.beginPath(); ctx.moveTo(w / 2, 110); ctx.lineTo(w - 30, 170); ctx.lineTo(w / 2, 230); ctx.lineTo(30, 170); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0, h - 32); ctx.lineTo(w / 2, h); ctx.lineTo(w, h - 32); ctx.fill();
    }, renderer),
  });
  for (const x of [-9, -5, 5, 9]) add(g, new THREE.Mesh(new THREE.PlaneGeometry(1.4, 4.2), banner), x, Y0 + 4.4, -12.2);

  // คบเพลิง + ประกายไฟลอยขึ้น
  const torches = [];
  for (const x of [-11, -7, -3, 3, 7, 11]) torches.push([x, Y0 + 3.2, -12.05, 0]);
  for (const sx of [-1, 1]) for (const z of [-9, -4, 1]) torches.push([sx * 12.1, Y0 + 3.2, z, sx]);
  const flameOuter = glow("#ff6a1a", 3.2), flameInner = glow("#ffd27a", 3.5), bracket = std("#1a1512", 0.6, { metalness: 0.6 });
  for (const [x, y, z] of torches) {
    add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.04, 0.6, 8), bracket), x, y, z);
    add(g, new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.45, 8), flameOuter), x, y + 0.5, z);
    add(g, new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 8), flameInner), x, y + 0.45, z);
  }
  sparkles(g, torches.length * 14, (i) => {
    const [x, y, z] = torches[(i / 14) | 0];
    return [x + rand(-0.12, 0.12), y + 0.55, z + rand(-0.12, 0.12)];
  }, { color: "#ff7a1a", k: 3, size: 0.05, rise: 0.5, height: 1.8, drift: 0.1 });
  sparkles(g, 60, inBox(-12, 12, Y0 + 0.5, Y0 + 6, -12, 3), { color: "#ff9a4a", k: 1.8, size: 0.04, drift: 0.8, twinkle: 2 });

  const flicker = [-7, 7].map((x) => {
    const l = new THREE.PointLight("#ff7a2a", 10, 14, 1.5);
    l.position.set(x, Y0 + 3.6, -11);
    g.add(l);
    return l;
  });
  return (dt, t) => flicker.forEach((l, i) => { l.intensity = 10 * (0.8 + 0.15 * Math.sin(t * 13 + i * 3) + 0.08 * Math.sin(t * 31 + i)); });
}

// ---------- ด่าน 5: ท้องพระโรง ----------

function buildPalace(g, { renderer }) {
  const gold = GOLD();
  const pattern = canvasTexture(256, 256, (ctx, w) => {
    ctx.fillStyle = "#4a0a10";
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = "#d8a93c";
    ctx.fillStyle = "#d8a93c";
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(w / 2, 10); ctx.lineTo(w - 10, w / 2); ctx.lineTo(w / 2, w - 10); ctx.lineTo(10, w / 2); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.arc(w / 2, w / 2, 34, 0, Math.PI * 2); ctx.fill();
    for (const [x, y] of [[0, 0], [w, 0], [0, w], [w, w]]) { ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.fill(); }
  }, renderer);
  pattern.wrapS = pattern.wrapT = THREE.RepeatWrapping;
  pattern.repeat.set(8, 3.5);
  add(g, new THREE.Mesh(new THREE.PlaneGeometry(36, 15), std("#ffffff", 0.45, { map: pattern, metalness: 0.4 })), 0, Y0 + 7.5, -18);

  // เสาแดง บัวหัวเสาทอง
  const shaft = std("#7d1414", 0.5);
  const pillar = (x, z) => {
    add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 9, 20), shaft), x, Y0 + 4.5, z);
    add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.66, 0.72, 0.5, 20), gold), x, Y0 + 0.25, z);
    add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.46, 0.8, 20), gold), x, Y0 + 8.6, z);
    for (const y of [1.2, 7.6]) add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.49, 0.49, 0.16, 20), gold), x, Y0 + y, z);
  };
  for (const sx of [-1, 1]) for (let z = -15; z <= 1; z += 4) pillar(sx * 7.5, z);
  for (const x of [-11, -3.5, 3.5, 11]) pillar(x, -16.5);

  // บัลลังก์ขั้นบันไดทอง + บุษบก (ทรงเจดีย์ทอง) + ฉัตรสองข้าง
  [[7, 3.2, 0.25], [5.2, 2.6, 0.75], [3.4, 2, 1.25]].forEach(([w, d, y]) => add(g, new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, d), gold), 0, Y0 + y, -15.6));
  chedi(g, 0, -15.6, 0.6, gold).position.y = Y0 + 1.5;
  const white = std("#f3ecd8", 0.6);
  for (const sx of [-1, 1]) {
    const x = sx * 4.8, z = -14.5;
    add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6.8, 8), gold), x, Y0 + 3.4, z);
    for (let i = 0; i < 7; i++) {
      const r = 1.15 - i * 0.14, y = Y0 + 2.4 + i * 0.6;
      add(g, new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r, 0.24, 28), white), x, y, z);
      add(g, new THREE.Mesh(new THREE.TorusGeometry(r, 0.03, 6, 28).rotateX(Math.PI / 2), gold), x, y - 0.12, z);
    }
  }

  // ม่านแดงจับจีบ
  const drapeGeo = new THREE.PlaneGeometry(6, 13, 48, 1);
  const dp = drapeGeo.attributes.position;
  for (let i = 0; i < dp.count; i++) dp.setZ(i, Math.sin(dp.getX(i) * 5) * 0.18);
  drapeGeo.computeVertexNormals();
  const drape = std("#5e0b16", 0.65, { side: THREE.DoubleSide });
  for (const sx of [-1, 1]) add(g, new THREE.Mesh(drapeGeo, drape), sx * 13, Y0 + 6.5, -16.5, -sx * 0.5);

  // โคมระย้า
  for (const [x, z] of [[0, -9], [-5, -11], [5, -11]]) {
    add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3, 6), gold), x, Y0 + 9.2, z);
    add(g, new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 8, 32).rotateX(Math.PI / 2), gold), x, Y0 + 7.7, z);
    const n = 14, bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.08, 10, 8), glow("#ffdca0", 3), n);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      bulbs.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x + Math.cos(a) * 0.8, Y0 + 7.85, z + Math.sin(a) * 0.8));
    }
    g.add(bulbs);
  }
  sparkles(g, 120, inBox(-11, 11, Y0 + 0.5, Y0 + 7, -15, 3), { color: "#ffcf6a", k: 1.8, size: 0.035, drift: 0.6, twinkle: 2.5 }); // ละอองทอง
}

// ---------- ด่าน 6: ป่าตอนกลางคืน ----------

function buildForest(g) {
  celestial(g, [-0.4, 0.3, -1], "#eaf6ff", 2.6, 1.8);
  stars(g, 200);
  const pine = mergeGeometries([
    new THREE.CylinderGeometry(0.14, 0.22, 1.4, 6).translate(0, 0.7, 0),
    new THREE.ConeGeometry(1.8, 2.6, 7).translate(0, 2.2, 0),
    new THREE.ConeGeometry(1.4, 2.2, 7).translate(0, 3.4, 0),
    new THREE.ConeGeometry(0.95, 1.9, 7).translate(0, 4.5, 0),
  ]);
  instances(g, pine, std("#0b1a16", 0.95), scatter(120, { minHalf: 8.5 }), [0.9, 2]);
  instances(g, new THREE.DodecahedronGeometry(0.8, 0).translate(0, 0.3, 0), std("#2a3330", 0.95), scatter(18, { minHalf: 8, xMax: 16, zMin: -16 }), [0.5, 1.4]);
  sparkles(g, 240, inBox(-15, 15, Y0 + 0.3, Y0 + 3.6, -18, 3), { color: "#c8ff6a", k: 2.6, size: 0.06, drift: 0.9, twinkle: 1.2 }); // หิ่งห้อย
}

// ---------- ด่าน 7 + เล่นอิสระ: สนามใหญ่ ----------

const beamMaterial = new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color("#fff1d6") }, strength: { value: 0.07 } },
  vertexShader: `
    varying float vY; varying vec3 vN; varying vec3 vView;
    void main() {
      vY = uv.y;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: `
    uniform vec3 color; uniform float strength;
    varying float vY; varying vec3 vN; varying vec3 vView;
    void main() {
      float edge = pow(abs(dot(vN, vView)), 2.0);
      gl_FragColor = vec4(color, strength * pow(vY, 1.6) * edge);
    }`,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

function buildStadium(g, { renderer, apron }) {
  // อัฒจันทร์มืดๆ + ไฟมือถือระยิบระยับ + แฟลชกล้อง (ถี่ขึ้นตอนเชียร์)
  const ROWS = 11, START = 6.4, DEPTH = 0.95, RISE = 0.5;
  const standMat = std("#0c0e14", 0.8, { envMapIntensity: 0 });
  const seats = [];
  for (let r = 0; r < ROWS; r++) {
    const dist = START + r * DEPTH, top = Y0 + (r + 1) * RISE;
    for (const [axis, sign] of [["z", -1], ["x", -1], ["x", 1]]) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(2 * dist + DEPTH * 2, top - Y0, DEPTH), standMat);
      step.position.y = (top + Y0) / 2;
      if (axis === "z") step.position.z = sign * (dist + DEPTH / 2);
      else { step.rotation.y = Math.PI / 2; step.position.x = sign * (dist + DEPTH / 2); }
      g.add(step);
      for (let u = -dist; u < dist; u += 0.3) {
        const out = sign * (dist + DEPTH * 0.5), y = top + rand(0.9, 1.4);
        seats.push(axis === "z" ? [u, y, out] : [out, y, u]);
      }
    }
  }
  const at = () => { const s = pick(seats); return [s[0] + rand(-0.1, 0.1), s[1], s[2]]; };
  sparkles(g, 700, at, { color: "#d6e6ff", k: 2.4, size: 0.13, twinkle: 1.4 });
  sparkles(g, 260, at, { color: "#ffd9a0", k: 2.2, size: 0.13, twinkle: 1.1 });
  sparkles(g, 120, at, { color: "#ff5fa2", k: 2.2, size: 0.12, twinkle: 0.9 });
  sparkles(g, 70, at, { color: "#ffffff", k: 5, size: 0.4, flash: 1 });

  // จอใหญ่หลังอัฒจันทร์
  const screen = signTexture([
    { text: "BAKADOT", color: "#ffffff", size: 150, y: 0.4 },
    { text: "FINAL FIGHT · ยกสุดท้าย", color: "#f5c542", size: 64, y: 0.8 },
  ], { bg: "#0a1030", glowColor: "#39c6ff" });
  add(g, new THREE.Mesh(new THREE.PlaneGeometry(9, 2.25), new THREE.MeshBasicMaterial({ map: screen, color: new THREE.Color(1.4, 1.4, 1.4) })), 0, Y0 + 6.6, -17.5);
  add(g, new THREE.Mesh(new THREE.BoxGeometry(9.3, 2.5, 0.2), std("#05060a", 0.6)), 0, Y0 + 6.6, -17.65);

  // ป้ายไฟวิ่งรอบเวที
  const boardTex = canvasTexture(2048, 128, (ctx, w, h) => {
    ctx.fillStyle = "#050507";
    ctx.fillRect(0, 0, w, h);
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.font = `700 76px ${FONT}`;
    const items = [["BAKADOT", "#ffffff"], ["◆", "#f5c542"], ["MUAY THAI", "#f5c542"], ["◆", "#39c6ff"], ["มวยไทย", "#ff3d7f"], ["◆", "#f5c542"]];
    items.forEach(([t, color], i) => { ctx.fillStyle = color; ctx.fillText(t, (w / items.length) * (i + 0.5), h / 2 + 4); });
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
  }, renderer);
  boardTex.wrapS = THREE.RepeatWrapping;
  const boards = [];
  const dist = apron + 1.6, bh = 0.75;
  for (const [x, z, ry] of [[0, -dist, 0], [-dist, 0, Math.PI / 2], [dist, 0, -Math.PI / 2]]) {
    const tex = boardTex.clone();
    tex.repeat.x = 2;
    const board = add(g, new THREE.Mesh(new THREE.PlaneGeometry(dist * 2, bh), new THREE.MeshBasicMaterial({ map: tex, color: new THREE.Color(1.3, 1.3, 1.3) })), x, Y0 + bh / 2 + 0.05, z, ry);
    const frame = add(g, new THREE.Mesh(new THREE.BoxGeometry(dist * 2 + 0.1, bh + 0.1, 0.12), std("#0a0a0a", 0.6)), x, board.position.y, z, ry);
    frame.translateZ(-0.07);
    boards.push(tex);
  }

  // โครงไฟเหนือเวที + ลำแสง
  const y = 4.8, s = 2.3, steel = std("#1a1d24", 0.5, { metalness: 0.8 });
  for (const [w, d, x, z] of [[2 * s + 0.2, 0.16, 0, -s], [2 * s + 0.2, 0.16, 0, s], [0.16, 2 * s, -s, 0], [0.16, 2 * s, s, 0]]) add(g, new THREE.Mesh(new THREE.BoxGeometry(w, 0.22, d), steel), x, y, z);
  const lampBody = std("#15171c", 0.4, { metalness: 0.7 }), lampFace = glow("#fff3dc", 4);
  const beamLen = y + 0.1;
  const beamGeo = new THREE.CylinderGeometry(0.14, 1.25, beamLen, 32, 1, true).translate(0, -beamLen / 2, 0);
  const lamps = [];
  for (const t of [-0.66, 0, 0.66]) lamps.push([t * s, -s]);
  for (const t of [-0.66, 0]) lamps.push([-s, t * s], [s, t * s]);
  for (const [x, z] of lamps) {
    add(g, new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.24, 16), lampBody), x, y - 0.2, z);
    const face = add(g, new THREE.Mesh(new THREE.CircleGeometry(0.12, 20), lampFace), x, y - 0.33, z);
    face.rotation.x = Math.PI / 2;
    const beam = add(g, new THREE.Mesh(beamGeo, beamMaterial), x, y - 0.33, z);
    beam.lookAt(x * 0.35, 0, z * 0.35);
    beam.rotateX(-Math.PI / 2); // แกน -y ของกรวยชี้ไปที่เป้า
  }

  return (dt, t) => { for (const tex of boards) tex.offset.x = (t * 0.04) % 1; };
}

// ---------- ตารางฉาก ----------
// sky: [บน, ขอบฟ้า, ล่าง]  fog: [สี, ความหนา]  floor: [สี, roughness, metalness]  canvas: [กลาง, ขอบ]
// key/rims/hemi/fill: ไฟของเวที  build: สร้างของประกอบฉาก (ครั้งแรกที่ใช้) คืนฟังก์ชัน update ได้

export const VENUES = {
  camp: {
    sky: ["#3a1d52", "#ff8a45", "#24120b"], fog: ["#4a2626", 0.03], floor: ["#4a3526", 0.95, 0],
    canvas: ["#b8452f", "#6f1d14"], key: ["#ffd9a8", 42], rims: ["#ff8a3d", "#ff5fa2"],
    hemi: ["#ffb27a", "#2b1a12", 0.55], fill: 0.6, build: buildCamp,
  },
  temple: {
    sky: ["#03071a", "#1b2c55", "#04060d"], fog: ["#141f3a", 0.045], floor: ["#4d525e", 0.9, 0],
    canvas: ["#3b5c88", "#1c2f4d"], key: ["#cfe0ff", 40], rims: ["#ff8a3d", "#6ea8ff"],
    hemi: ["#7090d0", "#0b0d14", 0.5], fill: 0.55, build: buildTemple,
  },
  market: {
    sky: ["#08051a", "#3d1f4d", "#07060c"], fog: ["#1f1430", 0.04], floor: ["#1b1c22", 0.32, 0.35],
    canvas: ["#1f8a72", "#0f4a3d"], key: ["#fff0d8", 44], rims: ["#ff4fa0", "#ffd23f"],
    hemi: ["#8a5fbf", "#0d0a12", 0.5], fill: 0.55, build: buildMarket,
  },
  fortress: {
    sky: ["#100505", "#3a1810", "#080404"], fog: ["#24120c", 0.04], floor: ["#3a2c22", 0.95, 0],
    canvas: ["#7a5433", "#3e2a19"], key: ["#ffd0a0", 42], rims: ["#ff6a2a", "#ffb03d"],
    hemi: ["#ff8c5a", "#120a08", 0.45], fill: 0.55, build: buildFortress,
  },
  palace: {
    sky: ["#0e0604", "#2a140a", "#0a0503"], fog: ["#1c0e08", 0.035], floor: ["#2a0c0c", 0.18, 0.4],
    canvas: ["#9a1d2e", "#4a0b16"], key: ["#ffe2b0", 46], rims: ["#ffc34d", "#ff4d4d"],
    hemi: ["#ffb86b", "#140806", 0.5], fill: 0.6, build: buildPalace,
  },
  forest: {
    sky: ["#02060f", "#123a44", "#020405"], fog: ["#0c2228", 0.06], floor: ["#10231a", 0.95, 0],
    canvas: ["#317a40", "#173a1f"], key: ["#d8f0ff", 40], rims: ["#5fffc8", "#9a7bff"],
    hemi: ["#4f8a9a", "#050a08", 0.45], fill: 0.55, build: buildForest,
  },
  stadium: {
    sky: ["#020308", "#0a0d1c", "#020305"], fog: ["#070a16", 0.06], floor: ["#0b0d14", 0.45, 0.3],
    canvas: ["#2350a8", "#122a63"], key: ["#fff4e0", 42], rims: ["#ff3d7f", "#39c6ff"],
    hemi: ["#2c3a66", "#050608", 0.3], fill: 0.55, build: buildStadium,
  },
};
