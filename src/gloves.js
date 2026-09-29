// นวมของผู้เล่น (มุมมองบุรุษที่หนึ่ง ติดกับกล้อง) — ตำแหน่งเป็นเมตรเทียบกล้อง
import * as THREE from "three";
import { lerp } from "./tween.js?v=07d1cee";

const REST = { left: [-0.26, -0.34, -0.62], right: [0.26, -0.34, -0.62] };
const GUARD = { left: [-0.12, -0.14, -0.42], right: [0.12, -0.14, -0.42] };
const HIT = { left: [-0.07, -0.02, -1.25], right: [0.07, -0.02, -1.25] };

const mat = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.45 });

export function makeGlove(isLeft) {
  const glove = new THREE.Group();
  const red = mat("#c62828");
  const fist = new THREE.Mesh(new THREE.SphereGeometry(0.11, 24, 16), red);
  fist.scale.set(0.95, 0.9, 1.25);
  glove.add(fist);
  const thumb = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 12), red);
  thumb.position.set(isLeft ? 0.09 : -0.09, 0.02, -0.03);
  glove.add(thumb);
  // ข้อมือนวม: แดงเข้ม + แถบขาวเส้นเล็ก
  for (const [r, h, z, color] of [[0.058, 0.1, 0.17, "#8e1b1b"], [0.061, 0.018, 0.13, "#f5f5f5"]]) {
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 20), mat(color));
    cuff.rotation.x = Math.PI / 2;
    cuff.position.set(0, -0.03, z);
    glove.add(cuff);
  }
  return glove;
}

export class Gloves {
  constructor(camera) {
    this.meshes = { left: makeGlove(true), right: makeGlove(false) };
    this.out = { left: 0, right: 0 }; // 0 = ท่าพัก/การ์ด, 1 = เหยียดสุด
    this.guard = 0; // 0 = มือล่าง, 1 = ยกบังหน้า
    for (const g of Object.values(this.meshes)) camera.add(g);
  }

  update(dt, guarding) {
    const target = guarding ? 1 : 0;
    this.guard += Math.sign(target - this.guard) * Math.min(Math.abs(target - this.guard), dt * 8);
    for (const side of ["left", "right"]) {
      const p = [0, 1, 2].map((i) => lerp(lerp(REST[side][i], GUARD[side][i], this.guard), HIT[side][i], this.out[side]));
      this.meshes[side].position.set(...p);
    }
  }
}
