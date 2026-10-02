import { test } from "node:test";
import assert from "node:assert/strict";
import { stageProgress, stepScrollTop } from "../components/motion/stage-math.ts";
import { cubeLayout, dotGrid } from "../components/motion/cube-math.ts";

test("stageProgress maps scroll through the track to step + in-step progress", () => {
  // track 300vh-ish: range 2000, pin sticks at 64
  const at = (scrolled) => stageProgress(64 - scrolled, 64, 2000, 4);
  assert.deepEqual(at(0), { f: 0, P: 0, step: 0, p: 0 });
  assert.equal(at(500).step, 1); // exactly on a step boundary
  assert.equal(at(750).step, 1);
  assert.ok(Math.abs(at(750).p - 0.5) < 1e-9);
  assert.equal(at(-300).step, 0, "above the track clamps to the start");
  const end = at(9999);
  assert.equal(end.step, 3, "past the track clamps to the last step");
  assert.equal(end.p, 1, "...at its end state");
});

test("stepScrollTop lands mid-slice of the step it targets", () => {
  for (let i = 0; i < 4; i++) {
    const y = stepScrollTop(1000, 64, 2000, 4, i); // track at absolute y=1000
    const s = stageProgress(1000 - y, 64, 2000, 4);
    assert.equal(s.step, i);
    assert.ok(Math.abs(s.p - 0.5) < 1e-9);
  }
});

test("dotGrid is 5 rows x 4 cols with rows grouped, no collisions", () => {
  const g = dotGrid(5, 4, 0);
  assert.equal(g.length, 20);
  assert.equal(new Set(g.map((d) => `${d.x},${d.y}`)).size, 20);
  assert.ok(g.every((d) => d.x > 5 && d.x < 95 && d.y > 5 && d.y < 95), "dots stay inside the face");
  assert.ok(dotGrid(5, 4, 2)[0].delay > g[0].delay, "later faces start later");
});

test("cubeLayout: single-source geometry, closed blocks sit in the logo, open ones land in thirds", () => {
  assert.equal(cubeLayout({ W: 0, H: 400, wide: true, withCards: false }), null);
  const L = cubeLayout({ W: 900, H: 440, wide: true, withCards: false });
  const left = L.cubes[1];
  const right = L.cubes[2];
  assert.ok(left.x0 < L.cubes[0].x0 && L.cubes[0].x0 < right.x0, "left, top, right order across the cluster");
  assert.ok(Math.abs(left.x0 + left.tx + left.gx - 150) < 1e-6, "left block lands at 1/6 of the width");
  assert.ok(Math.abs(right.x0 + right.tx + right.gx - 450) < 1e-6, "right block lands in the middle third");
  const top = L.cubes[0];
  assert.ok(Math.abs(top.x0 + top.tx + top.gx - 750) < 1e-6, "top block lands in the last third");
  const phone = cubeLayout({ W: 390, H: 300, wide: false, withCards: true });
  assert.ok(phone.zc > phone.zo, "phone cube zone is taller closed (cluster) than open (row)");
});
