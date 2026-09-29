// HUD (HTML ซ้อนบนฉาก 3D): เมนู / เล่นอิสระ / ประลอง / สรุปผล + ป้ายและข้อความต่างๆ
import { PLAYER_MAX_HP } from "./fight.js?v=b24b321";
import { clock } from "./workout.js?v=b24b321";

const NAMES = { punch: "Punch", elbow: "Elbow", knee: "Knee", kick: "Kick" };
const ORDER = ["punch", "elbow", "knee", "kick"];

const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
};

/** เริ่มแอนิเมชัน CSS ใหม่ทุกครั้งที่เรียก (ลบคลาสแล้วใส่กลับ) */
const replay = (el, cls, seconds) => {
  el.classList.remove(cls);
  void el.offsetWidth;
  if (seconds) el.style.animationDuration = `${seconds}s`;
  el.classList.add(cls);
};

function setHp(bar, frac) {
  const w = `${Math.max(0, Math.min(1, frac)) * 100}%`;
  bar.fill.style.width = w;
  bar.trail.style.width = w;
  bar.wrap.classList.toggle("low", frac <= 0.3);
}

export class Hud {
  constructor(root) {
    this.root = root;
    root.innerHTML = "";

    // --- เล่นอิสระ (ซ้อม): หลอดเลือดคู่ซ้อม + น็อก/หมัด/โดนต่อย + นับแต่ละอาวุธ ---
    this.freePanel = h("div", "panel free-panel");
    this.freeHp = h("div", "hp opp free-hp");
    this.freeHp.fill = h("div", "hp-fill");
    this.freeHp.trail = h("div", "hp-trail");
    this.freeHp.wrap = this.freeHp;
    const freeBar = h("div", "hp-bar");
    freeBar.append(this.freeHp.trail, this.freeHp.fill);
    this.freeHp.append(h("div", "free-title", "SPARRING"), freeBar);
    this.scoreEl = h("div", "score");
    this.countsEl = h("div", "counts");
    this.freePanel.append(this.freeHp, this.scoreEl, this.countsEl);

    // --- เวลาออกกำลังกาย + แคลอรี (ระหว่างเล่น) ---
    this.workoutEl = h("div", "workout");

    // --- ประลอง: HP สองฝ่าย + ยก/เวลา ---
    this.fightPanel = h("div", "fight-panel");
    const bar = (side) => {
      const wrap = h("div", `hp ${side}`);
      const name = h("div", "hp-name");
      const outer = h("div", "hp-bar");
      const trail = h("div", "hp-trail"); // ดาเมจที่เพิ่งโดน: ลดตามหลังแถบจริงช้าๆ
      const fill = h("div", "hp-fill");
      outer.append(trail, fill);
      wrap.append(outer, name);
      return { wrap, name, fill, trail };
    };
    this.youBar = bar("you");
    this.oppBar = bar("opp");
    this.roundEl = h("div", "round");
    this.roundLabel = h("div", "round-label");
    this.clockEl = h("div", "round-clock");
    this.roundEl.append(this.roundLabel, this.clockEl);
    this.fightPanel.append(this.youBar.wrap, this.roundEl, this.oppBar.wrap);

    this.banner = h("div", "banner");
    this.pop = h("div", "pop");
    this.warnBox = h("div", "warn");
    this.warnBox.append(h("div", "warn-text", "GUARD!"), h("div", "warn-bar"));
    this.msg = h("div", "msg");
    this.flash = h("div", "hit-flash");
    this.status = h("div", "status");
    this.guardEl = h("div", "guard-tag", "GUARD");
    this.oppTag = h("div", "opp-tag");

    this.menu = this.buildMenu();
    this.result = h("div", "screen result");

    root.append(this.flash, this.freePanel, this.workoutEl, this.fightPanel, this.oppTag, this.banner, this.pop,
      this.warnBox, this.msg, this.status, this.guardEl, this.menu, this.result);
    this.setMode("menu");
  }

  buildMenu() {
    const menu = h("div", "screen menu");
    this.todayEl = h("p", "today");
    menu.append(h("h1", "", "BakaDot"), h("p", "sub", "Punch LEFT or RIGHT to choose"), this.todayEl);
    const row = h("div", "cards");
    const card = (side, title, text) => {
      const c = h("div", `card ${side}`);
      c.append(h("div", "card-key", side === "left" ? "◀ Punch LEFT" : "Punch RIGHT ▶"), h("h2", "", title), h("p", "", text));
      return c;
    };
    row.append(
      card("left", "Free Play", "Throw punches, elbows and knees. Guard when you hear \"Guard!\"."),
      (this.storyCard = card("right", "Road of the Nak Muay", "")),
    );
    menu.append(row);
    return menu;
  }

  /** Story card text: which stage is next (stage = 1-based number, fighter = its data). */
  setNextStage(stage, total, fighter) {
    this.storyCard.lastChild.textContent = `Stage ${stage} of ${total}: ${fighter.name}, ${fighter.title}. Knock them out or win on points.`;
  }

  /** Today's workout total on the menu. */
  setToday({ seconds, kcal }) {
    this.todayEl.textContent = seconds > 0 ? `Today: ${clock(seconds)} of exercise · ~${Math.round(kcal)} kcal` : "";
  }

  setMode(mode) {
    this.mode = mode;
    this.root.dataset.mode = mode;
    this.warnBox.classList.remove("on");
  }

  update({ score, counts, guarding, connected, fight, free, workout }) {
    if (this.mode === "free") {
      setHp(this.freeHp, free.hp / free.max);
      this.scoreEl.textContent = `KO ${free.kos}   ·   STRIKES ${score}   ·   HITS TAKEN ${free.hitsTaken}`;
      this.countsEl.textContent = ORDER.map((k) => `${NAMES[k]} ${counts[k] ?? 0}`).join("   ");
    }
    if (workout) this.workoutEl.textContent = `⏱ ${clock(workout.seconds)}    🔥 ~${Math.round(workout.kcal)} kcal`;
    if (this.mode === "fight" && fight) {
      this.youBar.name.textContent = "YOU";
      setHp(this.youBar, fight.playerHp / PLAYER_MAX_HP);
      this.oppBar.name.textContent = `${fight.f.name} · ${fight.f.title}`;
      setHp(this.oppBar, fight.oppHp / fight.oppMax);
      const t = Math.ceil(fight.timeLeft);
      const clock = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
      this.roundLabel.textContent = fight.phase === "rest" ? "REST" : `ROUND ${fight.round}/${fight.f.rounds}`;
      this.clockEl.textContent = clock;
      this.roundEl.classList.toggle("rest", fight.phase === "rest");
    }
    this.guardEl.classList.toggle("on", guarding && (this.mode === "free" || this.mode === "fight"));
    this.status.textContent = connected ? "Camera connected" : "Camera off · keys: J/K punch · E elbow · N knee · hold G guard";
    this.status.classList.toggle("ok", connected);
  }

  showStrike(kind, { damage = null, open = false, blocked = false, dodged = false } = {}) {
    let text = `${NAMES[kind]}!`;
    if (dodged) {
      this.pop.textContent = "MISS!  (dodged)";
      this.pop.dataset.kind = "miss";
      return replay(this.pop, "go");
    }
    if (damage !== null) text += blocked ? "  (blocked)" : `  -${Math.round(damage * 10) / 10}`;
    if (open) text += "  OPEN!";
    if (damage === null) text += "  +1";
    this.pop.textContent = text;
    this.pop.dataset.kind = kind;
    replay(this.pop, "go");
  }

  warn(seconds) {
    replay(this.warnBox, "on");
    this.warnBox.querySelector(".warn-bar").style.animationDuration = `${seconds}s`;
    clearTimeout(this.warnTimer);
    this.warnTimer = setTimeout(() => this.warnBox.classList.remove("on"), seconds * 1000);
  }

  message(text, color) {
    this.msg.textContent = text;
    this.msg.style.color = color;
    replay(this.msg, "go");
  }

  hitFlash() {
    replay(this.flash, "go");
  }

  showBanner(text, color, seconds) {
    this.banner.textContent = text;
    this.banner.style.color = color;
    replay(this.banner, "go", seconds);
  }

  /** ป้ายเหนือหัวคู่ต่อสู้ (x, y เป็นพิกเซลบนจอ) */
  opponentTag(x, y, state) {
    const text = state.guard ? "GUARD" : state.open ? "OPEN!" : "";
    this.oppTag.textContent = text;
    this.oppTag.dataset.state = state.guard ? "guard" : "open";
    this.oppTag.classList.toggle("on", Boolean(text));
    this.oppTag.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
  }

  showResult(r) {
    const mins = Math.floor(r.time / 60);
    const secs = String(Math.floor(r.time % 60)).padStart(2, "0");
    this.result.innerHTML = "";
    this.result.classList.toggle("win", r.win);
    this.result.append(
      h("h1", "", r.win ? "YOU WIN!" : "YOU LOSE"),
      h("p", "sub", `${r.win ? "Beat" : "Lost to"} ${r.fighter.name} by ${r.how === "KO" ? "knockout" : "decision"} · ${mins}:${secs}`),
    );
    if (r.workout) {
      const w = r.workout, t = r.today;
      this.result.append(h("p", "workout-sum",
        `⏱ ${clock(w.seconds)}  ·  🔥 ~${Math.round(w.kcal)} kcal` + (t ? `     Today: ${clock(t.seconds)} · ~${Math.round(t.kcal)} kcal` : "")));
    }
    const stats = h("div", "stats");
    for (const [label, value] of [
      ["Punches", r.punch], ["Elbows", r.elbow], ["Knees", r.knee],
      ["Blocks", r.blocks], ["Hits taken", r.hitsTaken], ["Open hits", r.openHits],
    ]) {
      const s = h("div", "stat");
      s.append(h("b", "", String(value)), h("span", "", label));
      stats.append(s);
    }
    this.result.append(stats);
    if (!r.win && r.fighter.hint) this.result.append(h("p", "hint", `Tip: ${r.fighter.hint}`));
    if (r.champion) this.result.append(h("p", "sub", "You beat every fighter. You are the champion!"));
    else if (r.next) this.result.append(h("p", "sub", `Next: ${r.next.name} · ${r.next.title}`));
    const again = r.win ? (r.champion ? "Play again from stage 1" : "Next fight") : "Try again";
    this.result.append(h("p", "choices", `◀ Punch LEFT: Menu        Punch RIGHT: ${again} ▶`));
    this.setMode("result");
  }
}
