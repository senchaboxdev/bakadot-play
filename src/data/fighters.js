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

export const FIGHTERS = {
  ptom: {
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

  // Stages 2-7 use the models we have so far; names and numbers are placeholders to tune while playing.
  bones: {
    name: "Old Bones",
    title: "Temple Guardian",
    intro: "Something rattles in the old temple yard.",
    hp: 55, damage: 13, rounds: 2, roundTime: 60, restTime: 15,
    attackEvery: [3.5, 5.0], warn: 1.1, guardChance: 0.45, guardTime: [1.5, 2.5], openTime: 1.4,
    shorts: "#9e9e9e", model: "skeleton",
    hint: "Old Bones guards a lot. Elbows and knees get through his guard.",
  },
  chai: {
    name: "Uncle Chai",
    title: "Market Champion",
    intro: "The market's toughest uncle challenges you.",
    hp: 70, damage: 15, rounds: 3, roundTime: 60, restTime: 15,
    attackEvery: [3.0, 4.5], warn: 1.0, guardChance: 0.4, guardTime: [1.5, 2.5], openTime: 1.3,
    shorts: "#ef6c00", model: "villager",
    hint: "Uncle Chai hits hard. Do not drop your guard early.",
  },
  iron: {
    name: "Iron Warrior",
    title: "Fortress Boss",
    intro: "The fortress guard stands in your way.",
    hp: 100, damage: 18, rounds: 3, roundTime: 60, restTime: 15,
    attackEvery: [2.5, 4.0], warn: 0.9, guardChance: 0.5, guardTime: [1.5, 2.5], openTime: 1.2,
    shorts: "#b71c1c", model: "warrior",
    hint: "Iron Warrior attacks fast and guards often. Use knees and elbows, and counter right after his attacks.",
  },
  maria: {
    name: "Captain Maria",
    title: "Armor Fighter",
    intro: "A veteran in golden armor blocks the road.",
    hp: 110, damage: 18, rounds: 3, roundTime: 60, restTime: 15,
    attackEvery: [2.5, 4.0], warn: 0.9, guardChance: 0.5, guardTime: [1.5, 2.5], openTime: 1.2,
    shorts: "#ffb300", model: "maria",
    hint: "Maria guards a lot. Elbows and knees get through her guard.",
  },
  warrok: {
    name: "Warrok",
    title: "Wild Beast",
    intro: "Something big is growling in the dark.",
    hp: 130, damage: 20, rounds: 3, roundTime: 60, restTime: 15,
    attackEvery: [2.5, 3.8], warn: 0.85, guardChance: 0.45, guardTime: [1.5, 2.5], openTime: 1.2,
    shorts: "#6d4c41", model: "bear",
    hint: "Warrok hits very hard. Do not drop your guard early.",
  },
  goblin: {
    name: "Boogie Goblin",
    title: "Final Boss",
    intro: "The last challenger is dancing. Do not let that fool you.",
    hp: 160, damage: 22, rounds: 3, roundTime: 60, restTime: 15,
    attackEvery: [2.0, 3.5], warn: 0.8, guardChance: 0.5, guardTime: [1.5, 2.5], openTime: 1.1,
    shorts: "#2e7d32", model: "goblin",
    hint: "The goblin dances but attacks fast and guards often. Use knees and elbows, and counter right after his attacks.",
  },
};

/** Stage order (first to last). */
export const STAGES = ["ptom", "bones", "chai", "iron", "maria", "warrok", "goblin"];
export const FIRST_FIGHTER = STAGES[0];
