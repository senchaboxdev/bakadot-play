// ใบผลงานหลังจบไฟต์ (แพ้/ชนะ/แชมป์): ภาพคนเล่นจากกล้อง + ด่านที่ไปถึง + สถิติ ทำเป็นรูป PNG ในเครื่อง
// ภาพไม่ถูกส่งไปไหนจนกว่าผู้เล่นจะกด Save photo / Share เอง
import { clock } from "./workout.js?v=e8f76bb";

const W = 1080, H = 1350;
const FONT = '"Kanit", system-ui, sans-serif';
const GOLD = "#f5c542";

/** ภาพจากกล้อง (กลับซ้ายขวาแบบกระจก) หรือภาพเกมถ้าไม่ได้เปิดกล้อง: คืน canvas หรือ null */
export function capturePhoto(video, gameCanvas) {
  const src = video && video.readyState >= 2 && video.videoWidth ? video : gameCanvas;
  if (!src) return null;
  const sw = src.videoWidth || src.width, sh = src.videoHeight || src.height;
  const c = document.createElement("canvas");
  c.width = sw;
  c.height = sh;
  const g = c.getContext("2d");
  if (src === video) { g.translate(sw, 0); g.scale(-1, 1); }
  g.drawImage(src, 0, 0, sw, sh);
  return c;
}

/** วาดใบผลงาน: info = { stage, stages, win, champion, opponent, session: { seconds, kcal }, fight: { punch, elbow, knee } } -> Blob PNG */
export async function makeCard(photo, info) {
  await document.fonts?.load(`700 64px ${FONT}`).catch(() => {});
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");

  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#1a1030");
  bg.addColorStop(0.55, "#0b0d1a");
  bg.addColorStop(1, "#05060c");
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  // รัศมีแสงทองด้านหลังรูป
  const halo = g.createRadialGradient(W / 2, 560, 60, W / 2, 560, 620);
  halo.addColorStop(0, "rgba(245,197,66,0.35)");
  halo.addColorStop(1, "rgba(245,197,66,0)");
  g.fillStyle = halo;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = GOLD;
  g.lineWidth = 10;
  g.strokeRect(28, 28, W - 56, H - 56);

  g.textAlign = "center";
  g.textBaseline = "middle";
  const gold = g.createLinearGradient(0, 90, 0, 210);
  gold.addColorStop(0, "#fff6c8");
  gold.addColorStop(0.5, GOLD);
  gold.addColorStop(1, "#b8820f");
  g.fillStyle = gold;
  g.font = `italic 700 118px ${FONT}`;
  g.fillText("BakaDot", W / 2, 140);
  const headline = info.champion ? "CHAMPION" : info.win ? `STAGE ${info.stage} CLEARED` : `REACHED STAGE ${info.stage}`;
  g.fillStyle = info.champion || info.win ? "#ffffff" : "#ffd6d6";
  g.font = `700 ${info.champion ? 76 : 66}px ${FONT}`;
  g.fillText(headline, W / 2, 248);

  // รูปคนเล่น (ตัดให้เต็มกรอบ 4:3)
  const fx = 110, fy = 320, fw = W - 220, fh = Math.round(fw * 0.75);
  g.save();
  roundRect(g, fx, fy, fw, fh, 28);
  g.clip();
  g.fillStyle = "#000";
  g.fillRect(fx, fy, fw, fh);
  if (photo) {
    const s = Math.max(fw / photo.width, fh / photo.height);
    const dw = photo.width * s, dh = photo.height * s;
    g.drawImage(photo, fx + (fw - dw) / 2, fy + (fh - dh) / 2, dw, dh);
  }
  g.restore();
  g.lineWidth = 8;
  g.strokeStyle = GOLD;
  roundRect(g, fx, fy, fw, fh, 28);
  g.stroke();

  const y0 = fy + fh + 80;
  g.fillStyle = GOLD;
  g.font = `700 54px ${FONT}`;
  g.fillText(info.champion ? `Beat all ${info.stages} fighters · ชนะครบทุกด่าน`
    : `${info.win ? "Beat" : "vs"} ${info.opponent} · Stage ${info.stage} of ${info.stages}`, W / 2, y0);
  g.fillStyle = "#e8ecf5";
  g.font = `700 44px ${FONT}`;
  const s = info.session;
  g.fillText(`⏱ ${clock(s.seconds)}   ·   🔥 ~${Math.round(s.kcal)} kcal`, W / 2, y0 + 80);
  const f = info.fight;
  g.font = `400 36px ${FONT}`;
  g.fillStyle = "#b9c3d6";
  g.fillText(`This fight: ${f.punch} punches · ${f.elbow} elbows · ${f.knee} knees`, W / 2, y0 + 145);
  g.fillText(new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }), W / 2, H - 80);

  return new Promise((resolve) => c.toBlob(resolve, "image/png"));
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export const cardFileName = () => `bakadot-${new Date().toLocaleDateString("sv")}-${new Date().toTimeString().slice(0, 5).replace(":", "")}.png`;

const isIOS = () => /iP(ad|hone|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** บันทึกไฟล์ลงเครื่อง คืน false ถ้าบันทึกเองไม่ได้ (ให้ผู้เล่นกดค้างที่รูปแทน)
 *  iOS ไม่สน <a download> จึงเปิดเมนูแชร์ซึ่งมี "Save Image" ลง Photos */
export async function savePhoto(blob) {
  if (isIOS()) return sharePhoto(blob);
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: cardFileName() });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return true;
}

/** แชร์ผ่านเมนูแชร์ของเครื่อง (Mail, LINE, AirDrop ...) คืน false ถ้าเบราว์เซอร์นี้แชร์ไฟล์ไม่ได้ */
export async function sharePhoto(blob) {
  const file = new File([blob], cardFileName(), { type: "image/png" });
  if (!navigator.canShare?.({ files: [file] })) return false;
  try {
    await navigator.share({ files: [file], title: "BakaDot", text: "My BakaDot Muay Thai workout 🥊" });
  } catch (err) {
    if (err.name !== "AbortError") throw err; // ปิดเมนูแชร์เอง = ไม่ใช่ error
  }
  return true;
}

export const canShareFiles = () => {
  try { return Boolean(navigator.canShare?.({ files: [new File([""], "x.png", { type: "image/png" })] })); } catch { return false; }
};
