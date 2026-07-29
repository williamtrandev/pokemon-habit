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
function hashStr(s: string): number {
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
}
export const BOSS_TIERS: BossTier[] = [
  { key: 'easy', label: 'Dễ', color: '#22C55E', hpMul: 0.9, atkMul: 0.9, candyMul: 0.8, weight: 2 },
  { key: 'normal', label: 'Thường', color: '#3B82F6', hpMul: 1.3, atkMul: 1.15, candyMul: 1.3, weight: 4 },
  { key: 'hard', label: 'Khó', color: '#F97316', hpMul: 1.9, atkMul: 1.4, candyMul: 2.2, weight: 3 },
  { key: 'elite', label: 'Cực khó', color: '#EF4444', hpMul: 2.6, atkMul: 1.75, candyMul: 4.0, weight: 2, winEgg: 'normal' },
  { key: 'legendary', label: 'Huyền thoại', color: '#FBBF24', hpMul: 3.5, atkMul: 2.1, candyMul: 6.5, weight: 1, winEgg: 'rare' },
];
function pickTier(r: number): BossTier {
  const total = BOSS_TIERS.reduce((s, t) => s + t.weight, 0);
  let x = r * total;
  for (const t of BOSS_TIERS) { if (x < t.weight) return t; x -= t.weight; }
  return BOSS_TIERS[0];
}

// ===== Sự kiện boss: xuất hiện NGẪU NHIÊN trong 1 kỳ, tồn tại 1 khoảng rồi biến mất =====
export const BOSS_PERIOD_MS = 3 * 3600_000; // mỗi kỳ 3h có đúng 1 lượt boss (giờ random trong kỳ)
export const BOSS_WINDOW_MIN = 45;  // phút tồn tại tối thiểu
export const BOSS_WINDOW_MAX = 120; // phút tồn tại tối đa

export interface BossEncounter {
  id: number;       // = spawnAt (định danh duy nhất mỗi lượt)
  spawnAt: number;  // ms xuất hiện
  expireAt: number; // ms biến mất
  species: { id: number; name: string };
  tier: BossTier;
  seed: number;     // seed mô phỏng trận
}

// Lượt boss tất định của một kỳ (giờ/độ khó/loài đều random theo seed kỳ).
export function encounterForPeriod(period: number): BossEncounter {
  const rng = lcg(hashStr('boss:' + period));
  const winLen = (BOSS_WINDOW_MIN + Math.floor(rng() * (BOSS_WINDOW_MAX - BOSS_WINDOW_MIN + 1))) * 60000;
  const maxOffset = Math.max(0, BOSS_PERIOD_MS - winLen);
  const spawnAt = period * BOSS_PERIOD_MS + Math.floor(rng() * maxOffset);
  const species = BOSS_POOL[Math.floor(rng() * BOSS_POOL.length)];
  const tier = pickTier(rng());
  return { id: spawnAt, spawnAt, expireAt: spawnAt + winLen, species, tier, seed: hashStr('seed:' + period) };
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
};

export interface BattleResult {
  win: boolean;
  events: BattleEvent[];
  boss: Combatant;
  order: string[]; // thứ tự player ra sân (key)
}

// LCG nhỏ cho phương sai đòn đánh — tất định.
function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296; // [0,1)
  };
}

// Sát thương = Công (đòn mạnh hơn) GIẢM bởi Thủ/Đ.Thủ đúng loại của đối thủ,
// × hệ khắc × phương sai × (chí mạng nếu có).
function damage(attacker: Combatant, defender: Combatant, rng: () => number): { dmg: number; mult: number; crit: boolean } {
  const mult = typeMultiplier(attacker.types, defender.types);
  const defStat = attacker.physical ? defender.defP : defender.defS;
  const variance = 0.85 + rng() * 0.15; // 0.85..1.0
  const crit = rng() < critChance(attacker.spd);
  const critM = crit ? CRIT_MULT : 1;
  const raw = attacker.atk * (65 / (65 + defStat)) * 1.7 * mult * variance * critM;
  const dmg = mult === 0 ? 0 : Math.max(1, Math.round(raw));
  return { dmg, mult, crit };
}

// Đánh theo LƯỢT TIẾP SỨC: lead player đấu boss, gục thì con kế vào (đầy máu).
// Trong mỗi vòng, con nhanh hơn (spd) đánh trước. Hết bầy -> thua; boss gục -> thắng.
export function simulateBattle(team: Combatant[], boss: Combatant, seed: number): BattleResult {
  const rng = lcg(seed);
  const events: BattleEvent[] = [];
  const order = team.map((c) => c.key);
  let bossHp = boss.maxHp;
  let idx = 0;
  let cur = team[idx];
  let curHp = cur ? cur.maxHp : 0;
  const GUARD = 500;

  if (!cur) return { win: false, events, boss, order };

  for (let step = 0; step < GUARD; step++) {
    if (bossHp <= 0 || idx >= team.length) break;

    // Thứ tự trong vòng: nhanh hơn trước (hoà -> player trước).
    const playerFirst = cur.spd >= boss.spd;
    const acts: ('player' | 'boss')[] = playerFirst ? ['player', 'boss'] : ['boss', 'player'];

    for (const who of acts) {
      if (bossHp <= 0 || idx >= team.length) break;
      if (who === 'player') {
        const { dmg, mult, crit } = damage(cur, boss, rng);
        bossHp = Math.max(0, bossHp - dmg);
        events.push({ attacker: 'player', attackerKey: cur.key, defenderKey: 'boss', dmg, mult, crit, playerHp: curHp, bossHp, faintedKey: null, incomingKey: null });
      } else {
        const { dmg, mult, crit } = damage(boss, cur, rng);
        curHp = Math.max(0, curHp - dmg);
        let faintedKey: string | null = null;
        let incomingKey: string | null = null;
        if (curHp <= 0) {
          faintedKey = cur.key;
          idx++;
          if (idx < team.length) {
            cur = team[idx];
            curHp = cur.maxHp;
            incomingKey = cur.key;
          }
        }
        events.push({ attacker: 'boss', attackerKey: boss.key, defenderKey: faintedKey ?? cur.key, dmg, mult, crit, playerHp: faintedKey ? 0 : curHp, bossHp, faintedKey, incomingKey });
      }
    }
  }

  return { win: bossHp <= 0, events, boss, order };
}

// ===== Sức mạnh bầy (Team Power) = tổng BST của DẠNG hiện tại mỗi con =====
export const TEAM_POWER_MILESTONES: { power: number; candy: number }[] = [
  { power: 2000, candy: 150 },
  { power: 5000, candy: 300 },
  { power: 10000, candy: 600 },
  { power: 20000, candy: 1200 },
];

// ===== Thưởng đấu boss =====
export const BATTLE_CANDY_FACTOR = 0.3; // kẹo thắng = round(bossBST * factor * bội_độ_khó)
export const BATTLE_EGG_EVERY = 3; // mỗi 3 trận thắng -> 1 trứng hiếm

export function battleCandy(bossBst: number, candyMul = 1): number {
  return Math.round(bossBst * BATTLE_CANDY_FACTOR * candyMul);
}
