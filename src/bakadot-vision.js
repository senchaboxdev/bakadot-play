// BakaDot บนเว็บ: เปิดกล้อง -> MediaPipe Pose (ในเบราว์เซอร์) -> ตรวจจับอาวุธ -> ส่งเข้าเกม Godot
// เกมรับคำสั่งผ่าน window.bakadotAction(...) ที่ game/action_client.gd ลงทะเบียนไว้
// ทำหน้าที่เดียวกับ vision/pose_viewer.py + vision/action_server.py ในเวอร์ชันเดสก์ท็อป

import { FilesetResolver, PoseLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";
import { ARM_LANDMARKS, GuardDetector, StrikeDetector, framingHint } from "./detectors.js?v=d8eb412";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL = "models/pose_landmarker_full.task";
const FLASH_MS = 400;
const LABELS = { PUNCH: "Punch", ELBOW: "Elbow", KNEE: "Knee" };
const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
];

const ui = buildUi();
let landmarker = null;
let running = false;

ui.startButton.addEventListener("click", start);

async function start() {
  ui.startButton.disabled = true;
  ui.startNote.textContent = "Starting camera and loading pose model...";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      audio: false,
    });
    ui.video.srcObject = stream;
    await ui.video.play();
    const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
    landmarker = await PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
  } catch (err) {
    console.error(err);
    ui.startButton.disabled = false;
    ui.startNote.textContent = err.name === "NotAllowedError"
      ? "Camera permission denied — allow the camera in your browser and try again"
      : `Could not start: ${err.message}`;
    return;
  }
  ui.startScreen.remove();
  ui.camPanel.hidden = false;
  document.querySelector("canvas")?.focus();
  running = true;
  loop();
}

// ---------- ลูปหลัก ----------

const detector = new StrikeDetector();
const guard = new GuardDetector();
const lastStrike = { LEFT: { t: -1e9, kind: "" }, RIGHT: { t: -1e9, kind: "" } };
let cameraAnnounced = false;
let lastVideoTime = -1;
let fps = 0, lastFrameAt = performance.now();

function loop() {
  if (!running) return;
  const video = ui.video;
  if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
    lastVideoTime = video.currentTime;
    const nowMs = performance.now();
    const result = landmarker.detectForVideo(video, nowMs);
    processFrame(result, nowMs / 1000, video.videoWidth / video.videoHeight);
    fps = 0.9 * fps + 0.1 * (1000 / Math.max(nowMs - lastFrameAt, 1));
    lastFrameAt = nowMs;
  }
  requestAnimationFrame(loop);
}

function processFrame(result, t, aspect) {
  const img = normalize(result.landmarks?.[0]);
  const world = normalize(result.worldLandmarks?.[0]);

  const actions = detector.update(img, world, aspect, t);
  for (const action of actions) {
    const [kind, side] = action.split("_");
    lastStrike[side] = { t, kind };
    send(action);
  }
  if (actions.length) guard.notifyPunch(t);
  // ใกล้กล้องเกิน: ไม่คิดเรื่องการ์ด (ส่ง null = มองไม่เห็น -> หลุดการ์ด)
  const guardEvent = guard.update(detector.blocked ? null : img, aspect, detector.scale, t);
  if (guardEvent) send(guardEvent);

  if (img && !cameraAnnounced) cameraAnnounced = send("camera_on");
  draw(img, t);
}

function normalize(lms) {
  if (!lms) return null;
  return lms.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 1 }));
}

function send(action) {
  // เกมอาจยังโหลดไม่เสร็จ -> ข้ามไปก่อน (camera_on จะส่งซ้ำจนสำเร็จ)
  if (typeof window.bakadotAction !== "function") return false;
  window.bakadotAction(action.toLowerCase());
  return true;
}

// ---------- วาดกรอบกล้อง ----------

function draw(img, t) {
  const { canvas, ctx, hint, status } = ui;
  const w = (canvas.width = ui.video.videoWidth || 640);
  const h = (canvas.height = ui.video.videoHeight || 480);
  ctx.clearRect(0, 0, w, h);

  let message = null;
  if (!img) message = "Stand in view";
  else if (detector.blocked) message = "Step back";
  else if (detector.settling) message = "Hold still...";
  else message = framingHint(img);
  hint.textContent = message ?? "";
  hint.hidden = !message;

  // ใกล้กล้องเกิน: ไม่วาดเส้นเลย จะขึ้นเมื่อได้ระยะ (เหมือนเวอร์ชันเดสก์ท็อป)
  if (img && !detector.blocked) {
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    for (const [a, b] of BONES) line(ctx, img[a], img[b], w, h);
    for (const side of ["LEFT", "RIGHT"]) {
      const flashing = (t - lastStrike[side].t) * 1000 < FLASH_MS;
      ctx.strokeStyle = flashing ? "#ff3b30" : "#34c759";
      ctx.lineWidth = 8;
      const [s, e, wr] = ARM_LANDMARKS[side];
      line(ctx, img[s], img[e], w, h);
      line(ctx, img[e], img[wr], w, h);
    }
  }

  const flashes = ["LEFT", "RIGHT"]
    .filter((s) => (t - lastStrike[s].t) * 1000 < FLASH_MS)
    .map((s) => LABELS[lastStrike[s].kind]);
  status.textContent = [guard.active ? "Guard" : "", ...flashes, `${Math.round(fps)} fps`].filter(Boolean).join("  ·  ");
}

function line(ctx, a, b, w, h) {
  if (a.visibility < 0.3 || b.visibility < 0.3) return;
  ctx.beginPath();
  ctx.moveTo(a.x * w, a.y * h);
  ctx.lineTo(b.x * w, b.y * h);
  ctx.stroke();
}

// ---------- หน้าจอเริ่ม + กรอบกล้อง ----------

function buildUi() {
  const startScreen = el("div", { id: "bk-start" });
  const title = el("h1", {}, "BakaDot");
  const sub = el("p", { className: "bk-sub" }, "Muay Thai workout with your webcam: punch · elbow · knee · guard");
  const tips = el("ul", { className: "bk-tips" });
  for (const tip of [
    "Stand about 2 m from the camera so it sees you from head to knees",
    "Keep your guard up near your face and return to guard after every strike",
    "When you hear \"Guard!\", raise your guard fast or you lose points",
  ]) tips.append(el("li", {}, tip));
  const startButton = el("button", { type: "button" }, "Start (turn on camera)");
  const startNote = el("p", { className: "bk-note" }, "Camera video is processed on this device only and is never uploaded");
  startScreen.append(title, sub, tips, startButton, startNote);

  const camPanel = el("div", { id: "bk-cam", hidden: true });
  const mirror = el("div", { className: "bk-mirror" });
  const video = el("video", { playsInline: true, muted: true });
  const canvas = el("canvas");
  mirror.append(video, canvas);
  const hint = el("div", { className: "bk-hint", hidden: true });
  const status = el("div", { className: "bk-status" });
  camPanel.append(mirror, hint, status);

  document.body.append(startScreen, camPanel);
  return { startScreen, startButton, startNote, camPanel, video, canvas, ctx: canvas.getContext("2d"), hint, status };
}

function el(tag, props = {}, text) {
  const node = Object.assign(document.createElement(tag), props);
  if (text !== undefined) node.textContent = text;
  return node;
}
