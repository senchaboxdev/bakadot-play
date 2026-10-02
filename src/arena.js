// เวทีมวย + ไฟ + ฉากรอบเวทีที่เปลี่ยนตามด่าน (venues.js)
// เวที: 4 เชือก (หย่อนนิดๆ) เบาะมุมแดง/น้ำเงินหุ้มเสา ผ้าใบมีโลโก้ (สีตามฉาก) กระโปรงแดงขอบไฟทอง
// buildArena() คืน { setVenue(name), update(dt), cheer(amount) }   ?venue=ชื่อ บังคับฉากไว้ทดสอบ
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";
import { FLOOR_Y, SPARK, VENUES, canvasTexture, makeSky } from "./venues.js?v=d8186c6";

export const RING_SIZE = 6.0;
const HALF = RING_SIZE / 2;
const APRON = HALF + 0.5; // ผ้าใบยื่นออกนอกเชือก
const C = { red: "#d7263d", blue: "#1f6fe5", white: "#f4f4f4", gold: "#f5c542" };
const FONT = '"Kanit", system-ui, sans-serif';
let canvasColors = ["#2350a8", "#122a63"]; // ผ้าใบ [กลาง, ขอบ] ตามฉาก

const std = (color, roughness = 0.6, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

export function buildArena(scene, renderer) {
  scene.background = new THREE.Color("#05070d");
  scene.fog = new THREE.FogExp2("#070a16", 0.06);

  // แสงสะท้อนเบาๆ ให้เชือก/เบาะ/นวมเงา (ไม่ต้องใช้ไฟล์ HDR)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.12;
  pmrem.dispose();

  const lights = addLights(scene);
  const ring = addRing(scene, renderer);
  const sky = makeSky();
  scene.add(sky.mesh);

  const forced = new URLSearchParams(location.search).get("venue");
  const size = new THREE.Vector2();
  let venue = null, update = null, time = 0, excite = 0;

  return {
    /** เปลี่ยนฉากรอบเวที (สร้างของประกอบครั้งแรกที่ใช้ แล้วเก็บไว้) */
    setVenue(name) {
      const v = VENUES[forced ?? name] ?? VENUES.stadium;
      if (v === venue) return;
      if (venue) venue.group.visible = false;
      if (!v.group) {
        v.group = new THREE.Group();
        v.update = v.build(v.group, { renderer, apron: APRON }) ?? null;
        scene.add(v.group);
      }
      v.group.visible = true;
      venue = v;
      update = v.update;

      sky.set(v.sky);
      scene.fog.color.set(v.fog[0]);
      scene.fog.density = v.fog[1];
      scene.background.set(v.fog[0]);
      ring.floor.material.color.set(v.floor[0]);
      ring.floor.material.roughness = v.floor[1];
      ring.floor.material.metalness = v.floor[2];
      canvasColors = v.canvas;
      ring.canvasTex.userData.repaint();
      ring.canvasSide.color.set(v.canvas[1]);
      lights.key.color.set(v.key[0]);
      lights.key.intensity = v.key[1];
      v.rims.forEach((c, i) => lights.rims[i].color.set(c));
      lights.hemi.color.set(v.hemi[0]);
      lights.hemi.groundColor.set(v.hemi[1]);
      lights.hemi.intensity = v.hemi[2];
      lights.fill.intensity = v.fill;
    },

    /** คนดูเชียร์: amount 0..1 (ต่อยโดน ~0.3-0.5, น็อค 1) ตอนนี้ทำให้แฟลชในสนามใหญ่ถี่ขึ้น */
    cheer(amount = 0.5) { excite = Math.min(1, excite + amount); },

    update(dt) {
      time += dt;
      excite = Math.max(0, excite - dt * 0.35);
      renderer.getDrawingBufferSize(size);
      SPARK.uTime.value = time;
      SPARK.uBoost.value = excite;
      SPARK.uScale.value = size.y * 0.785; // = ความสูงจอ / (2 tan(fov/2)) ที่ fov 65°
      update?.(dt, time);
    },
  };
}

// ---------- ไฟ ----------

function addLights(scene) {
  const hemi = new THREE.HemisphereLight("#2c3a66", "#050608", 0.3);
  scene.add(hemi);

  // ไฟหลักเหนือเวที (มีเงา)
  const key = new THREE.SpotLight("#fff4e0", 42, 14, THREE.MathUtils.degToRad(42), 0.55, 1.3);
  key.position.set(0, 6.5, 0.6);
  key.target.position.set(0, 0, 0.2);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0005;
  scene.add(key, key.target);

  // ไฟขอบสีจากมุมหลัง ให้ตัวคู่ต่อสู้มีมิติ
  const rims = [-4.5, 4.5].map((x) => {
    const rim = new THREE.SpotLight("#ffffff", 45, 16, THREE.MathUtils.degToRad(28), 0.6, 1.2);
    rim.position.set(x, 4.2, -4.5);
    rim.target.position.set(0, 1.1, 0);
    scene.add(rim, rim.target);
    return rim;
  });

  const fill = new THREE.DirectionalLight("#dfe6ff", 0.55);
  fill.position.set(1.5, 3, 4);
  scene.add(fill);
  return { hemi, key, rims, fill };
}

// ---------- เวที ----------

function addRing(scene, renderer) {
  const corners = [[-HALF, -HALF], [HALF, -HALF], [-HALF, HALF], [HALF, HALF]].map(([x, z]) => new THREE.Vector3(x, 0, z));

  // ผ้าใบ: ด้านบนเป็นลาย (โลโก้กลาง + สามเหลี่ยมมุม), ด้านข้างสีพื้น
  const canvasTex = canvasTexture(1024, 1024, drawCanvas, renderer);
  const canvasTop = std("#ffffff", 0.88, { map: canvasTex });
  const canvasSide = std(canvasColors[1], 0.9);
  const mat = new THREE.Mesh(new THREE.BoxGeometry(APRON * 2, 0.12, APRON * 2),
    [canvasSide, canvasSide, canvasTop, canvasSide, canvasSide, canvasSide]);
  mat.position.y = -0.06;
  mat.receiveShadow = true;
  scene.add(mat);

  // กระโปรงเวที: ผ้าแดงลายตัวอักษร + ขอบไฟสีทอง
  const skirtTex = canvasTexture(2048, 256, drawSkirt, renderer);
  const skirtH = -FLOOR_Y - 0.12;
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(APRON * 2 + 0.1, skirtH, APRON * 2 + 0.1),
    [...Array(6)].map((_, i) => (i === 2 || i === 3 ? std("#111", 0.9) : std("#ffffff", 0.7, { map: skirtTex }))));
  skirt.position.y = FLOOR_Y + skirtH / 2;
  scene.add(skirt);
  const led = new THREE.Mesh(new THREE.BoxGeometry(APRON * 2 + 0.14, 0.04, APRON * 2 + 0.14),
    new THREE.MeshStandardMaterial({ color: "#000", emissive: C.gold, emissiveIntensity: 1.6 }));
  led.position.y = -0.14;
  scene.add(led);

  // เบาะมุมหุ้มเสาทั้งต้น (แดง / น้ำเงิน / ขาว ขาว) ยอดมน ไม่มีเสาโผล่
  const padColors = [C.red, C.blue, C.white, C.white];
  const padH = 1.5;
  corners.forEach((c, i) => {
    const pad = new THREE.Mesh(new RoundedBoxGeometry(0.26, padH, 0.26, 5, 0.1),
      new THREE.MeshPhysicalMaterial({ color: padColors[i], roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.3 }));
    pad.position.copy(c).setY(padH / 2).multiply(new THREE.Vector3(0.99, 1, 0.99));
    pad.rotation.y = Math.PI / 4;
    pad.castShadow = true;
    scene.add(pad);
  });

  // เชือก 4 เส้น หย่อนตรงกลางนิดๆ เคลือบเงา
  const ropeMats = [C.red, C.white, C.blue, C.white].map((color) =>
    new THREE.MeshPhysicalMaterial({ color, roughness: 0.6, clearcoat: 0.25, clearcoatRoughness: 0.5 }));
  const levels = [1.3, 1.0, 0.7, 0.4];
  const sides = [[0, 1], [1, 3], [3, 2], [2, 0]];
  for (const [a, b] of sides) {
    const pa = corners[a].clone().multiplyScalar(0.97), pb = corners[b].clone().multiplyScalar(0.97);
    levels.forEach((y, i) => {
      const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => new THREE.Vector3().lerpVectors(pa, pb, t).setY(y - 0.045 * 4 * t * (1 - t)));
      const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.034, 10), ropeMats[i]);
      rope.castShadow = true;
      scene.add(rope);
    });
  }

  // พื้นรอบเวที (สี/ความมันตามฉาก)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), std("#0b0d14", 0.45, { metalness: 0.3 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = FLOOR_Y;
  floor.receiveShadow = true;
  scene.add(floor);
  return { floor, canvasTex, canvasSide };
}

function drawCanvas(g, w, h) {
  // พื้นผ้า + ลายเส้นใยจางๆ
  const bg = g.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w * 0.75);
  bg.addColorStop(0, canvasColors[0]);
  bg.addColorStop(1, canvasColors[1]);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.globalAlpha = 0.05;
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = Math.random() < 0.5 ? "#fff" : "#000";
    g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
  g.globalAlpha = 1;

  // แนวเชือก (ส่วนผ้าใบที่ยื่นออกไปเข้มกว่า) + ขอบทอง
  const inner = (HALF / APRON) * w;
  const m = (w - inner) / 2;
  g.fillStyle = "rgba(0,0,0,0.28)";
  g.fillRect(0, 0, w, m); g.fillRect(0, h - m, w, m); g.fillRect(0, m, m, h - 2 * m); g.fillRect(w - m, m, m, h - 2 * m);
  g.strokeStyle = C.gold;
  g.lineWidth = 6;
  g.strokeRect(m + 10, m + 10, inner - 20, inner - 20);

  // สามเหลี่ยมมุมแดง (ซ้ายไกล) / น้ำเงิน (ขวาไกล)
  const tri = (x, y, dx, dy, color) => {
    g.fillStyle = color;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + dx, y); g.lineTo(x, y + dy); g.closePath(); g.fill();
  };
  tri(m, m, 150, 150, C.red);
  tri(w - m, m, -150, 150, C.blue);

  // โลโก้กลางเวที
  const cx = w / 2, cy = h / 2;
  g.strokeStyle = "rgba(235,240,255,0.6)";
  g.lineWidth = 8;
  g.beginPath(); g.arc(cx, cy, 230, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = C.gold;
  g.lineWidth = 4;
  g.beginPath(); g.arc(cx, cy, 250, 0, Math.PI * 2); g.stroke();
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "rgba(235,240,255,0.78)";
  g.font = `700 118px ${FONT}`;
  g.fillText("BAKADOT", cx, cy - 10);
  g.fillStyle = C.gold;
  g.font = `700 50px ${FONT}`;
  g.fillText("มวยไทย · MUAY THAI", cx, cy + 82);
}

function drawSkirt(g, w, h) {
  const bg = g.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, "#8e0f1f");
  bg.addColorStop(1, "#3a0610");
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = C.gold;
  g.fillRect(0, 14, w, 6);
  g.fillRect(0, h - 20, w, 6);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `700 110px ${FONT}`;
  const words = ["BAKADOT", "★", "MUAY THAI", "★"];
  const step = w / words.length;
  words.forEach((t, i) => {
    g.fillStyle = t === "★" ? C.gold : "#ffffff";
    g.fillText(t, step * (i + 0.5), h / 2 + 4);
  });
}

// ---------- ฉากหลังจากไฟล์ HDR (ไม่บังคับ) ----------
// ค่าเริ่มต้นใช้สนามที่สร้างจากโค้ดข้างบน  ?env=path/ไฟล์.hdr|.exr ใช้ภาพ HDRI แทน  ?envrot=องศา หมุนภาพ

// ดูชนิดไฟล์จากเนื้อใน (ไม่เชื่อนามสกุล): .hdr ขึ้นต้น "#?" / .exr ขึ้นต้น 76 2F 31 01
function sniffFormat(bytes) {
  if (bytes[0] === 0x23 && bytes[1] === 0x3f) return "hdr";
  if (bytes[0] === 0x76 && bytes[1] === 0x2f && bytes[2] === 0x31 && bytes[3] === 0x01) return "exr";
  return null;
}

export async function loadEnvironment(scene, renderer) {
  const params = new URLSearchParams(location.search);
  const url = params.get("env");
  if (!url) return false;
  let objectUrl;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
    const format = sniffFormat(head);
    if (!format) {
      const text = Array.from(head, (b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
      throw new Error(`not a .hdr or .exr file (starts with "${text}"). Download the HDR/EXR file itself from Poly Haven`);
    }
    objectUrl = URL.createObjectURL(blob);
    const texture = await (format === "exr" ? new EXRLoader() : new HDRLoader()).loadAsync(objectUrl);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(texture).texture; // แสงสะท้อนจากภาพเดียวกัน
    scene.environmentIntensity = 0.7;
    scene.background = texture;
    scene.backgroundIntensity = 0.85;
    scene.backgroundBlurriness = 0.02;
    scene.backgroundRotation.y = THREE.MathUtils.degToRad(Number(params.get("envrot")) || 0);
    scene.fog = null;
    pmrem.dispose();
    console.info(`environment loaded: ${url} (${format}, ${texture.image.width}x${texture.image.height})`);
    return true;
  } catch (err) {
    console.warn(`environment not loaded (${url}), keeping the built-in arena:`, err.message ?? err);
    return false;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
