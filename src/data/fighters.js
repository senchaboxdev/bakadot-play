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
// dodgeChance   โอกาสหลบหมัดตอนยืนเชิง (0..1)
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
    dodgeChance: 0.15,
    shorts: "#1565c0",
    model: "boxer",
    hint: "P'Tom raises his guard sometimes. Punches barely hurt then - use elbows and knees, or hit him right after he attacks.",
  },
};

// ---------- ด่าน 2-17: ตัวละครจาก fbx/ ความยากไต่ขึ้นทีละด่าน ----------
// เรียงเป็นบทตามฉาก: ค่ายมวย -> ตลาด -> วัด -> ป้อม -> วัง -> ป่า -> สนามใหญ่
// ค่าตัวเลขคำนวณจากลำดับด่าน (ดู difficulty) เปลี่ยนลำดับได้ที่ ROSTER

const ROSTER = [
  ["nong", "camp", "cartoon_boy", "Little Nong", "Camp Rookie", "The youngest kid at the camp wants a match too."],
  ["mali", "camp", "anime_girl", "Mali", "Camp Speedster", "Mali is small, but she is fast."],
  ["ton", "market", "teen", "Ton", "Street Kid", "A street kid at the market thinks he can beat you."],
  ["fah", "market", "dancer", "DJ Fah", "Market Dancer", "She fights to the beat of the market music."],
  ["chai", "market", "big_elvis", "Uncle Chai", "Market Champion", "The market's toughest uncle challenges you."],
  ["dang", "temple", "dwarf", "Grandpa Dang", "Temple Keeper", "The old keeper of the temple yard still has quick hands."],
  ["shadow", "temple", "red_suit", "Red Shadow", "Temple Ninja", "Someone in red moves between the lanterns."],
  ["boom", "fortress", "trooper", "Sergeant Boom", "Fortress Trooper", "The trooper at the gate will not let you pass."],
  ["scarlet", "fortress", "red_knight", "Sir Scarlet", "Fortress Knight", "A knight in a red cloak blocks the stairs."],
  ["iron", "fortress", "iron_knight", "Iron Knight", "Fortress Captain", "The captain of the fortress guards the last door."],
  ["maria", "palace", "armor_girl", "Captain Maria", "Golden Guard", "A veteran in golden armor guards the throne hall."],
  ["nighthorn", "palace", "dark_knight", "Night Horn", "Palace Shadow", "A horned knight steps out of the dark."],
  ["stonefist", "forest", "rock_brute", "Stonefist", "Forest Brute", "Something with fists of stone is waiting in the trees."],
  ["warrok", "forest", "crystal_ogre", "Warrok", "Crystal Beast", "Something big is growling in the dark."],
  ["chupa", "stadium", "luchador", "El Chupacabra", "Stadium Star", "The masked star of the stadium wants your belt."],
  ["oni", "stadium", "demon", "Big Red Oni", "Final Boss", "The last challenger. Everything you learned, now."],
];

/** Stats for stage `i` (1 = right after P'Tom ... ROSTER.length = last): everything gets harder step by step. */
export function difficulty(i, n = ROSTER.length) {
  const t = i / n;
  const lerp = (a, b) => Math.round((a + (b - a) * t) * 100) / 100;
  return {
    hp: Math.round(35 + 135 * t),
    damage: Math.round(12 + 12 * t),
    rounds: i <= 4 ? 2 : 3,
    roundTime: 60,
    restTime: 15,
    attackEvery: [lerp(4.3, 2.0), lerp(5.8, 3.2)],
    warn: lerp(1.25, 0.75),
    guardChance: lerp(0.35, 0.55),
    guardTime: [1.5, 2.5],
    openTime: lerp(1.45, 1.0),
    dodgeChance: lerp(0.12, 0.3),
  };
}

function hintFor(f) {
  if (f.dodgeChance >= 0.22) return `${f.name} dodges a lot. Throw two strikes in a row, and hit right after they attack.`;
  if (f.guardChance >= 0.45) return `${f.name} guards a lot. Elbows and knees get through the guard.`;
  if (f.damage >= 16) return `${f.name} hits hard. Keep your guard up until the punch is over.`;
  return `Raise your guard when you hear "Guard!", then hit back while ${f.name} is open.`;
}

ROSTER.forEach(([id, venue, model, name, title, intro], k) => {
  const f = { venue, model, name, title, intro, ...difficulty(k + 1) };
  FIGHTERS[id] = { ...f, hint: hintFor(f) };
});

/** Stage order (first to last). */
export const STAGES = ["ptom", ...ROSTER.map(([id]) => id)];
export const FIRST_FIGHTER = STAGES[0];
