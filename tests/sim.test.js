import { describe, test, expect } from 'bun:test';
import { Game, simulateGame, aiSchemeFor, mulberry32 } from '../src/sim.js';
import { PLAYERS, SQUADS } from '../src/roster.js';

const std = (aId, bId, seed, schemeA, schemeB) => simulateGame(aId, bId, {
  seed,
  schemeA: schemeA || { off: 'iso', def: 'man', tempo: 'half' },
  schemeB: schemeB || { off: 'iso', def: 'man', tempo: 'half' },
});

describe('sim core', () => {
  test('deterministic: same seed -> identical game', () => {
    const g1 = std('WCI', 'SHO', 7), g2 = std('WCI', 'SHO', 7);
    expect(g1.box()).toEqual(g2.box());
    expect(JSON.stringify(g1.events)).toBe(JSON.stringify(g2.events));
  });
  test('different seeds vary results', () => {
    const scores = new Set();
    for (let s = 1; s <= 6; s++) { const g = std('WCI', 'SHO', s); scores.add(g.box().a.score + '-' + g.box().b.score); }
    expect(scores.size).toBeGreaterThan(1);
  });
  test('game completes with a winner', () => {
    const g = std('SMA', 'MAM', 11);
    expect(g.done).toBe(true);
    expect(['SMA', 'MAM']).toContain(g.winner);
    expect(g.events[g.events.length - 1].t).toBe('end');
  });
  test('events are well-formed', () => {
    const g = std('WCI', 'MAM', 13);
    for (const e of g.events) {
      expect(typeof e.t).toBe('string');
      expect(Array.isArray(e.s) && e.s.length === 2).toBe(true);
      expect(typeof e.c).toBe('number');
    }
  });
  test('all player ids in events exist', () => {
    const g = std('SHO', 'SMA', 17);
    for (const e of g.events) {
      for (const k of ['player', 'from', 'to', 'by', 'on', 'for']) {
        if (e[k] && typeof e[k] === 'string' && !SQUADS[e[k]]) expect(PLAYERS[e[k]]).toBeTruthy();
      }
    }
  });
  test('scores in sane range', () => {
    for (let s = 1; s <= 10; s++) {
      const g = std('WCI', 'SHO', s * 3);
      const { a, b } = g.box();
      expect(a.score).toBeGreaterThan(15); expect(a.score).toBeLessThan(130);
      expect(b.score).toBeGreaterThan(15); expect(b.score).toBeLessThan(130);
    }
  });
  test('box score points add up to team score', () => {
    const g = std('SMA', 'WCI', 23);
    const b = g.box();
    for (const t of [b.a, b.b]) {
      const sum = t.players.reduce((x, p) => x + p.pts, 0);
      expect(sum).toBe(t.score);
    }
  });
  test('shotProb sanity: curry open three > shaq open three; shaq dunk > curry dunk', () => {
    const g = std('SMA', 'WCI', 1);
    const team = g.teams.SMA;
    expect(g.shotProb('curry', 'three', 0.1, team)).toBeGreaterThan(g.shotProb('shaq', 'three', 0.1, team));
    expect(g.shotProb('shaq', 'dunk', 0.4, team)).toBeGreaterThan(g.shotProb('curry', 'dunk', 0.4, team));
  });
  test('overtime path triggers on tie', () => {
    const g = new Game('WCI', 'SHO', { seed: 5 });
    g.teams.WCI.score = 50; g.teams.SHO.score = 50; g.half = 2; g.clock = 0;
    g.endPeriod();
    expect(g.done).toBe(false);
    expect(g.half).toBe(3);
    expect(g.clock).toBe(120);
  });
  test('clutch detection', () => {
    const g = std('WCI', 'SHO', 5);
    g.half = 2; g.clock = 45;
    g.teams.WCI.score = 60; g.teams.SHO.score = 64;
    expect(g.isClutch()).toBe(true);
    g.clock = 200; expect(g.isClutch()).toBe(false);
  });
  test('timeout restores stamina', () => {
    const g = new Game('WCI', 'SHO', { seed: 9 });
    const t = g.teams.WCI;
    for (const pid of t.order) t.players[pid].stam = 50;
    expect(g.callTimeout('WCI')).toBe(true);
    for (const pid of t.order) expect(t.players[pid].stam).toBeGreaterThan(50);
    expect(t.timeouts).toBe(1);
    expect(g.callTimeout('WCI')).toBe(true);
    expect(g.callTimeout('WCI')).toBe(false); // out of timeouts
  });
});

describe('scheme effects (statistical, seeded)', () => {
  const N = 30;
  test('press forces more turnovers vs weak handles', () => {
    let pressTO = 0, manTO = 0;
    for (let s = 0; s < N; s++) {
      // offense = shaq-heavy weak handles vs press/man defense
      const gp = std('SMA', 'WCI', 100 + s,
        { off: 'post', def: 'man', tempo: 'half' },
        { off: 'iso', def: 'press', tempo: 'half' });
      const gm = std('SMA', 'WCI', 100 + s,
        { off: 'post', def: 'man', tempo: 'half' },
        { off: 'iso', def: 'man', tempo: 'half' });
      pressTO += gp.box().a.players.reduce((x, p) => x + p.tov, 0);
      manTO += gm.box().a.players.reduce((x, p) => x + p.tov, 0);
    }
    expect(pressTO).toBeGreaterThan(manTO);
  });
  test('zone lowers paint FG% vs man', () => {
    const paintKinds = new Set(['close', 'layup', 'dunk', 'post', 'hook', 'bank', 'dreamshake']);
    let zoneM = 0, zoneA = 0, manM = 0, manA = 0;
    for (let s = 0; s < N; s++) {
      for (const [def, acc] of [['zone', null], ['man', null]]) {
        const g = std('SMA', 'WCI', 300 + s,
          { off: 'post', def: 'man', tempo: 'half' },
          { off: 'iso', def, tempo: 'half' });
        for (const e of g.events) {
          if (e.t === 'shot' && paintKinds.has(e.kind) && (e.player === 'shaq' || e.player === 'durant')) {
            if (def === 'zone') { zoneA++; if (e.made) zoneM++; }
            else { manA++; if (e.made) manM++; }
          }
        }
      }
    }
    expect(zoneA).toBeGreaterThan(20);
    expect(zoneM / zoneA).toBeLessThan(manM / manA);
  });
  test('curry 3pt% > shaq 3pt%', () => {
    let cM = 0, cA = 0, sM = 0, sA = 0;
    for (let s = 0; s < N; s++) {
      const g = std('SMA', 'WCI', 500 + s,
        { off: 'motion', def: 'man', tempo: 'half' },
        { off: 'iso', def: 'man', tempo: 'half' });
      for (const e of g.events) {
        if (e.t === 'shot' && e.kind === 'three') {
          if (e.player === 'curry') { cA++; if (e.made) cM++; }
          if (e.player === 'shaq') { sA++; if (e.made) sM++; }
        }
      }
    }
    expect(cA).toBeGreaterThan(30);
    expect(cM / cA).toBeGreaterThan(0.30);
    if (sA > 5) expect(cM / cA).toBeGreaterThan(sM / sA);
  });
  test('post scheme feeds the big', () => {
    let bigShare = 0;
    for (let s = 0; s < 20; s++) {
      const g = std('SMA', 'WCI', 700 + s, { off: 'post', def: 'man', tempo: 'half' });
      const b = g.box().a;
      const total = b.players.reduce((x, p) => x + p.fga, 0);
      const big = b.players.find(p => p.id === 'shaq');
      bigShare += big.fga / Math.max(1, total);
    }
    expect(bigShare / 20).toBeGreaterThan(0.35);
  });
  test('hot hand leads team in attempts', () => {
    let lead = 0;
    for (let s = 0; s < 20; s++) {
      const g = std('MAM', 'WCI', 900 + s,
        { off: 'iso', def: 'man', tempo: 'half', hot: 'kobe' });
      const b = g.box().a;
      const top = [...b.players].sort((x, y) => y.fga - x.fga)[0];
      if (top.id === 'kobe') lead++;
    }
    expect(lead).toBeGreaterThan(12);
  });
  test('run tempo -> more possessions than half-court', () => {
    let runP = 0, halfP = 0;
    for (let s = 0; s < 10; s++) {
      runP += std('SMA', 'WCI', 1100 + s, { off: 'run', def: 'man', tempo: 'push' }).possCount;
      halfP += std('SMA', 'WCI', 1100 + s, { off: 'iso', def: 'man', tempo: 'half' }).possCount;
    }
    expect(runP).toBeGreaterThan(halfP);
  });
});

describe('soak', () => {
  test('100 games complete without crashing', () => {
    const sids = Object.keys(SQUADS);
    for (let s = 0; s < 100; s++) {
      const a = sids[s % 4], b = sids[(s + 1) % 4];
      const g = simulateGame(a, b, { seed: 2000 + s, schemeA: aiSchemeFor(a), schemeB: aiSchemeFor(b) });
      expect(g.done).toBe(true);
      expect(g.winner).toBeTruthy();
    }
  }, 30000);
});
