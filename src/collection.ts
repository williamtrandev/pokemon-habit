import { AppData, PartyMon } from './types';

// ===== Thu nạp tách khỏi số habit =====
// Điểm nở đến từ SỰ KIÊN TRÌ (làm mỗi ngày, xong hết, streak). Đủ ngưỡng -> nở 1 con MỚI
// (một creature dạng cơ bản, tạo ở AppContext qua fetchRandomLine). Nuôi lớn bằng kẹo.

export const HATCH_DAILY_CAP = 8;   // trần điểm/ngày (chống cày dồn) — nới để thu nhiều hơn
export const PERFECT_DAY_BONUS = 2; // xong HẾT hôm nay (1 lần/ngày)
export const HATCH_THRESHOLD = 5;   // đủ điểm -> nở (thấp hơn -> nhiều Pokémon hơn)

// Điểm nở mỗi lần hoàn thành, TĂNG theo chuỗi ngày -> giữ chuỗi = trứng nở nhanh hơn (đòn bẩy giữ chân).
export function hatchPoints(bestStreak: number): number {
  return 1 + Math.floor(bestStreak / 7); // 0-6:1, 7-13:2, 14-20:3...
}

// ===== Nuôi lớn (kẹo ↔ thân thiết 1:1) =====
export const EVO_AFFECTION = [0, 80, 200]; // ngưỡng thân thiết cho bậc 0, 1, 2
export const MEGA_AFFECTION = 400;         // nuôi RIÊNG con này tới mốc này -> Mega (nếu loài có Mega)
export const FEED_CHUNK = 10;              // mỗi lần "cho ăn" đổ tối đa 10 kẹo -> +10 thân thiết

// ===== Kẹo mỗi lần hoàn thành, TỈ LỆ với chu kỳ habit =====
// Chuẩn hoá theo tần suất: tổng kẹo/ngày của 1 habit là như nhau dù lặp dày hay thưa.
//   kẹo/lượt = (phút chu kỳ) × CANDY_PER_MIN ; habit hằng ngày coi như chu kỳ = 1440 phút.
// Hiệu chỉnh: 1 habit giữ đều -> ~30 ngày nuôi 1 con lên Mega (nửa tháng lên bậc cuối).
export const MEGA_DAYS = 30;
export const CANDY_PER_DAY = MEGA_AFFECTION / MEGA_DAYS; // ≈ 13.33 (tổng kẹo/ngày cho 1 habit)
export const CANDY_PER_MIN = CANDY_PER_DAY / (24 * 60);  // kẹo mỗi phút chu kỳ

// Kẹo nhận cho MỘT lần hoàn thành, theo chu kỳ (phút). Habit hằng ngày: intervalMin = 1440.
export function completionCandy(intervalMin: number): number {
  return intervalMin * CANDY_PER_MIN;
}

// Bậc hiện tại theo độ thân thiết.
export function stageFromAffection(aff: number): number {
  let s = 0;
  for (let i = 0; i < EVO_AFFECTION.length; i++) if (aff >= EVO_AFFECTION[i]) s = i;
  return s;
}

// DẠNG hiển thị hiện tại của một con (Mega nếu đã đạt, ngược lại theo bậc thân thiết).
export function currentForm(mon: PartyMon): { id: number; name: string } {
  const stage = Math.min(stageFromAffection(mon.affection), mon.line.length - 1);
  if (mon.megaId != null && mon.affection >= MEGA_AFFECTION) return { id: mon.megaId, name: mon.megaName ?? 'Mega' };
  return mon.line[stage];
}

// Streak dài -> cơ hội shiny cao hơn (tối đa 8%).
export function shinyChance(bestStreak: number): number {
  return Math.min(0.01 + bestStreak * 0.002, 0.08);
}

// Mốc chuỗi -> thưởng trứng HIẾM (shiny đảm bảo) + confetti.
export const STREAK_MILESTONES = [7, 30, 100];

// Lửa chuỗi leo thang: nhỏ -> đuốc -> lửa trại.
export function streakFire(streak: number): { emoji: string; label: string } {
  if (streak >= 100) return { emoji: '🔥🔥🔥', label: 'huyền thoại' };
  if (streak >= 30) return { emoji: '🔥🔥', label: 'lửa trại' };
  if (streak >= 7) return { emoji: '🔥', label: 'đuốc' };
  return { emoji: '🔥', label: '' };
}

export interface HatchResult {
  data: AppData;
  newEggs: number; // số trứng vừa đủ điểm (chờ chạm để nở)
}

// Cộng điểm nở sau MỘT lần hoàn thành; báo `hatched` khi đủ ngưỡng.
export function addHatchProgress(
  data: AppData,
  opts: { today: string; allDoneToday: boolean; bestStreak: number }
): HatchResult {
  let meter = data.hatchMeter ?? 0;
  let day = data.hatchDay;
  let dayAdded = data.hatchDayAdded ?? 0;
  let perfectDay = data.perfectDay;

  if (day !== opts.today) {
    day = opts.today;
    dayAdded = 0;
    perfectDay = undefined;
  }

  if (dayAdded < HATCH_DAILY_CAP) {
    const add = Math.min(hatchPoints(opts.bestStreak), HATCH_DAILY_CAP - dayAdded);
    meter += add;
    dayAdded += add;
  }

  if (opts.allDoneToday && perfectDay !== opts.today) {
    meter += PERFECT_DAY_BONUS;
    perfectDay = opts.today;
  }

  let newEggs = 0;
  while (meter >= HATCH_THRESHOLD) {
    newEggs += 1;
    meter -= HATCH_THRESHOLD;
  }

  return {
    data: { ...data, hatchMeter: meter, hatchDay: day, hatchDayAdded: dayAdded, perfectDay },
    newEggs,
  };
}
