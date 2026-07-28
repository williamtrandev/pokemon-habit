import { Branch, CreatureForm, MegaForm } from './species';

// Kiểu ngày ISO dạng 'YYYY-MM-DD'
export type ISODate = string;

export interface ReminderTime {
  hour: number;
  minute: number;
  // undefined = 'daily' (tương thích dữ liệu cũ). 'interval' = lặp mỗi everyMinutes phút.
  kind?: 'daily' | 'interval';
  everyMinutes?: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// "1 giờ", "45 phút", "1 giờ 30 phút".
export function formatDuration(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  if (h === 0) return `${min} phút`;
  if (min === 0) return `${h} giờ`;
  return `${h} giờ ${min} phút`;
}

// Nhãn ngắn cho nhắc nhở: "08:30" (hằng ngày) hoặc "mỗi 30 phút" / "mỗi 1 giờ 30 phút".
export function reminderLabel(r: ReminderTime): string {
  if (r.kind === 'interval' && r.everyMinutes) {
    return `mỗi ${formatDuration(r.everyMinutes)}`;
  }
  return `${pad2(r.hour)}:${pad2(r.minute)}`;
}

// Sinh vật gắn với một mục tiêu. Dòng tiến hoá (line) được lấy ngẫu nhiên từ PokéAPI khi tạo.
export interface Creature {
  line: CreatureForm[]; // 1..3 dạng: [cơ bản, giữa, cuối]
  color: string; // màu đại diện (suy từ Pokédex id)
  xp: number; // BẬC tiến hoá
  vitality: number; // 0-100, THỂ TRẠNG — 0 = gục
  fainted: boolean;
  branch: Branch | null; // nhánh cuối (legendary = shiny)
  bestStreak: number;
  everFinal: boolean; // đã từng đạt dạng cuối
  // Danh sách dạng Mega của loài (có thể 0/1/2): undefined = chưa tra PokéAPI, [] = không có.
  megas?: MegaForm[];
  megaPick?: number; // chỉ số Mega đang chọn (khi loài có nhiều dạng, vd X/Y)
}

export interface Habit {
  id: string;
  title: string;
  reminder: ReminderTime | null;
  notificationId: string | null;
  createdAt: number;
  completions: Record<ISODate, boolean>;
  // Mốc hoàn thành gần nhất (epoch ms). Dùng cho habit 'interval': nút khóa trong
  // cửa sổ everyMinutes rồi tự mở lại. undefined = chưa từng / habit cũ (hằng ngày).
  lastCompletedAt?: number;
}

export interface AppData {
  habits: Habit[];
  lastActiveDate: ISODate;
  soundOn: boolean;
  hapticsOn: boolean;
  musicOn: boolean;
  version: number;
  // Pokédex "đã thấy": pokedexId -> đã thu (mọi dạng từng đạt). Dùng cho tab Pokédex.
  collection: Record<number, { shiny: boolean; at: number }>;
  // Bầy: mỗi con là 1 CREATURE có dòng tiến hoá riêng; thân thiết đủ ngưỡng thì tiến hoá.
  party: PartyMon[];
  // Kẹo 🍬 — nhận mỗi lần hoàn thành (tỉ lệ chu kỳ habit), dùng cho ăn nuôi lớn Pokémon.
  candy: number;
  // Trứng ĐÃ đủ điểm, chờ người chơi CHẠM để đập vỏ nở (rare = mốc streak -> shiny đảm bảo).
  pendingEggs: { rare: boolean }[];
  // Các mốc chuỗi đã trao thưởng (7/30/100...) để không trao lặp.
  streakClaimed: number[];
  // Tiến trình "nở trứng": điểm tích từ hành vi habit (xem collection.ts).
  hatchMeter: number;
  hatchDay: ISODate; // ngày của bộ đếm/ngày
  hatchDayAdded: number; // điểm đã cộng trong hatchDay (theo trần)
  perfectDay?: ISODate; // ngày đã nhận thưởng "xong hết"
  // Đồng hồ logic cho đồng bộ cloud: mốc sửa gần nhất (ms). Dùng để last-write-wins
  // khi merge giữa local và Supabase.
  updatedAt: number;
  // ===== Đấu đạo trường (boss battle) =====
  bossBeaten?: number[];   // id các lượt boss ĐÃ hạ (nhận thưởng 1 lần/lượt); giữ gần nhất
  bossWins?: number;       // tổng số trận thắng (mốc mỗi 5 trận -> trứng hiếm)
  // Sức mạnh bầy: các mốc Team Power đã nhận thưởng (không trao lặp).
  teamPowerClaimed?: number[];
}

// Một Pokémon trong bầy: nuôi lớn bằng kẹo -> thân thiết tăng -> tiến hoá dọc `line`.
export interface PartyMon {
  key: string; // id nội bộ duy nhất
  line: { id: number; name: string }[]; // dòng tiến hoá [cơ bản, ...]
  affection: number; // độ thân thiết -> quyết định bậc hiện tại (nuôi RIÊNG từng con)
  shiny: boolean;
  at: number; // mốc thu phục (ms)
  megaId?: number; // dạng đặc biệt ĐÃ hoá của RIÊNG con này; undefined = chưa hoá/không có
  megaName?: string;
  megaChoice?: number; // dạng người chơi CHỌN để hoá (khi loài có nhiều dạng, vd Mega/Ash)
}

export const CURRENT_VERSION = 5;

export interface HealthState {
  key: string;
  label: string;
  face: string;
  badge: string;
  color: string;
  opacity: number;
  tilt: number;
}

export function healthState(vitality: number, fainted: boolean): HealthState {
  if (fainted || vitality <= 0)
    return { key: 'fainted', label: 'Đã gục', face: '💀', badge: '💀', color: '#94A3B8', opacity: 0.45, tilt: 0 };
  if (vitality >= 80)
    return { key: 'radiant', label: 'Khỏe mạnh', face: '😄', badge: '', color: '#22C55E', opacity: 1, tilt: 0 };
  if (vitality >= 50)
    return { key: 'happy', label: 'Hơi mệt', face: '🙂', badge: '💤', color: '#84CC16', opacity: 0.92, tilt: 0 };
  if (vitality >= 20)
    return { key: 'weak', label: 'Suy yếu', face: '😕', badge: '🤒', color: '#F59E0B', opacity: 0.7, tilt: -8 };
  return { key: 'critical', label: 'Nguy kịch', face: '😣', badge: '🥀', color: '#EF4444', opacity: 0.55, tilt: -14 };
}
