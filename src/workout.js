// เวลาออกกำลังกาย + แคลอรีโดยประมาณ (ตรรกะล้วน ทดสอบด้วย node ได้)
// kcal = MET × น้ำหนักตัว(กก.) × ชั่วโมง  (docs/stage-design.md) — แสดงเป็นค่าประมาณเสมอ
// นับเฉพาะตอนเล่น (สู้/เล่นอิสระ); พักระหว่างยกนับด้วย MET ต่ำกว่า; เมนู/หน้าสรุปไม่นับ

export const MET = { active: 6, rest: 2.5 };
export const DEFAULT_WEIGHT = 30; // กก. (เด็กประถม) จนกว่าจะกรอกเอง

export const kcalFor = (met, weightKg, seconds) => (met * weightKg * seconds) / 3600;

export class Workout {
  constructor(weightKg = DEFAULT_WEIGHT) {
    this.weight = weightKg;
    this.seconds = 0;
    this.kcal = 0;
  }

  /** activity: "active" | "rest" | null (ไม่นับ) */
  update(dt, activity) {
    if (!activity) return;
    this.seconds += dt;
    this.kcal += kcalFor(MET[activity], this.weight, dt);
  }

  /** ยอดตั้งแต่ mark() ครั้งล่าสุด (ใช้สรุปต่อไฟต์) */
  mark() { this.marked = { seconds: this.seconds, kcal: this.kcal }; }
  sinceMark() {
    const m = this.marked ?? { seconds: 0, kcal: 0 };
    return { seconds: this.seconds - m.seconds, kcal: this.kcal - m.kcal };
  }
}

export const clock = (seconds) => {
  const s = Math.floor(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

// ---------- ยอดรวมรายวัน (เก็บในเบราว์เซอร์) ----------

const DAY_KEY = "bakadot.days";
const WEIGHT_KEY = "bakadot.weight";
const today = () => new Date().toLocaleDateString("sv"); // YYYY-MM-DD ตามเวลาเครื่อง

function readDays(storage) {
  try { return JSON.parse(storage.getItem(DAY_KEY)) ?? {}; } catch { return {}; }
}

/** เพิ่มเวลา/แคลอรีเข้ายอดของวันนี้ แล้วคืนยอดวันนี้ */
export function addToToday(storage, seconds, kcal) {
  const days = readDays(storage);
  const d = days[today()] ?? { seconds: 0, kcal: 0 };
  d.seconds += seconds;
  d.kcal += kcal;
  days[today()] = d;
  try { storage.setItem(DAY_KEY, JSON.stringify(days)); } catch { /* private mode: not kept */ }
  return d;
}

export function todayTotal(storage) {
  return readDays(storage)[today()] ?? { seconds: 0, kcal: 0 };
}

export function loadWeight(storage) {
  try {
    const w = Number(storage.getItem(WEIGHT_KEY));
    return w >= 10 && w <= 200 ? w : null;
  } catch { return null; }
}

export function saveWeight(storage, kg) {
  try { storage.setItem(WEIGHT_KEY, String(kg)); } catch { /* private mode */ }
}
