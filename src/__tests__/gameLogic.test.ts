import { describe, it, expect } from 'vitest';
import {
  XP_PER_COMPLETE, VIT_PER_COMPLETE, VIT_MISS_PENALTY, REVIVE_VITALITY, MAX_VIT,
  clampVit, stageOf, habitStreak, applyDailyDecay, toggleCompletion,
  countDoneToday, countDoneOnDate,
} from '../gameLogic';
import { STAGE_XP, BRANCH_STREAK } from '../species';
import { addDays } from '../date';
import { mkHabit, mkData } from './helpers';

const T = '2026-07-25';

describe('clampVit', () => {
  it('floors, ceils, rounds', () => {
    expect(clampVit(-5)).toBe(0);
    expect(clampVit(150)).toBe(MAX_VIT);
    expect(clampVit(50.6)).toBe(51);
  });
});

describe('stageOf', () => {
  it('maps xp to stage', () => {
    expect(stageOf(0)).toBe(0);
    expect(stageOf(39)).toBe(0);
    expect(stageOf(40)).toBe(1);
    expect(stageOf(STAGE_XP[3])).toBe(3);
  });
});

describe('habitStreak', () => {
  it('counts consecutive incl today', () => {
    const h = mkHabit('s', { '2026-07-25': true, '2026-07-24': true, '2026-07-23': true });
    expect(habitStreak(h, T)).toBe(3);
  });
  it('breaks on gap', () => {
    const h = mkHabit('g', { '2026-07-25': true, '2026-07-23': true });
    expect(habitStreak(h, T)).toBe(1);
  });
  it('yesterday counts when today undone', () => {
    expect(habitStreak(mkHabit('y', { '2026-07-24': true }), T)).toBe(1);
  });
  it('empty = 0', () => {
    expect(habitStreak(mkHabit('e'), T)).toBe(0);
  });
});

describe('toggleCompletion — complete', () => {
  it('gains xp+vit, sets completion', () => {
    const r = toggleCompletion(mkData([mkHabit('a')], T), 'a', T);
    const c = r.data.habits[0].creature;
    expect(r.nowCompleted).toBe(true);
    expect(c.xp).toBe(XP_PER_COMPLETE + 1); // streak-1 bonus
    expect(c.vitality).toBe(clampVit(85 + VIT_PER_COMPLETE));
    expect(r.data.habits[0].completions[T]).toBe(true);
  });
});

describe('toggleCompletion — symmetry', () => {
  it('complete then undo restores baseline exactly', () => {
    const after = toggleCompletion(mkData([mkHabit('a')], T), 'a', T).data;
    const undone = toggleCompletion(after, 'a', T);
    const c = undone.data.habits[0].creature;
    expect(c.xp).toBe(0);
    expect(c.vitality).toBe(85);
    expect(undone.data.habits[0].completions[T]).toBeUndefined();
    expect(undone.nowCompleted).toBe(false);
  });
});

describe('toggleCompletion — evolution', () => {
  it('fires when crossing a stage', () => {
    const r = toggleCompletion(mkData([mkHabit('a', {}, { xp: 30 })], T), 'a', T);
    expect(r.evolvedTo).toBe(1);
  });
  it('silent within same stage', () => {
    const r = toggleCompletion(mkData([mkHabit('a', {}, { xp: 0 })], T), 'a', T);
    expect(r.evolvedTo).toBeNull();
  });
});

describe('toggleCompletion — revive', () => {
  it('fainted creature revives on complete', () => {
    const r = toggleCompletion(mkData([mkHabit('a', {}, { vitality: 0, fainted: true, xp: 50 })], T), 'a', T);
    const c = r.data.habits[0].creature;
    expect(r.revived).toBe(true);
    expect(c.fainted).toBe(false);
    expect(c.vitality).toBeGreaterThanOrEqual(REVIVE_VITALITY);
  });
});

describe('toggleCompletion — branch lock', () => {
  it('legendary at final stage with high streak', () => {
    const comp: Record<string, boolean> = {};
    for (let i = 1; i <= BRANCH_STREAK; i++) comp[addDays(T, -i)] = true; // yesterday back
    const r = toggleCompletion(mkData([mkHabit('a', comp, { xp: STAGE_XP[3] - 5, bestStreak: BRANCH_STREAK })], T), 'a', T);
    const c = r.data.habits[0].creature;
    expect(stageOf(c.xp)).toBe(3);
    expect(c.branch).toBe('legendary');
  });
  it('common at final stage with low streak', () => {
    const r = toggleCompletion(mkData([mkHabit('a', {}, { xp: STAGE_XP[3] - 5, bestStreak: 1 })], T), 'a', T);
    expect(r.data.habits[0].creature.branch).toBe('common');
  });
});

describe('applyDailyDecay', () => {
  it('penalizes interior missed days', () => {
    const past = addDays(T, -3);
    const d = applyDailyDecay(mkData([mkHabit('a', {}, { vitality: 100 })], past), T);
    expect(d.lastActiveDate).toBe(T);
    expect(d.habits[0].creature.vitality).toBe(clampVit(100 - 2 * VIT_MISS_PENALTY));
  });
  it('same day is a noop', () => {
    const d = applyDailyDecay(mkData([mkHabit('a', {}, { vitality: 70 })], T), T);
    expect(d.habits[0].creature.vitality).toBe(70);
  });
  it('faints when vitality hits 0', () => {
    const past = addDays(T, -10);
    const d = applyDailyDecay(mkData([mkHabit('a', {}, { vitality: 20 })], past), T);
    expect(d.habits[0].creature.fainted).toBe(true);
  });
});

describe('counts', () => {
  it('done today and on date', () => {
    const habits = [mkHabit('a', { [T]: true }), mkHabit('b', { [T]: true }), mkHabit('c')];
    expect(countDoneToday(habits, T)).toBe(2);
    expect(countDoneOnDate(habits, addDays(T, -1))).toBe(0);
  });
});
