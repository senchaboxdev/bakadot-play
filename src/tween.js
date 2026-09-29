// ตัวช่วยเคลื่อนไหวแบบง่าย เดินด้วยเวลาเกม (update(dt) จากลูปหลัก) ไม่ใช้ setTimeout
export const ease = {
  linear: (t) => t,
  out: (t) => 1 - (1 - t) ** 3,
  in: (t) => t * t,
};

export class Tweens {
  constructor() {
    this.list = [];
  }

  /** เรียก fn(p) ทุกเฟรม p = 0..1 ตลอด duration วินาที; คืน Promise เมื่อจบ */
  to(duration, fn = () => {}, easing = ease.linear) {
    return new Promise((resolve) => {
      this.list.push({ t: 0, duration: Math.max(duration, 1e-6), fn, easing, resolve });
      fn(0);
    });
  }

  wait(seconds) {
    return this.to(seconds);
  }

  update(dt) {
    for (const tw of [...this.list]) {
      tw.t += dt;
      const p = Math.min(tw.t / tw.duration, 1);
      tw.fn(tw.easing(p));
      if (p >= 1) {
        this.list.splice(this.list.indexOf(tw), 1);
        tw.resolve();
      }
    }
  }
}

export const lerp = (a, b, t) => a + (b - a) * t;
