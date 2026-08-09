import { AppData, PartyMon } from './types';

// ===== Thu nạp tách khỏi số habit =====
// Điểm nở đến từ SỰ KIÊN TRÌ (làm mỗi ngày, xong hết, streak). Đủ ngưỡng -> nở 1 con MỚI
// (một creature dạng cơ bản, tạo ở AppContext qua fetchRandomLine). Nuôi lớn bằng kẹo.

export const HATCH_DAILY_CAP = 14;  // trần điểm/ngày (chống cày dồn) — nới rộng để thu nhanh hơn
export const PERFECT_DAY_BONUS = 4; // xong HẾT hôm nay (1 lần/ngày)
export const HATCH_THRESHOLD = 3;   // đủ điểm -> nở (thấp hơn -> nhiều Pokémon hơn)

// Điểm nở mỗi lần hoàn thành, TĂNG theo chuỗi ngày -> giữ chuỗi = trứng nở nhanh hơn (đòn bẩy giữ chân).
export function hatchPoints(bestStreak: number): number {
  return 2 + Math.floor(bestStreak / 7); // 0-6:2, 7-13:3, 14-20:4...
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

// ===== Cửa hàng trứng: đổi kẹo lấy trứng để thu thêm Pokémon nhanh hơn =====
export const EGG_PRICE = 120;       // kẹo cho 1 trứng thường
export const RARE_EGG_PRICE = 600;  // kẹo cho 1 trứng HIẾM (shiny đảm bảo)

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

// ===== Bầy phải DUY NHẤT =====
//
// Khoá của một con là CẢ DÒNG tiến hoá, rút gọn thành "dạng cơ bản > bậc cuối":
//
//   • Không dùng dạng đang hiển thị: một con giữ nguyên cả dòng, nên Charmander và Charizard
//     là CÙNG một con — nở thêm Charmander khi đã có Charizard vẫn là trùng.
//   • Không dùng riêng dạng cơ bản: họ có NHÁNH thì mỗi nhánh là một con khác hẳn. Charcadet
//     (935) rẽ thành Armarouge (936) hoặc Ceruledge (937); nuôi lên là hai con nhìn không
//     liên quan gì nhau, gộp lại thì mất trắng một nhánh.
export function baseIdOf(mon: PartyMon): number {
  return mon.line[0]?.id ?? -1;
}

// "152>154". Dòng một bậc thì hai đầu trùng nhau ("143>143") — vẫn đúng.
export function lineKeyOf(mon: PartyMon): string {
  return lineKey(mon.line);
}

export function lineKey(line: { id: number }[]): string {
  if (!line.length) return '-1>-1';
  return `${line[0].id}>${line[line.length - 1].id}`;
}

// Shiny là một món sưu tầm KHÁC, nên (dòng, shiny) mới là khoá thật sự:
//   • trứng thường nở ra dòng đã có  -> TRÙNG, không nhận
//   • trứng nở ra shiny của dòng đã có -> hợp lệ, vì shiny là con chưa từng có
//   • nở ra shiny của dòng đã có shiny -> TRÙNG
export function partyKey(lk: string, shiny: boolean): string {
  return `${lk}:${shiny ? 's' : 'n'}`;
}

// Những DÒNG không được nở ra nữa cho lần nở này.
// Trứng thường né mọi dòng đã có; trứng shiny chỉ né những dòng đã có SẴN bản shiny.
export function hatchAvoidKeys(party: PartyMon[], shiny: boolean): string[] {
  const avoid = new Set<string>();
  for (const m of party) {
    if (!shiny || m.shiny) avoid.add(lineKeyOf(m));
  }
  return [...avoid];
}

// Con sắp nở có thật sự mới không (dùng để quyết định có nhận hay trả lại trứng).
export function isNewCatch(party: PartyMon[], lk: string, shiny: boolean): boolean {
  const have = new Set(party.map((m) => partyKey(lineKeyOf(m), m.shiny)));
  return !have.has(partyKey(lk, shiny));
}

// Ghi vào Pokédex mà KHÔNG hạ cấp shiny.
// Trước đây chỗ này gán đè: đã ghi nhận Charizard shiny, sau đó một Charmander thường tiến
// hoá lên Charizard là ô Pokédex mất dấu shiny.
export function recordCaught(
  collection: AppData['collection'],
  id: number,
  shiny: boolean,
  at: number
): AppData['collection'] {
  const prev = collection[id];
  return {
    ...collection,
    [id]: { shiny: !!prev?.shiny || shiny, at: prev?.at ?? at },
  };
}

// ===== Dọn bầy đã trùng sẵn =====
//
// Luật duy nhất ở trên chỉ chặn con TRÙNG MỚI. Bầy đang chơi thì đã đầy bản sao do lỗi cũ,
// nên phải gộp lại một lần.
//
// Giữ con "xịn nhất" của mỗi khoá (thân thiết cao nhất -> đã hoá dạng đặc biệt -> thu trước),
// và HOÀN LẠI kẹo bằng đúng thân thiết của những con bị gộp: kẹo đổ vào chúng là công sức
// thật, xoá trắng là phạt oan người chơi.
export interface DedupeResult {
  party: PartyMon[];
  removed: number;
  refund: number; // kẹo trả lại (thân thiết ↔ kẹo tỉ lệ 1:1)
}

export function dedupeParty(party: PartyMon[]): DedupeResult {
  const best = new Map<string, PartyMon>();
  let removed = 0;
  let refund = 0;

  // Con nào đáng giữ hơn giữa hai bản trùng.
  const better = (a: PartyMon, b: PartyMon): PartyMon => {
    if (a.affection !== b.affection) return a.affection > b.affection ? a : b;
    if (!!a.megaId !== !!b.megaId) return a.megaId ? a : b;
    return a.at <= b.at ? a : b; // thu được trước thì giữ
  };

  for (const mon of party) {
    const k = partyKey(lineKeyOf(mon), mon.shiny);
    const cur = best.get(k);
    if (!cur) {
      best.set(k, mon);
      continue;
    }
    const keep = better(cur, mon);
    const drop = keep === cur ? mon : cur;
    best.set(k, keep);
    removed += 1;
    refund += Math.max(0, Math.round(drop.affection));
  }

  // Giữ nguyên thứ tự xuất hiện đầu tiên để bầy không bị xáo tung sau khi dọn.
  const seen = new Set<string>();
  const out: PartyMon[] = [];
  for (const mon of party) {
    const k = partyKey(lineKeyOf(mon), mon.shiny);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(best.get(k)!);
  }

  return { party: out, removed, refund };
}

// Dọn bầy trong AppData. Không có gì trùng -> trả về ĐÚNG object cũ, nên gọi mỗi lần load
// cũng không tạo ghi thừa.
export function dedupeData(data: AppData): AppData {
  const r = dedupeParty(data.party ?? []);
  if (!r.removed) return data;
  return { ...data, party: r.party, candy: (data.candy ?? 0) + r.refund };
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
