import { test } from "node:test";
import assert from "node:assert/strict";
import { connectGeo, tiltBox, SCR_GAP } from "../components/services/connect-geo.ts";

/** The panel boxes the Connect page actually renders (see connect-stage.tsx), by viewport width. */
function panel(v) {
  if (v < 1024) return { w: v - 48, h: v < 600 ? 460 : 400 };
  return { w: ((Math.min(v, 1440) - 144 - 56) * 7) / 12, h: 540 };
}

test("scrambled tool cards keep >= 12px clearance, stay inside the panel, and loose dots never sit on a card", () => {
  for (let v = 320; v <= 1920; v += 7) {
    const { w, h } = panel(v);
    const g = connectGeo(w, h);
    const bx = g.scr.map(([x, y, r]) => {
      const b = tiltBox(g.cw, g.ch, r);
      return { l: x + g.cw / 2 - b.w / 2, r: x + g.cw / 2 + b.w / 2, t: y + g.ch / 2 - b.h / 2, b: y + g.ch / 2 + b.h / 2 };
    });
    const where = `viewport ${v} (panel ${w.toFixed(0)}x${h})`;
    bx.forEach((a, i) => {
      assert.ok(a.l >= 0 && a.r <= w && a.t >= 0 && a.b <= h, `card ${i} inside the panel at ${where}`);
      bx.slice(i + 1).forEach((b, j) => {
        const gx = Math.max(b.l - a.r, a.l - b.r);
        const gy = Math.max(b.t - a.b, a.t - b.b);
        assert.ok(Math.max(gx, gy) >= SCR_GAP - 1e-6, `cards ${i}/${i + 1 + j} >= ${SCR_GAP}px apart at ${where}`);
      });
    });
    const r = g.cs * 0.42;
    if (!g.land) bx.forEach((a, i) => {
      const dx = Math.max(a.l - g.cx, 0, g.cx - a.r), dy = Math.max(a.t - g.cy, 0, g.cy - a.b);
      assert.ok(Math.hypot(dx, dy) >= r + SCR_GAP - 1e-6, `card ${i} clear of the target circle at ${where}`);
    });
    assert.ok(g.loose.filter(Boolean).length >= 24, `most loose dots placed at ${where}`);
    g.loose.forEach((d) => {
      if (!d) return;
      assert.ok(bx.every((a) => d[0] < a.l - 6 || d[0] > a.r + 6 || d[1] < a.t - 6 || d[1] > a.b + 6), `dot on a card at ${where}`);
    });
  }
});
