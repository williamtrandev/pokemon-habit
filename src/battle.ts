// ===== Đấu đạo trường (boss battle) — LÕI THUẦN, không phụ thuộc UI =====
// Chỉ số gốc (base stats) của Pokémon giờ CÓ TÁC DỤNG: quyết định sức mạnh trong
// trận đấu tự động với "boss" hằng ngày. Tất định (deterministic) theo seed để test
// được và phát lại (replay) khớp animation. KHÔNG dùng Math.random ở đây.

export interface StatMap {
  [name: string]: number; // hp/attack/defense/special-attack/special-defense/speed
}

// Tổng chỉ số gốc (BST) từ danh sách stat của PokéAPI.
export function bstFromStats(stats: { name: string; value: number }[]): number {
  return stats.reduce((s, x) => s + (x.value || 0), 0);
}

export function statMap(stats: { name: string; value: number }[]): StatMap {
  const m: StatMap = {};
  for (const s of stats) m[s.name] = s.value;
  return m;
}

// ===== Shiny mạnh hơn dạng thường =====
// Shiny = +10% MỌI chỉ số gốc. Áp NGAY trên danh sách stat (trước toCombatant/bstFromStats)
// nên BST hiển thị, Sức mạnh bầy và sức mạnh trong trận cùng tăng — một con số nhất quán.
export const SHINY_STAT_MUL = 1.1;
export function shinyStats(
  stats: { name: string; value: number }[],
  shiny: boolean
): { name: string; value: number }[] {
  if (!shiny) return stats;
  return stats.map((s) => ({ name: s.name, value: Math.round(s.value * SHINY_STAT_MUL) }));
}

// ===== Bảng khắc hệ (tấn công) — chuẩn Pokémon =====
// x2 = hiệu quả gấp đôi, x0.5 = kém hiệu quả, x0 = miễn nhiễm.
type Eff = { x2: string[]; half: string[]; zero: string[] };
const CHART: Record<string, Eff> = {
  normal: { x2: [], half: ['rock', 'steel'], zero: ['ghost'] },
  fire: { x2: ['grass', 'ice', 'bug', 'steel'], half: ['fire', 'water', 'rock', 'dragon'], zero: [] },
  water: { x2: ['fire', 'ground', 'rock'], half: ['water', 'grass', 'dragon'], zero: [] },
  electric: { x2: ['water', 'flying'], half: ['electric', 'grass', 'dragon'], zero: ['ground'] },
  grass: { x2: ['water', 'ground', 'rock'], half: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'], zero: [] },
  ice: { x2: ['grass', 'ground', 'flying', 'dragon'], half: ['fire', 'water', 'ice', 'steel'], zero: [] },
  fighting: { x2: ['normal', 'ice', 'rock', 'dark', 'steel'], half: ['poison', 'flying', 'psychic', 'bug', 'fairy'], zero: ['ghost'] },
  poison: { x2: ['grass', 'fairy'], half: ['poison', 'ground', 'rock', 'ghost'], zero: ['steel'] },
  ground: { x2: ['fire', 'electric', 'poison', 'rock', 'steel'], half: ['grass', 'bug'], zero: ['flying'] },
  flying: { x2: ['grass', 'fighting', 'bug'], half: ['electric', 'rock', 'steel'], zero: [] },
  psychic: { x2: ['fighting', 'poison'], half: ['psychic', 'steel'], zero: ['dark'] },
  bug: { x2: ['grass', 'psychic', 'dark'], half: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'], zero: [] },
  rock: { x2: ['fire', 'ice', 'flying', 'bug'], half: ['fighting', 'ground', 'steel'], zero: [] },
  ghost: { x2: ['psychic', 'ghost'], half: ['dark'], zero: ['normal'] },
  dragon: { x2: ['dragon'], half: ['steel'], zero: ['fairy'] },
  dark: { x2: ['psychic', 'ghost'], half: ['fighting', 'dark', 'fairy'], zero: [] },
  steel: { x2: ['ice', 'rock', 'fairy'], half: ['fire', 'water', 'electric', 'steel'], zero: [] },
  fairy: { x2: ['fighting', 'dragon', 'dark'], half: ['fire', 'poison', 'steel'], zero: [] },
};

// Hệ số của MỘT hệ tấn công lên MỘT hệ phòng thủ.
function effOne(atk: string, def: string): number {
  const e = CHART[atk];
  if (!e) return 1;
  if (e.zero.includes(def)) return 0;
  if (e.x2.includes(def)) return 2;
  if (e.half.includes(def)) return 0.5;
  return 1;
}

// Kẻ tấn công (nhiều hệ) chọn hệ TỐT NHẤT đánh vào phòng thủ (nhiều hệ).
// = max theo hệ tấn công của (tích các hệ số lên từng hệ phòng thủ).
export function typeMultiplier(atkTypes: string[], defTypes: string[]): number {
  const atks = atkTypes.length ? atkTypes : ['normal'];
  const defs = defTypes.length ? defTypes : ['normal'];
  let best = 0;
  for (const a of atks) {
    let prod = 1;
    for (const d of defs) prod *= effOne(a, d);
    best = Math.max(best, prod);
  }
  return best;
}

export function effLabel(mult: number): string {
  if (mult === 0) return 'Vô hiệu!';
  if (mult >= 2) return 'Hiệu quả tuyệt vời!';
  if (mult > 0 && mult < 1) return 'Không hiệu quả lắm';
  return '';
}

export const ALL_TYPES = Object.keys(CHART);

// Các hệ tấn công KHẮC CHẾ (gây dame tăng, mult>1) lên bộ hệ phòng thủ cho trước.
// Dùng gợi ý người chơi chọn Pokémon phù hợp để đấu boss.
export function countersOf(defTypes: string[]): string[] {
  return ALL_TYPES.filter((t) => typeMultiplier([t], defTypes) > 1);
}

// ===== Chiến binh (combatant) suy từ chỉ số gốc =====
export interface Combatant {
  key: string; // party key hoặc 'boss'
  id: number; // sprite id
  name: string;
  types: string[];
  maxHp: number;
  atk: number; // đòn mạnh hơn (Công vs Đặc công)
  physical: boolean; // true = đòn vật lý (dùng Thủ của đối thủ), false = đặc biệt (Đ.Thủ)
  defP: number; // Thủ
  defS: number; // Đ.Thủ
  spd: number; // Tốc độ — quyết lượt + tỉ lệ chí mạng
}

// HP nhân lên để thanh máu tụt qua nhiều đòn (đẹp animation). ATK = đòn mạnh hơn
// (Công vs Đặc công); kèm loại đòn để trừ đúng Thủ/Đ.Thủ của đối thủ. Boss cộng bội
// máu theo `hpMul` cho cân với cả bầy.
export function toCombatant(
  key: string,
  id: number,
  name: string,
  types: string[],
  stats: { name: string; value: number }[],
  hpMul = 1,
  atkMul = 1
): Combatant {
  const m = statMap(stats);
  const baseHp = m['hp'] ?? 60;
  const attack = m['attack'] ?? 50;
  const spAtk = m['special-attack'] ?? 50;
  return {
    key,
    id,
    name,
    types,
    maxHp: Math.round((baseHp * 2.5 + 50) * hpMul),
    atk: Math.round(Math.max(attack, spAtk) * atkMul),
    physical: attack >= spAtk,
    defP: m['defense'] ?? 50,
    defS: m['special-defense'] ?? 50,
    spd: m['speed'] ?? 50,
  };
}

// Chí mạng: Tốc độ cao -> tỉ lệ cao hơn (tối đa 35%), sát thương ×1.8.
export const CRIT_MULT = 1.8;
export function critChance(spd: number): number {
  return Math.min(0.35, 0.05 + spd / 600);
}

// ===== Bể boss theo ngày (loài mạnh/biểu tượng) =====
export const BOSS_POOL: { id: number; name: string }[] = [
  { id: 150, name: 'Mewtwo' }, { id: 149, name: 'Dragonite' }, { id: 6, name: 'Charizard' },
  { id: 9, name: 'Blastoise' }, { id: 3, name: 'Venusaur' }, { id: 248, name: 'Tyranitar' },
  { id: 445, name: 'Garchomp' }, { id: 130, name: 'Gyarados' }, { id: 282, name: 'Gardevoir' },
  { id: 373, name: 'Salamence' }, { id: 376, name: 'Metagross' }, { id: 143, name: 'Snorlax' },
  { id: 94, name: 'Gengar' }, { id: 448, name: 'Lucario' }, { id: 384, name: 'Rayquaza' },
  { id: 385, name: 'Jirachi' },
];

// Hash tất định từ chuỗi -> RNG ổn định theo kỳ (không cần server).
// Export cho items.ts dùng chung (món rơi tất định theo lượt boss).
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ===== Độ khó boss (random, có tag) =====
export interface BossTier {
  key: string;
  label: string;
  color: string;
  hpMul: number;   // bội máu boss
  atkMul: number;  // bội công boss
  candyMul: number; // bội kẹo thưởng
  weight: number;  // trọng số random
  winEgg?: 'normal' | 'rare'; // thắng bậc này -> tặng thêm 1 trứng (đảm bảo)
  itemChance?: number; // tỉ lệ rơi trang bị khi thắng (0..1) — xem items.ts
}
// Bội máu/công hạ so với bản cũ: cơ chế 3 pha đã tự làm loãng dame người chơi (mỗi con
// chỉ khắc được 1 trong 3 pha), nên giữ bội cũ thì bậc Khó trở lên bất khả thắng.
// Đo bằng mô phỏng 60 seed, đội hình khắc được 3 pha (còn lệch 1 pha, chọn tối ưu sẽ cao hơn):
//   Dễ 100% · Thường 100% · Khó 67% · Cực khó 23% · Huyền thoại 17%
// Cùng đội đó nhưng LỆCH hệ: 32% ở Dễ, và 0-2% từ bậc Thường trở lên.
// Khoảng cách giữa "chọn đúng" và "chọn bừa" chính là chỗ thử thách.
export const BOSS_TIERS: BossTier[] = [
  { key: 'easy', label: 'Dễ', color: '#22C55E', hpMul: 0.85, atkMul: 0.9, candyMul: 0.8, weight: 2, itemChance: 0.2 },
  { key: 'normal', label: 'Thường', color: '#3B82F6', hpMul: 1.2, atkMul: 1.1, candyMul: 1.3, weight: 4, itemChance: 0.35 },
  { key: 'hard', label: 'Khó', color: '#F97316', hpMul: 1.5, atkMul: 1.25, candyMul: 2.2, weight: 3, itemChance: 0.55 },
  { key: 'elite', label: 'Cực khó', color: '#EF4444', hpMul: 1.7, atkMul: 1.35, candyMul: 4.0, weight: 2, winEgg: 'normal', itemChance: 0.8 },
  { key: 'legendary', label: 'Huyền thoại', color: '#FBBF24', hpMul: 1.95, atkMul: 1.5, candyMul: 6.5, weight: 1, winEgg: 'rare', itemChance: 1 },
];
function pickTier(r: number): BossTier {
  const total = BOSS_TIERS.reduce((s, t) => s + t.weight, 0);
  let x = r * total;
  for (const t of BOSS_TIERS) { if (x < t.weight) return t; x -= t.weight; }
  return BOSS_TIERS[0];
}

// ===== Sự kiện boss: xuất hiện NGẪU NHIÊN trong 1 kỳ, tồn tại 1 khoảng rồi biến mất =====
// Mỗi kỳ có ĐÚNG 1 lượt boss, giờ spawn random trong kỳ.
//
// Kỳ 3h + cửa sổ 45-120' cho khoảng chờ trung bình 97 phút, dài nhất 172 phút — quá thưa.
// Kỳ 1h + cửa sổ 30-50' kéo xuống trung bình ~18 phút, và chặn trần: lượt sau KHÔNG BAO
// GIỜ cách lượt trước quá (kỳ − cửa_sổ_min) = 30 phút.
export const BOSS_PERIOD_MS = 1 * 3600_000;
export const BOSS_WINDOW_MIN = 30; // phút tồn tại tối thiểu
export const BOSS_WINDOW_MAX = 50; // phút tồn tại tối đa

export interface BossEncounter {
  id: number;       // = spawnAt (định danh duy nhất mỗi lượt)
  spawnAt: number;  // ms xuất hiện
  expireAt: number; // ms biến mất
  species: { id: number; name: string };
  tier: BossTier;
  seed: number;     // seed mô phỏng trận
  // Hệ của pha 2 và pha 3 (pha 1 dùng hệ gốc của loài). Tất định theo kỳ.
  auraTypes: [string, string];
}

// Lượt boss tất định của một kỳ (giờ/độ khó/loài đều random theo seed kỳ).
export function encounterForPeriod(period: number): BossEncounter {
  const rng = lcg(hashStr('boss:' + period));
  const winLen = (BOSS_WINDOW_MIN + Math.floor(rng() * (BOSS_WINDOW_MAX - BOSS_WINDOW_MIN + 1))) * 60000;
  const maxOffset = Math.max(0, BOSS_PERIOD_MS - winLen);
  const spawnAt = period * BOSS_PERIOD_MS + Math.floor(rng() * maxOffset);
  const species = BOSS_POOL[Math.floor(rng() * BOSS_POOL.length)];
  const tier = pickTier(rng());
  return {
    id: spawnAt,
    spawnAt,
    expireAt: spawnAt + winLen,
    species,
    tier,
    seed: hashStr('seed:' + period),
    auraTypes: pickAuras(rng),
  };
}

// Hai hệ "hào quang" cho pha 2 và pha 3 (pha 1 dùng hệ gốc của loài).
// Tất định theo rng của kỳ, và khác nhau để người chơi buộc phải phủ nhiều hệ.
function pickAuras(rng: () => number): [string, string] {
  const a = ALL_TYPES[Math.floor(rng() * ALL_TYPES.length)];
  let b = ALL_TYPES[Math.floor(rng() * ALL_TYPES.length)];
  if (b === a) b = ALL_TYPES[(ALL_TYPES.indexOf(a) + 1 + Math.floor(rng() * (ALL_TYPES.length - 1))) % ALL_TYPES.length];
  return [a, b];
}

// ===== Ba pha của boss =====
// Mỗi pha ĐỔI HỆ, nên không con nào khắc được cả trận: phải mang 3 con phủ 3 hệ, và
// XẾP ĐÚNG THỨ TỰ vì con thứ i được đẩy vào đúng pha i.
export const PHASE_CUTS = [1, 2 / 3, 1 / 3]; // mốc HP mở đầu mỗi pha
export const ENRAGE_ATK_MUL = 1.35;          // pha cuối boss nổi giận
export const STALL_ROUNDS = 8;               // đánh chậm quá bấy nhiêu lượt trong 1 pha...
export const STALL_REGEN = 0.05;             // ...thì boss hồi 5% máu tối đa mỗi lượt

export interface BossPhase {
  index: number;    // 0..2
  types: string[];  // hệ của boss trong pha này
  enraged: boolean;
}

// Bộ 3 pha của một lượt boss: pha 1 hệ gốc, pha 2 & 3 thay bằng hào quang.
export function phasesOf(bossTypes: string[], auraTypes: [string, string]): BossPhase[] {
  return [
    { index: 0, types: bossTypes.length ? bossTypes : ['normal'], enraged: false },
    { index: 1, types: [auraTypes[0]], enraged: false },
    { index: 2, types: [auraTypes[1]], enraged: true },
  ];
}

// Pha hiện tại theo tỉ lệ máu còn lại.
export function phaseAt(hpRatio: number): number {
  if (hpRatio > PHASE_CUTS[1]) return 0;
  if (hpRatio > PHASE_CUTS[2]) return 1;
  return 2;
}

// ===== Boss theo kịp ĐỘI HÌNH mang đi =====
// Boss lấy từ BOSS_POOL nên BST có trần, còn bầy thì lớn vô hạn -> càng chơi càng dễ.
//
// Scale theo tổng BST của 3 CON MANG ĐI, không phải Sức mạnh bầy: bầy 24 con có power
// ~9500 nhưng chỉ 3 con ra sân, nên scale theo bầy sẽ cho boss máu/công gấp 3 trong khi
// dame người chơi không tăng -> bất khả thắng.
export const SCALE_BASE_POWER = 1200; // ~3 con tầm trung -> không scale
export const SCALE_MAX = 2.0;
// ATK scale CHẬM hơn HP: cùng hệ số thì boss one-shot cả đội, trận hết hay.
export const SCALE_ATK_SHARE = 0.5;

// Bội máu boss theo đội hình.
export function lineupScale(lineupPower: number): number {
  if (lineupPower <= SCALE_BASE_POWER) return 1;
  return Math.min(SCALE_MAX, lineupPower / SCALE_BASE_POWER);
}

// Bội công boss = phần nửa của bội máu (scale 2.0 -> công ×1.5).
export function lineupAtkScale(lineupPower: number): number {
  return 1 + (lineupScale(lineupPower) - 1) * SCALE_ATK_SHARE;
}

// Boss đang xuất hiện tại `now` (null nếu chưa/đã hết).
export function activeBoss(now: number): BossEncounter | null {
  const enc = encounterForPeriod(Math.floor(now / BOSS_PERIOD_MS));
  return now >= enc.spawnAt && now < enc.expireAt ? enc : null;
}

// Lượt boss KẾ TIẾP kể từ `now` (để hiện đếm ngược tới lần xuất hiện sau).
export function nextBoss(now: number): BossEncounter {
  const p = Math.floor(now / BOSS_PERIOD_MS);
  const cur = encounterForPeriod(p);
  return now < cur.spawnAt ? cur : encounterForPeriod(p + 1);
}

// ===== Mô phỏng trận (tất định theo seed) =====
export type BattleEvent = {
  attacker: 'player' | 'boss';
  attackerKey: string;
  defenderKey: string;
  dmg: number;
  mult: number;
  crit: boolean; // đòn chí mạng
  playerHp: number; // HP còn lại của chiến binh player hiện tại (sau đòn)
  bossHp: number;
  faintedKey: string | null; // con vừa gục (nếu có)
  incomingKey: string | null; // con player kế tiếp vào sân (nếu có)
  // ===== Thông tin PHA (thêm sau; UI cũ bỏ qua được) =====
  phase?: number;        // pha hiện tại 0..2
  bossTypes?: string[];  // hệ boss ở pha này (đổi mỗi pha)
  // Vì sao con mới vào sân: 'faint' = con trước gục, 'phase' = đổi pha nên luân phiên.
  incomingReason?: 'faint' | 'phase';
  // Máu THẬT của con vừa vào sân. Con rút về giữ nguyên máu đã mất, nên UI không được
  // mặc định vẽ đầy thanh.
  incomingHp?: number;
  // Boss vừa hồi máu do người chơi đánh quá chậm trong pha.
  regen?: number;
};

export interface BattleResult {
  win: boolean;
  events: BattleEvent[];
  boss: Combatant;
  order: string[]; // thứ tự player ra sân (key)
}

// LCG nhỏ cho phương sai đòn đánh — tất định. Export cho items.ts (random món rơi).
export function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296; // [0,1)
  };
}

// Bội số ngoài công thức gốc — dùng cho cơ chế đánh theo lượt (dồn lực, đòn nặng, phòng thủ).
export interface DamageOpts {
  atkMul?: number;   // bội CÔNG của bên ra đòn (dồn lực, đòn nặng...)
  takenMul?: number; // bội SÁT THƯƠNG bên nhận phải chịu (<1 = đỡ được bớt)
}

// Sát thương = Công (đòn mạnh hơn) GIẢM bởi Thủ/Đ.Thủ đúng loại của đối thủ,
// × hệ khắc × phương sai × (chí mạng nếu có) × các bội ngoài.
// Tách ra export để battleLive.ts dùng đúng CÙNG một công thức — hai engine lệch số là bug ngầm.
export function rollDamage(
  attacker: Combatant,
  defender: Combatant,
  rng: () => number,
  opts: DamageOpts = {}
): { dmg: number; mult: number; crit: boolean } {
  const mult = typeMultiplier(attacker.types, defender.types);
  const defStat = attacker.physical ? defender.defP : defender.defS;
  const variance = 0.85 + rng() * 0.15; // 0.85..1.0
  const crit = rng() < critChance(attacker.spd);
  const critM = crit ? CRIT_MULT : 1;
  const raw =
    attacker.atk * (65 / (65 + defStat)) * 1.7 * mult * variance * critM *
    (opts.atkMul ?? 1) * (opts.takenMul ?? 1);
  const dmg = mult === 0 ? 0 : Math.max(1, Math.round(raw));
  return { dmg, mult, crit };
}

function damage(attacker: Combatant, defender: Combatant, rng: () => number): { dmg: number; mult: number; crit: boolean } {
  return rollDamage(attacker, defender, rng);
}

// Đánh theo PHA. Trong mỗi vòng, con nhanh hơn (spd) đánh trước.
//
// Luật (chỗ tạo ra thử thách — xem thêm phasesOf/phaseAt):
//   • Boss có 3 pha theo mốc máu, MỖI PHA ĐỔI HỆ -> không con nào khắc suốt trận.
//   • Đổi pha thì LUÂN PHIÊN sang con kế tiếp trong đội, nên con thứ i gánh pha i:
//     xếp sai thứ tự là mất ưu thế khắc hệ dù đội vẫn mạnh.
//   • Con rút về GIỮ NGUYÊN máu đã mất; quay lại sân không được hồi.
//     (Trước đây mỗi con vào sân đầy máu -> tổng HP gấp 3 boss, thắng quá dễ.)
//   • Pha cuối boss nổi giận: ATK × ENRAGE_ATK_MUL.
//   • Kéo dài quá STALL_ROUNDS lượt trong một pha -> boss hồi STALL_REGEN máu mỗi lượt,
//     nên mang toàn con thủ cao rồi rùa từ từ là không xong.
//
// Vẫn TẤT ĐỊNH theo seed: cùng seed cho cùng kết quả ở app và web.
export function simulateBattle(team: Combatant[], boss: Combatant, seed: number, auraTypes?: [string, string]): BattleResult {
  const rng = lcg(seed);
  const events: BattleEvent[] = [];
  const order = team.map((c) => c.key);
  if (!team.length) return { win: false, events, boss, order };

  // Không truyền hào quang -> suy tất định từ seed để hàm dùng được độc lập (test/replay).
  const auras = auraTypes ?? pickAuras(lcg(seed ^ 0x9e3779b9));
  const phases = phasesOf(boss.types, auras);

  let bossHp = boss.maxHp;
  let idx = 0;
  let cur = team[idx];
  // Máu RIÊNG từng con, giữ qua các lần ra sân.
  const hp = new Map<string, number>(team.map((c) => [c.key, c.maxHp]));
  let phase = 0;
  let roundsInPhase = 0;
  const GUARD = 500;

  // Boss ở pha hiện tại: đổi hệ, pha cuối cộng bội công.
  const bossNow = (): Combatant => {
    const p = phases[phase];
    return { ...boss, types: p.types, atk: p.enraged ? Math.round(boss.atk * ENRAGE_ATK_MUL) : boss.atk };
  };

  // Con còn sống kế tiếp kể từ vị trí i (dùng cho luân phiên theo pha).
  const nextAliveFrom = (i: number): number => {
    for (let j = i; j < team.length; j++) if ((hp.get(team[j].key) ?? 0) > 0) return j;
    return -1;
  };

  for (let step = 0; step < GUARD; step++) {
    if (bossHp <= 0) break;
    if ((hp.get(cur.key) ?? 0) <= 0) break; // hết con -> thua

    const b = bossNow();
    const playerFirst = cur.spd >= b.spd;
    const acts: ('player' | 'boss')[] = playerFirst ? ['player', 'boss'] : ['boss', 'player'];
    let ended = false;

    for (const who of acts) {
      if (bossHp <= 0 || ended) break;

      if (who === 'player') {
        const { dmg, mult, crit } = damage(cur, b, rng);
        bossHp = Math.max(0, bossHp - dmg);
        events.push({
          attacker: 'player', attackerKey: cur.key, defenderKey: 'boss', dmg, mult, crit,
          playerHp: hp.get(cur.key) ?? 0, bossHp, faintedKey: null, incomingKey: null,
          phase, bossTypes: b.types,
        });
      } else {
        const { dmg, mult, crit } = damage(b, cur, rng);
        const left = Math.max(0, (hp.get(cur.key) ?? 0) - dmg);
        hp.set(cur.key, left);
        let faintedKey: string | null = null;
        let incomingKey: string | null = null;

        if (left <= 0) {
          faintedKey = cur.key;
          const nx = nextAliveFrom(idx + 1);
          if (nx >= 0) {
            idx = nx;
            cur = team[idx];
            incomingKey = cur.key;
          } else {
            ended = true; // hết con còn sống -> thua
          }
        }
        events.push({
          attacker: 'boss', attackerKey: boss.key, defenderKey: faintedKey ?? cur.key, dmg, mult, crit,
          playerHp: faintedKey ? 0 : left, bossHp, faintedKey, incomingKey,
          phase, bossTypes: b.types,
          ...(incomingKey ? { incomingReason: 'faint' as const, incomingHp: hp.get(incomingKey) ?? 0 } : null),
        });
      }
    }

    if (bossHp <= 0 || ended) break;

    // ===== Đổi pha -> luân phiên sang con kế tiếp =====
    const nextPhase = phaseAt(bossHp / boss.maxHp);
    if (nextPhase !== phase) {
      phase = nextPhase;
      roundsInPhase = 0;
      // Con của pha này là con ở ĐÚNG vị trí `phase` trong đội (còn sống); không thì con
      // còn sống kế tiếp. Nhờ vậy thứ tự chạm chọn = thứ tự gánh pha.
      const want = (hp.get(team[phase]?.key ?? '') ?? 0) > 0 ? phase : nextAliveFrom(0);
      if (want >= 0 && team[want].key !== cur.key) {
        idx = want;
        cur = team[idx];
        const last = events[events.length - 1];
        last.incomingKey = cur.key;
        last.incomingReason = 'phase';
        last.incomingHp = hp.get(cur.key) ?? 0;
      }
      continue;
    }

    // ===== Đánh chậm -> boss hồi máu =====
    roundsInPhase++;
    if (roundsInPhase > STALL_ROUNDS) {
      const heal = Math.round(boss.maxHp * STALL_REGEN);
      const before = bossHp;
      bossHp = Math.min(boss.maxHp, bossHp + heal);
      const last = events[events.length - 1];
      if (last && bossHp > before) {
        last.bossHp = bossHp;
        last.regen = bossHp - before;
      }
    }
  }

  return { win: bossHp <= 0, events, boss, order };
}

// ===== Sức mạnh bầy (Team Power) = tổng BST của DẠNG hiện tại mỗi con =====
// Bốn mốc ĐẦU GAME giữ nguyên con số cũ: người chơi đã nhận kẹo theo `teamPowerClaimed`
// (khoá theo `power`), đổi số là trao lại hoặc mất mốc.
export const TEAM_POWER_MILESTONES: { power: number; candy: number }[] = [
  { power: 2000, candy: 150 },
  { power: 5000, candy: 300 },
  { power: 10000, candy: 600 },
  { power: 20000, candy: 1200 },
];

// Hết bảng thì SINH THÊM mãi — bầy lớn vô hạn nên thang mốc cũng phải vô hạn.
// Trước đây hết mốc 20000 là thẻ đứng ở "Đã đạt mốc cao nhất", không còn gì để đuổi.
export const TEAM_POWER_STEP = 10_000;        // khoảng cách mỗi mốc sinh thêm
export const TEAM_POWER_STEP_CANDY = 800;     // kẹo mốc sinh thêm đầu tiên
export const TEAM_POWER_STEP_GROWTH = 200;    // mỗi mốc sau lại nhiều hơn mốc trước

export interface TeamMilestone { power: number; candy: number; index: number }

// Mốc thứ `i` (0-based) của CẢ thang: trong bảng thì lấy bảng, ngoài bảng thì sinh theo STEP.
export function teamMilestoneAt(i: number): TeamMilestone {
  const fixed = TEAM_POWER_MILESTONES;
  if (i < fixed.length) return { ...fixed[i], index: i };
  const k = i - fixed.length; // 0, 1, 2...
  return {
    power: fixed[fixed.length - 1].power + (k + 1) * TEAM_POWER_STEP,
    candy: TEAM_POWER_STEP_CANDY + k * TEAM_POWER_STEP_GROWTH,
    index: i,
  };
}

// Mọi mốc đã ĐẠT với sức mạnh này (để trao kẹo). Chặn trần vòng lặp cho an toàn.
export function teamMilestonesUpTo(power: number): TeamMilestone[] {
  const out: TeamMilestone[] = [];
  for (let i = 0; i < 1000; i++) {
    const m = teamMilestoneAt(i);
    if (power < m.power) break;
    out.push(m);
  }
  return out;
}

// Mốc KẾ TIẾP — luôn tồn tại, nên thẻ Sức mạnh bầy không bao giờ hết đích để đuổi.
export function nextTeamMilestone(power: number): TeamMilestone {
  return teamMilestoneAt(teamMilestonesUpTo(power).length);
}

// ===== Danh hiệu bầy — "bậc mới" nhìn thấy được, không chỉ là con số =====
export const TEAM_RANKS: { at: number; label: string; color: string }[] = [
  { at: 0, label: 'Tân binh', color: '#94A3B8' },
  { at: 2_000, label: 'Huấn luyện viên', color: '#22C55E' },
  { at: 5_000, label: 'Kỳ cựu', color: '#3B82F6' },
  { at: 10_000, label: 'Tinh nhuệ', color: '#A855F7' },
  { at: 20_000, label: 'Quán quân', color: '#F97316' },
  { at: 35_000, label: 'Cao thủ', color: '#EF4444' },
  { at: 50_000, label: 'Bậc thầy', color: '#FBBF24' },
  { at: 75_000, label: 'Truyền kỳ', color: '#22D3EE' },
];

// Danh hiệu + số SAO. Sao đếm các mốc vượt ngoài bảng cố định, nên qua hạng cuối cùng
// vẫn còn thứ để leo (Truyền kỳ ★1, ★2...).
export function teamRank(power: number): { label: string; color: string; star: number } {
  let r = TEAM_RANKS[0];
  for (const x of TEAM_RANKS) if (power >= x.at) r = x;
  const star = Math.max(0, teamMilestonesUpTo(power).length - TEAM_POWER_MILESTONES.length);
  return { label: r.label, color: r.color, star };
}

// ===== Thưởng đấu boss =====
export const BATTLE_CANDY_FACTOR = 0.3; // kẹo thắng = round(bossBST * factor * bội_độ_khó)
// Mỗi N trận thắng -> 1 trứng hiếm. Nâng 3 -> 6 khi rút kỳ boss 3h xuống 1h: số lượt/ngày
// tăng 8 -> 24 nên mốc cũ cho ~5.8 trứng hiếm/ngày (trước là 2.5). Mốc 6 kéo về ~2.9/ngày.
// Kẹo thì để nguyên: +60%/ngày, nhưng bầy 24 con ăn hết, và boss giờ khó hơn nhiều.
export const BATTLE_EGG_EVERY = 6;

export function battleCandy(bossBst: number, candyMul = 1): number {
  return Math.round(bossBst * BATTLE_CANDY_FACTOR * candyMul);
}
