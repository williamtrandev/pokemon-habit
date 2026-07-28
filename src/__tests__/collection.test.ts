import { describe, it, expect } from 'vitest';
import {
  addHatchProgress, stageFromAffection, EVO_AFFECTION, completionCandy, CANDY_PER_DAY,
  HATCH_DAILY_CAP, PERFECT_DAY_BONUS, HATCH_THRESHOLD,
} from '../collection';
import { mkData, mkHabit } from './helpers';

const T = '2026-07-25';
const base = () => mkData([mkHabit('a')], T);

describe('addHatchProgress — trần điểm/ngày', () => {
  it('không cộng quá HATCH_DAILY_CAP trong một ngày', () => {
    let data = base();
    for (let i = 0; i < HATCH_DAILY_CAP + 5; i++) {
      data = addHatchProgress(data, { today: T, allDoneToday: false, bestStreak: 0 }).data;
    }
    expect(data.hatchDayAdded).toBe(HATCH_DAILY_CAP);
  });

  it('sang ngày mới thì reset bộ đếm/ngày', () => {
    let data = addHatchProgress(base(), { today: T, allDoneToday: false, bestStreak: 0 }).data;
    data = addHatchProgress(data, { today: '2026-07-26', allDoneToday: false, bestStreak: 0 }).data;
    expect(data.hatchDayAdded).toBe(1);
    expect(data.hatchDay).toBe('2026-07-26');
  });
});

describe('addHatchProgress — thưởng "xong hết" (1 lần/ngày)', () => {
  it('cộng PERFECT_DAY_BONUS đúng 1 lần', () => {
    let r = addHatchProgress(base(), { today: T, allDoneToday: true, bestStreak: 0 });
    expect(r.data.hatchMeter).toBe(1 + PERFECT_DAY_BONUS);
    r = addHatchProgress(r.data, { today: T, allDoneToday: true, bestStreak: 0 });
    expect(r.data.hatchMeter).toBe(1 + PERFECT_DAY_BONUS + 1); // không cộng bonus lần 2
  });
});

describe('addHatchProgress — báo trứng khi đủ ngưỡng', () => {
  it('đủ HATCH_THRESHOLD -> newEggs>=1, trừ ngưỡng', () => {
    let data = base();
    let eggs = 0;
    let day = 20;
    for (let i = 0; i < HATCH_THRESHOLD + 1; i++) {
      const r = addHatchProgress(data, { today: `2026-08-${day++}`, allDoneToday: false, bestStreak: 0 });
      data = r.data;
      eggs += r.newEggs;
    }
    expect(eggs).toBeGreaterThanOrEqual(1);
    expect(data.hatchMeter).toBeLessThan(HATCH_THRESHOLD);
  });
});

describe('completionCandy — tỉ lệ chu kỳ, chuẩn hoá theo ngày', () => {
  it('habit hằng ngày (1440p) = CANDY_PER_DAY mỗi lượt', () => {
    expect(completionCandy(1440)).toBeCloseTo(CANDY_PER_DAY, 5);
  });
  it('habit mỗi 20p: 72 lượt/ngày = tổng CANDY_PER_DAY', () => {
    expect(completionCandy(20) * 72).toBeCloseTo(CANDY_PER_DAY, 5);
  });
});

describe('stageFromAffection', () => {
  it('ánh xạ thân thiết -> bậc', () => {
    expect(stageFromAffection(0)).toBe(0);
    expect(stageFromAffection(EVO_AFFECTION[1] - 1)).toBe(0);
    expect(stageFromAffection(EVO_AFFECTION[1])).toBe(1);
    expect(stageFromAffection(EVO_AFFECTION[2])).toBe(2);
    expect(stageFromAffection(9999)).toBe(2);
  });
});
