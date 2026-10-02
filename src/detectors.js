// ตัวตรวจจับอาวุธมวยไทย (หมัด / ศอก / เข่า) + การ์ด สำหรับเล่นบนเว็บ
// แปลงจาก vision/punch_detector.py, vision/strike_detector.py, vision/guard_detector.py
// ให้ทำงานเหมือนกันทุกขั้น (ตรวจด้วย web/tools/parity.mjs กับข้อมูลที่บันทึกไว้)
// ถ้าแก้ตรรกะฝั่งใดฝั่งหนึ่ง ต้องแก้อีกฝั่งให้ตรงกัน
//
// landmark: {x, y, z, visibility} แบบ MediaPipe (x, y = 0..1 บนภาพ; world = เมตร)

export const LEFT = "LEFT";
export const RIGHT = "RIGHT";
const SIDES = [LEFT, RIGHT];

// MediaPipe Pose landmark index (shoulder, elbow, wrist) ตามข้างของร่างกายจริง
export const ARM_LANDMARKS = { LEFT: [11, 13, 15], RIGHT: [12, 14, 16] };
const LEG_LANDMARKS = { LEFT: [23, 25], RIGHT: [24, 26] }; // (สะโพก, เข่า)
const NOSE = 0, L_SHOULDER = 11, R_SHOULDER = 12, L_HIP = 23, R_HIP = 24;

export function punchConfig(overrides = {}) {
  return {
    speedThreshold: 2.5, // ขนาดลำตัวต่อวินาที
    stillSpeed: 1.2, // ช้ากว่านี้ = แขนนิ่ง (อัปเดตจุดการ์ด)
    minTravel: 0.3, // ต้องพุ่งออกจากจุดการ์ดอย่างน้อยเท่านี้
    returnRadius: 0.4, // กลับมาใกล้จุดการ์ดเท่านี้ = พร้อมชกใหม่
    rearmTimeout: 1.5, // วินาที: ไม่กลับมาก็พร้อมชกใหม่หลังเวลานี้
    maxDown: 0.5, // ทิศพุ่งลงมากกว่านี้ ไม่นับ (ลดมือ/ดึงกลับ)
    speedSmoothing: 0.7,
    scaleSmoothing: 0.1,
    minVisibility: 0.3,
    maxGap: 0.25, // มองไม่เห็นแขนไม่เกินนี้ (วินาที) ยังจำสถานะไว้
    maxScaleChange: 0.15, // ขนาดตัวในภาพเปลี่ยนเร็วเกินนี้ = เดินเข้า/ออกกล้อง
    settleTime: 0.7, // หลังได้ระยะ/หยุดเดิน รอให้นิ่งก่อนนับ
    startRadius: 1.4, // หมัดต้องเริ่มจากมือใกล้หน้า
    ...overrides,
  };
}

export function strikeConfig(overrides = {}) {
  return {
    punchExtendAngle: 120.0, // องศา (3D) แขนเหยียดถึงนี้ = หมัด
    decideWindow: 0.25, // รอดูว่าแขนเหยียดไหม ก่อนสรุปว่าเป็นศอก
    elbowMaxDrop: 0.45, // ศอกต่ำกว่าไหล่ไม่เกินนี้
    kneeMinHeight: -0.6, // เข่าต้องยกถึง (สะโพก - เข่า) >= ค่านี้
    kneeMinLead: 0.35, // เข่าที่ยกต้องสูงกว่าเข่าอีกข้างอย่างน้อยเท่านี้
    kneeGap: 0.5, // หลังนับเข่าแล้ว ไม่นับเข่าข้างไหนอีกช่วงนี้
    kneeDecideWindow: 0.25,
    sameSideGap: 0.4,
    noPunchAfter: 0.4, // หลังศอก/เข่า ไม่นับหมัด
    holdPunchMax: 0.35,
    kneeMovingSpeed: 1.5,
    minVisibility: 0.5,
    ...overrides,
  };
}

export function guardConfig(overrides = {}) {
  return {
    onDistance: 1.2,
    offDistance: 1.4,
    holdTime: 0.15,
    punchBreak: 0.4,
    maxGap: 0.3,
    minVisibility: 0.3,
    ...overrides,
  };
}

const ELBOW_TRACK = punchConfig({ speedThreshold: 2.5, minTravel: 0.3 });
const KNEE_TRACK = punchConfig({ speedThreshold: 2.5, minTravel: 0.4, maxDown: 0.2 });

export const TOO_CLOSE_SHOULDER_WIDTH = 0.28;
const CLEAR_SHOULDER_WIDTH = 0.25;
const CLEAR_TIME = 0.5;

const dist2 = (a, b) => Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
const len2 = (v) => Math.sqrt(v[0] ** 2 + v[1] ** 2);

export function armFeatures(world, side) {
  const [si, ei, wi] = ARM_LANDMARKS[side];
  const s = world[si], e = world[ei], w = world[wi];
  const d3 = (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
  const upper = d3(s, e), fore = d3(e, w);
  const cos = ((s.x - e.x) * (w.x - e.x) + (s.y - e.y) * (w.y - e.y) + (s.z - e.z) * (w.z - e.z)) /
    Math.max(upper * fore, 1e-9);
  return { elbowDeg: (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI };
}

export function bodyScale(img, aspect) {
  const ls = img[L_SHOULDER], rs = img[R_SHOULDER];
  if (Math.min(ls.visibility, rs.visibility) < 0.3) return null;
  const width = Math.sqrt(((ls.x - rs.x) * aspect) ** 2 + (ls.y - rs.y) ** 2);
  const lh = img[L_HIP], rh = img[R_HIP];
  let torso = 0;
  if (Math.min(lh.visibility, rh.visibility) >= 0.3) {
    torso = Math.sqrt((((ls.x + rs.x - lh.x - rh.x) / 2) * aspect) ** 2 + ((ls.y + rs.y - lh.y - rh.y) / 2) ** 2);
  }
  const scale = Math.max(width, 0.6 * torso);
  return scale > 1e-4 ? scale : null;
}

function wristPosition(img, side, aspect, scale, minVisibility) {
  const [si, , wi] = ARM_LANDMARKS[side];
  const s = img[si], w = img[wi];
  if (Math.min(s.visibility, w.visibility) < minVisibility) return null;
  return [
    [((w.x - s.x) * aspect) / scale, (w.y - s.y) / scale],
    [(w.x * aspect) / scale, w.y / scale],
  ];
}

export const shoulderWidth = (img) => Math.abs(img[L_SHOULDER].x - img[R_SHOULDER].x);

export function framingHint(img) {
  const ls = img[L_SHOULDER], rs = img[R_SHOULDER];
  if (shoulderWidth(img) > TOO_CLOSE_SHOULDER_WIDTH) return "Step back";
  if ((ls.y + rs.y) / 2 > 0.55) return "Lower the camera";
  for (const side of SIDES) {
    const w = img[ARM_LANDMARKS[side][2]];
    if (!(w.x >= 0.02 && w.x <= 0.98 && w.y >= 0.02 && w.y <= 0.98)) return "Hands in view";
  }
  for (const k of [25, 26]) {
    const knee = img[k];
    if (knee.visibility < 0.5 || knee.y > 0.97) return "Show your knees";
  }
  return null;
}

// ---------- ArmTracker (ใช้กับข้อมือ / ศอก / เข่า) ----------

class Motion {
  constructor() {
    this.pos = null;
    this.vel = [0, 0];
    this.anchor = null;
    this.punchAnchor = null;
  }
  get speed() { return len2(this.vel); }
  get offset() { return [this.pos[0] - this.anchor[0], this.pos[1] - this.anchor[1]]; }
  step(pos, dt, a) {
    if (this.pos !== null && dt > 0) {
      const raw = [(pos[0] - this.pos[0]) / dt, (pos[1] - this.pos[1]) / dt];
      this.vel = [a * raw[0] + (1 - a) * this.vel[0], a * raw[1] + (1 - a) * this.vel[1]];
    }
    this.pos = pos;
    if (this.anchor === null) this.anchor = pos;
  }
}

export class ArmTracker {
  constructor(cfg) {
    this.cfg = cfg;
    this.speed = 0;
    this.travel = 0;
    this.armed = true;
    this.rel = new Motion();
    this.abs = new Motion();
    this.firedT = null;
    this.t = null;
  }
  get pos() { return this.rel.pos; }
  get vel() { return this.rel.vel; }
  get startOnScreen() { return this.abs.punchAnchor; }

  update(pos, t, absPos = null) {
    const cfg = this.cfg;
    if (pos === null) {
      if (this.t !== null && t - this.t > cfg.maxGap) {
        this.rel = new Motion(); this.abs = new Motion();
        this.t = null; this.speed = 0; this.travel = 0; this.armed = true;
      }
      return false;
    }
    const dt = this.t === null ? 0 : t - this.t;
    this.t = t;
    const motions = [this.rel];
    this.rel.step(pos, dt, cfg.speedSmoothing);
    if (absPos !== null) {
      this.abs.step(absPos, dt, cfg.speedSmoothing);
      motions.push(this.abs);
    }
    this.speed = Math.min(...motions.map((m) => m.speed));

    if (!this.armed) {
      const backHome = dist2(pos, this.rel.punchAnchor) <= cfg.returnRadius;
      if (backHome || t - this.firedT >= cfg.rearmTimeout) {
        this.armed = true;
        for (const m of motions) m.anchor = m.punchAnchor ?? m.pos;
      }
    }
    if (this.armed && this.speed < cfg.stillSpeed) {
      for (const m of motions) m.anchor = m.pos;
    }

    const d = this.rel.offset;
    this.travel = Math.min(...motions.map((m) => len2(m.offset)));
    const outward = motions.every((m) => m.offset[0] * m.vel[0] + m.offset[1] * m.vel[1] > 0);
    const relTravel = len2(d);
    const downward = relTravel > 0 && d[1] / relTravel > cfg.maxDown;

    if (this.armed && outward && !downward && this.travel >= cfg.minTravel && this.speed >= cfg.speedThreshold) {
      this.armed = false;
      for (const m of motions) m.punchAnchor = m.anchor;
      this.firedT = t;
      return true;
    }
    return false;
  }
}

// ---------- หมัด ----------

export class PunchDetector {
  constructor(cfg = punchConfig()) {
    this.cfg = cfg;
    this.arms = { LEFT: new ArmTracker(cfg), RIGHT: new ArmTracker(cfg) };
    this.scale = null;
    this.blocked = false;
    this.clearSince = null;
    this.settleUntil = -Infinity;
    this.t = null;
  }

  get settling() { return !this.blocked && this.t !== null && this.t < this.settleUntil; }

  update(img, aspect, t) {
    this.t = t;
    const scale = img ? bodyScale(img, aspect) : null;

    if (img) {
      const width = shoulderWidth(img);
      if (width > TOO_CLOSE_SHOULDER_WIDTH) {
        this.blocked = true; this.clearSince = null;
      } else if (this.blocked) {
        if (width >= CLEAR_SHOULDER_WIDTH) this.clearSince = null;
        else if (this.clearSince === null) this.clearSince = t;
        else if (t - this.clearSince >= CLEAR_TIME) this.blocked = false;
      }
    }
    if (this.blocked) {
      this.reset(t, scale);
      return [];
    }
    if (scale !== null && this.scale && Math.abs(scale - this.scale) / this.scale > this.cfg.maxScaleChange) {
      this.reset(t, null);
    }
    if (scale !== null) {
      const a = this.cfg.scaleSmoothing;
      this.scale = this.scale === null ? scale : a * scale + (1 - a) * this.scale;
    }
    if (t < this.settleUntil) {
      this.arms = { LEFT: new ArmTracker(this.cfg), RIGHT: new ArmTracker(this.cfg) };
      return [];
    }

    const actions = [];
    for (const side of SIDES) {
      const tracker = this.arms[side];
      let rel = null, absPos = null;
      if (scale !== null) {
        const found = wristPosition(img, side, aspect, this.scale, this.cfg.minVisibility);
        if (found !== null) [rel, absPos] = found;
      }
      if (tracker.update(rel, t, absPos) && this.startsFromGuard(tracker, img, aspect)) {
        actions.push(`PUNCH_${side}`);
      }
    }
    return actions;
  }

  startsFromGuard(tracker, img, aspect) {
    const start = tracker.startOnScreen, nose = img[NOSE];
    if (start === null || nose.visibility < this.cfg.minVisibility) return true;
    const nosePos = [(nose.x * aspect) / this.scale, nose.y / this.scale];
    return dist2(start, nosePos) <= this.cfg.startRadius;
  }

  reset(t, scale) {
    this.arms = { LEFT: new ArmTracker(this.cfg), RIGHT: new ArmTracker(this.cfg) };
    this.settleUntil = t + this.cfg.settleTime;
    if (scale !== null) this.scale = scale;
  }
}

// ---------- หมัด + ศอก + เข่า (ทีละอาวุธ) ----------

const visible = (minVis, ...lms) => lms.every((lm) => lm.visibility >= minVis);
const point = (lm, aspect, scale) => [(lm.x * aspect) / scale, lm.y / scale];
const other = (side) => (side === LEFT ? RIGHT : LEFT);

export class StrikeDetector {
  constructor(cfg = strikeConfig(), punchCfg = punchConfig()) {
    this.cfg = cfg;
    this.punch = new PunchDetector(punchCfg);
    this.lastStrike = { LEFT: -Infinity, RIGHT: -Infinity };
    this.lastKnee = -Infinity;
    this.noPunchUntil = -Infinity;
    this.resetTrackers();
  }

  get blocked() { return this.punch.blocked; }
  get settling() { return this.punch.settling; }
  get scale() { return this.punch.scale; }

  update(img, world, aspect, t) {
    const punches = this.punch.update(img, aspect, t);
    if (!img || this.punch.blocked || this.punch.settling || !this.punch.scale) {
      this.resetTrackers();
      return [];
    }
    const scale = this.punch.scale;
    const actions = [];

    // เข่า: ตีครั้งเดียวต้องได้ข้างเดียว
    const heights = { LEFT: this.kneeHeight(img, LEFT, scale), RIGHT: this.kneeHeight(img, RIGHT, scale) };
    for (const side of SIDES) {
      if (this.trackKnee(img, aspect, scale, side, t) && !this.kneePending.has(side)) this.kneePending.set(side, t);
    }
    for (const [side, t0] of [...this.kneePending]) {
      if (t - t0 > this.cfg.kneeDecideWindow) this.kneePending.delete(side);
    }
    const ready = [...this.kneePending.keys()].filter(
      (s) => heights[s] !== null && heights[s] >= this.cfg.kneeMinHeight && this.kneeLeads(heights, s),
    );
    if (ready.length) {
      const side = ready.reduce((best, s) => (heights[s] > heights[best] ? s : best));
      this.kneePending.clear();
      if (t - this.lastKnee >= this.cfg.kneeGap) {
        actions.push(`KNEE_${side}`);
        this.lastKnee = t;
      }
    }

    // หมัด / ศอก
    for (const side of SIDES) {
      const elbowFired = this.trackElbow(img, aspect, scale, side, t);
      const started = punches.includes(`PUNCH_${side}`) || elbowFired;
      if (started && !this.pending.has(side) && t - this.lastStrike[side] >= this.cfg.sameSideGap) {
        this.pending.set(side, t);
      }
      const kind = this.decide(side, img, world, scale, t);
      if (kind === "ELBOW") {
        actions.push(`ELBOW_${side}`);
        this.lastStrike[side] = t;
      } else if (kind === "PUNCH" && t >= this.noPunchUntil) {
        this.held.set(side, t);
      }
    }

    if (actions.some((a) => a.startsWith("KNEE") || a.startsWith("ELBOW"))) {
      this.held.clear();
      this.pending.clear();
      this.noPunchUntil = t + this.cfg.noPunchAfter;
    }
    for (const [side, heldAt] of [...this.held]) {
      if (this.punchShouldWait(side) && t - heldAt < this.cfg.holdPunchMax) continue;
      this.held.delete(side);
      actions.push(`PUNCH_${side}`);
      this.lastStrike[side] = t;
    }
    return actions;
  }

  punchShouldWait(side) {
    for (const knee of Object.values(this.knees)) {
      if (knee.pos !== null && knee.speed >= this.cfg.kneeMovingSpeed && knee.vel[1] < 0) return true;
    }
    return this.pending.has(other(side));
  }

  decide(side, img, world, scale, t) {
    if (!this.pending.has(side)) return null;
    if (!world) { this.pending.delete(side); return "PUNCH"; }
    if (armFeatures(world, side).elbowDeg >= this.cfg.punchExtendAngle) {
      this.pending.delete(side);
      return "PUNCH";
    }
    if (t - this.pending.get(side) < this.cfg.decideWindow) return null;
    this.pending.delete(side);
    const [si, ei] = ARM_LANDMARKS[side];
    const s = img[si], e = img[ei];
    const high = visible(this.cfg.minVisibility, s, e) && (e.y - s.y) / scale <= this.cfg.elbowMaxDrop;
    return high ? "ELBOW" : null;
  }

  trackElbow(img, aspect, scale, side, t) {
    const [si, ei] = ARM_LANDMARKS[side];
    const s = img[si], e = img[ei];
    if (!visible(this.cfg.minVisibility, s, e)) return this.elbows[side].update(null, t);
    const rel = [((e.x - s.x) * aspect) / scale, (e.y - s.y) / scale];
    return this.elbows[side].update(rel, t, point(e, aspect, scale));
  }

  trackKnee(img, aspect, scale, side, t) {
    const [hi, ki] = LEG_LANDMARKS[side];
    const hip = img[hi], knee = img[ki];
    if (!visible(this.cfg.minVisibility, hip, knee) || knee.y > 0.99) return this.knees[side].update(null, t);
    const rel = [((knee.x - hip.x) * aspect) / scale, (knee.y - hip.y) / scale];
    return this.knees[side].update(rel, t, point(knee, aspect, scale));
  }

  kneeHeight(img, side, scale) {
    const [hi, ki] = LEG_LANDMARKS[side];
    const hip = img[hi], knee = img[ki];
    if (!visible(this.cfg.minVisibility, hip, knee) || knee.y > 0.99) return null;
    return (hip.y - knee.y) / scale;
  }

  kneeLeads(heights, side) {
    const mine = heights[side], theirs = heights[other(side)];
    if (mine === null) return false;
    return theirs === null || mine - theirs >= this.cfg.kneeMinLead;
  }

  resetTrackers() {
    this.pending = new Map();
    this.kneePending = new Map();
    this.held = new Map();
    this.elbows = { LEFT: new ArmTracker(ELBOW_TRACK), RIGHT: new ArmTracker(ELBOW_TRACK) };
    this.knees = { LEFT: new ArmTracker(KNEE_TRACK), RIGHT: new ArmTracker(KNEE_TRACK) };
  }
}

// ---------- การ์ด ----------

export class GuardDetector {
  constructor(cfg = guardConfig()) {
    this.cfg = cfg;
    this.active = false;
    this.nearSince = null;
    this.lastSeen = null;
    this.lastPunch = -Infinity;
  }

  notifyPunch(t) { this.lastPunch = t; }

  update(img, aspect, scale, t) {
    const cfg = this.cfg;
    const dist = img && scale ? wristToNose(img, aspect, scale, cfg.minVisibility) : null;
    const punching = t - this.lastPunch < cfg.punchBreak;
    if (dist === null) {
      this.nearSince = null;
      const lost = this.lastSeen === null || t - this.lastSeen > cfg.maxGap;
      return this.active && lost ? this.set(false) : null;
    }
    this.lastSeen = t;
    if (this.active) return dist > cfg.offDistance || punching ? this.set(false) : null;
    if (dist <= cfg.onDistance && !punching) {
      if (this.nearSince === null) this.nearSince = t;
      if (t - this.nearSince >= cfg.holdTime) return this.set(true);
    } else {
      this.nearSince = null;
    }
    return null;
  }

  set(active) {
    this.active = active;
    this.nearSince = null;
    return active ? "GUARD_ON" : "GUARD_OFF";
  }
}

function wristToNose(img, aspect, scale, minVisibility) {
  const nose = img[NOSE];
  if (nose.visibility < minVisibility) return null;
  let far = 0;
  for (const i of [15, 16]) {
    const w = img[i];
    if (w.visibility < minVisibility) return null;
    far = Math.max(far, Math.sqrt(((w.x - nose.x) * aspect) ** 2 + (w.y - nose.y) ** 2) / scale);
  }
  return far;
}
