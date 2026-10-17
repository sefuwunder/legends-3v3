import { describe, test, expect } from 'bun:test';
import { PLAYERS, SQUADS, squadPlayers } from '../src/roster.js';

describe('roster', () => {
  test('12 players defined', () => {
    expect(Object.keys(PLAYERS).length).toBe(12);
  });
  test('4 squads of 3, each with a G/W/B', () => {
    expect(Object.keys(SQUADS).length).toBe(4);
    for (const sid of Object.keys(SQUADS)) {
      const ps = squadPlayers(sid);
      expect(ps.length).toBe(3);
      const poss = ps.map(p => p.pos).sort().join('');
      expect(poss).toBe('BGW');
    }
  });
  test('attributes in range 1..99', () => {
    for (const p of Object.values(PLAYERS)) {
      for (const [k, v] of Object.entries(p.a)) {
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(99);
      }
    }
  });
  test('unique jersey numbers within each squad', () => {
    for (const sid of Object.keys(SQUADS)) {
      const nums = squadPlayers(sid).map(p => p.num);
      expect(new Set(nums).size).toBe(3);
    }
  });
  test('signature moves are known animations', () => {
    const known = new Set(['fadeaway','chasedown','quickthree','powerdunk','bank','nlook','setthree','pullup','dreamshake','crossover','onelegger']);
    for (const p of Object.values(PLAYERS)) expect(known.has(p.sig)).toBe(true);
  });
  test('heights look right: shaq tallest, iverson shortest', () => {
    expect(PLAYERS.shaq.h).toBeGreaterThan(PLAYERS.iverson.h);
    expect(PLAYERS.iverson.h).toBeLessThan(1.9);
    expect(PLAYERS.shaq.h).toBeGreaterThan(2.1);
  });
});
