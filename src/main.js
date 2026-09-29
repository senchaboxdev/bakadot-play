// BakaDot (เว็บ): เวทีมวย 3D มุมมองบุรุษที่หนึ่ง + กล้องจับท่า
// โหมด: menu (ต่อยซ้าย = เล่นอิสระ, ต่อยขวา = ประลอง) / free / fight / result
// - free: นับอาวุธที่ออก, คู่ต่อสู้บุกเป็นระยะ ไม่การ์ด = แต้มลด
// - fight: การประลองจริงกับยอดฝีมือ (ตรรกะใน fight.js, ข้อมูลใน data/fighters.js)
// ทดสอบโดยไม่ใช้กล้อง: ?demo=free หรือ ?demo=fight (เล่นท่าอัตโนมัติ) หรือกดคีย์บอร์ด
import * as THREE from "three";
import { buildArena, loadEnvironment } from "./arena.js?v=5f1590a";
import { Opponent, OPPONENT_HEIGHT, OPPONENT_MODELS } from "./opponent.js?v=5f1590a";
import { Gloves } from "./gloves.js?v=5f1590a";
import { Effects } from "./effects.js?v=5f1590a";
import { GameAudio } from "./audio.js?v=5f1590a";
import { Hud } from "./hud.js?v=5f1590a";
import { Tweens, lerp } from "./tween.js?v=5f1590a";
import { Fight } from "./fight.js?v=5f1590a";
import { FIGHTERS, STAGES } from "./data/fighters.js?v=5f1590a";
import { startVision } from "./vision.js?v=5f1590a";

const STRIKE_TYPES = {
  punch_left: "punch", punch_right: "punch",
  elbow_left: "elbow", elbow_right: "elbow",
  knee_left: "knee", knee_right: "knee",
  kick_left: "kick", kick_right: "kick",
};
const FREE = { attackEvery: [3.5, 6.5], warn: 1.0, penalty: 5, shorts: "#c62828" };
const STEP_IN = 0.55; // เมตร ที่คู่ต่อสู้ก้าวเข้ามาตอนบุก
const PUNCH_LEAD = 0.35; // เริ่มท่าชกก่อนหมัดถึงเท่านี้ (วินาที)
const OUT_TIME = 0.08; // นวมพุ่งออก
const BACK_TIME = 0.15; // นวมดึงกลับ

// ---------- ฉาก ----------

const stage = document.getElementById("stage");
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
stage.append(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, 1, 0.05, 60);
const CAMERA_HOME = new THREE.Vector3(0, 1.65, 1.95);
camera.position.copy(CAMERA_HOME);
camera.rotation.x = THREE.MathUtils.degToRad(-10);
scene.add(camera);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

buildArena(scene);
loadEnvironment(scene, renderer); // optional HDRI backdrop; the plain one stays if the file is missing
const tweens = new Tweens();
const fx = new Effects(scene);
const audio = new GameAudio();
const hud = new Hud(document.getElementById("hud"));
const gloves = new Gloves(camera);
// One opponent model per fighter, loaded on demand and kept. `opponent` is whichever is in the ring.
const opponentCache = new Map();
async function loadOpponent(modelKey) {
  if (!opponentCache.has(modelKey)) opponentCache.set(modelKey, Opponent.load(OPPONENT_MODELS[modelKey] ?? OPPONENT_MODELS.boxer));
  return opponentCache.get(modelKey);
}
let opponent = await loadOpponent(FIGHTERS[STAGES[0]].model);
scene.add(opponent.group);
async function showOpponent(modelKey) {
  const next = await loadOpponent(modelKey);
  if (next !== opponent) {
    scene.remove(opponent.group);
    opponent = next;
    scene.add(opponent.group);
  }
  opponent.reset();
}
audio.load();

// ---------- ด่าน (stage progression) ----------
// ?stage=N starts at stage N. Progress (furthest stage reached) is kept in localStorage.
const SAVE_KEY = "bakadot.stage";
function loadStage() {
  const fromUrl = Number(new URLSearchParams(location.search).get("stage"));
  if (fromUrl >= 1) return Math.min(fromUrl, STAGES.length) - 1;
  try { return Math.min(Number(localStorage.getItem(SAVE_KEY)) || 0, STAGES.length - 1); } catch { return 0; }
}
/** Fighter data for stage i (0-based), with the stage number in its title. */
function stageFighter(i) {
  const f = FIGHTERS[STAGES[i]];
  return { ...f, title: `Stage ${i + 1} · ${f.title}` };
}
function saveStage(i) {
  try { localStorage.setItem(SAVE_KEY, String(i)); } catch { /* private mode: progress just isn't kept */ }
}

const state = {
  mode: "menu",
  guarding: false,
  connected: false,
  counts: { punch: 0, elbow: 0, knee: 0, kick: 0 },
  score: 0,
  attacking: false,
  attackTimer: 4,
  fight: null,
  stage: loadStage(),
  oppState: { guard: false, open: false },
  shake: 0,
};

// warm the cache for the stage the player is about to fight while they read the menu (the rest load on demand)
loadOpponent(FIGHTERS[STAGES[loadStage()]].model);

// ---------- รับคำสั่ง (กล้อง / คีย์บอร์ด / เมาส์) ----------

function onAction(action) {
  if (action === "camera_on") return void (state.connected = true);
  if (action === "guard_on") return void (state.guarding = true);
  if (action === "guard_off") return void (state.guarding = false);
  if (!(action in STRIKE_TYPES) || state.mode === "loading") return;
  if (state.mode === "menu") {
    if (action === "punch_left") startFree();
    else if (action === "punch_right") startFight(STAGES[state.stage]);
  } else if (state.mode === "result") {
    if (action === "punch_left") toMenu();
    else if (action === "punch_right") startFight(STAGES[state.stage]);
  } else {
    strike(action);
  }
}

const KEYS = { j: "punch_left", k: "punch_right", e: "elbow_right", n: "knee_left", m: "knee_right" };
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.key === "g") onAction("guard_on");
  else if (e.key === "Escape") toMenu();
  else if (KEYS[e.key]) onAction(KEYS[e.key]);
});
window.addEventListener("keyup", (e) => { if (e.key === "g") onAction("guard_off"); });
window.addEventListener("pointerdown", (e) => {
  // เมนู/สรุปผล: แตะครึ่งซ้าย/ขวาของจอ = เหมือนต่อยซ้าย/ขวา
  if (state.mode === "menu" || state.mode === "result") {
    onAction(e.clientX < window.innerWidth / 2 ? "punch_left" : "punch_right");
  }
});

// ---------- โหมด ----------

function toMenu() {
  state.mode = "menu";
  state.fight = null;
  state.oppState = { guard: false, open: false };
  hud.setNextStage(state.stage + 1, STAGES.length, FIGHTERS[STAGES[state.stage]]);
  hud.setMode("menu");
  opponent.reset();
}

function startFree() {
  state.mode = "free";
  state.fight = null;
  state.score = 0;
  for (const k in state.counts) state.counts[k] = 0;
  state.attackTimer = 4;
  state.oppState = { guard: false, open: false };
  opponent.reset();
  opponent.setShorts(FREE.shorts);
  hud.setMode("free");
}

async function startFight(id, overrides = {}) {
  const fighter = { ...stageFighter(STAGES.indexOf(id)), ...overrides };
  state.mode = "loading";
  await showOpponent(fighter.model);
  state.mode = "fight";
  opponent.setShorts(fighter.shorts);
  hud.setMode("fight");
  state.fight = new Fight(fighter, {
    banner: (text, color, seconds) => hud.showBanner(text, color, seconds),
    opponentAttack,
    isGuarding: () => state.guarding,
    block: feedbackBlock,
    playerHit: feedbackPlayerHit,
    opponentState: (s) => (state.oppState = s),
    finished: onFightFinished,
  });
}

async function onFightFinished(r) {
  state.mode = "result";
  const last = state.stage === STAGES.length - 1;
  if (r.win) {
    // win: next stage next time (after the last one, start over from stage 1)
    state.stage = last ? 0 : state.stage + 1;
    saveStage(state.stage);
    r.next = last ? null : stageFighter(state.stage);
    r.champion = last;
  }
  if (r.win) {
    if (r.how === "KO") {
      opponent.play("Death", { loop: false, fade: 0.1 });
      audio.play("heavy");
    }
    hud.showBanner(r.how === "KO" ? "K.O.!" : "YOU WIN!", "#ffd400", 1.8);
  } else {
    hud.showBanner(r.how === "KO" ? "K.O." : "YOU LOSE", "#ff5252", 1.8);
  }
  await tweens.wait(1.9);
  if (state.mode === "result") hud.showResult(r);
}

// ---------- ผู้เล่นออกอาวุธ ----------

function strike(action) {
  state.guarding = false;
  const kind = STRIKE_TYPES[action];
  const side = action.endsWith("left") ? "left" : "right";
  let landed = true;
  let blocked = false;
  if (state.mode === "fight") {
    const r = state.fight.onStrike(kind);
    landed = r.damage > 0;
    blocked = r.guarded;
    if (landed) hud.showStrike(kind, r);
  } else {
    state.counts[kind] += 1;
    state.score += 1;
    hud.showStrike(kind);
  }
  const hit = () => {
    if (!landed) return;
    if (blocked) return audio.play("block"); // คู่ต่อสู้การ์ดรับไว้
    hitReaction(side, kind);
    audio[kind === "punch" ? "hit" : "play"]("heavy");
    fx.impact(kind, side, opponent.group.position);
  };
  if (kind === "punch") {
    tweens.to(OUT_TIME, (p) => (gloves.out[side] = p)).then(() => {
      hit();
      return tweens.to(BACK_TIME, (p) => (gloves.out[side] = 1 - p));
    });
  } else {
    hit(); // ศอก/เข่า: ไม่วาดแขนขาผู้เล่น ใช้เอฟเฟกต์ตรงจุดที่โดนแทน
  }
}

function hitReaction(side, kind) {
  // ตอนบุกอยู่ไม่ขัดท่าชก / ตอนเพิ่งน็อก (mode = result) ไม่ทับท่าล้ม
  const fighting = state.mode === "free" || state.mode === "fight";
  if (fighting && !state.attacking) opponent.play(Math.random() < 0.5 ? "HitRecieve" : "HitRecieve_2", { loop: false, fade: 0.05 });
  const lean = side === "left" ? 0.12 : -0.12;
  tweens.to(0.06, (p) => (opponent.group.rotation.z = lean * p))
    .then(() => tweens.to(0.3, (p) => (opponent.group.rotation.z = lean * (1 - p))));
  if (kind === "knee") {
    // โดนเข่าเข้าท้อง: งอตัวไปข้างหน้าแล้วกลับ
    tweens.to(0.08, (p) => (opponent.group.rotation.x = 0.3 * p))
      .then(() => tweens.to(0.35, (p) => (opponent.group.rotation.x = 0.3 * (1 - p))));
  }
  opponent.flash(0.2);
}

// ---------- คู่ต่อสู้บุก ----------

/** ก้าวเข้ามา + เตือน (เสียง "Guard!") -> ชก -> เรียก onImpact ตอนหมัดถึง -> ถอยกลับ */
async function opponentAttack(warn, onImpact) {
  state.attacking = true;
  const side = Math.random() < 0.5 ? "Left" : "Right";
  hud.warn(warn);
  audio.play("warn", 1);
  const z0 = opponent.home.z;
  tweens.to(warn * 0.6, (p) => (opponent.group.position.z = lerp(z0, z0 + STEP_IN, p)));
  await tweens.wait(Math.max(warn - PUNCH_LEAD, 0.05));
  opponent.play(`Punch_${side}`, { loop: false, fade: 0.1 });
  await tweens.wait(PUNCH_LEAD);
  onImpact();
  await tweens.to(0.5, (p) => (opponent.group.position.z = lerp(z0 + STEP_IN, z0, p)));
  state.attacking = false;
}

async function freeAttack() {
  await opponentAttack(FREE.warn, () => {
    if (state.mode !== "free") return;
    if (state.guarding) return feedbackBlock();
    state.score = Math.max(state.score - FREE.penalty, 0);
    feedbackPlayerHit(FREE.penalty);
  });
  state.attackTimer = lerp(FREE.attackEvery[0], FREE.attackEvery[1], Math.random());
}

function feedbackBlock() {
  audio.play("block");
  hud.message("BLOCKED!", "#4fc3f7");
  state.shake = Math.max(state.shake, 0.02);
}

function feedbackPlayerHit(amount) {
  audio.play("playerHit");
  hud.message(`HIT!  -${amount}`, "#ff5252");
  hud.hitFlash();
  state.shake = 0.08;
}

// ---------- ลูปหลัก ----------

const clock = new THREE.Clock();
const headPos = new THREE.Vector3();

renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  tweens.update(dt);
  opponent.update(dt);
  fx.update(dt);
  gloves.update(dt, state.guarding);

  if (state.mode === "fight") state.fight?.update(dt);
  if (state.mode === "free" && !state.attacking) {
    state.attackTimer -= dt;
    if (state.attackTimer <= 0) freeAttack();
  }

  // สั่นกล้องตอนโดน/กัน
  camera.position.copy(CAMERA_HOME);
  if (state.shake > 0) {
    camera.position.x += (Math.random() * 2 - 1) * state.shake;
    camera.position.y += (Math.random() * 2 - 1) * state.shake;
    state.shake = Math.max(state.shake - dt * 0.4, 0);
  }

  // ป้ายเหนือหัวคู่ต่อสู้ (GUARD / OPEN!)
  headPos.copy(opponent.group.position).setY(OPPONENT_HEIGHT + 0.25).project(camera);
  hud.opponentTag((headPos.x * 0.5 + 0.5) * window.innerWidth, (-headPos.y * 0.5 + 0.5) * window.innerHeight,
    state.mode === "fight" ? state.oppState : { guard: false, open: false });
  hud.update(state);
  renderer.render(scene, camera);
});

// ---------- หน้าจอเริ่ม ----------

const start = document.getElementById("start");
const startButton = document.getElementById("start-camera");
const startNote = document.getElementById("start-note");

startButton.addEventListener("click", async () => {
  startButton.disabled = true;
  startNote.textContent = "Starting camera and loading pose model...";
  audio.resume();
  try {
    await startVision(onAction);
    start.hidden = true;
  } catch (err) {
    console.error(err);
    startButton.disabled = false;
    startNote.textContent = err.name === "NotAllowedError"
      ? "Camera permission denied — allow the camera in your browser and try again"
      : `Could not start the camera: ${err.message}`;
  }
});
document.getElementById("start-keys").addEventListener("click", () => {
  audio.resume();
  start.hidden = true;
});

hud.setNextStage(state.stage + 1, STAGES.length, FIGHTERS[STAGES[state.stage]]);

// ---------- โหมดทดสอบ (?demo=free / ?demo=fight) ----------

const demo = new URLSearchParams(location.search).get("demo");
if (demo) {
  start.hidden = true;
  runDemo(demo);
}

async function runDemo(kind) {
  const act = async (seconds, action) => { await tweens.wait(seconds); onAction(action); };
  if (kind === "fight") {
    startFight(STAGES[state.stage], { roundTime: 8, restTime: 2, attackEvery: [2.5, 3], warn: 1.0 });
    await tweens.wait(2.4);
    for (const [s, a] of [[0.3, "punch_left"], [0.4, "punch_right"], [0.6, "guard_on"], [1.4, "guard_off"],
      [0.3, "knee_left"], [0.5, "elbow_right"], [0.5, "punch_left"]]) await act(s, a);
    await tweens.wait(6);
    for (let i = 0; i < 8; i++) await act(0.35, i % 2 ? "knee_right" : "knee_left");
  } else {
    startFree();
    state.attackTimer = 1.0;
    for (const [s, a] of [[0.3, "punch_left"], [0.3, "punch_right"], [0.5, "guard_on"], [1.0, "guard_off"],
      [0.4, "knee_left"], [0.4, "elbow_right"]]) await act(s, a);
  }
}
