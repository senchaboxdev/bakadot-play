// เสียงเกม (Web Audio) — ไฟล์ .m4a (AAC) เล่นได้ทุกเบราว์เซอร์รวม Safari บน iPhone
// เบราว์เซอร์จะไม่ให้เล่นเสียงจนกว่าผู้ใช้กดอะไรสักอย่าง -> เรียก resume() จากปุ่มเริ่ม

const SOUNDS = {
  hit0: "assets/sounds/impactPunch_medium_000.m4a",
  hit1: "assets/sounds/impactPunch_medium_001.m4a",
  hit2: "assets/sounds/impactPunch_medium_002.m4a",
  hit3: "assets/sounds/impactPunch_medium_003.m4a",
  hit4: "assets/sounds/impactPunch_medium_004.m4a",
  heavy: "assets/sounds/impactPunch_heavy_000.m4a",
  block: "assets/sounds/block.m4a",
  playerHit: "assets/sounds/player_hit.m4a",
  warn: "assets/sounds/warn_guard.m4a", // เสียงพูด "Guard!"
};
const HITS = ["hit0", "hit1", "hit2", "hit3", "hit4"];

export class GameAudio {
  constructor() {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    this.buffers = {};
    this.lastHit = -1;
  }

  async load() {
    await Promise.all(Object.entries(SOUNDS).map(async ([key, url]) => {
      try {
        const data = await (await fetch(url)).arrayBuffer();
        this.buffers[key] = await this.ctx.decodeAudioData(data);
      } catch (err) {
        console.warn("sound failed", url, err);
      }
    }));
  }

  resume() {
    return this.ctx.resume();
  }

  play(key, rate = 1 + (Math.random() - 0.5) * 0.16) {
    const buffer = this.buffers[key];
    if (!buffer) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    src.connect(this.ctx.destination);
    src.start();
  }

  /** เสียงต่อยโดน: สุ่มไม่ให้ซ้ำครั้งก่อน */
  hit() {
    let i = Math.floor(Math.random() * HITS.length);
    if (i === this.lastHit) i = (i + 1) % HITS.length;
    this.lastHit = i;
    this.play(HITS[i]);
  }
}
