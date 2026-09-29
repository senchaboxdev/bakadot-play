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

// ---------- น้ำหนักตัว (เก็บในเบราว์เซอร์) ----------
// เวลา/แคลอรีไม่เก็บข้าม refresh (refresh = คนใหม่มาเล่น)

const WEIGHT_KEY = "bakadot.weight";

export function loadWeight(storage) {
  try {
    const w = Number(storage.getItem(WEIGHT_KEY));
    return w >= 10 && w <= 200 ? w : null;
  } catch { return null; }
}

export function saveWeight(storage, kg) {
  try { storage.setItem(WEIGHT_KEY, String(kg)); } catch { /* private mode */ }
}
