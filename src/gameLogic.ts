import { AppData, Creature, Habit, ISODate } from './types';
import { addDays, daysBetween, todayStr } from './date';
import { BRANCH_STREAK, STAGE_XP, MEGA_XP, MEGA_STAGE, Branch, CreatureForm } from './species';

// ----- Hằng số cân bằng -----
export const XP_PER_COMPLETE = 12;
export const STREAK_BONUS_CAP = 8; // +XP thêm theo chuỗi ngày (tối đa)
export const VIT_PER_COMPLETE = 12; // Thể trạng hồi mỗi lần hoàn thành
export const VIT_MISS_PENALTY = 18; // Thể trạng tụt mỗi ngày bỏ lỡ
export const REVIVE_VITALITY = 40; // Thể trạng sau khi hồi sinh
export const MAX_VIT = 100;
export const MAX_CATCHUP_DAYS = 60;

const FINAL_STAGE = STAGE_XP.length - 1;

export function clampVit(v: number): number {
  return Math.max(0, Math.min(MAX_VIT, Math.round(v)));
}

export function newCreature(line: CreatureForm[], color: string): Creature {
  return { line, color, xp: 0, vitality: 85, fainted: false, branch: null, bestStreak: 0, everFinal: false };
}

export function stageOf(xp: number): number {
  let stage = 0;
  for (let i = 0; i < STAGE_XP.length; i++) if (xp >= STAGE_XP[i]) stage = i;
  return stage;
}

export function isDoneOn(habit: Habit, date: ISODate): boolean {
  return !!habit.completions[date];
}

// Chuỗi ngày liên tiếp có hoàn thành, tính riêng cho một mục tiêu.
export function habitStreak(habit: Habit, today: ISODate = todayStr()): number {
  let streak = 0;
  let cursor = isDoneOn(habit, today) ? today : addDays(today, -1);
  for (let i = 0; i < 3650; i++) {
    if (isDoneOn(habit, cursor)) {
      streak++;
      cursor = addDays(cursor, -1);
    } else break;
  }
  return streak;
}

// Suy giảm thể trạng cho các ngày đã bỏ lỡ (mỗi sinh vật độc lập).
export function applyDailyDecay(data: AppData, today: ISODate = todayStr()): AppData {
  if (data.lastActiveDate === today) return data;
  const gap = daysBetween(data.lastActiveDate, today);
  if (gap <= 0) return { ...data, lastActiveDate: today };

  const start = Math.max(1, gap - MAX_CATCHUP_DAYS + 1);
  const habits = data.habits.map((h) => {
    let vit = h.creature.vitality;
    for (let i = start; i < gap; i++) {
      const day = addDays(data.lastActiveDate, i);
      if (!isDoneOn(h, day)) vit -= VIT_MISS_PENALTY;
    }
    vit = clampVit(vit);
    const fainted = vit <= 0;
    return { ...h, creature: { ...h.creature, vitality: vit, fainted } };
  });

  return { ...data, habits, lastActiveDate: today };
}

export interface ToggleResult {
  data: AppData;
  evolvedTo: number | null; // bậc mới nếu vừa tiến hoá
  revived: boolean;
  nowCompleted: boolean;
}

// Bật/tắt hoàn thành một mục tiêu trong ngày → cập nhật sinh vật của nó.
export function toggleCompletion(
  data: AppData,
  habitId: string,
  date: ISODate = todayStr()
): ToggleResult {
  const habit = data.habits.find((h) => h.id === habitId);
  if (!habit) return { data, evolvedTo: null, revived: false, nowCompleted: false };

  const wasDone = isDoneOn(habit, date);
  const nowDone = !wasDone;

  const newCompletions = { ...habit.completions };
  if (nowDone) newCompletions[date] = true;
  else delete newCompletions[date];

  const nextHabit: Habit = { ...habit, completions: newCompletions };

  const c = habit.creature;
  const prevStage = stageOf(c.xp);
  let xp = c.xp;
  let vit = c.vitality;
  let fainted = c.fainted;
  let revived = false;

  const streak = habitStreak(nextHabit, date);
  const bestStreak = Math.max(c.bestStreak, streak);

  // Thưởng XP tính theo chuỗi ngày KHI đã hoàn thành hôm nay, để cộng/trừ đối xứng
  // (bỏ tick sẽ hoàn lại đúng lượng đã cộng, không sót XP lẻ).
  const withToday = { ...habit, completions: { ...habit.completions, [date]: true } };
  const gain = XP_PER_COMPLETE + Math.min(habitStreak(withToday, date), STREAK_BONUS_CAP);

  if (nowDone) {
    xp += gain;
    if (fainted) {
      // Hồi sinh: vực dậy ở mức thể trạng vừa phải.
      vit = Math.max(REVIVE_VITALITY, clampVit(vit + VIT_PER_COMPLETE));
      fainted = false;
      revived = true;
    } else {
      vit = clampVit(vit + VIT_PER_COMPLETE);
    }
  } else {
    // Hoàn tác
    xp = Math.max(0, xp - gain);
    vit = clampVit(vit - VIT_PER_COMPLETE);
  }

  const newStage = stageOf(xp);

  // Chốt nhánh khi vừa chạm bậc cuối: bền bỉ → huyền thoại.
  let branch: Branch | null = c.branch;
  if (newStage === FINAL_STAGE && branch === null) {
    branch = bestStreak >= BRANCH_STREAK ? 'legendary' : 'common';
  }
  if (newStage < FINAL_STAGE) branch = null; // nếu hoàn tác lùi khỏi bậc cuối

  const everFinal = c.everFinal || newStage === FINAL_STAGE;

  const nextCreature: Creature = { ...c, xp, vitality: vit, fainted, branch, bestStreak, everFinal };
  const habits = data.habits.map((h) => (h.id === habitId ? { ...nextHabit, creature: nextCreature } : h));

  // Bậc hiển thị gồm cả Mega (chỉ khi loài có dạng Mega và đạt mốc XP).
  const speciesHasMega = !!c.megas && c.megas.length > 0;
  const displayPrev = c.xp >= MEGA_XP && speciesHasMega ? MEGA_STAGE : prevStage;
  const displayNew = xp >= MEGA_XP && speciesHasMega ? MEGA_STAGE : newStage;
  const evolvedTo = nowDone && displayNew > displayPrev ? displayNew : null;
  return { data: { ...data, habits }, evolvedTo, revived, nowCompleted: nowDone };
}

// ----- Tổng hợp cho màn hình chính -----
export function countDoneToday(habits: Habit[], today: ISODate = todayStr()): number {
  return habits.reduce((n, h) => n + (isDoneOn(h, today) ? 1 : 0), 0);
}

export function countDoneOnDate(habits: Habit[], date: ISODate): number {
  return habits.reduce((n, h) => n + (isDoneOn(h, date) ? 1 : 0), 0);
}
