// Task 6.1: การประลองจริง (โหมดเนื้อเรื่อง) — ตรรกะล้วน ไม่ผูกกับภาพ/เสียง (ทดสอบด้วย node ได้)
// - HP สองฝ่าย, ดาเมจตามอาวุธ (คู่ต่อสู้ยกการ์ด = หมัดเบาลงมาก, เข่าทะลุการ์ด)
// - AI: ยืนเชิง -> (ยกการ์ด) -> ง้างเตือน+บุก -> หอบเปิดช่อง (ตีตอนนี้แรงขึ้น) -> วนใหม่
// - ตอนยืนเชิง หลบหมัดได้ (dodgeChance) — ไม่หลบตอนการ์ด/บุก/หอบ และไม่หลบติดกันเร็วกว่า DODGE_COOLDOWN
// - แบ่งยก + พัก, ชนะเมื่อน็อก หรือเหลือ HP (เป็นสัดส่วน) มากกว่าเมื่อครบยก
//
// เวลาเดินด้วย update(dt) เท่านั้น (ไม่มี setTimeout) ส่วนภาพ/เสียงทำผ่าน hooks:
//   banner(text, color, seconds)
//   opponentAttack(warnSeconds, onImpact) -> Promise (เล่นท่าบุก เรียก onImpact ตอนหมัดถึง)
//   isGuarding() -> bool
//   block() / playerHit(damage)
//   opponentState({ guard, open })
//   finished(result)

export const PLAYER_MAX_HP = 100;
export const WEAPON_DAMAGE = { punch: 3, elbow: 6, knee: 7, kick: 6 };
export const GUARD_FACTOR = { punch: 0.3, elbow: 0.5, knee: 1.0, kick: 0.5 };
export const OPEN_BONUS = 1.5;
const INTRO_TIME = 2.2; // "ROUND n" แล้ว "FIGHT!"
export const DODGE_COOLDOWN = 1.0; // วินาที

export const AI = { IDLE: "idle", GUARD: "guard", ATTACK: "attack", OPEN: "open", DOWN: "down" };

export class Fight {
  constructor(fighter, hooks, random = Math.random) {
    this.f = fighter;
    this.hooks = hooks;
    this.random = random;
    this.oppMax = fighter.hp;
    this.oppHp = fighter.hp;
    this.playerHp = PLAYER_MAX_HP;
    this.round = 1;
    this.elapsed = 0;
    this.stats = { punch: 0, elbow: 0, knee: 0, kick: 0, blocks: 0, hitsTaken: 0, openHits: 0 };
    this.done = false;
    this.beginRound();
  }

  get active() { return this.phase === "fight"; }
  get timeLeft() { return Math.max(this.phaseTime, 0); }

  range([a, b]) { return a + (b - a) * this.random(); }

  beginRound() {
    this.phase = "intro";
    this.phaseTime = INTRO_TIME;
    this.roundTime = this.f.roundTime;
    this.introStep = 0;
    this.setAi(AI.IDLE, 1.5);
    this.hooks.banner(`ROUND ${this.round}`, "#ffffff", INTRO_TIME / 2);
  }

  update(dt) {
    if (this.done) return;
    this.phaseTime -= dt;
    if (this.phase === "intro") {
      if (this.introStep === 0 && this.phaseTime <= INTRO_TIME / 2) {
        this.introStep = 1;
        this.hooks.banner("FIGHT!", "#ffd400", INTRO_TIME / 2);
      }
      if (this.phaseTime <= 0) {
        this.phase = "fight";
        this.phaseTime = this.roundTime;
      }
    } else if (this.phase === "rest") {
      if (this.phaseTime <= 0) {
        this.round += 1;
        this.beginRound();
      }
    } else if (this.phase === "fight") {
      this.elapsed += dt;
      this.dodgeWait = Math.max((this.dodgeWait ?? 0) - dt, 0);
      if (this.phaseTime <= 0) return this.endRound();
      this.updateAi(dt);
    }
  }

  // ---------- AI คู่ต่อสู้ ----------

  updateAi(dt) {
    this.aiTimer -= dt;
    if (this.aiTimer > 0 || this.ai === AI.ATTACK) return;
    if (this.ai === AI.IDLE) {
      if (this.random() < this.f.guardChance) this.setAi(AI.GUARD, this.range(this.f.guardTime));
      else this.attack();
    } else if (this.ai === AI.GUARD) {
      this.attack();
    } else if (this.ai === AI.OPEN) {
      // เวลาระหว่างบุก หักส่วนที่ใช้เตือนออก, HP เหลือน้อยแล้วดุขึ้น
      let gap = this.range(this.f.attackEvery) - this.f.warn;
      if (this.oppHp < this.oppMax * 0.35) gap *= 0.7;
      this.setAi(AI.IDLE, Math.max(gap, 0.6));
    }
  }

  async attack() {
    this.setAi(AI.ATTACK, 0);
    await this.hooks.opponentAttack(this.f.warn, () => this.resolveAttack());
    if (this.ai !== AI.ATTACK) return; // จบไฟต์/พักยกไปแล้วระหว่างบุก
    if (this.active) this.setAi(AI.OPEN, this.f.openTime);
    else this.setAi(AI.IDLE, 1.0);
  }

  resolveAttack() {
    if (!this.active) return;
    if (this.hooks.isGuarding()) {
      this.stats.blocks += 1;
      this.hooks.block();
      return;
    }
    this.stats.hitsTaken += 1;
    this.playerHp = Math.max(this.playerHp - this.f.damage, 0);
    this.hooks.playerHit(this.f.damage);
    if (this.playerHp <= 0) this.finish(false, "KO");
  }

  setAi(state, seconds) {
    this.ai = state;
    this.aiTimer = seconds;
    this.hooks.opponentState({ guard: state === AI.GUARD, open: state === AI.OPEN });
  }

  // ---------- ผู้เล่นออกอาวุธ ----------

  /** คืน { damage, guarded, open, dodged } — ไม่ได้อยู่ในช่วงสู้ = damage 0 */
  onStrike(kind) {
    if (!this.active) return { damage: 0, guarded: false, open: false, dodged: false };
    this.stats[kind] = (this.stats[kind] ?? 0) + 1;
    if (this.ai === AI.IDLE && !this.dodgeWait && this.random() < (this.f.dodgeChance ?? 0)) {
      this.dodgeWait = DODGE_COOLDOWN;
      this.stats.dodged = (this.stats.dodged ?? 0) + 1;
      return { damage: 0, guarded: false, open: false, dodged: true };
    }
    const guarded = this.ai === AI.GUARD;
    const open = this.ai === AI.OPEN;
    let damage = WEAPON_DAMAGE[kind] ?? 3;
    if (guarded) damage *= GUARD_FACTOR[kind] ?? 0.5;
    if (open) {
      damage *= OPEN_BONUS;
      this.stats.openHits += 1;
    }
    this.oppHp = Math.max(this.oppHp - damage, 0);
    if (this.oppHp <= 0) this.finish(true, "KO");
    return { damage, guarded, open, dodged: false };
  }

  // ---------- ยก / จบ ----------

  endRound() {
    if (this.round < this.f.rounds) {
      this.phase = "rest";
      this.phaseTime = this.f.restTime;
      this.setAi(AI.IDLE, 0);
      this.hooks.banner("REST - breathe", "#4fc3f7", 2.0);
      return;
    }
    // ครบยก: ตัดสินจากสัดส่วน HP ที่เหลือ
    this.finish(this.oppHp / this.oppMax < this.playerHp / PLAYER_MAX_HP, "DECISION");
  }

  finish(win, how) {
    if (this.done) return; // กันเรียกซ้ำ (เช่น น็อกพร้อมหมดเวลา)
    this.done = true;
    this.phase = "done";
    this.ai = AI.DOWN;
    this.hooks.opponentState({ guard: false, open: false });
    this.hooks.finished({
      ...this.stats, win, how, fighter: this.f, time: this.elapsed, rounds: this.round,
      playerHp: this.playerHp, oppHp: this.oppHp, oppMax: this.oppMax,
    });
  }
}
