import { describe, it, expect } from 'vitest';
import { addDays, daysBetween, todayStr, parseDate, lastNDays, weekdayLabel } from '../date';

describe('date', () => {
  it('addDays forward/back', () => {
    expect(addDays('2026-07-25', 1)).toBe('2026-07-26');
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31');
  });
  it('addDays leap year', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
  });
  it('daysBetween signed', () => {
    expect(daysBetween('2026-07-20', '2026-07-25')).toBe(5);
    expect(daysBetween('2026-07-25', '2026-07-20')).toBe(-5);
  });
  it('lastNDays old->new inclusive', () => {
    expect(lastNDays(3, '2026-07-25')).toEqual(['2026-07-23', '2026-07-24', '2026-07-25']);
  });
  it('todayStr roundtrips parseDate', () => {
    expect(todayStr(parseDate('2026-07-25'))).toBe('2026-07-25');
  });
  it('weekdayLabel Vietnamese', () => {
    expect(weekdayLabel('2026-07-25')).toBe('T7'); // Saturday
  });
});
