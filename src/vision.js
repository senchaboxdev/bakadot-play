// กล้อง + MediaPipe Pose (ในเบราว์เซอร์) + ตัวตรวจจับอาวุธ -> ส่ง action ให้เกม (onAction)
// action: "punch_left", "elbow_right", "knee_left", "guard_on", "guard_off", "camera_on"
// ภาพจากกล้องประมวลผลในเครื่องนี้เท่านั้น
import { FilesetResolver, PoseLandmarker } from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs";
import { ARM_LANDMARKS, GuardDetector, StrikeDetector, framingHint } from "./detectors.js?v=5f1590a";

const WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const MODEL_URL = "models/pose_landmarker_full.task";
const FLASH_MS = 400;
const LABELS = { PUNCH: "Punch", ELBOW: "Elbow", KNEE: "Knee" };
const BONES = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
  [11, 23], [12, 24], [23, 24], [23, 25], [24, 26], [25, 27], [26, 28],
];

/** เปิดกล้องและเริ่มจับท่า; โยน error ถ้าเปิดกล้อง/โหลดโมเดลไม่ได้ */
export async function startVision(onAction) {
  const ui = buildPanel();
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
    audio: false,
  });
  ui.video.srcObject = stream;
  await ui.video.play();
  const fileset = await FilesetResolver.forVisionTasks(WASM_URL);
  const landmarker = await PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
  ui.panel.hidden = false;

  const detector = new StrikeDetector();
  const guard = new GuardDetector();
  const lastStrike = { LEFT: { t: -1e9, kind: "" }, RIGHT: { t: -1e9, kind: "" } };
  let announced = false;
  let lastVideoTime = -1;
  let fps = 0;
  let lastFrameAt = performance.now();

  const loop = () => {
    const video = ui.video;
    if (video.readyState >= 2 && video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const nowMs = performance.now();
      const result = landmarker.detectForVideo(video, nowMs);
      const t = nowMs / 1000;
      const aspect = video.videoWidth / video.videoHeight;
      const img = normalize(result.landmarks?.[0]);
      const world = normalize(result.worldLandmarks?.[0]);

      const actions = detector.update(img, world, aspect, t);
      for (const action of actions) {
        const [kind, side] = action.split("_");
        lastStrike[side] = { t, kind };
        onAction(action.toLowerCase());
      }
      if (actions.length) guard.notifyPunch(t);
      // ใกล้กล้องเกิน: ไม่คิดเรื่องการ์ด (ส่ง null = มองไม่เห็น -> หลุดการ์ด)
      const guardEvent = guard.update(detector.blocked ? null : img, aspect, detector.scale, t);
      if (guardEvent) onAction(guardEvent.toLowerCase());
      if (img && !announced) {
        announced = true;
        onAction("camera_on");
      }
      fps = 0.9 * fps + 0.1 * (1000 / Math.max(nowMs - lastFrameAt, 1));
      lastFrameAt = nowMs;
      draw(ui, img, t, detector, guard, lastStrike, fps);
    }
    requestAnimationFrame(loop);
  };
  loop();
}

function normalize(lms) {
  if (!lms) return null;
  return lms.map((p) => ({ x: p.x, y: p.y, z: p.z, visibility: p.visibility ?? 1 }));
}

function draw(ui, img, t, detector, guard, lastStrike, fps) {
  const { canvas, ctx } = ui;
  const w = (canvas.width = ui.video.videoWidth || 640);
  const h = (canvas.height = ui.video.videoHeight || 480);
  ctx.clearRect(0, 0, w, h);

  let message = null;
  if (!img) message = "Stand in front of the camera";
  else if (detector.blocked) message = "Step back (too close to the camera)";
  else if (detector.settling) message = "Hold still...";
  else message = framingHint(img);
  ui.hint.textContent = message ?? "";
  ui.hint.hidden = !message;

  // ใกล้กล้องเกิน: ไม่วาดเส้นเลย จะขึ้นเมื่อได้ระยะ
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
  ui.status.textContent = [guard.active ? "Guard" : "", ...flashes, `${Math.round(fps)} fps`].filter(Boolean).join("  ·  ");
}

function line(ctx, a, b, w, h) {
  if (a.visibility < 0.3 || b.visibility < 0.3) return;
  ctx.beginPath();
  ctx.moveTo(a.x * w, a.y * h);
  ctx.lineTo(b.x * w, b.y * h);
  ctx.stroke();
}

function buildPanel() {
  const panel = Object.assign(document.createElement("div"), { id: "cam", hidden: true });
  const mirror = Object.assign(document.createElement("div"), { className: "mirror" });
  const video = Object.assign(document.createElement("video"), { playsInline: true, muted: true });
  const canvas = document.createElement("canvas");
  mirror.append(video, canvas);
  const hint = Object.assign(document.createElement("div"), { className: "hint", hidden: true });
  const status = Object.assign(document.createElement("div"), { className: "cam-status" });
  panel.append(mirror, hint, status);
  document.body.append(panel);
  return { panel, video, canvas, ctx: canvas.getContext("2d"), hint, status };
}
