// Body physics model tests: IK round-trip, foot planting, jumps, collisions.
import { describe, test, expect } from 'bun:test';
import { Body, solveLeg, fkLeg, resolveCollisions, GRAV, FOOT_Y } from '../public/body.js';

const L1 = 0.484, L2 = 0.446; // ~1.98m player

describe('leg IK', () => {
  test('solveLeg -> fkLeg round-trips within 1cm (sagittal plane)', () => {
    const rng = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(12345);
    for (let i = 0; i < 200; i++) {
      // planar target relative to hip joint (the rig has no hip-roll joint,
      // so lateral offset is rendered at the hip joint's x by design)
      const ty = -(0.55 + rng() * 0.35);
      const tz = (rng() - 0.5) * 0.6;
      const sol = solveLeg(0, ty, tz, L1, L2);
      const hip = { x: 1.0, y: 0.9, z: 2.0 };
      const foot = fkLeg(hip, 0.7, sol.hipX, sol.knee, L1, L2);
      const d = Math.hypot(ty, tz);
      const maxD = (L1 + L2) * 0.999;
      const k = d > maxD ? maxD / d : 1;
      const c = Math.cos(0.7), s = Math.sin(0.7);
      const ex = hip.x + (tz * k * s);
      const ez = hip.z + (tz * k * c);
      const ey = hip.y + ty * k;
      expect(Math.hypot(foot.x - ex, foot.y - ey, foot.z - ez)).toBeLessThan(0.01);
    }
  });
  test('knee is ~0 for a straight leg, positive when bent', () => {
    const straight = solveLeg(0, -(L1 + L2) * 0.999, 0, L1, L2);
    expect(Math.abs(straight.knee)).toBeLessThan(0.12); // reach clamp keeps a hair of bend
    const bent = solveLeg(0, -0.6, 0.25, L1, L2);
    expect(bent.knee).toBeGreaterThan(straight.knee + 0.2);
  });
});

describe('gait / foot planting', () => {
  test('planted stance foot does not move (world speed ~ 0)', () => {
    const b = new Body({ x: 0, z: 10, h: 1.98, maxSpeed: 6, accel: 20, turnRate: 7 });
    b.setTarget(0, 2, 3); // run 8m
    let worstDrift = 0;
    let prevL = { ...b.footL }, prevR = { ...b.footR };
    for (let i = 0; i < 240; i++) {
      b.update(1 / 60);
      for (const [f, p] of [[b.footL, prevL], [b.footR, prevR]]) {
        if (f.mode === 'plant' && p.mode === 'plant') {
          const drift = Math.hypot(f.x - p.x, f.z - p.z);
          if (drift > worstDrift) worstDrift = drift;
        }
      }
      prevL = { ...b.footL }; prevR = { ...b.footR };
    }
    expect(worstDrift).toBeLessThan(1e-9);
  });
  test('IK places the rendered foot at the planted target', () => {
    const b = new Body({ x: 0, z: 10, h: 1.98, maxSpeed: 6, accel: 20, turnRate: 7 });
    b.setTarget(3, 2, 3);
    let worst = 0;
    for (let i = 0; i < 200; i++) {
      b.update(1 / 60);
      const hipY = b.hipHeight();
      for (const [f, sgn] of [[b.footL, -1], [b.footR, 1]]) {
        if (f.mode !== 'plant') continue;
        const c = Math.cos(b.heading), s = Math.sin(b.heading);
        const jwx = b.x + sgn * b.hipXoff * c, jwz = b.z - sgn * b.hipXoff * s;
        const dx = f.x - jwx, dz = f.z - jwz;
        const sol = solveLeg(dx * c - dz * s, f.y - (b.y + hipY), dx * s + dz * c, b.L1, b.L2);
        const foot = fkLeg({ x: jwx, y: b.y + hipY, z: jwz }, b.heading, sol.hipX, sol.knee, b.L1, b.L2);
        const err = Math.hypot(foot.x - f.x, foot.y - f.y, foot.z - f.z);
        if (err > worst) worst = err;
      }
    }
    expect(worst).toBeLessThan(0.03);
  });
  test('stride frequency scales with speed (no foot-skating cadence)', () => {
    const slow = new Body({ x: 0, z: 10, h: 1.98, maxSpeed: 6, accel: 30, turnRate: 9 });
    const fast = new Body({ x: 0, z: 10, h: 1.98, maxSpeed: 6, accel: 30, turnRate: 9 });
    slow.setTarget(0, 8, 10); // amble
    fast.setTarget(0, -20, 4); // sprint-ish
    for (let i = 0; i < 120; i++) { slow.update(1 / 60); fast.update(1 / 60); }
    // after settling, faster body must have advanced stride phase more
    expect(fast.stridePhase).toBeGreaterThan(slow.stridePhase * 1.5);
    expect(fast.speed).toBeGreaterThan(slow.speed);
  });
});

describe('jumps', () => {
  test('apex matches v^2/2g within 5%', () => {
    for (const apex of [0.3, 0.55, 0.85]) {
      const b = new Body({ x: 0, z: 5, h: 2.0 });
      b.jump(apex);
      let maxY = 0;
      for (let i = 0; i < 300 && (b.airborne || i < 2); i++) { b.update(1 / 240); if (b.y > maxY) maxY = b.y; }
      expect(b.airborne).toBe(false);
      expect(Math.abs(maxY - apex) / apex).toBeLessThan(0.05);
    }
  });
  test('landing triggers crouch and landed flag', () => {
    const b = new Body({ x: 0, z: 5, h: 2.0 });
    b.jump(0.5);
    let sawLand = false;
    for (let i = 0; i < 300; i++) { b.update(1 / 60); if (b.landed) { sawLand = true; break; } }
    expect(sawLand).toBe(true);
    expect(b.crouch).toBeGreaterThan(0.5);
  });
});

describe('movement physics', () => {
  test('turn rate is limited (no instant swivels)', () => {
    const b = new Body({ x: 0, z: 7, h: 1.98, maxSpeed: 6, accel: 30, turnRate: 5 });
    b.heading = 0;
    b.setTarget(6, 7, 1); // hard right, 90 degrees
    let maxStep = 0, prev = b.heading;
    for (let i = 0; i < 60; i++) {
      b.update(1 / 60);
      let d = Math.abs(b.heading - prev);
      if (d > Math.PI) d = Math.PI * 2 - d;
      if (d > maxStep) maxStep = d;
      prev = b.heading;
    }
    expect(maxStep).toBeLessThanOrEqual(5 / 60 + 1e-9);
  });
  test('acceleration is capped', () => {
    const b = new Body({ x: 0, z: 7, h: 1.98, maxSpeed: 8, accel: 10, turnRate: 9 });
    b.setTarget(0, -10, 0.5);
    b.update(1 / 60);
    expect(b.speed).toBeLessThanOrEqual(10 / 60 + 1e-9);
  });
  test('no interpenetration: capsule collision resolves overlap', () => {
    const bs = [];
    for (let i = 0; i < 6; i++) {
      const b = new Body({ x: (i - 2.5) * 0.3, z: 7, h: 1.98, build: 'athletic' });
      b.setTarget(0, 7, 2); // all converge on the same spot
      bs.push(b);
    }
    for (let i = 0; i < 240; i++) { for (const b of bs) b.update(1 / 60); resolveCollisions(bs); }
    let minGap = 1e9;
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const d = Math.hypot(bs[i].x - bs[j].x, bs[i].z - bs[j].z);
      const need = bs[i].radius + bs[j].radius;
      if (d - need < minGap) minGap = d - need;
    }
    expect(minGap).toBeGreaterThan(-0.03);
  });
  test('lean follows acceleration direction', () => {
    const b = new Body({ x: 0, z: 10, h: 1.98, maxSpeed: 6, accel: 25, turnRate: 9 });
    b.heading = Math.PI; // facing -z
    b.setTarget(0, 0, 2); // burst forward (-z)
    for (let i = 0; i < 20; i++) b.update(1 / 60);
    expect(b.leanF).toBeGreaterThan(0.05); // leaned into the burst
  });
});
