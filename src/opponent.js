// คู่ต่อสู้: โมเดลนักมวย (Quaternius, CC0) แต่งเป็นนักมวยไทยด้วยโค้ด
// ถอดเสื้อ (เสื้อกล้าม -> สีผิว), กางเกงมวยตามสีของยอดฝีมือ, มงคลที่หัว, ประเจียดที่ต้นแขน
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const OPPONENT_HEIGHT = 1.8; // เมตร
const MONGKOL = { bone: "Head", offset: 0.17, radius: 0.095, tube: 0.02, color: "#f2f2f2" };
const PRAJIOUD = { bones: ["UpperArm.L", "UpperArm.R"], offset: 0.13, radius: 0.046, tube: 0.012, color: "#c62828" };

const clipName = (name) => name.split("|").pop(); // "CharacterArmature|Idle" -> "Idle"

// Mixamo characters (web/tools/fbx_to_glb.py): one "Punching" clip each. `auto` finds, when the model
// loads, where each hand is furthest forward in that clip and cuts a short Punch_Left / Punch_Right around it
// (played fast: the fist lands PUNCH_PEAK s after the move starts, with a lunge toward the player);
// the stance with both hands closest in is Idle.
// Clips we do not have are faked on the body group (see proceduralPose): hit recoil, fall.
// No Muay Thai dressing (no shorts, mongkol, armbands).
export const PUNCH_PEAK = 0.25; // seconds from the start of a Mixamo punch to the fist landing
const WINDUP = 0.4; // clip seconds of wind-up before the fist lands (played in PUNCH_PEAK: 1.6x speed)
const MIXAMO_FIGHTER = { auto: "Punching" };
const mixamo = (file) => ({ url: `assets/opponents/${file}.glb`, clips: MIXAMO_FIGHTER });
// key -> model. The number is the source file "fbx/Punching (N).fbx".
export const OPPONENT_MODELS = {
  boxer: { url: "assets/boxer/MuayThai.glb" },
  armor_girl: mixamo("mx01"), // golden armour, blonde
  crystal_ogre: mixamo("mx02"), // big ogre with a crystal shoulder
  demon: mixamo("mx03"), // horned demon, flaming hand
  teen: mixamo("mx04"), // boy in T-shirt and shorts
  trooper: mixamo("mx05"), // armoured soldier
  anime_girl: mixamo("mx06"), // teal hair, pink shorts
  dwarf: mixamo("mx07"), // white beard, striped shirt
  rock_brute: mixamo("mx08"), // stone-armed brute
  red_suit: mixamo("mx09"), // red bodysuit, black mask
  dancer: mixamo("mx10"), // headphones, yellow pants
  dark_knight: mixamo("mx11"), // black horned armour
  big_elvis: mixamo("mx12"), // big man in a white jumpsuit
  iron_knight: mixamo("mx13"), // grey helmet and armour
  luchador: mixamo("mx14"), // masked wrestler
  red_knight: mixamo("mx16"), // red hood, crusader tunic
  cartoon_boy: mixamo("mx17"), // big-head cartoon boy
};

/** Body offsets for a fake pose; `k` runs 0 -> 1 -> 0 over 0.45 s, death falls over 0.8 s and stays down. */
function proceduralPose(name, time, withClip = false) {
  if (withClip && name.startsWith("Punch")) { // lunge into a clip punch, peaking when the fist lands
    const k = Math.sin(Math.min(time / (2 * PUNCH_PEAK), 1) * Math.PI);
    return { lean: 0.18 * k, twist: 0, y: 0, z: 0.15 * k };
  }
  const k = Math.sin(Math.min(time / 0.45, 1) * Math.PI);
  const d = Math.min(time / 0.8, 1);
  if (name.startsWith("Punch")) return { lean: 0.28 * k, twist: (name.endsWith("Left") ? 0.4 : -0.4) * k, y: 0, z: 0.15 * k };
  if (name.startsWith("Hit")) return { lean: -0.3 * k, twist: 0, y: 0, z: -0.12 * k };
  if (name === "Death") return { lean: -d * (Math.PI / 2 - 0.15), twist: 0, y: 0.05 * d, z: -0.4 * d };
  return { lean: 0, twist: 0, y: 0, z: 0 };
}
const PROCEDURAL = ["Punch_Left", "Punch_Right", "HitRecieve", "HitRecieve_2", "Death"];

export class Opponent {
  /** onProgress(ProgressEvent) ระหว่างดาวน์โหลดไฟล์โมเดล (ใช้ขึ้น % บนปุ่ม Start) */
  static async load(spec, onProgress) {
    const gltf = await new GLTFLoader().loadAsync(spec.url, onProgress);
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
    this.speed = {};
    this.punchLead = 0.35; // seconds from starting a punch to the fist landing (main.js times the hit with it)
    this.clips = clipMap?.auto ? this.autoPunches(byName[clipMap.auto]) : clipMap
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

  /** Cut Punch_Left / Punch_Right out of one Mixamo clip where each hand reaches furthest forward. */
  autoPunches(clip) {
    const bone = (end) => {
      let found = null;
      this.model.traverse((o) => { if (!found && o.isBone && o.name.endsWith(end)) found = o; });
      return found;
    };
    const hips = bone("Hips"), hands = { L: bone("LeftHand"), R: bone("RightHand") };
    if (!clip) return {};
    if (!hips || !hands.L || !hands.R) return { Idle: clip };

    // sample the clip: how far in front of the hips each hand is
    const FPS = 30, n = Math.max(2, Math.floor(clip.duration * FPS));
    const probe = new THREE.AnimationMixer(this.model);
    probe.clipAction(clip).play();
    this.model.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.model.getWorldQuaternion(new THREE.Quaternion()));
    const h = new THREE.Vector3(), p = new THREE.Vector3();
    const ext = { L: [], R: [] };
    for (let i = 0; i <= n; i++) {
      probe.setTime(i / FPS);
      this.model.updateMatrixWorld(true);
      hips.getWorldPosition(h);
      for (const s of ["L", "R"]) ext[s].push(hands[s].getWorldPosition(p).sub(h).dot(fwd));
    }
    // the guard stance is bladed (chest turned sideways): turn the whole model so the chest in
    // the Idle stance faces the player (+z)
    const sum = ext.L.map((v, i) => v + ext.R[i]);
    this.freeze.Idle = sum.indexOf(Math.min(...sum)) / FPS;
    const arms = { L: bone("LeftArm"), R: bone("RightArm") };
    if (arms.L && arms.R) {
      probe.setTime(this.freeze.Idle);
      this.model.updateMatrixWorld(true);
      const across = arms.R.getWorldPosition(p).sub(arms.L.getWorldPosition(h));
      const facing = new THREE.Vector3(0, 1, 0).cross(across);
      this.model.rotation.y -= Math.atan2(facing.x, facing.z);
      this.model.updateMatrixWorld(true);
    }
    probe.stopAllAction();
    probe.uncacheRoot(this.model);

    const range = (a) => Math.max(...a) - Math.min(...a);
    // first local maximum that reaches 85% of the way to the hand's furthest point
    const peak = (a) => {
      const lo = Math.min(...a), thr = lo + 0.85 * (Math.max(...a) - lo);
      return a.findIndex((v, i) => v >= thr && v >= (a[i + 1] ?? -Infinity));
    };
    const peaks = { L: peak(ext.L), R: peak(ext.R) };
    // most Mixamo punch clips are one strike (e.g. a left hook): a hand that moves much less than
    // the other only drifts, so both punches use the striking hand
    if (range(ext.L) < 0.7 * range(ext.R)) peaks.L = peaks.R;
    if (range(ext.R) < 0.7 * range(ext.L)) peaks.R = peaks.L;
    const cut = (name, i) => THREE.AnimationUtils.subclip(clip, name,
      Math.max(0, i - Math.round(WINDUP * FPS)), Math.min(n, i + Math.round(0.3 * FPS)), FPS);
    this.speed.Punch_Left = this.speed.Punch_Right = WINDUP / PUNCH_PEAK;
    this.punchLead = PUNCH_PEAK;
    return { Idle: clip, Punch_Left: cut("Punch_Left", peaks.L), Punch_Right: cut("Punch_Right", peaks.R) };
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
    if (this.fakePoses && PROCEDURAL.includes(name)) {
      if (!clip) this.proc = { name, time: 0, withClip: false };
      else if (name.startsWith("Punch")) this.proc = { name, time: 0, withClip: true };
    }
    else if (name === "Idle") this.proc = null;
    if (!clip) return;
    const action = this.mixer.clipAction(clip);
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !loop;
    action.setEffectiveTimeScale(this.speed[name] ?? 1);
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

  /** สไลด์หลบหมัดไปด้านข้าง (side = -1 ซ้าย / 1 ขวา) แล้วกลับที่เดิม */
  dodge(side = Math.random() < 0.5 ? -1 : 1) {
    this.dodgeMove = { side, time: 0 };
  }

  update(dt) {
    this.mixer.update(dt);
    this.applyPose(dt);
    if (this.flashLevel > 0) {
      this.flashLevel = Math.max(this.flashLevel - dt * 5, 0);
      for (const m of this.materials) {
        if (!m.emissive) continue;
        m.emissive.setScalar(this.flashLevel);
      }
    }
  }

  /** ท่าปลอม (ถ้ามี) + ฟุตเวิร์กโยกซ้ายขวา + สไลด์หลบ บนกลุ่ม body */
  applyPose(dt) {
    this.bobTime = (this.bobTime ?? 0) + dt;
    const t = this.bobTime;
    let pose = { lean: 0, twist: 0, y: this.fakePoses ? Math.sin(t * 4) * 0.02 : 0, z: 0 };
    if (this.fakePoses && this.proc) {
      this.proc.time += dt;
      pose = proceduralPose(this.proc.name, this.proc.time, this.proc.withClip);
      const end = this.proc.withClip ? 2 * PUNCH_PEAK : 0.45;
      if (this.proc.name !== "Death" && this.proc.time > end) this.proc = null;
    }
    // ฟุตเวิร์ก: ขยับซ้ายขวาช้าๆ (ไม่ขยับตอนล้ม)
    const down = this.proc?.name === "Death";
    let x = down ? 0 : Math.sin(t * 1.4) * 0.12 + Math.sin(t * 0.6) * 0.06;
    let roll = 0;
    if (this.dodgeMove) { // สไลด์ออก 0.12 วิ ค้าง แล้วกลับใน 0.35 วิ
      const d = this.dodgeMove;
      d.time += dt;
      const k = d.time < 0.12 ? d.time / 0.12 : Math.max(0, 1 - (d.time - 0.2) / 0.35);
      const e = k * k * (3 - 2 * k);
      x += d.side * 0.45 * e;
      roll = -d.side * 0.35 * e;
      pose.y -= 0.12 * e; // ย่อตัวลงนิดๆ
      if (d.time > 0.55) this.dodgeMove = null;
    }
    this.body.rotation.set(pose.lean, pose.twist, roll);
    this.body.position.set(x, pose.y, pose.z);
  }

  reset() {
    this.group.position.copy(this.home);
    this.group.rotation.set(0, 0, 0);
    this.proc = null;
    this.play("Idle", { fade: 0.1 });
  }
}
