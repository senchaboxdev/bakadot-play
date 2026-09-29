// คู่ต่อสู้: โมเดลนักมวย (Quaternius, CC0) แต่งเป็นนักมวยไทยด้วยโค้ด
// ถอดเสื้อ (เสื้อกล้าม -> สีผิว), กางเกงมวยตามสีของยอดฝีมือ, มงคลที่หัว, ประเจียดที่ต้นแขน
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const OPPONENT_HEIGHT = 1.8; // เมตร
const MONGKOL = { bone: "Head", offset: 0.17, radius: 0.095, tube: 0.02, color: "#f2f2f2" };
const PRAJIOUD = { bones: ["UpperArm.L", "UpperArm.R"], offset: 0.13, radius: 0.046, tube: 0.012, color: "#c62828" };

const clipName = (name) => name.split("|").pop(); // "CharacterArmature|Idle" -> "Idle"

// Models whose clips differ from ours (Mixamo exports: one clip each). Map our clip names onto theirs:
// a string is a clip name, { clip, freeze } holds that clip still at time `freeze` (a fighting stance).
// Any clip we do not map is faked on the body group (see proceduralPose): hit recoil, lunge, fall.
// No Muay Thai dressing (no shorts, mongkol, armbands).
// Low-Poly Dungeon Kit rig (Woshi Gang Studio): one clip per move, hit/death included.
const DUNGEON_CLIPS = {
  Idle: "Idle_Loop", Punch_L: "Punch_Jab", Punch_R: "Punch_Jab",
  HitRecieve: "Hit_Chest", HitRecieve_2: "Hit_Head", Death: "Death01",
};
const MIXAMO_FIGHTER = { Idle: { clip: "Punching", freeze: 0.2 }, Punch_L: "Punching", Punch_R: "Punching" };
export const OPPONENT_MODELS = {
  boxer: { url: "assets/boxer/MuayThai.glb" },
  skeleton: { url: "assets/opponents/enemy_skeleton.glb", clips: DUNGEON_CLIPS },
  warrior: { url: "assets/opponents/hero_warrior.glb", clips: DUNGEON_CLIPS },
  villager: { url: "assets/opponents/npc_villager.glb", clips: DUNGEON_CLIPS },
  maria: { url: "assets/opponents/maria.glb", clips: MIXAMO_FIGHTER },
  bear: { url: "assets/opponents/bear.glb", clips: MIXAMO_FIGHTER },
  // dances instead of standing; the dance faces sideways, so turn the model a quarter to face the player
  goblin: { url: "assets/opponents/goblin.glb", clips: { Idle: "Dance" }, turn: Math.PI / 2 },
};

/** Body offsets for a fake pose; `k` runs 0 -> 1 -> 0 over 0.45 s, death falls over 0.8 s and stays down. */
function proceduralPose(name, time) {
  const k = Math.sin(Math.min(time / 0.45, 1) * Math.PI);
  const d = Math.min(time / 0.8, 1);
  if (name.startsWith("Punch")) return { lean: 0.28 * k, twist: (name.endsWith("L") ? 0.4 : -0.4) * k, y: 0, z: 0.15 * k };
  if (name.startsWith("Hit")) return { lean: -0.3 * k, twist: 0, y: 0, z: -0.12 * k };
  if (name === "Death") return { lean: -d * (Math.PI / 2 - 0.15), twist: 0, y: 0.05 * d, z: -0.4 * d };
  return { lean: 0, twist: 0, y: 0, z: 0 };
}
const PROCEDURAL = ["Punch_L", "Punch_R", "HitRecieve", "HitRecieve_2", "Death"];

export class Opponent {
  static async load(spec) {
    const gltf = await new GLTFLoader().loadAsync(spec.url);
    return new Opponent(gltf, spec.clips, spec.turn);
  }

  constructor(gltf, clipMap = null, turn = 0) {
    this.group = new THREE.Group();
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const s = OPPONENT_HEIGHT / (box.max.y - box.min.y);
    model.scale.setScalar(s);
    model.position.y = -box.min.y * s;
    model.rotation.y = turn;
    this.body = new THREE.Group(); // pivots at the feet for fake poses
    this.body.add(model);
    this.group.add(this.body);
    this.proc = null;
    this.fakePoses = Boolean(clipMap);
    this.home = this.group.position.clone();
    this.model = model;

    this.materials = [];
    this.shorts = new THREE.MeshStandardMaterial({ color: "#c62828", roughness: 0.6 });
    this.dress(!clipMap);
    if (!clipMap) {
      this.addRing(MONGKOL.bone, MONGKOL);
      for (const bone of PRAJIOUD.bones) this.addRing(bone, PRAJIOUD);
    }

    this.mixer = new THREE.AnimationMixer(model);
    const byName = Object.fromEntries(gltf.animations.map((c) => [clipName(c.name), c]));
    this.freeze = {};
    this.clips = clipMap
      ? Object.fromEntries(Object.entries(clipMap).flatMap(([ours, real]) => {
        const { clip, freeze } = typeof real === "string" ? { clip: real } : real;
        if (!byName[clip]) return [];
        if (freeze !== undefined) this.freeze[ours] = freeze;
        return [[ours, byName[clip]]];
      }))
      : byName;
    this.current = null;
    this.mixer.addEventListener("finished", (e) => {
      if (e.action === this.current && this.current.getClip().name.endsWith("Death") === false) this.play("Idle");
    });
    this.flashLevel = 0;
    this.play("Idle");
  }

  dress(muayThai = true) {
    let skin = null;
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      for (const m of [o.material].flat()) if (m.name === "Skin") skin = m;
    });
    this.model.traverse((o) => {
      if (!o.isMesh) return;
      if (!muayThai) {
        for (const m of [o.material].flat()) if (!this.materials.includes(m)) this.materials.push(m);
        return;
      }
      const mats = [o.material].flat().map((m) => {
        if (m.name === "LightBrown" && skin) return skin; // เสื้อกล้าม -> ถอดเสื้อ
        if (m.name === "Red_Dark") return this.shorts; // กางเกงมวย
        return m;
      });
      o.material = Array.isArray(o.material) ? mats : mats[0];
      for (const m of mats) if (!this.materials.includes(m)) this.materials.push(m);
    });
  }

  addRing(boneName, spec) {
    // GLTFLoader ตัดจุดออกจากชื่อ node ("UpperArm.L" -> "UpperArmL")
    const bone = this.model.getObjectByName(boneName) ?? this.model.getObjectByName(boneName.replace(/\./g, ""));
    if (!bone) return console.warn("bone not found", boneName);
    this.model.updateMatrixWorld(true);
    const unit = bone.getWorldScale(new THREE.Vector3()).x; // โครงกระดูกถูกขยายไว้ข้างใน -> แปลงหน่วยเมตร
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(spec.radius / unit, spec.tube / unit, 10, 32),
      new THREE.MeshStandardMaterial({ color: spec.color, roughness: 0.5 }),
    );
    ring.rotation.x = Math.PI / 2; // แกนวงแหวนตามแนวกระดูก (แกน Y ของกระดูก)
    ring.position.y = spec.offset / unit;
    bone.add(ring);
  }

  setShorts(color) {
    this.shorts.color.set(color);
  }

  has(name) {
    return name in this.clips || (this.fakePoses && PROCEDURAL.includes(name));
  }

  /** เล่นท่า: loop = วนซ้ำ (ยืน), ไม่ loop = เล่นครั้งเดียวแล้วกลับไปท่ายืน (ยกเว้นท่าล้ม) */
  play(name, { fade = 0.2, loop = name === "Idle" } = {}) {
    const clip = this.clips[name];
    if (this.fakePoses && PROCEDURAL.includes(name)) this.proc = { name, time: 0, loop: false };
    else if (name === "Idle") this.proc = null;
    if (!clip) return;
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    if (this.current && this.current !== action) {
      action.crossFadeFrom(this.current, fade, false);
    }
    action.play();
    if (name in this.freeze) { // hold a still stance instead of playing the clip
      action.time = this.freeze[name];
      action.paused = true;
    }
    this.current = action;
  }

  flash(amount = 0.6) {
    this.flashLevel = amount;
  }

  update(dt) {
    this.mixer.update(dt);
    if (this.fakePoses) this.applyFakePose(dt);
    if (this.flashLevel > 0) {
      this.flashLevel = Math.max(this.flashLevel - dt * 5, 0);
      for (const m of this.materials) {
        if (!m.emissive) continue;
        m.emissive.setScalar(this.flashLevel);
      }
    }
  }

  applyFakePose(dt) {
    this.bobTime = (this.bobTime ?? 0) + dt;
    const bob = Math.sin(this.bobTime * 4) * 0.02;
    let pose = { lean: 0, twist: 0, y: bob, z: 0 };
    if (this.proc) {
      this.proc.time += dt;
      pose = proceduralPose(this.proc.name, this.proc.time);
      if (this.proc.name !== "Death" && this.proc.time > 0.45) this.proc = null;
    }
    this.body.rotation.set(pose.lean, pose.twist, 0);
    this.body.position.set(0, pose.y, pose.z);
  }

  reset() {
    this.group.position.copy(this.home);
    this.group.rotation.set(0, 0, 0);
    this.proc = null;
    this.play("Idle", { fade: 0.1 });
  }
}
