// เอฟเฟกต์ตอนโดน (แทนการวาดแขน/ขาผู้เล่น): วงแหวน/รอยเฉือน + ประกายไฟ ตามชนิดอาวุธ
import * as THREE from "three";

export const FX = {
  punch: { color: "#ffd400", height: 1.58 },
  elbow: { color: "#ff8f00", height: 1.62 },
  knee: { color: "#43c463", height: 0.95 },
  kick: { color: "#4fc3f7", height: 1.2 },
};

const glow = (color, extra = {}) => new THREE.MeshBasicMaterial({
  color, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, ...extra,
});

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.live = [];
  }

  impact(kind, side, opponentPos) {
    const { color, height } = FX[kind] ?? FX.punch;
    const sign = side === "left" ? -1 : 1;
    const origin = opponentPos.clone().add(new THREE.Vector3(0.08 * sign, height, 0.3));

    // วงแหวน (TorusGeometry อยู่ในระนาบ XY = หันหน้าเข้ากล้องอยู่แล้ว)
    let ring, start, end;
    if (kind === "elbow") {
      ring = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 8, 40), glow(color));
      ring.rotation.z = THREE.MathUtils.degToRad(35) * sign;
      start = [0.6, 0.22]; end = [1.7, 0.55]; // รอยเฉือนโค้งแบนเอียง
    } else if (kind === "knee") {
      ring = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 8, 32), glow(color));
      start = [0.4, 0.4]; end = [2.6, 2.6]; // วงกระแทกขยายออก
    } else {
      ring = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.015, 8, 24), glow(color));
      start = [0.5, 0.5]; end = [1.8, 1.8];
    }
    ring.position.copy(origin);
    ring.renderOrder = 10;
    this.scene.add(ring);

    // ประกายไฟ
    const n = kind === "punch" ? 12 : 26;
    const pos = new Float32Array(n * 3);
    const vel = [];
    for (let i = 0; i < n; i++) {
      pos.set([origin.x, origin.y, origin.z], i * 3);
      const dir = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 2 - 1, 0.6 + Math.random()).normalize();
      vel.push(dir.multiplyScalar(1.5 + Math.random() * 2));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const sparks = new THREE.Points(geo, new THREE.PointsMaterial({
      color: new THREE.Color(color).lerp(new THREE.Color("#ffffff"), 0.3), size: 0.07,
      transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false,
    }));
    sparks.renderOrder = 11;
    this.scene.add(sparks);

    this.live.push({ ring, start, end, sparks, vel, t: 0 });
  }

  update(dt) {
    for (const fx of [...this.live]) {
      fx.t += dt;
      const p = Math.min(fx.t / 0.22, 1);
      const e = 1 - (1 - p) ** 3;
      fx.ring.scale.set(fx.start[0] + (fx.end[0] - fx.start[0]) * e, fx.start[1] + (fx.end[1] - fx.start[1]) * e, 1);
      fx.ring.material.opacity = Math.max(1 - (fx.t / 0.38) ** 2, 0);

      const arr = fx.sparks.geometry.attributes.position.array;
      fx.vel.forEach((v, i) => {
        v.y -= 4 * dt;
        arr[i * 3] += v.x * dt;
        arr[i * 3 + 1] += v.y * dt;
        arr[i * 3 + 2] += v.z * dt;
      });
      fx.sparks.geometry.attributes.position.needsUpdate = true;
      fx.sparks.material.opacity = Math.max(1 - fx.t / 0.35, 0);

      if (fx.t > 0.6) {
        for (const obj of [fx.ring, fx.sparks]) {
          this.scene.remove(obj);
          obj.geometry.dispose();
          obj.material.dispose();
        }
        this.live.splice(this.live.indexOf(fx), 1);
      }
    }
  }
}
