// bun test for src/style.js — pure player-styling helpers.
import { describe, test, expect } from 'bun:test';
import { hashStr, archLayout, accessoriesFor, buildParams } from '../src/style.js';
import { PLAYERS } from '../src/roster.js';

const PIDS = Object.keys(PLAYERS);

describe('hashStr', () => {
  test('deterministic and well-distributed', () => {
    expect(hashStr('jordan')).toBe(hashStr('jordan'));
    const hs = new Set(PIDS.map(hashStr));
    expect(hs.size).toBe(PIDS.length); // no collisions across the roster
  });
});

describe('archLayout', () => {
  test('one entry per character, crown centered with zero rotation', () => {
    const L = archLayout('ABC', 64, 26, 64, 0.15);
    expect(L).toHaveLength(3);
    expect(L[1].ch).toBe('B');
    expect(L[1].x).toBeCloseTo(64, 9);
    expect(L[1].y).toBeCloseTo(26, 9);
    expect(L[1].rot).toBeCloseTo(0, 9);
  });
  test('symmetric about the center, arc dips at the ends', () => {
    const L = archLayout('SHOWTIME', 64, 26, 64, 0.15);
    const n = L.length;
    for (let i = 0; i < n; i++) {
      const j = n - 1 - i;
      expect(L[i].x + L[j].x).toBeCloseTo(128, 6); // mirror about cx=64
      expect(L[i].rot).toBeCloseTo(-L[j].rot, 9);
      expect(L[i].y).toBeCloseTo(L[j].y, 9);
    }
    // ends sit lower (larger y) than the middle of the word
    const mid = L[Math.floor((n - 1) / 2)];
    expect(L[0].y).toBeGreaterThan(mid.y);
    expect(L[n - 1].y).toBeGreaterThan(mid.y);
  });
  test('rotation bounded by the arc span', () => {
    const step = 0.15;
    const L = archLayout('MAMBA MENTALITY', 64, 26, 64, step);
    const n = L.length; // 15
    const maxRot = ((n - 1) / 2) * step;
    for (const c of L) expect(Math.abs(c.rot)).toBeLessThanOrEqual(maxRot + 1e-9);
    // all chars stay on the canvas horizontally for the jersey texture
    for (const c of L) { expect(c.x).toBeGreaterThan(-4); expect(c.x).toBeLessThan(132); }
  });
  test('single char and empty string do not blow up', () => {
    const one = archLayout('X', 64, 26, 64, 0.15);
    expect(one).toHaveLength(1);
    expect(one[0].rot).toBeCloseTo(0, 9);
    expect(archLayout('', 64, 26, 64, 0.15)).toHaveLength(0);
  });
});

describe('accessoriesFor', () => {
  test('deterministic per player id', () => {
    for (const pid of PIDS) expect(accessoriesFor(pid)).toEqual(accessoriesFor(pid));
  });
  test('valid shape: sleeve/wristband on opposite arms, never the same', () => {
    for (const pid of PIDS) {
      const a = accessoriesFor(pid);
      expect(['L', 'R', null]).toContain(a.sleeve);
      expect(['L', 'R', null]).toContain(a.wristband);
      expect(typeof a.kneeSleeves).toBe('boolean');
      if (a.sleeve && a.wristband) expect(a.sleeve).not.toBe(a.wristband);
    }
  });
  test('plausible distribution across the 12-legends roster', () => {
    const as = PIDS.map(accessoriesFor);
    const sleeves = as.filter(a => a.sleeve).length;
    const bands = as.filter(a => a.wristband).length;
    const knees = as.filter(a => a.kneeSleeves).length;
    expect(sleeves).toBeGreaterThanOrEqual(4); expect(sleeves).toBeLessThanOrEqual(8);
    expect(bands).toBeGreaterThanOrEqual(6); expect(bands).toBeLessThanOrEqual(11);
    expect(knees).toBeGreaterThanOrEqual(2); expect(knees).toBeLessThanOrEqual(6);
  });
});

describe('buildParams', () => {
  test('leg split matches the Body IK convention', () => {
    for (const pid of PIDS) {
      const P = PLAYERS[pid];
      const bp = buildParams(P.build, P.h);
      expect(bp.L1 + bp.L2).toBeCloseTo(bp.legLen, 9);
      expect(bp.L1 / bp.legLen).toBeCloseTo(0.52, 9);
      expect(bp.legLen / P.h).toBeGreaterThan(0.45);
      expect(bp.legLen / P.h).toBeLessThan(0.52);
    }
  });
  test('tapered torso: shoulders broader than waist, all widths sane', () => {
    for (const pid of PIDS) {
      const P = PLAYERS[pid];
      const bp = buildParams(P.build, P.h);
      expect(bp.shoulderW).toBeGreaterThan(bp.waistW);
      expect(bp.waistW).toBeGreaterThan(0.2);
      expect(bp.shoulderW).toBeLessThan(0.9);
      expect(bp.hipW).toBeGreaterThan(0);
      expect(bp.tD).toBeGreaterThan(0);
      expect(bp.hipJointX).toBeGreaterThan(0.05);
      expect(bp.hipJointX).toBeLessThan(0.2);
      expect(bp.armLen).toBeGreaterThan(0.5);
      expect(bp.armLen).toBeLessThan(1.0);
    }
  });
  test('total stature preserved near h', () => {
    for (const pid of PIDS) {
      const P = PLAYERS[pid];
      const bp = buildParams(P.build, P.h);
      // hips + torso stack + head room should land within a few cm of h
      const stack = bp.legLen + bp.torsoH * 1.1 + 0.30 * bp.s;
      expect(stack).toBeGreaterThan(P.h * 0.92);
      expect(stack).toBeLessThan(P.h * 1.06);
    }
  });
  test('unknown build falls back instead of NaN', () => {
    const bp = buildParams('nope', 1.98);
    for (const v of Object.values(bp)) expect(Number.isFinite(v)).toBe(true);
  });
});
