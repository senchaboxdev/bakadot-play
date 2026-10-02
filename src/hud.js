// HUD (HTML ซ้อนบนฉาก 3D): เมนู / เล่นอิสระ / ประลอง / สรุปผล + ป้ายและข้อความต่างๆ
import { PLAYER_MAX_HP } from "./fight.js?v=d8eb412";
import { clock } from "./workout.js?v=d8eb412";
import { savePhoto, sharePhoto, canShareFiles } from "./champion.js?v=d8eb412";

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

    // ปุ่มหยุดชั่วคราว (ขึ้นตอนสู้/ซ้อม) + จอ Paused: แตะตรงไหนก็ได้เพื่อเล่นต่อ
    this.pauseBtn = h("button", "pause-btn", "⏸");
    this.pauseBtn.type = "button";
    this.pauseBtn.setAttribute("aria-label", "Pause");
    this.pauseBtn.addEventListener("click", () => this.onPause());
    this.pausedEl = h("div", "screen paused");
    this.pausedEl.append(h("h1", "", "Paused"), h("p", "sub", "Tap to continue"));
    this.pausedEl.addEventListener("click", () => this.onResume());

    root.append(this.flash, this.freePanel, this.workoutEl, this.fightPanel, this.oppTag, this.banner, this.pop,
      this.warnBox, this.msg, this.status, this.guardEl, this.menu, this.result, this.pauseBtn, this.pausedEl);
    this.setMode("menu");
  }

  buildMenu() {
    const menu = h("div", "screen menu");
    this.sessionEl = h("p", "today");
    menu.append(h("h1", "", "BakaDot"), h("p", "sub", "Punch LEFT or RIGHT to choose"), this.sessionEl);
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
    menu.append(row, this.buildRestart());
    return menu;
  }

  /** ปุ่มเริ่มด่าน 1 ใหม่ (ขึ้นเมื่อไปถึงด่าน 2 ขึ้นไป) ต้องแตะสองครั้ง ลูกกดพลาดทีเดียวด่านจะได้ไม่หาย */
  buildRestart() {
    const LABEL = "↺ Start from Stage 1";
    const btn = h("button", "action restart", LABEL);
    btn.type = "button";
    btn.hidden = true;
    let armed = 0;
    btn.addEventListener("click", () => {
      if (!armed) {
        btn.textContent = "Tap again to start over";
        armed = setTimeout(() => { armed = 0; btn.textContent = LABEL; }, 3000);
        return;
      }
      clearTimeout(armed);
      armed = 0;
      btn.textContent = LABEL;
      this.onRestart();
    });
    this.restartBtn = btn;
    return btn;
  }

  /** ตั้งใน main.js: กลับไปด่าน 1 */
  onRestart() {}
  /** ตั้งใน main.js: กดปุ่ม ⏸ / แตะจอ Paused */
  onPause() {}
  onResume() {}

  setPaused(on) {
    if (on) this.root.dataset.paused = "";
    else delete this.root.dataset.paused;
  }

  /** Story card text: which stage is next (stage = 1-based number, fighter = its data). */
  setNextStage(stage, total, fighter) {
    this.storyCard.lastChild.textContent = `Stage ${stage} of ${total}: ${fighter.name}, ${fighter.title}. Knock them out or win on points.`;
    this.restartBtn.hidden = stage <= 1;
  }

  /** This player's total so far (since the page opened or the weight was picked), on the menu. */
  setSession({ seconds, kcal }) {
    this.sessionEl.textContent = seconds > 0 ? `This session: ${clock(seconds)} of exercise · ~${Math.round(kcal)} kcal` : "";
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
      this.roundLabel.textContent = fight.phase === "rest" ? `REST · ROUND ${fight.round + 1} NEXT` : `ROUND ${fight.round}/${fight.f.rounds}`;
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

  /** แฟลชเต็มจอ: แดง = โดนต่อย, "white" = แฟลชกล้องตอนถ่ายรูป */
  hitFlash(color) {
    this.flash.style.background = color === "white" ? "rgba(255, 255, 255, 0.9)" : "";
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
    this.result.classList.toggle("with-card", Boolean(r.card));
    // ข้อมูลผล (ถ้ามีใบผลงาน: ใบอยู่ซ้าย ข้อมูลอยู่ขวา)
    const info = h("div", "result-info");
    info.append(
      h("h1", "", r.win ? "YOU WIN!" : "YOU LOSE"),
      h("p", "sub", `${r.win ? "Beat" : "Lost to"} ${r.fighter.name} by ${r.how === "KO" ? "knockout" : "decision"} · ${mins}:${secs}`),
    );
    if (r.workout) {
      const w = r.workout, t = r.session;
      info.append(h("p", "workout-sum",
        `⏱ ${clock(w.seconds)}  ·  🔥 ~${Math.round(w.kcal)} kcal` + (t ? `\nThis session: ${clock(t.seconds)} · ~${Math.round(t.kcal)} kcal` : "")));
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
    info.append(stats);
    if (!r.win && r.fighter.hint) info.append(h("p", "hint", `Tip: ${r.fighter.hint}`));
    if (r.champion) info.append(h("p", "sub", "You beat every fighter. You are the champion!"));
    else if (r.next) info.append(h("p", "sub", `Next: ${r.next.name} · ${r.next.title}`));
    if (r.card) {
      const { img, side } = this.photoCard(r.card, r.onPhotoAction);
      info.append(side);
      this.result.append(img);
    }
    const again = r.win ? (r.champion ? "Play again from stage 1" : "Next fight") : "Try again";
    this.choicesEl = h("p", "choices", `◀ Punch LEFT: Menu        Punch RIGHT: ${again} ▶`);
    info.append(this.choicesEl);
    this.result.append(info);
    this.setMode("result");
  }

  /** ใบผลงาน (ภาพคนเล่น + ด่านที่ไปถึง) + ปุ่ม Save photo / Share; onAction = กดปุ่มใดปุ่มหนึ่ง */
  photoCard(blob, onAction = () => {}) {
    const img = h("img", "card-img");
    img.src = URL.createObjectURL(blob);
    img.alt = "BakaDot result card with the player's photo";
    const actions = h("div", "card-actions");
    const note = h("p", "card-note", "The photo stays on this device until you save or share it.");
    const save = h("button", "action", "💾 Save photo");
    save.type = "button";
    save.addEventListener("click", async () => {
      onAction();
      try {
        if (!(await savePhoto(blob))) note.textContent = "Press and hold the photo, then tap Save to Photos.";
      } catch (err) { note.textContent = `Could not save: ${err.message}`; }
    });
    actions.append(save);
    if (canShareFiles()) {
      const share = h("button", "action share", "📤 Share");
      share.type = "button";
      share.addEventListener("click", async () => {
        onAction();
        try { await sharePhoto(blob); } catch (err) { note.textContent = `Could not share: ${err.message}`; }
      });
      actions.append(share);
    } else {
      note.textContent += " This browser cannot share files: save the photo, then send it by email.";
    }
    const side = h("div", "card-side");
    side.append(actions, note);
    return { img, side };
  }

  /** Result screen after a win: counting down to the next fight (it starts by itself). */
  nextFightIn(seconds) {
    this.choicesEl.textContent = seconds > 0
      ? `◀ Punch LEFT: Menu        Next fight in ${Math.ceil(seconds)}… ▶`
      : "◀ Punch LEFT: Menu        Punch RIGHT: Next fight ▶";
  }
}
