// Legends 3v3 — event-script playback: sim events -> procedural animation.
import { COURT } from './world.js';
import { PLAYERS } from '../src/roster.js';
import { bounce, swish, clang, buzzer, whistle, squeak, cheer, crowdSwell } from './audio.js';

const V3 = (x, y, z) => ({ x, y, z });
const lerp = (a, b, t) => a + (b - a) * t;

export class Playback {
  constructor(world, hooks = {}) {
    this.w = world; this.hooks = hooks;
    this.queue = []; this.cur = null;
    this.pos = new Map();      // pid -> {x,z}
    this.moves = new Map();    // pid -> {fx,fz,tx,tz,t,dur}
    this.ball = { mode: 'held', holder: null, p: V3(0, 1, 7), v: V3(0, 0, 0) };
    this.pose = new Map();     // pid -> {kind, t, dur, data}
    this.t = 0; this.runPh = new Map();
    this.bounceT = 0;
  }
  reset(pids) {
    this.queue = []; this.cur = null; this.pos.clear(); this.moves.clear(); this.pose.clear();
    for (const pid of pids) this.pos.set(pid, { x: 0, z: 10 });
    this.ball = { mode: 'held', holder: null, p: V3(0, 1, 7), v: V3(0, 0, 0) };
  }
  push(events) { this.queue.push(...events); }
  get idle() { return !this.cur && this.queue.length === 0; }

  update(dt, t) {
    this.t = t;
    if (!this.cur && this.queue.length) this.begin(this.queue.shift());
    if (this.cur) {
      this.cur.t += dt;
      const ph = Math.min(1, this.cur.t / this.cur.ev.dur);
      this.tick(this.cur.ev, ph, dt);
      if (ph >= 1) { this.endEv(this.cur.ev); this.cur = null; }
    }
    this.updatePlayers(dt, t);
    this.updateBall(dt, t);
  }

  begin(ev) {
    this.cur = { ev, t: 0 };
    if (this.hooks.onEvent) this.hooks.onEvent(ev);
    const P = (pid) => this.w.players.get(pid);
    switch (ev.t) {
      case 'set': {
        for (const pid of Object.keys(ev.spots)) this.movePlayer(pid, ev.spots[pid][0], ev.spots[pid][1], ev.dur);
        for (const pid of Object.keys(ev.dspots)) this.movePlayer(pid, ev.dspots[pid][0], ev.dspots[pid][1], ev.dur);
        this.ball.mode = 'held'; this.ball.holder = ev.handler;
        break;
      }
      case 'pass': {
        const a = P(ev.from), b = P(ev.to);
        if (a) this.setPose(ev.from, 'pass', ev.dur * 0.7, { nlook: PLAYERS[ev.from].sig === 'nlook' });
        this.dribblePid = null;
        const p0 = this.chest(ev.from), p1 = this.chest(ev.to);
        this.ballFlight(p0, p1, Math.min(0.45, ev.dur * 0.7), 0.9, () => { this.ball.mode = 'held'; this.ball.holder = ev.to; });
        break;
      }
      case 'dribble': {
        const mv = ev.move;
        this.setPose(ev.player, mv === 'crossover' ? 'cross' : mv === 'dreamshake' ? 'shake' : 'dribble', ev.dur, { from: ev.from });
        this.ball.mode = 'held'; this.ball.holder = ev.player;
        this.dribblePid = ev.player;
        break;
      }
      case 'drive': {
        this.movePlayer(ev.player, ev.to[0], ev.to[1], ev.dur);
        this.ball.mode = 'held'; this.ball.holder = ev.player;
        // nearest defender trails
        const dp = this.nearestDef(ev.player, ev.to);
        if (dp) this.movePlayer(dp, ev.to[0] * 0.9, ev.to[1] - 0.7, ev.dur);
        break;
      }
      case 'move': this.movePlayer(ev.player, ev.to[0], ev.to[1], ev.dur); break;
      case 'screen': this.movePlayer(ev.player, ev.at[0], ev.at[1], ev.dur * 0.7); break;
      case 'shot': this.beginShot(ev); break;
      case 'rebound': {
        this.setPose(ev.player, 'rebound', ev.dur, {});
        this.ball.mode = 'held'; this.ball.holder = ev.player;
        const pm = P(ev.player); if (pm) pm.face(0, -1);
        break;
      }
      case 'block': {
        this.setPose(ev.player, 'contest', ev.dur, {});
        const pm = P(ev.player);
        if (pm) { pm.setPos(ev.at[0], ev.at[1] - 0.6); pm.face(0, -1); }
        this.ball.mode = 'loose';
        this.ball.p = V3(ev.at[0], 2.2, ev.at[1]);
        this.ball.v = V3((Math.random() - 0.5) * 3, 2.5, 1.5 + Math.random() * 2);
        this.ball.bounces = 0;
        bounce(1.2);
        break;
      }
      case 'turnover': {
        if (ev.by) { this.ball.mode = 'held'; this.ball.holder = ev.by; }
        else { // out of bounds / travel: ball loose out
          this.ball.mode = 'loose';
          const pp = this.pos.get(ev.player) || { x: 0, z: 8 };
          this.ball.p = V3(pp.x, 1.2, pp.z); this.ball.v = V3((Math.random() - 0.5) * 4, 2, 3); this.ball.bounces = 0;
        }
        whistle();
        break;
      }
      case 'foul': {
        whistle();
        const pm = P(ev.player);
        if (pm) this.movePlayer(ev.player, 0, 5.2, ev.dur); // to the stripe
        break;
      }
      case 'timeout': whistle(); crowdSwell(0.5); break;
      case 'period': if (ev.half === 1 || /half/i.test(ev.txt)) buzzer(); break;
      case 'end': buzzer(); setTimeout(() => cheer(), 900); break;
      case 'score': { const pm = P(ev.player); if (pm) this.setPose(ev.player, 'celebrate', 1.2, {}); break; }
    }
  }

  beginShot(ev) {
    const pm = this.w.players.get(ev.player);
    const from = ev.from;
    if (pm) {
      pm.face(COURT.HX - from[0], COURT.HZ - from[1]);
      this.setPose(ev.player, 'shoot', 1.0, { kind: ev.kind });
    }
    // closest defender contests
    const dp = this.nearestDef(ev.player, from);
    if (dp && ev.contested > 0.25) this.setPose(dp, 'contest', 1.0, {});
    const p0 = V3(from[0], 1.9, from[1]);
    const p1 = V3(COURT.HX, COURT.RIM, COURT.HZ);
    const arc = ev.kind === 'three' ? 2.2 : 1.4;
    this.shotCtx = { ev, p0, p1, arc, phase: 'flight', t: 0, dur: 0.85 };
    this.ball.mode = 'shot';
    if (ev.made) { setTimeout(() => { swish(); this.w.swishNet(); cheer(); }, 850); }
    else { setTimeout(() => clang(), 850); }
  }

  tick(ev, ph, dt) {
    if (ev.t === 'shot' && this.shotCtx && this.shotCtx.ev === ev) this.tickShot(ph, dt);
  }
  tickShot(ph, dt) {
    const c = this.shotCtx;
    c.t += dt;
    if (c.phase === 'flight') {
      const q = Math.min(1, c.t / c.dur);
      this.ball.p = V3(lerp(c.p0.x, c.p1.x, q), lerp(c.p0.y, c.p1.y, q) + Math.sin(q * Math.PI) * c.arc, lerp(c.p0.z, c.p1.z, q));
      if (q >= 1) {
        c.phase = 'rim'; c.t = 0;
        if (c.ev.made) {
          c.dur2 = 0.7; c.p2 = V3(c.p1.x, 0.6, c.p1.z + 0.9);
        } else {
          // rim bounce toward rebound target
          const nxt = this.queue[0];
          let tx = c.p1.x + (Math.random() - 0.5) * 3, tz = c.p1.z + 1 + Math.random() * 2;
          if (nxt && nxt.t === 'rebound') {
            const rp = this.pos.get(nxt.player);
            if (rp) { tx = rp.x; tz = rp.z; }
          }
          c.dur2 = 0.9;
          this.ball.mode = 'loose';
          this.ball.p = V3(c.p1.x, c.p1.y, c.p1.z);
          this.ball.v = V3((tx - c.p1.x) * 1.4, 1.6, (tz - c.p1.z) * 1.4);
          this.ball.bounces = 0;
        }
      }
    } else if (c.phase === 'rim') {
      const q = Math.min(1, c.t / c.dur2);
      if (c.ev.made) {
        this.ball.p = V3(lerp(c.p1.x, c.p2.x, q), lerp(c.p1.y, c.p2.y, q), lerp(c.p1.z, c.p2.z, q));
      }
    }
  }
  endEv(ev) {
    if (ev.t === 'shot') {
      if (this.shotCtx && this.shotCtx.ev === ev) {
        if (ev.made && this.ball.mode === 'shot') {
          this.ball.mode = 'held'; this.ball.holder = ev.player;
        }
        this.shotCtx = null;
      }
    }
  }

  // ---- helpers ----
  chest(pid) {
    const pm = this.w.players.get(pid);
    if (!pm) return V3(0, 1.4, 8);
    const p = pm.group.position;
    return V3(p.x, 1.35 * (pm.h / 1.98), p.z);
  }
  movePlayer(pid, x, z, dur) {
    const p = this.pos.get(pid) || { x: 0, z: 10 };
    this.moves.set(pid, { fx: p.x, fz: p.z, tx: x, tz: z, t: 0, dur: Math.max(0.05, dur) });
  }
  setPose(pid, kind, dur, data) { this.pose.set(pid, { kind, t: 0, dur, data }); }
  nearestDef(pid, at) {
    // defenders = players on court not on shooter's team; approximate via all others
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
    this.ball.mode = 'flight';
    this.ball.f = { p0, p1, t: 0, dur, arc, onDone };
  }

  updatePlayers(dt, t) {
    for (const [pid, pm] of this.w.players) {
      const mv = this.moves.get(pid);
      const pose = this.pose.get(pid);
      if (mv) {
        mv.t += dt;
        const q = Math.min(1, mv.t / mv.dur);
        const x = lerp(mv.fx, mv.tx, q), z = lerp(mv.fz, mv.tz, q);
        pm.setPos(x, z); pm.face(mv.tx - mv.fx, mv.tz - mv.fz);
        this.pos.set(pid, { x, z });
        let ph = this.runPh.get(pid) || 0; ph += dt * 11; this.runPh.set(pid, ph);
        pm.run(ph);
        if (q >= 1) this.moves.delete(pid);
        if (Math.random() < dt * 2) squeak();
      } else if (pose) {
        pose.t += dt;
        const ph = Math.min(1, pose.t / pose.dur);
        const d = pose.data || {};
        switch (pose.kind) {
          case 'shoot': pm.shoot(d.kind || 'mid', ph); break;
          case 'pass': pm.pass(!!d.nlook, ph); break;
          case 'contest': pm.contest(ph); break;
          case 'rebound': pm.rebound(ph); break;
          case 'shake': pm.shake(ph); break;
          case 'cross': pm.cross(ph); break;
          case 'dribble': pm.dribble('R', pose.t * 9); break;
          case 'drive': { let rph = this.runPh.get(pid) || 0; rph += dt * 12; this.runPh.set(pid, rph); pm.run(rph); break; }
          case 'celebrate': pm.celebrate(pose.t); break;
        }
        if (ph >= 1) { this.pose.delete(pid); pm.reset(); }
      } else {
        pm.idle(t + pid.length);
      }
    }
  }

  updateBall(dt, t) {
    const b = this.ball, m = this.w.ball;
    if (b.mode === 'held' && b.holder) {
      const pm = this.w.players.get(b.holder);
      if (pm) {
        const p = pm.group.position;
        const moving = this.moves.has(b.holder);
        const dribbling = moving || this.dribblePid === b.holder;
        const side = 0.42;
        b.p.x = p.x + side; b.p.z = p.z + 0.15;
        b.p.y = dribbling ? Math.abs(Math.sin(t * 11)) * 0.62 + 0.12 : 0.62;
        this.bounceT += dt;
        if (dribbling && this.bounceT > 0.55) { this.bounceT = 0; bounce(0.5); }
      }
    } else if (b.mode === 'flight' && b.f) {
      const f = b.f; f.t += dt;
      const q = Math.min(1, f.t / f.dur);
      b.p = V3(lerp(f.p0.x, f.p1.x, q), lerp(f.p0.y, f.p1.y, q) + Math.sin(q * Math.PI) * f.arc, lerp(f.p0.z, f.p1.z, q));
      if (q >= 1 && f.onDone) { const cb = f.onDone; b.f = null; cb(); }
    } else if (b.mode === 'loose') {
      b.v.y -= 9.8 * dt;
      b.p.x += b.v.x * dt; b.p.y += b.v.y * dt; b.p.z += b.v.z * dt;
      if (b.p.y < 0.121) {
        b.p.y = 0.121;
        if (Math.abs(b.v.y) > 0.8) { bounce(0.6); b.bounces++; }
        b.v.y = -b.v.y * 0.55; b.v.x *= 0.7; b.v.z *= 0.7;
      }
    }
    // 'shot' mode: ball.p set by tickShot
    m.position.set(b.p.x, b.p.y, b.p.z);
    m.rotation.x += dt * 3;
  }
}
