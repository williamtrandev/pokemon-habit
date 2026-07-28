import { AppData, Habit, ISODate } from './types';
import { addDays, todayStr } from './date';

// Logic MỤC TIÊU thuần (không còn pet). Hoàn thành -> điểm nở trứng ở collection.ts.

export function isDoneOn(habit: Habit, date: ISODate): boolean {
  return !!habit.completions[date];
}

// Chu kỳ interval (ms) nếu habit lặp theo phút; null nếu là habit hằng ngày.
export function intervalMs(habit: Habit): number | null {
  const r = habit.reminder;
  if (r && r.kind === 'interval' && r.everyMinutes) return r.everyMinutes * 60000;
  return null;
}

// "Đã hoàn thành / khóa" tại nowMs. Interval: trong cửa sổ [lastCompletedAt, +chu kỳ). Hằng ngày: xong hôm nay.
export function isDoneNow(habit: Habit, nowMs: number): boolean {
  const iv = intervalMs(habit);
  if (iv != null) return habit.lastCompletedAt != null && nowMs < habit.lastCompletedAt + iv;
  return isDoneOn(habit, todayStr(new Date(nowMs)));
}

// Thời điểm (ms) nút interval mở lại; null nếu không phải interval / đang mở.
export function nextResetAt(habit: Habit, nowMs: number): number | null {
  const iv = intervalMs(habit);
  if (iv == null || habit.lastCompletedAt == null) return null;
  const end = habit.lastCompletedAt + iv;
  return end > nowMs ? end : null;
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

// Chỉ cập nhật mốc ngày hoạt động (không còn suy giảm pet).
export function applyDailyDecay(data: AppData, today: ISODate = todayStr()): AppData {
  if (data.lastActiveDate === today) return data;
  return { ...data, lastActiveDate: today };
}

export interface ToggleResult {
  data: AppData;
  nowCompleted: boolean;
}

// Đánh dấu hoàn thành MỘT CHIỀU: interval theo cửa sổ thời gian, hằng ngày theo `date`.
// Đang khóa -> no-op (nowCompleted=false).
export function toggleCompletion(
  data: AppData,
  habitId: string,
  date: ISODate = todayStr(),
  nowMs: number = Date.now()
): ToggleResult {
  const habit = data.habits.find((h) => h.id === habitId);
  if (!habit) return { data, nowCompleted: false };

  const iv = intervalMs(habit);
  const locked =
    iv != null
      ? habit.lastCompletedAt != null && nowMs < habit.lastCompletedAt + iv
      : isDoneOn(habit, date);
  if (locked) return { data, nowCompleted: false };

  const completions = { ...habit.completions, [date]: true };
  const habits = data.habits.map((h) =>
    h.id === habitId ? { ...h, completions, lastCompletedAt: nowMs } : h
  );
  return { data: { ...data, habits }, nowCompleted: true };
}

// ----- Tổng hợp cho màn hình chính -----
export function countDoneToday(habits: Habit[], today: ISODate = todayStr()): number {
  return habits.reduce((n, h) => n + (isDoneOn(h, today) ? 1 : 0), 0);
}

export function countDoneOnDate(habits: Habit[], date: ISODate): number {
  return habits.reduce((n, h) => n + (isDoneOn(h, date) ? 1 : 0), 0);
}
