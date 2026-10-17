// Legends 3v3 — possession-based coaching sim engine.
// Deterministic w/ seeded RNG. Shared module: bun tests + browser.
// Court: half-court, x in [-7.5,7.5], z in [0,14]. Hoop at (0,1.575), rim 3.05m.

import { PLAYERS, SQUADS } from './roster.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const HOOP = { x: 0, z: 1.575 };
const ARC_R = 6.75;

export const HALF_LEN = 300; // 5:00 halves

function pick(rng, arr, weights) {
  let s = 0; for (const w of weights) s += w;
  let r = rng() * s;
  for (let i = 0; i < arr.length; i++) { r -= weights[i]; if (r <= 0) return arr[i]; }
  return arr[arr.length - 1];
}

const SHOT_LABEL = {
  three: 'from deep', mid: 'pull-up jumper', fadeaway: 'fadeaway', pullup: 'pull-up',
  layup: 'driving layup', dunk: 'powerful dunk', bank: 'bank shot', hook: 'hook shot',
  dreamshake: 'Dream Shake', onelegger: 'one-legged fadeaway', freethrow: 'free throw',
};

function shotSpot(kind, rng) {
  const j = () => (rng() - 0.5);
  if (kind === 'three') { const a = (rng() * 1.6 - 0.8); return [Math.sin(a) * (ARC_R + 0.8 + rng()), 1.575 + Math.cos(a) * (ARC_R + 0.8 + rng()) * 0.9]; }
  if (kind === 'mid') { const spots = [[-4.5, 6.5], [4.5, 6.5], [-3.2, 8.5], [3.2, 8.5], [0, 7.5]]; return spots[(rng() * spots.length) | 0]; }
  if (kind === 'bank' || kind === 'hook' || kind === 'dreamshake') return [j() * 2 + (rng() < 0.5 ? -2.2 : 2.2), 3.6 + rng() * 1.5];
  if (kind === 'onelegger' || kind === 'fadeaway' || kind === 'pullup') return [j() * 7, 4.5 + rng() * 3];
  return [j() * 2.4, 2.6 + rng() * 1.4]; // close
}

// Offensive sets: 3 spots [x,z] for the offense by scheme.
function offSpots(scheme, rng) {
  const top = [0, 11.5], wingL = [-5.5, 8.5], wingR = [5.5, 8.5], cornerL = [-6.5, 3.5], cornerR = [6.5, 3.5],
        blockL = [-2.4, 3.2], blockR = [2.4, 3.2], elbowL = [-3.4, 6.8], elbowR = [3.4, 6.8];
  switch (scheme) {
    case 'post': return [top, rng() < 0.5 ? blockL : blockR, rng() < 0.5 ? wingR : wingL];
    case 'motion': return [top, cornerL, wingR];
    case 'pnr': return [top, blockL, wingR];
    case 'run': return [top, wingL, wingR];
    default: return [top, wingL, elbowR]; // iso
  }
}
function defSpots(defScheme, ospots) {
  if (defScheme === 'zone') return [[0, 6.5], [-3.5, 4.5], [3.5, 4.5]];
  if (defScheme === 'pack') return [[0, 4.5], [-2.2, 3.6], [2.2, 3.6]];
  if (defScheme === 'press') return ospots.map(([x, z]) => [x * 0.9, z + 0.4]);
  return ospots.map(([x, z]) => [x * 0.92, z - 0.9]); // man: between man and hoop
}

export class Game {
  constructor(aId, bId, opts = {}) {
    this.rng = mulberry32(opts.seed ?? 1);
    this.aId = aId; this.bId = bId;
    this.teams = {
      [aId]: this.mkTeam(aId, opts.schemeA, opts.hotA),
      [bId]: this.mkTeam(bId, opts.schemeB, opts.hotB),
    };
    this.offId = rngPickFirst(this.rng, aId, bId);
    this.clock = HALF_LEN; this.half = 1; this.done = false;
    this.events = [];
    this.lastRun = [0, 0]; // momentum: pts in last 5 poss per team
    this.possCount = 0;
    this.winner = null;
    this.lastPasser = null;
    this.emit({ t: 'start', a: aId, b: bId, dur: 1.2, txt: `Tip-off! ${SQUADS[aId].name} vs ${SQUADS[bId].name}` });
  }
  mkTeam(sid, scheme, hot) {
    const ids = SQUADS[sid].players;
    const best = [...ids].sort((a, b) =>
      (PLAYERS[b].a.mid + PLAYERS[b].a.close + PLAYERS[b].a.three) - (PLAYERS[a].a.mid + PLAYERS[a].a.close + PLAYERS[a].a.three))[0];
    return {
      sid, scheme: scheme || { off: 'iso', def: 'man', tempo: 'half' },
      hot: hot || best, timeouts: 2, score: 0, fouls: 0,
      players: Object.fromEntries(ids.map(id => [id, { stam: 100, stats: blankStats() }])),
      order: ids,
    };
  }
  off() { return this.teams[this.offId]; }
  def() { return this.teams[this.offId === this.aId ? this.bId : this.aId]; }
  emit(e) {
    e.s = [this.teams[this.aId].score, this.teams[this.bId].score];
    e.c = Math.max(0, this.clock); e.half = this.half;
    this.events.push(e);
  }
  stamOf(pid, team) { return team.players[pid].stam; }
  drain(team, amt) { for (const pid of team.order) team.players[pid].stam = clamp(team.players[pid].stam - amt * (100 / PLAYERS[pid].a.stam) * 0.9, 20, 100); }

  // ---- main driver: simulate ONE possession, return its events ----
  nextPossession() {
    if (this.done) return [];
    const startIdx = this.events.length;
    this.runPossession();
    return this.events.slice(startIdx);
  }
  hasMore() { return !this.done; }

  runPossession() {
    const off = this.off(), def = this.def();
    const rng = this.rng;
    this.possCount++;
    this.lastPasser = null;
    // tempo -> clock + stamina
    const fast = off.scheme.tempo === 'push' || def.scheme.def === 'press';
    const possTime = fast ? 7 + rng() * 6 : 10 + rng() * 8;
    this.clock -= possTime;
    this.drain(off, fast ? 2.4 : 1.5);
    this.drain(def, def.scheme.def === 'press' ? 2.6 : 1.5);

    const ospots = offSpots(off.scheme.off, rng);
    const dspots = defSpots(def.scheme.def, ospots);
    const handler = this.pickHandler(off);
    const hIdx = off.order.indexOf(handler);
    // set: handler takes the 'top' spot
    const os = [ospots[0], ospots[1], ospots[2]];
    // rotate so handler is at index 0 spot
    const ordered = [handler, ...off.order.filter(p => p !== handler)];
    const spots = {}; ordered.forEach((pid, i) => spots[pid] = os[i % 3]);
    const dspotsBy = {}; def.order.forEach((pid, i) => dspotsBy[pid] = dspots[i % 3]);

    this.emit({ t: 'set', off: this.offId, spots, dspots: dspotsBy, handler, dur: 0.8 });

    // turnover check (before the action)
    const pressBonus = def.scheme.def === 'press' ? 0.055 : 0;
    const hp = PLAYERS[handler].a;
    let tovP = 0.055 + pressBonus + (off.scheme.off === 'run' ? 0.02 : 0)
      - (hp.handles - 70) * 0.0012 - (hp.passing - 70) * 0.0005;
    tovP = clamp(tovP, 0.025, 0.24);
    if (rng() < tovP) { this.doTurnover(off, def, handler, spots[handler]); this.endPossession(); return; }

    // choose action by offensive scheme
    const action = this.pickAction(off, def, handler, ordered);
    this.resolveAction(off, def, handler, ordered, spots, action);
    this.endPossession();
  }

  pickHandler(off) {
    const r = this.rng();
    if (r < 0.42) return off.hot;
    const guards = off.order.filter(id => PLAYERS[id].pos === 'G');
    if (r < 0.72 && guards.length) return guards[0];
    return off.order[(this.rng() * off.order.length) | 0];
  }

  pickAction(off, def, handler, ordered) {
    const rng = this.rng, hp = PLAYERS[handler];
    const bigs = ordered.filter(id => PLAYERS[id].pos === 'B');
    const shooter = ordered.filter(id => PLAYERS[id].a.three > 84);
    switch (off.scheme.off) {
      case 'post': return rng() < 0.55 && bigs.length ? { k: 'post', who: bigs[0] } : { k: 'iso', who: handler };
      case 'pnr': { const big = bigs[0] || ordered[1]; return { k: rng() < 0.5 ? 'pnr-drive' : 'pnr-pop', who: handler, with: big }; }
      case 'motion': return { k: rng() < 0.55 ? 'motion-three' : 'cut', who: shooter.length ? shooter[(rng() * shooter.length) | 0] : handler };
      case 'run': return { k: rng() < 0.45 ? 'early-three' : 'early-drive', who: handler };
      default: return { k: 'iso', who: hp.a.close > 90 && rng() < 0.4 ? handler : (off.hot || handler) };
    }
  }

  contestFor(def, shooterId, kind) {
    const sp = PLAYERS[shooterId].a;
    const matchups = def.order.map(id => PLAYERS[id]);
    const perD = Math.max(...matchups.map(p => p.a.perD));
    const intD = Math.max(...matchups.map(p => p.a.intD));
    let c;
    const paint = (kind === 'close' || kind === 'post' || kind === 'dunk' || kind === 'layup' || kind === 'hook' || kind === 'bank' || kind === 'dreamshake');
    switch (def.scheme.def) {
      case 'zone': c = paint ? 0.55 : 0.30; break;
      case 'pack': c = paint ? 0.68 : 0.32; break;
      case 'press': c = 0.50; break;
      default: c = 0.45;
    }
    c += (paint ? intD : perD) / 100 * 0.15 - 0.075;
    return clamp(c, 0.05, 0.9);
  }

  shotProb(pid, kind, contest, team) {
    const p = PLAYERS[pid], s = p.a;
    const skill = { three: s.three, mid: s.mid, fadeaway: s.mid, pullup: s.mid, onelegger: s.mid, close: s.close, layup: s.close, dunk: s.close, post: s.post, bank: s.post, hook: s.post, dreamshake: s.post, freethrow: s.ft }[kind] ?? 70;
    let base;
    if (kind === 'three') base = 0.12 + 0.62 * (skill / 100);
    else if (kind === 'freethrow') base = 0.25 + 0.70 * (skill / 100);
    else if (kind === 'close' || kind === 'layup' || kind === 'dunk') base = 0.30 + 0.58 * (skill / 100);
    else base = 0.22 + 0.58 * (skill / 100);
    base *= (1 - 0.55 * contest);
    base *= (0.82 + 0.18 * (team.players[pid].stam / 100));
    if (this.isClutch()) base *= (0.92 + 0.16 * (s.clutch / 100));
    return clamp(base, 0.04, 0.93);
  }
  isClutch() { return (this.half >= 2 && this.clock <= 60 && Math.abs(this.teams[this.aId].score - this.teams[this.bId].score) <= 8); }

  resolveAction(off, def, handler, ordered, spots, action) {
    const rng = this.rng;
    const A = action;
    if (A.k === 'post') return this.doPost(off, def, A.who, spots);
    if (A.k === 'pnr-drive' || A.k === 'pnr-pop') return this.doPnR(off, def, A.who, A.with, spots, A.k);
    if (A.k === 'motion-three' || A.k === 'early-three') return this.doJumper(off, def, A.who, 'three', spots);
    if (A.k === 'cut' || A.k === 'early-drive') return this.doDrive(off, def, A.who, spots);
    return this.doIso(off, def, A.who, spots); // iso
  }

  doIso(off, def, who, spots) {
    const p = PLAYERS[who], rng = this.rng;
    const from = spots[who];
    // signature dribble move flavor
    if (p.sig === 'crossover' && rng() < 0.6) this.emit({ t: 'dribble', player: who, move: 'crossover', from, dur: 0.7, txt: `${p.name} hits the killer crossover!` });
    else if (rng() < 0.3) this.emit({ t: 'dribble', player: who, move: 'hesitation', from, dur: 0.6, txt: `${p.name} with the hesitation...` });
    const r = rng();
    if (p.a.close >= 92 && r < 0.45) return this.doDrive(off, def, who, spots);
    if (p.a.three >= 88 && r < 0.62) return this.doJumper(off, def, who, 'three', spots);
    const kind = p.sig === 'fadeaway' ? 'fadeaway' : p.sig === 'onelegger' ? 'onelegger' : p.sig === 'pullup' ? 'pullup' : 'mid';
    return this.doJumper(off, def, who, kind, spots);
  }

  doDrive(off, def, who, spots) {
    const p = PLAYERS[who], rng = this.rng;
    const from = spots[who];
    const to = [from[0] * 0.25, 2.8 + rng() * 0.8];
    this.emit({ t: 'drive', player: who, from, to, dur: 1.1, txt: `${p.name} puts his head down and drives!` });
    // chase-down block flavor: elite athlete on defense
    const chaser = def.order.find(id => PLAYERS[id].sig === 'chasedown' && rng() < 0.25);
    // foul?
    if (rng() < 0.11) return this.doFoul(off, def, who, 'close', to);
    // block?
    const contest = this.contestFor(def, who, 'close');
    const blkAttr = Math.max(...def.order.map(id => PLAYERS[id].a.intD + PLAYERS[id].a.ath)) / 2;
    if (rng() < (blkAttr / 100) * 0.10 * (0.5 + contest)) {
      const by = def.order[(rng() * def.order.length) | 0];
      this.emit({ t: 'block', player: by, on: who, at: to, dur: 0.9, txt: `${PLAYERS[by].name} with the rejection!` });
      def.players[by].stats.blk++;
      return this.doReboundScramble(off, def, to, rng() < 0.5 ? off : def);
    }
    const kind = p.a.close >= 96 && rng() < 0.4 ? 'dunk' : 'layup';
    this.takeShot(off, def, who, kind, to, contest, null);
  }

  doJumper(off, def, who, kind, spots) {
    const p = PLAYERS[who], rng = this.rng;
    let k = kind;
    if (k === 'mid') k = p.sig === 'fadeaway' ? 'fadeaway' : p.sig === 'onelegger' ? 'onelegger' : 'mid';
    if (k === 'three' && p.sig === 'quickthree') k = 'three';
    if (k === 'three' && p.sig === 'setthree') k = 'three';
    const from = k === 'three' ? shotSpot('three', rng) : shotSpot('mid', rng);
    if (p.sig === 'nlook') { /* magic passes instead sometimes */ }
    const contest = this.contestFor(def, who, k);
    // zone/pack give up open threes
    const openBonus = (def.scheme.def === 'zone' || def.scheme.def === 'pack') && k === 'three' ? 0.06 : 0;
    this.emit({ t: 'move', player: who, to: from, dur: 0.7 });
    if (rng() < 0.10 && k === 'three') return this.doFoul(off, def, who, 'three', from);
    this.takeShot(off, def, who, k, from, Math.max(0.03, contest - openBonus), null, openBonus);
  }

  doPost(off, def, who, spots) {
    const p = PLAYERS[who], rng = this.rng;
    const to = shotSpot('bank', rng);
    this.lastPasser = off.hot;
    this.emit({ t: 'pass', from: off.hot, to: who, dur: 0.5, txt: `Entry pass to ${p.name} on the block.` });
    if (p.sig === 'dreamshake') this.emit({ t: 'dribble', player: who, move: 'dreamshake', from: to, dur: 1.0, txt: `${p.name} with the Dream Shake!` });
    if (rng() < 0.13) return this.doFoul(off, def, who, 'post', to);
    const kind = p.sig === 'bank' ? 'bank' : p.sig === 'dreamshake' ? 'dreamshake' : p.sig === 'powerdunk' ? 'dunk' : 'hook';
    const contest = this.contestFor(def, who, 'post') + (def.scheme.def === 'pack' ? 0.08 : 0);
    this.takeShot(off, def, who, kind, to, contest, off.hot);
  }

  doPnR(off, def, who, big, spots) {
    const p = PLAYERS[who], bp = PLAYERS[big], rng = this.rng;
    const screenAt = [spots[who][0] * 0.6, spots[who][1] * 0.75];
    this.emit({ t: 'screen', player: big, at: screenAt, for: who, dur: 0.8, txt: `${bp.name} sets the screen for ${p.name}.` });
    if (rng() < 0.5) {
      const to = [screenAt[0] * 0.4, 3.2];
      this.emit({ t: 'drive', player: who, from: screenAt, to, dur: 0.9 });
      if (rng() < 0.3) { // dish to roller
        this.lastPasser = who;
        this.emit({ t: 'pass', from: who, to: big, dur: 0.4, txt: `${p.name} dishes to the rolling ${bp.name}!` });
        const contest = this.contestFor(def, big, 'close');
        this.takeShot(off, def, big, 'dunk', [0.8, 2.6], contest * 0.7, who);
      } else {
        const contest = this.contestFor(def, who, 'close');
        this.takeShot(off, def, who, 'layup', to, contest, null);
      }
    } else {
      const to = shotSpot('three', rng);
      this.emit({ t: 'move', player: big, to, dur: 0.7, txt: `${bp.name} pops out.` });
      const contest = this.contestFor(def, big, 'three');
      this.takeShot(off, def, big, 'three', to, contest, who);
    }
  }

  takeShot(off, def, who, kind, from, contest, assistedBy, openBonus = 0) {
    const rng = this.rng, p = PLAYERS[who];
    const prob = this.shotProb(who, kind, contest, off) + openBonus;
    const made = rng() < prob;
    const st = off.players[who].stats;
    st.fga++; if (kind === 'three') st.tpa++; if (assistedBy && made) off.players[assistedBy].stats.ast++;
    if (!assistedBy && made && this.lastPasser && this.lastPasser !== who && kind !== 'freethrow') off.players[this.lastPasser].stats.ast++;
    const pts = kind === 'three' ? 3 : 2;
    const label = SHOT_LABEL[kind] || kind;
    this.emit({
      t: 'shot', player: who, kind, from, contested: contest, made, pts: made ? pts : 0, dur: 1.5,
      txt: made ? `${p.name} ${label} — GOOD!` : `${p.name}'s ${label} rims out.`,
    });
    if (made) {
      st.fgm++; if (kind === 'three') st.tpm++; st.pts += pts;
      off.score += pts;
      this.emit({ t: 'score', team: off.sid, player: who, pts, dur: 0.7 });
      this.momentum(off.sid, pts);
      // celebrate crowd
      this.emit({ t: 'make', dur: 0.4 });
    } else {
      this.doRebound(off, def, from);
    }
  }

  doRebound(off, def, at) {
    const rng = this.rng;
    const wsum = (team, isOff) => team.order.map(pid => {
      const p = PLAYERS[pid];
      return Math.max(1, (p.h - 1.75) * 120 + p.a.ath * 0.7 + (isOff ? 0 : 12) + p.a.intD * 0.15);
    });
    const offWin = rng() < 0.30;
    const team = offWin ? off : def;
    const w = wsum(team, offWin);
    const reb = pick(rng, team.order, w);
    team.players[reb].stats.reb++;
    this.emit({ t: 'rebound', player: reb, team: team.sid, off: offWin, at, dur: 0.8, txt: `${PLAYERS[reb].name} ${offWin ? 'with the offensive board!' : 'cleans the glass.'}` });
    if (offWin && rng() < 0.55) {
      // putback
      const contest = this.contestFor(this.def(), reb, 'close');
      this.takeShot(off, def, reb, 'layup', [at[0] * 0.5, 2.8], contest, null);
    } else if (offWin) {
      this.emit({ t: 'reset', dur: 0.6, txt: 'Resetting the offense...' });
      // bonus mini-possession: quick shot, no clock drain
      const who = team.order[(rng() * 3) | 0];
      const contest = this.contestFor(this.def(), who, 'mid');
      this.takeShot(off, def, who, 'mid', shotSpot('mid', rng), contest, null);
    }
  }

  doReboundScramble(off, def, at, team) {
    const rng = this.rng;
    const reb = team.order[(rng() * team.order.length) | 0];
    team.players[reb].stats.reb++;
    this.emit({ t: 'rebound', player: reb, team: team.sid, off: team === off, at, dur: 0.8, txt: `${PLAYERS[reb].name} grabs the loose ball.` });
  }

  doTurnover(off, def, who, at) {
    const rng = this.rng, p = PLAYERS[who];
    const r = rng();
    off.players[who].stats.tov++;
    if (r < 0.45) {
      const by = def.order[(rng() * def.order.length) | 0];
      def.players[by].stats.stl++;
      this.emit({ t: 'turnover', player: who, by, kind: 'steal', at, dur: 1.0, txt: `${PLAYERS[by].name} picks the pocket of ${p.name}!` });
    } else if (r < 0.8) {
      this.emit({ t: 'turnover', player: who, kind: 'badpass', at, dur: 0.9, txt: `Errant pass by ${p.name} — turnover!` });
    } else {
      this.emit({ t: 'turnover', player: who, kind: 'travel', at, dur: 0.9, txt: `${p.name} called for steps!` });
    }
  }

  doFoul(off, def, who, kind, at) {
    const rng = this.rng;
    const by = def.order[(rng() * def.order.length) | 0];
    def.players[by].stats.pf++; def.fouls++;
    const fts = kind === 'three' ? 3 : 2;
    this.emit({ t: 'foul', player: who, by, shooting: true, at, dur: 1.0, txt: `Foul on ${PLAYERS[by].name} — ${PLAYERS[who].name} to the line for ${fts}.` });
    for (let i = 0; i < fts; i++) {
      const made = rng() < this.shotProb(who, 'freethrow', 0, off);
      off.players[who].stats.fta++; if (made) { off.players[who].stats.ftm++; off.players[who].stats.pts++; off.score += 1; }
      this.emit({ t: 'shot', player: who, kind: 'freethrow', from: [0, 5.2], contested: 0, made, pts: made ? 1 : 0, dur: 1.0, txt: made ? 'Free throw good.' : 'Free throw no good.' });
      if (made) this.emit({ t: 'score', team: off.sid, player: who, pts: 1, dur: 0.4 });
    }
    this.momentum(off.sid, 0);
  }

  momentum(sid, pts) {
    this.lastRun.push(sid === this.aId ? pts : -pts);
    if (this.lastRun.length > 6) this.lastRun.shift();
  }
  momentumVal() { return this.lastRun.reduce((a, b) => a + b, 0); }

  stat(team, pid, k) { /* reserved */ }

  endPossession() {
    // swap offense
    this.offId = this.offId === this.aId ? this.bId : this.aId;
    // AI timeout logic: big run against, or late & close
    this.maybeAiTimeout();
    if (this.clock <= 0) this.endPeriod();
  }

  maybeAiTimeout() {
    const off = this.off(), def = this.def();
    for (const [tid, team] of Object.entries(this.teams)) {
      if (team.timeouts <= 0) continue;
      const diff = team.sid === this.aId ? this.teams[this.bId].score - team.score : this.teams[this.aId].score - team.score;
      const onRun = (team.sid === this.aId ? -this.momentumVal() : this.momentumVal()) >= 8;
      if ((diff >= 10 || onRun || (this.isClutch() && diff > 0 && diff <= 4)) && this.rng() < 0.5) {
        this.applyTimeout(team);
        this.emit({ t: 'timeout', team: team.sid, dur: 1.5, txt: `${SQUADS[team.sid].name} calls timeout.` });
        // AI adjusts: if getting torched from three, tighten up
        if (this.rng() < 0.6) this.aiAdjust(team);
      }
    }
  }

  applyTimeout(team) {
    team.timeouts--;
    for (const pid of team.order) team.players[pid].stam = clamp(team.players[pid].stam + 14, 0, 100);
  }
  callTimeout(sid, scheme) {
    const team = this.teams[sid];
    if (team.timeouts <= 0 || this.done) return false;
    if (scheme) team.scheme = scheme;
    if (scheme && scheme.hot) team.hot = scheme.hot;
    this.applyTimeout(team);
    this.emit({ t: 'timeout', team: sid, dur: 1.5, txt: `${SQUADS[sid].name} calls timeout.` });
    return true;
  }

  aiAdjust(team) {
    // simple heuristics: chase the game state
    const oppId = team.sid === this.aId ? this.bId : this.aId;
    const opp = this.teams[oppId];
    const losing = opp.score > team.score;
    if (!losing) return;
    const hasShooter = opp.order.some(id => PLAYERS[id].a.three > 88);
    if (hasShooter && team.scheme.def === 'zone') team.scheme.def = 'man';
    else if (!hasShooter && team.scheme.def === 'man' && this.rng() < 0.4) team.scheme.def = 'pack';
    if (opp.score - team.score >= 8 && team.scheme.tempo === 'half') team.scheme.tempo = 'push';
  }

  endPeriod() {
    if (this.half === 1) {
      this.emit({ t: 'period', half: 1, dur: 1.5, txt: 'Halftime.' });
      for (const team of Object.values(this.teams)) {
        for (const pid of team.order) team.players[pid].stam = clamp(team.players[pid].stam + 25, 0, 100);
        this.aiAdjust(team);
      }
      this.half = 2; this.clock = HALF_LEN;
      this.emit({ t: 'period', half: 2, dur: 1.0, txt: 'Second half underway.' });
    } else {
      const [a, b] = [this.teams[this.aId].score, this.teams[this.bId].score];
      if (a === b) {
        this.half++; this.clock = 120;
        this.emit({ t: 'period', half: this.half, dur: 1.5, txt: 'Overtime!' });
      } else {
        this.done = true;
        this.winner = a > b ? this.aId : this.bId;
        this.emit({ t: 'end', winner: this.winner, dur: 2.0, txt: `Final: ${SQUADS[this.winner].name} wins!` });
      }
    }
  }

  box() {
    const t = sid => ({
      sid, name: SQUADS[sid].name, score: this.teams[sid].score,
      players: this.teams[sid].order.map(pid => ({ id: pid, name: PLAYERS[pid].name, num: PLAYERS[pid].num, ...this.teams[sid].players[pid].stats })),
    });
    return { a: t(this.aId), b: t(this.bId), winner: this.winner, half: this.half };
  }
}

function blankStats() {
  return { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, tov: 0, pf: 0 };
}
function rngPickFirst(rng, a, b) { return rng() < 0.5 ? a : b; }

// Convenience: simulate a whole game, return { game, events }
export function simulateGame(aId, bId, opts = {}) {
  const g = new Game(aId, bId, opts);
  let guard = 0;
  while (g.hasMore() && guard++ < 500) g.nextPossession();
  return g;
}

export function aiSchemeFor(sid) {
  // AI picks schemes to fit personnel
  const ids = SQUADS[sid].players;
  const hasEliteShooter = ids.some(id => PLAYERS[id].a.three >= 90);
  const hasDominantBig = ids.some(id => PLAYERS[id].a.post >= 95);
  const hasEliteGuard = ids.some(id => PLAYERS[id].a.handles >= 95);
  const off = hasDominantBig ? 'post' : hasEliteShooter ? 'motion' : hasEliteGuard ? 'pnr' : 'iso';
  const def = hasEliteShooter ? 'man' : 'pack';
  return { off, def, tempo: hasEliteGuard ? 'push' : 'half' };
}
