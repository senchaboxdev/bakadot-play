// ยอดฝีมือในโหมดเนื้อเรื่อง "เส้นทางนักมวย" (ดูแบบใน docs/stage-design.md)
// ชื่อ/ตัวละครแต่งขึ้นเอง ไม่อิงนักมวยจริง
//
// hp            พลังชีวิต (หมัด 3, ศอก 6, เข่า 7 ต่อครั้ง)
// damage        ดาเมจต่อหมัดที่โดนผู้เล่น (ผู้เล่นมี 100)
// rounds / roundTime / restTime   จำนวนยก / วินาทีต่อยก / วินาทีพัก
// attackEvery   [min, max] วินาทีระหว่างการบุก
// warn          วินาทีที่เตือน ("Guard!") ก่อนหมัดถึง
// guardChance   โอกาสยกการ์ดก่อนบุก (หมัดผู้เล่นเบาลงมากตอนนี้)
// guardTime     [min, max] วินาทีที่ยกการ์ด
// openTime      วินาทีที่หอบ/เปิดช่องหลังบุก (ตีตอนนี้แรงขึ้น)
// venue         ฉากรอบเวที (ดู VENUES ใน venues.js)

export const FIGHTERS = {
  ptom: {
    venue: "camp",
    name: "P'Tom",
    title: "Camp Senior",
    intro: "Your camp senior wants to see if you are ready to leave the camp.",
    hp: 30,
    damage: 12,
    rounds: 2,
    roundTime: 60,
    restTime: 15,
    attackEvery: [4.5, 6.0],
    warn: 1.3,
    guardChance: 0.35,
    guardTime: [1.5, 2.5],
    openTime: 1.5,
    shorts: "#1565c0",
    model: "boxer",
    hint: "P'Tom raises his guard sometimes. Punches barely hurt then - use elbows and knees, or hit him right after he attacks.",
  },
};

/** Stage order (first to last). */
// Next fighters: pick from OPPONENT_MODELS in opponent.js (preview any of them with ?model=key).
export const STAGES = ["ptom"];
export const FIRST_FIGHTER = STAGES[0];
