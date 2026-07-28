import { describe, it, expect } from 'vitest';
import {
  habitStreak, applyDailyDecay, toggleCompletion,
  countDoneToday, countDoneOnDate, isDoneNow, nextResetAt,
} from '../gameLogic';
import type { ReminderTime } from '../types';
import { addDays } from '../date';
import { mkHabit, mkData } from './helpers';

const T = '2026-07-25';

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
  it('sets completion + lastCompletedAt', () => {
    const r = toggleCompletion(mkData([mkHabit('a')], T), 'a', T, 123);
    expect(r.nowCompleted).toBe(true);
    expect(r.data.habits[0].completions[T]).toBe(true);
    expect(r.data.habits[0].lastCompletedAt).toBe(123);
  });
});

describe('toggleCompletion — one-way (đã tick thì khóa)', () => {
  it('completing again is a no-op', () => {
    const after = toggleCompletion(mkData([mkHabit('a')], T), 'a', T).data;
    const again = toggleCompletion(after, 'a', T);
    expect(again.nowCompleted).toBe(false);
    expect(again.data.habits[0].completions[T]).toBe(true);
    expect(again.data).toBe(after); // nguyên trạng
  });
});

describe('toggleCompletion — interval (reset mỗi cửa sổ)', () => {
  const iv: ReminderTime = { hour: 0, minute: 0, kind: 'interval', everyMinutes: 20 };
  const t0 = 1_800_000_000_000;
  const mkIv = () => mkHabit('a', {}, iv);

  it('khóa trong cửa sổ, no-op giữa chừng', () => {
    const r1 = toggleCompletion(mkData([mkIv()], T), 'a', T, t0);
    expect(r1.nowCompleted).toBe(true);
    expect(isDoneNow(r1.data.habits[0], t0)).toBe(true);
    const mid = t0 + 19 * 60000;
    expect(isDoneNow(r1.data.habits[0], mid)).toBe(true);
    expect(toggleCompletion(r1.data, 'a', T, mid).nowCompleted).toBe(false);
    expect(nextResetAt(r1.data.habits[0], mid)).toBe(t0 + 20 * 60000);
  });

  it('hết cửa sổ -> mở lại, tick tiếp được', () => {
    const r1 = toggleCompletion(mkData([mkIv()], T), 'a', T, t0);
    const after = t0 + 20 * 60000;
    expect(isDoneNow(r1.data.habits[0], after)).toBe(false);
    expect(nextResetAt(r1.data.habits[0], after)).toBe(null);
    const r3 = toggleCompletion(r1.data, 'a', T, after);
    expect(r3.nowCompleted).toBe(true);
    expect(r3.data.habits[0].lastCompletedAt).toBe(after);
  });
});

describe('applyDailyDecay', () => {
  it('cập nhật lastActiveDate sang hôm nay', () => {
    const d = applyDailyDecay(mkData([mkHabit('a')], addDays(T, -3)), T);
    expect(d.lastActiveDate).toBe(T);
  });
  it('cùng ngày là no-op', () => {
    const src = mkData([mkHabit('a')], T);
    expect(applyDailyDecay(src, T)).toBe(src);
  });
});

describe('counts', () => {
  it('done today and on date', () => {
    const habits = [mkHabit('a', { [T]: true }), mkHabit('b', { [T]: true }), mkHabit('c')];
    expect(countDoneToday(habits, T)).toBe(2);
    expect(countDoneOnDate(habits, addDays(T, -1))).toBe(0);
  });
});
