// Legends 3v3 — event-script playback: sim events -> physics-driven animation.
// Ball possession is error-corrected: while held/dribbling the ball position is
// DERIVED from the hand every frame (see ball.js). Movement runs through the
// Body physics model (body.js): velocity/accel, planted feet, IK legs, jumps.
import { COURT } from './world.js';
import { PLAYERS } from '../src/roster.js';
import { Body, resolveCollisions } from './body.js';
import { anchorBall } from './ball.js';
import { bounce, swish, clang, buzzer, whistle, squeak, cheer, crowdSwell } from './audio.js';

const lerp = (a, b, t) => a + (b - a) * t;

export class Playback {
  constructor(world, hooks = {}) {
    this.w = world; this.hooks = hooks;
    this.queue = []; this.cur = null;
    this.pos = new Map();      // pid -> {x,z} (compat)
    this.bodies = new Map();   // pid -> Body
    // ball states: 'held' | 'dribble' | 'pass-flight' | 'shot-flight' | 'loose'
    this.ball = { state: 'held', holder: null, p: { x: 0, y: 1, z: 7 }, v: { x: 0, y: 0, z: 0 }, blend: null, flight: null, lastReleaser: null };
    this.pendingCatch = null;
    this.shotCtx = null;
    this.pose = new Map();     // pid -> {kind, t, dur, data}
    this.t = 0;
    this.stats = { maxGap: 0, gapViolations: 0 };
  }
  reset(pids) {
    this.queue = []; this.cur = null; this.pos.clear(); this.pose.clear();
    this.bodies.clear(); this.pendingCatch = null; this.shotCtx = null;
    this.ball = { state: 'held', holder: null, p: { x: 0, y: 1, z: 7 }, v: { x: 0, y: 0, z: 0 }, blend: null, flight: null, lastReleaser: null };
    this.stats = { maxGap: 0, gapViolations: 0 };
    for (const pid of pids) {
      this.pos.set(pid, { x: 0, z: 10 });
      const P = PLAYERS[pid];
      const pm = this.w.players.get(pid);
      const bp = pm && pm.bodyParams ? pm.bodyParams() : {};
      const b = new Body({
        x: 0, z: 10, heading: Math.PI, h: P.h, build: P.build,
        legLen: bp.legLen || P.h * 0.47,
        L1: bp.L1, L2: bp.L2, hipXoff: bp.hipXoff || 0.11,
        maxSpeed: 5.0 + (P.a.ath - 70) * 0.05,
        accel: 16 + (P.a.ath - 70) * 0.25,
        turnRate: 6.5 + (P.a.handles - 70) * 0.07,
      });
      this.bodies.set(pid, b);
      if (pm) pm.body = b;
    }
  }
  push(events) { this.queue.push(...events); }
  get idle() { return !this.cur && this.queue.length === 0; }

  update(dt, t) {
    this.t = t;
    if (!this.cur && this.queue.length) this.begin(this.queue.shift());
    if (this.cur) {
      this.cur.t += dt;
      if (this.cur.t / this.cur.ev.dur >= 1) this.cur = null;
    }
    if (this.shotCtx) this.tickShot(dt);
    this.updatePlayers(dt, t);
    this.updateBall(dt, t);
  }

  bodyOf(pid) { return this.bodies.get(pid); }

  begin(ev) {
    this.cur = { ev, t: 0 };
    if (this.hooks.onEvent) this.hooks.onEvent(ev);
    const P = (pid) => this.w.players.get(pid);
    switch (ev.t) {
      case 'set': {
        for (const pid of Object.keys(ev.spots)) { const b = this.bodyOf(pid); if (b) b.snap(ev.spots[pid][0], ev.spots[pid][1], Math.PI); }
        for (const pid of Object.keys(ev.dspots)) { const b = this.bodyOf(pid); if (b) b.snap(ev.dspots[pid][0], ev.dspots[pid][1], Math.PI); }
        this.holdBall(ev.handler, 0.2);
        break;
      }
      case 'pass': {
        const a = P(ev.from);
        if (a) this.setPose(ev.from, 'pass', ev.dur * 0.7, { kind: 'pass', to: ev.to, releaseAt: 0.6, dur: ev.dur, nlook: PLAYERS[ev.from].sig === 'nlook' });
        this.holdBall(ev.from, 0);
        break;
      }
      case 'dribble': {
        this.setPose(ev.player, ev.move === 'crossover' ? 'cross' : ev.move === 'dreamshake' ? 'shake' : 'dribble', ev.dur, { from: ev.from });
        this.ball.state = 'dribble'; this.ball.holder = ev.player; this.ball.blend = null;
        break;
      }
      case 'drive': {
        const b = this.bodyOf(ev.player); if (b) b.setTarget(ev.to[0], ev.to[1], ev.dur);
        this.ball.state = 'dribble'; this.ball.holder = ev.player; this.ball.blend = null;
        // nearest defender trails
        const dp = this.nearestDef(ev.player, ev.to);
        if (dp) { const db = this.bodyOf(dp); if (db) db.setTarget(ev.to[0] * 0.9, ev.to[1] - 0.7, ev.dur); }
        break;
      }
      case 'move': { const b = this.bodyOf(ev.player); if (b) b.setTarget(ev.to[0], ev.to[1], ev.dur); break; }
      case 'screen': { const b = this.bodyOf(ev.player); if (b) b.setTarget(ev.at[0], ev.at[1], ev.dur * 0.7); break; }
      case 'shot': this.beginShot(ev); break;
      case 'rebound': {
        this.setPose(ev.player, 'rebound', ev.dur, { jumpAt: 0.05, jumpApex: 0.55 });
        const pm = P(ev.player); if (pm) pm.face(0, -1);
        const b = this.bodyOf(ev.player); if (b) b.faceHeading = Math.PI;
        // catch the loose ball when it reaches the hands (no snap-pop)
        this.pendingCatch = { player: ev.player, until: this.t + 1.6 };
        break;
      }
      case 'block': {
        this.setPose(ev.player, 'contest', ev.dur, { jumpAt: 0.1, jumpApex: 0.5 });
        const pm = P(ev.player);
        const b = this.bodyOf(ev.player);
        if (b) b.snap(ev.at[0], ev.at[1] - 0.6, Math.PI);
        else if (pm) pm.setPos(ev.at[0], ev.at[1] - 0.6);
        if (pm) pm.face(0, -1);
        const hand = pm && pm.handWorld ? pm.handWorld() : { x: ev.at[0], y: 2.2, z: ev.at[1] };
        this.ball.state = 'loose';
        this.ball.p = { x: hand.x, y: hand.y, z: hand.z };
        this.ball.v = { x: (Math.random() - 0.5) * 3, y: 2.5, z: 1.5 + Math.random() * 2 };
        this.ball.bounces = 0;
        bounce(1.2);
        break;
      }
      case 'turnover': {
        if (ev.by) {
          // steal: ball travels from the victim's hand to the thief's hand
          const vm = P(ev.player), tm = P(ev.by);
          const p0 = vm && vm.handWorld ? vm.handWorld() : { x: 0, y: 1.2, z: 8 };
          const p1 = tm && tm.handWorld ? tm.handWorld() : { x: 0, y: 1.2, z: 8 };
          this.ballFlight({ x: p0.x, y: p0.y, z: p0.z }, { x: p1.x, y: p1.y, z: p1.z }, 0.25, 0.3,
            () => this.holdBall(ev.by, 0.08));
        } else {
          this.ball.state = 'loose';
          const pp = this.pos.get(ev.player) || { x: 0, z: 8 };
          this.ball.p = { x: pp.x, y: 1.2, z: pp.z };
          this.ball.v = { x: (Math.random() - 0.5) * 4, y: 2, z: 3 };
          this.ball.bounces = 0;
        }
        whistle();
        break;
      }
      case 'foul': {
        whistle();
        const b = this.bodyOf(ev.player);
        if (b) b.setTarget(0, 5.2, ev.dur);
        break;
      }
      case 'timeout': whistle(); crowdSwell(0.5); break;
      case 'period': if (ev.half === 1 || /half/i.test(ev.txt)) buzzer(); break;
      case 'end': buzzer(); setTimeout(() => cheer(), 900); break;
      case 'score': { const pm = P(ev.player); if (pm) { this.setPose(ev.player, 'celebrate', 1.2, {}); const b = this.bodyOf(ev.player); if (b) b.jump(0.22); } break; }
    }
  }

  beginShot(ev) {
    const pm = this.w.players.get(ev.player);
    const body = this.bodyOf(ev.player);
    const bx = body ? body.x : ev.from[0], bz = body ? body.z : ev.from[1];
    const faceA = Math.atan2(COURT.HX - bx, COURT.HZ - bz);
    if (pm) {
      pm.face(COURT.HX - bx, COURT.HZ - bz);
      this.setPose(ev.player, 'shoot', 1.0, {
        kind: ev.kind, releaseAt: 0.55, kind2: 'shot', ev,
        jumpAt: 0.22, jumpApex: ev.kind === 'dunk' ? 0.8 : ev.kind === 'layup' ? 0.42 : ev.kind === 'freethrow' ? 0.06 : 0.3,
      });
    }
    if (body) body.faceHeading = faceA;
    // closest defender contests
    const dp = this.nearestDef(ev.player, [bx, bz]);
    if (dp && ev.contested > 0.25) {
      this.setPose(dp, 'contest', 1.0, { jumpAt: 0.3, jumpApex: 0.5 });
    }
    // ball stays possessed until the release frame
    this.holdBall(ev.player, 0);
    if (ev.made) { setTimeout(() => { swish(); this.w.swishNet(); cheer(); }, 1250); }
    else { setTimeout(() => clang(), 1250); }
  }

  doRelease(pid, d) {
    const pm = this.w.players.get(pid);
    if (d.kind === 'pass') {
      const tm = this.w.players.get(d.to);
      const hand = pm && pm.handWorld ? pm.handWorld() : { x: 0, y: 1.4, z: 8 };
      const th = tm && tm.handWorld ? tm.handWorld() : { x: 0, y: 1.2, z: 8 };
      const p0 = { x: hand.x, y: hand.y, z: hand.z };
      const p1 = { x: th.x, y: th.y + 0.12, z: th.z };
      this.ballFlight(p0, p1, Math.min(0.45, (d.dur || 0.5) * 0.7), 0.9,
        () => this.holdBall(d.to, 0.10));
    } else if (d.kind2 === 'shot') {
      this.releaseShot(d.ev);
    }
  }

  releaseShot(ev) {
    const pm = this.w.players.get(ev.player);
    // trajectory START = release-hand world position (no pop)
    const hand = pm && pm.handWorld ? pm.handWorld() : { x: ev.from[0], y: 1.9, z: ev.from[1] };
    const p0 = { x: hand.x, y: hand.y, z: hand.z };
    const p1 = { x: COURT.HX, y: COURT.RIM, z: COURT.HZ };
    const arc = ev.kind === 'three' ? 2.2 : 1.4;
    this.shotCtx = { ev, p0, p1, arc, phase: 'flight', t: 0, dur: 0.7 };
    this.ball.state = 'shot-flight';
    this.ball.lastReleaser = pm || null;
    if (pm && pm.setGrip) pm.setGrip('R', 0.08);
  }

  tickShot(dt) {
    const c = this.shotCtx; if (!c) return;
    c.t += dt;
    if (c.phase === 'flight') {
      const q = Math.min(1, c.t / c.dur);
      this.ball.p.x = lerp(c.p0.x, c.p1.x, q);
      this.ball.p.y = lerp(c.p0.y, c.p1.y, q) + Math.sin(q * Math.PI) * c.arc;
      this.ball.p.z = lerp(c.p0.z, c.p1.z, q);
      if (q >= 1) {
        c.phase = 'rim'; c.t = 0;
        if (c.ev.made) {
          c.dur2 = 0.7; c.p2 = { x: c.p1.x, y: 0.6, z: c.p1.z + 0.9 };
        } else {
          // rim bounce toward rebound target
          const nxt = this.queue[0];
          let tx = c.p1.x + (Math.random() - 0.5) * 3, tz = c.p1.z + 1 + Math.random() * 2;
          if (nxt && nxt.t === 'rebound') {
            const rp = this.pos.get(nxt.player);
            if (rp) { tx = rp.x; tz = rp.z; }
          }
          c.dur2 = 0.9;
          this.ball.state = 'loose';
          this.ball.p = { x: c.p1.x, y: c.p1.y, z: c.p1.z };
          this.ball.v = { x: (tx - c.p1.x) * 1.4, y: 1.6, z: (tz - c.p1.z) * 1.4 };
          this.ball.bounces = 0;
        }
      }
    } else if (c.phase === 'rim') {
      const q = Math.min(1, c.t / c.dur2);
      if (c.ev.made) {
        this.ball.p.x = lerp(c.p1.x, c.p2.x, q);
        this.ball.p.y = lerp(c.p1.y, c.p2.y, q);
        this.ball.p.z = lerp(c.p1.z, c.p2.z, q);
        if (q >= 1) { this.shotCtx = null; this.holdBall(c.ev.player, 0.12); }
      } else if (q >= 1) {
        this.shotCtx = null;
      }
    }
  }

  holdBall(pid, blendDur) {
    this.ball.state = 'held';
    this.ball.holder = pid;
    if (blendDur > 0) {
      this.ball.blend = { fx: this.ball.p.x, fy: this.ball.p.y, fz: this.ball.p.z, t: 0, dur: blendDur };
    } else this.ball.blend = null;
  }

  // ---- helpers ----
  setPose(pid, kind, dur, data) { this.pose.set(pid, { kind, t: 0, dur, data }); }
  nearestDef(pid, at) {
    let best = null, bd = 1e9;
    const mine = this.shooterTeamOf(pid);
    for (const [id, pm] of this.w.players) {
      if (id === pid || this.shooterTeamOf(id) === mine) continue;
      const pp = pm.group.position;
      const d = (pp.x - at[0]) ** 2 + (pp.z - at[1]) ** 2;
      if (d < bd) { bd = d; best = id; }
    }
    return best;
  }
  shooterTeamOf(pid) { return this.teamOf ? this.teamOf(pid) : null; }

  ballFlight(p0, p1, dur, arc, onDone) {
    this.ball.state = 'pass-flight';
    this.ball.flight = { p0, p1, t: 0, dur, arc, onDone };
    const pm = this.w.players.get(this.ball.holder);
    this.ball.lastReleaser = pm || null;
    if (pm && pm.setGrip) pm.setGrip('R', 0.08);
  }

  updatePlayers(dt, t) {
    // 1. advance poses; fire release/jump triggers
    for (const [pid, pm] of this.w.players) {
      const body = this.bodies.get(pid);
      const pose = this.pose.get(pid);
      if (pose) {
        pose.t += dt;
        const ph = Math.min(1, pose.t / pose.dur);
        const d = pose.data || {};
        if (d.releaseAt !== undefined && !d.released && ph >= d.releaseAt) { d.released = true; this.doRelease(pid, d); }
        if (d.jumpAt !== undefined && !d.jumped && ph >= d.jumpAt) { d.jumped = true; if (body) body.jump(d.jumpApex || 0.3); }
        switch (pose.kind) {
          case 'shoot': pm.shoot(d.kind || 'mid', ph); break;
          case 'pass': pm.pass(!!d.nlook, ph); break;
          case 'contest': pm.contest(ph); break;
          case 'rebound': pm.rebound(ph); break;
          case 'shake': pm.shake(ph); break;
          case 'cross': pm.cross(ph); break;
          case 'dribble': pm.dribble('R', pose.t * 9); break;
          case 'celebrate': pm.celebrate(pose.t); break;
        }
        if (ph >= 1) { this.pose.delete(pid); pm.reset(); }
      } else {
        pm.idle(t + pid.length);
      }
      if (body) {
        body.crouchTarget = pose && (pose.kind === 'dribble' || pose.kind === 'cross' || pose.kind === 'shake') ? 0.2 : 0;
        // mesh pose crouch (e.g. shot gather) feeds the body; applied next integrate
        if (pm.crouchHint) body.crouchTarget = Math.max(body.crouchTarget, pm.crouchHint);
      }
    }
    // 2. integrate bodies, then resolve collisions
    for (const b of this.bodies.values()) b.update(dt);
    resolveCollisions([...this.bodies.values()]);
    // 3. apply to meshes
    for (const [pid, pm] of this.w.players) {
      const body = this.bodies.get(pid);
      if (body) {
        if (pm.applyBody) pm.applyBody(body);
        else { pm.setPos(body.x, body.z); pm.face(Math.sin(body.heading), Math.cos(body.heading)); }
        if (body.landed) { if (this.w.puff) this.w.puff(body.x, body.z, false); body.landed = false; }
        if (body.justPlanted && body.speed > 2.5 && Math.random() < 0.4) squeak();
        body.justPlanted = null;
        this.pos.set(pid, { x: body.x, z: body.z });
      }
    }
  }

  dribblePhase(mesh) {
    const b = mesh.body;
    return b ? b.stridePhase : this.t * 9;
  }

  updateBall(dt, t) {
    const b = this.ball, m = this.w.ball;
    const holderMesh = b.holder ? this.w.players.get(b.holder) : null;
    if ((b.state === 'held' || b.state === 'dribble') && holderMesh && holderMesh.handWorld) {
      const hand = holderMesh.handWorld();
      const hx = hand.x, hy = hand.y, hz = hand.z;
      if (b.blend) {
        // catch blend: ease from flight position onto the hand (kills pops)
        b.blend.t += dt;
        const q = Math.min(1, b.blend.t / b.blend.dur);
        const ax = { x: 0, y: 0, z: 0 };
        anchorBall(ax, b.state, { x: hx, y: hy, z: hz }, this.dribblePhase(holderMesh));
        b.p.x = lerp(b.blend.fx, ax.x, q);
        b.p.y = lerp(b.blend.fy, ax.y, q);
        b.p.z = lerp(b.blend.fz, ax.z, q);
        if (q >= 1) b.blend = null;
      } else {
        anchorBall(b.p, b.state, { x: hx, y: hy, z: hz }, this.dribblePhase(holderMesh));
      }
      if (!b.blend) {
        // runtime invariant: possessed ball must track the hand.
        // held -> 3D gap to the palm; dribble -> lateral gap to the hand's
        // vertical line (the ball legitimately leaves the hand downward).
        if (b.state === 'held') {
          const gap = Math.hypot(b.p.x - hx, b.p.y - hy, b.p.z - hz);
          if (gap > this.stats.maxGap) this.stats.maxGap = gap;
          if (gap > 0.25) this.stats.gapViolations++;
        } else {
          const lat = Math.hypot(b.p.x - hx, b.p.z - hz);
          if (lat > this.stats.maxGap) this.stats.maxGap = lat;
          if (lat > 0.18 || b.p.y < 0.10 || b.p.y > hy + 0.05) this.stats.gapViolations++;
        }
      }
      if (holderMesh.setGrip) holderMesh.setGrip('R', b.state === 'dribble' ? 0.72 : 0.92);
    } else if (b.state === 'pass-flight' && b.flight) {
      const f = b.flight; f.t += dt;
      const q = Math.min(1, f.t / f.dur);
      b.p.x = lerp(f.p0.x, f.p1.x, q);
      b.p.y = lerp(f.p0.y, f.p1.y, q) + Math.sin(q * Math.PI) * f.arc;
      b.p.z = lerp(f.p0.z, f.p1.z, q);
      if (q >= 1 && f.onDone) { const cb = f.onDone; b.flight = null; cb(); }
    } else if (b.state === 'loose') {
      b.v.y -= 9.81 * dt;
      b.p.x += b.v.x * dt; b.p.y += b.v.y * dt; b.p.z += b.v.z * dt;
      if (b.p.y < 0.121) {
        b.p.y = 0.121;
        if (Math.abs(b.v.y) > 0.8) { bounce(0.6); b.bounces = (b.bounces || 0) + 1; }
        b.v.y = -b.v.y * 0.55; b.v.x *= 0.7; b.v.z *= 0.7;
      }
      // pending catch: rebounder grabs it when it reaches the hands
      const pc = this.pendingCatch;
      if (pc) {
        const pm = this.w.players.get(pc.player);
        let caught = this.t > pc.until;
        if (!caught && pm && pm.handWorld) {
          const hh = pm.handWorld();
          caught = Math.hypot(b.p.x - hh.x, b.p.y - hh.y, b.p.z - hh.z) < 0.55;
        }
        if (caught) { this.pendingCatch = null; this.holdBall(pc.player, 0.08); }
      }
    }
    // 'shot-flight': ball.p driven by tickShot
    m.position.set(b.p.x, b.p.y, b.p.z);
    m.rotation.x += dt * 3;
  }
}
