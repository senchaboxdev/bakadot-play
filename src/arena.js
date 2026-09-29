// เวทีมวย: พื้นผ้าใบ ฐานเวที เสามุม เชือก 3 เส้น + ไฟส่อง
import * as THREE from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

export const RING_SIZE = 6.0;

const mat = (color, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness });

export function buildArena(scene) {
  scene.background = new THREE.Color("#0d0f14");
  scene.add(new THREE.HemisphereLight("#9aa3b8", "#2a2d36", 1.2));

  const top = new THREE.SpotLight("#ffffff", 90, 12, THREE.MathUtils.degToRad(45), 0.4, 1.4);
  top.position.set(0, 6, 0.5);
  top.target.position.set(0, 0, 0.3);
  top.castShadow = true;
  top.shadow.mapSize.set(1024, 1024);
  scene.add(top, top.target);

  const fill = new THREE.DirectionalLight("#ffffff", 0.8);
  fill.position.set(1.5, 3, 4);
  scene.add(fill);

  const half = RING_SIZE / 2;
  const box = (size, pos, color) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat(color));
    m.position.set(...pos);
    m.receiveShadow = true;
    scene.add(m);
  };
  box([RING_SIZE + 0.6, 0.1, RING_SIZE + 0.6], [0, -0.05, 0], "#b8b2a4"); // ผ้าใบ
  box([RING_SIZE + 0.8, 0.9, RING_SIZE + 0.8], [0, -0.55, 0], "#1f3b73"); // ฐานเวที

  const corners = [[-half, -half], [half, -half], [-half, half], [half, half]].map(([x, z]) => new THREE.Vector3(x, 0, z));
  const postColors = ["#c62828", "#1565c0", "#eeeeee", "#eeeeee"];
  corners.forEach((c, i) => {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 16), mat(postColors[i]));
    post.position.copy(c).setY(0.75);
    scene.add(post);
  });

  const ropeColors = ["#c62828", "#eeeeee", "#1565c0"];
  const order = [[0, 1], [1, 3], [3, 2], [2, 0]];
  ropeColors.forEach((color, level) => {
    const y = 0.45 + 0.4 * level;
    for (const [a, b] of order) rope(scene, corners[a].clone().setY(y), corners[b].clone().setY(y), color);
  });
}

function rope(scene, a, b, color) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, dir.length(), 8), mat(color));
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  scene.add(m);
}

// พื้นหลังจริงจากภาพ HDRI (เช่น Poly Haven "Basement Boxing Ring", CC0): วางไฟล์ .hdr ไว้ที่ ENV_URL
// ถ้าไม่มีไฟล์ก็ใช้ฉากมืดเดิม  ?envrot=องศา หมุนภาพ  ?env=path ใช้ไฟล์อื่น
const ENV_URL = "assets/env/boxing_ring.hdr";

// ดูชนิดไฟล์จากเนื้อใน (ไม่เชื่อนามสกุล): .hdr ขึ้นต้น "#?" / .exr ขึ้นต้น 76 2F 31 01
function sniffFormat(bytes) {
  if (bytes[0] === 0x23 && bytes[1] === 0x3f) return "hdr";
  if (bytes[0] === 0x76 && bytes[1] === 0x2f && bytes[2] === 0x31 && bytes[3] === 0x01) return "exr";
  return null;
}

export async function loadEnvironment(scene, renderer) {
  const params = new URLSearchParams(location.search);
  const url = params.get("env") ?? ENV_URL;
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
    pmrem.dispose();
    console.info(`environment loaded: ${url} (${format}, ${texture.image.width}x${texture.image.height})`);
    return true;
  } catch (err) {
    console.warn(`environment not loaded (${url}), keeping the plain background:`, err.message ?? err);
    return false;
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}
