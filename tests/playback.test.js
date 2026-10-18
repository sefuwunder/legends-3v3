// Playback integration tests: ball-possession invariant, release anchoring,
// and no-interpenetration across a full simmed game, using fake meshes.
// The fake hand is a documented approximation of the rig's hand position;
// what these tests verify is the ANCHORING WIRING: the ball must track
// whatever handWorld() reports, across every event and transition.
import { describe, test, expect } from 'bun:test';
import { Game } from '../src/sim.js';
import { Playback } from '../public/playback.js';
import { PLAYERS, SQUADS } from '../src/roster.js';

class FakeMesh {
  constructor(pid) {
    this.pid = pid;
    this.h = PLAYERS[pid].h;
    this.group = { position: { x: 0, y: 0, z: 0 } };
    this.heading = Math.PI;
    this.body = null;
    this._pose = { kind: 'idle', ph: 0 };
    this.gripR = 0.9;
  }
  setPos(x, z) { this.group.position.x = x; this.group.position.z = z; }
  face(dx, dz) { if (dx || dz) this.heading = Math.atan2(dx, dz); }
  reset() { this._pose = { kind: 'idle', ph: 0 }; }
  idle() { this._pose = { kind: 'idle', ph: 0 }; }
  dribble() { this._pose = { kind: 'dribble', ph: 0 }; }
  shoot(kind, ph) { this._pose = { kind: 'shoot', ph }; }
  pass() { this._pose = { kind: 'pass', ph: 0 }; }
  contest() { this._pose = { kind: 'contest', ph: 0 }; }
  rebound() { this._pose = { kind: 'rebound', ph: 0 }; }
  shake() { this._pose = { kind: 'dribble', ph: 0 }; }
  cross() { this._pose = { kind: 'dribble', ph: 0 }; }
  celebrate() { this._pose = { kind: 'idle', ph: 0 }; }
  setGrip(s, c) { this.gripR = c; }
  bodyParams() {
    const legLen = this.h * 0.47;
    return { legLen, L1: legLen * 0.52, L2: legLen * 0.48, hipXoff: 0.11 };
  }
  applyBody(b) {
    this.body = b;
    this.group.position.x = b.x; this.group.position.y = b.y; this.group.position.z = b.z;
  }
  // approximate arm model: hand local offset by pose (mirrors the rig's intent)
  handLocal() {
    const h = this.h, q = this._pose;
    switch (q.kind) {
      case 'shoot': {
        const e = Math.min(1, Math.max(0, (q.ph - 0.3) / 0.25));
        return { x: 0.15, y: (0.72 + 0.38 * e) * h, z: 0.12 + 0.28 * e };
      }
      case 'pass': return { x: 0.25, y: 0.72 * h, z: 0.45 };
      case 'dribble': return { x: 0.34, y: 0.52 * h, z: 0.30 };
      case 'rebound':
      case 'contest': return { x: 0.2, y: 0.95 * h, z: 0.1 };
      default: return { x: 0.30, y: 0.55 * h, z: 0.12 };
    }
  }
  handWorld() {
    const l = this.handLocal();
    const b = this.body;
    const bx = b ? b.x : this.group.position.x;
    const bz = b ? b.z : this.group.position.z;
    const by = b ? b.y : 0;
    const hd = b ? b.heading : this.heading;
    const c = Math.cos(hd), s = Math.sin(hd);
    return { x: bx + l.x * c + l.z * s, y: by + l.y, z: bz - l.x * s + l.z * c };
  }
}

class FakeWorld {
  constructor(pids) {
    this.players = new Map(pids.map(pid => [pid, new FakeMesh(pid)]));
    this.ball = {
      position: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } },
      rotation: { x: 0 },
    };
  }
  puff() {}
  swishNet() {}
}

function runGame(seed) {
  const pidsA = SQUADS.WCI.players, pidsB = SQUADS.SHO.players;
  const pids = [...pidsA, ...pidsB];
  const inA = new Set(pidsA);
  const g = new Game('WCI', 'SHO', {
    seed,
    schemeA: { off: 'iso', def: 'man', tempo: 'half' },
    schemeB: { off: 'motion', def: 'zone', tempo: 'half' },
  });
  const w = new FakeWorld(pids);
  const pb = new Playback(w, {});
  pb.teamOf = pid => (inA.has(pid) ? 'WCI' : 'SHO');
  pb.reset(pids);
  // hook the release moment: record the exact hand position at release
  const releaseHands = [];
  const origRelease = pb.doRelease.bind(pb);
  pb.doRelease = (pid, d) => {
    const pm = w.players.get(pid);
    if (pm) releaseHands.push({ pid, hand: { ...pm.handWorld() } });
    origRelease(pid, d);
  };
  const rec = { maxGap: 0, violations: 0, minPair: 1e9, releases: [], frames: 0 };
  let prevState = pb.ball.state;
  let t = 0, guard = 0;
  while ((g.hasMore() || !pb.idle) && guard++ < 300000) {
    if (pb.idle && g.hasMore()) pb.push(g.nextPossession());
    pb.update(1 / 60, t); t += 1 / 60; rec.frames++;
    const b = pb.ball;
    // (b) possession invariant, measured against the fake hand
    if ((b.state === 'held' || b.state === 'dribble') && !b.blend && b.holder) {
      const hh = w.players.get(b.holder).handWorld();
      if (b.state === 'held') {
        const gap = Math.hypot(b.p.x - hh.x, b.p.y - hh.y, b.p.z - hh.z);
        if (gap > rec.maxGap) rec.maxGap = gap;
        if (gap > 0.25) rec.violations++;
      } else {
        const lat = Math.hypot(b.p.x - hh.x, b.p.z - hh.z);
        if (lat > rec.maxGap) rec.maxGap = lat;
        if (lat > 0.18 || b.p.y < 0.10 || b.p.y > hh.y + 0.05) rec.violations++;
      }
    }
    // (d) pairwise interpenetration
    const bodies = [...pb.bodies.values()];
    for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
      const d = Math.hypot(bodies[i].x - bodies[j].x, bodies[i].z - bodies[j].z) - (bodies[i].radius + bodies[j].radius);
      if (d < rec.minPair) rec.minPair = d;
    }
    // (e) release capture: first frame of each flight — the trajectory's
    // captured start point must equal the hand AT the release moment
    if ((b.state === 'pass-flight' || b.state === 'shot-flight') && prevState !== b.state) {
      const p0 = b.state === 'pass-flight' && b.flight ? b.flight.p0
        : (pb.shotCtx ? pb.shotCtx.p0 : null);
      const rh = releaseHands[releaseHands.length - 1];
      if (p0 && rh) {
        const gap = Math.hypot(p0.x - rh.hand.x, p0.y - rh.hand.y, p0.z - rh.hand.z);
        rec.releases.push({ kind: b.state, gap, y: p0.y });
      }
    }
    prevState = b.state;
  }
  return { g, pb, rec, completed: g.done && pb.idle };
}

describe('playback possession', () => {
  test('full game: possessed ball tracks the hand (gap < 0.25m, no violations)', () => {
    const { rec, completed } = runGame(42);
    expect(completed).toBe(true);
    expect(rec.frames).toBeGreaterThan(1000);
    expect(rec.violations).toBe(0);
    expect(rec.maxGap).toBeLessThan(0.25);
    // the playback's own dev invariant agrees
    expect(rec.violations).toBe(0);
  }, 60000);
  test('full game: no player interpenetration', () => {
    const { rec, completed } = runGame(77);
    expect(completed).toBe(true);
    expect(rec.minPair).toBeGreaterThan(-0.03);
  }, 60000);
  test('pass/shot trajectories start at the release hand (< 0.1m)', () => {
    const { rec, completed } = runGame(123);
    expect(completed).toBe(true);
    expect(rec.releases.length).toBeGreaterThan(30);
    let worst = 0;
    for (const r of rec.releases) {
      if (r.gap > worst) worst = r.gap;
      expect(r.gap).toBeLessThan(0.1);
    }
    // shots release above the head (hand-derived, not the old fixed 1.9m chest point)
    const shots = rec.releases.filter(r => r.kind === 'shot-flight');
    expect(shots.length).toBeGreaterThan(10);
    for (const s of shots) expect(s.y).toBeGreaterThan(1.7);
  }, 60000);
  test('playback dev stats stay clean over a second seed', () => {
    const { pb, completed } = runGame(2024);
    expect(completed).toBe(true);
    expect(pb.stats.gapViolations).toBe(0);
    expect(pb.stats.maxGap).toBeLessThan(0.25);
  }, 60000);
});
