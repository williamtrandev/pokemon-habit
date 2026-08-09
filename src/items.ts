// ===== Trang bị (held item) — LÕI THUẦN, không phụ thuộc UI =====
// Rơi ra khi thắng boss (tỉ lệ theo độ khó), đeo cho TỪNG con trong bầy để buff
// chỉ số khi đấu đạo trường. Buff áp lên Combatant SAU toCombatant nên KHÔNG
// tính vào BST/Sức mạnh đội hình -> boss không scale theo, trang bị là lợi thế ròng.
//
// Có BẬC HIẾM: món xịn chỉ rơi từ boss khó (xem RARITY_W), nên không phải con nào
// cũng khoác đồ đẹp — chọn ai đeo món nào là một quyết định.

import { Combatant, BossEncounter, hashStr, lcg } from './battle';

export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary';

export const RARITY: Record<ItemRarity, { label: string; color: string }> = {
  common: { label: 'Thường', color: '#94A3B8' },
  rare: { label: 'Hiếm', color: '#3B82F6' },
  epic: { label: 'Sử thi', color: '#A855F7' },
  legendary: { label: 'Huyền thoại', color: '#FBBF24' },
};

export interface HeldItem {
  key: string;
  name: string;
  emoji: string;
  desc: string;
  rarity: ItemRarity;
  weight: number;  // trọng số TRONG bậc hiếm của nó
  hpMul?: number;  // bội máu tối đa
  atkMul?: number; // bội công
  defMul?: number; // bội cả Thủ lẫn Đ.Thủ
  spdMul?: number; // bội tốc độ (lượt đánh trước + tỉ lệ chí mạng)
}

// Số nhỏ có chủ đích: sát thương đã có khắc hệ ×2, buff to hơn sẽ lấn át chiến thuật
// chọn hệ. Bậc cao = mạnh hơn + (từ Sử thi) buff HAI chỉ số.
export const ITEMS: HeldItem[] = [
  // ── Thường: một chỉ số, nhẹ ──
  { key: 'band',  name: 'Băng Lực',       emoji: '💪', desc: 'Công +8%',            rarity: 'common', weight: 1, atkMul: 1.08 },
  { key: 'shell', name: 'Mai Sắt',        emoji: '🛡️', desc: 'Thủ & Đ.Thủ +10%',    rarity: 'common', weight: 1, defMul: 1.1 },
  { key: 'boots', name: 'Giày Gió',       emoji: '👟', desc: 'Tốc độ +12%',         rarity: 'common', weight: 1, spdMul: 1.12 },
  { key: 'heart', name: 'Ngọc Sinh Mệnh', emoji: '❤️', desc: 'HP +10%',             rarity: 'common', weight: 1, hpMul: 1.1 },
  // ── Hiếm: một chỉ số, đậm tay ──
  { key: 'blade', name: 'Kiếm Ánh Sao',   emoji: '🗡️', desc: 'Công +15%',           rarity: 'rare', weight: 1, atkMul: 1.15 },
  { key: 'aegis', name: 'Khiên Thánh',    emoji: '🔰', desc: 'Thủ & Đ.Thủ +18%',    rarity: 'rare', weight: 1, defMul: 1.18 },
  { key: 'wing',  name: 'Cánh Phong Thần', emoji: '🪽', desc: 'Tốc độ +22%',        rarity: 'rare', weight: 1, spdMul: 1.22 },
  { key: 'fruit', name: 'Đào Tiên',       emoji: '🍑', desc: 'HP +18%',             rarity: 'rare', weight: 1, hpMul: 1.18 },
  // ── Sử thi: HAI chỉ số ──
  { key: 'fang',  name: 'Nanh Rồng',      emoji: '🐉', desc: 'Công +15% · Tốc +10%', rarity: 'epic', weight: 1, atkMul: 1.15, spdMul: 1.1 },
  { key: 'armor', name: 'Giáp Titan',     emoji: '🦾', desc: 'HP +12% · Thủ +12%',   rarity: 'epic', weight: 1, hpMul: 1.12, defMul: 1.12 },
  // ── Huyền thoại: đổi cả cục diện ──
  { key: 'crown', name: 'Vương Miện Boss', emoji: '👑', desc: 'MỌI chỉ số +12%',     rarity: 'legendary', weight: 1, hpMul: 1.12, atkMul: 1.12, defMul: 1.12, spdMul: 1.12 },
  { key: 'orb',   name: 'Ngọc Hỗn Nguyên', emoji: '🔮', desc: 'Công +20% · HP +10%', rarity: 'legendary', weight: 1, atkMul: 1.2, hpMul: 1.1 },
];

// Trọng số BẬC HIẾM theo độ khó boss: đồ Huyền thoại gần như chỉ ra từ boss Cực khó
// trở lên. Đây là chỗ tạo khan hiếm — muốn cả bầy khoác đồ xịn thì phải cày boss khó dài hạn.
const RARITY_W: Record<string, Record<ItemRarity, number>> = {
  easy:      { common: 85, rare: 14, epic: 1,  legendary: 0 },
  normal:    { common: 65, rare: 28, epic: 6,  legendary: 1 },
  hard:      { common: 45, rare: 38, epic: 14, legendary: 3 },
  elite:     { common: 30, rare: 40, epic: 22, legendary: 8 },
  legendary: { common: 15, rare: 35, epic: 32, legendary: 18 },
};
const RARITY_W_FALLBACK = RARITY_W.normal;

export function itemByKey(key?: string | null): HeldItem | null {
  if (!key) return null;
  return ITEMS.find((i) => i.key === key) ?? null;
}

// Đeo trang bị vào chiến binh. Không có / key lạ (dữ liệu cũ, cloud lệch phiên bản) -> giữ nguyên.
export function applyHeld(c: Combatant, itemKey?: string | null): Combatant {
  const it = itemByKey(itemKey);
  if (!it) return c;
  return {
    ...c,
    maxHp: Math.round(c.maxHp * (it.hpMul ?? 1)),
    atk: Math.round(c.atk * (it.atkMul ?? 1)),
    defP: Math.round(c.defP * (it.defMul ?? 1)),
    defS: Math.round(c.defS * (it.defMul ?? 1)),
    spd: Math.round(c.spd * (it.spdMul ?? 1)),
  };
}

// Chọn theo trọng số từ một bảng [giá trị, trọng số].
function weighted<T>(pairs: [T, number][], r: number): T {
  const total = pairs.reduce((s, [, w]) => s + w, 0);
  let x = r * total;
  for (const [v, w] of pairs) { if (x < w) return v; x -= w; }
  return pairs[0][0];
}

// Món rơi của MỘT lượt boss — tất định theo id lượt, nên app và web cho cùng kết quả
// và không cần lưu thêm gì: thắng lượt nào thì món của lượt đó (bossBeaten đã chặn nhận lặp).
// null = lượt này không rơi gì (tỉ lệ itemChance theo độ khó, xem BOSS_TIERS).
// Rơi thì: quay BẬC HIẾM theo độ khó -> quay MÓN trong bậc đó.
export function itemDropFor(enc: BossEncounter): HeldItem | null {
  const rng = lcg(hashStr('drop:' + enc.id));
  if (rng() >= (enc.tier.itemChance ?? 0)) return null;

  const w = RARITY_W[enc.tier.key] ?? RARITY_W_FALLBACK;
  const rarity = weighted(
    (Object.keys(w) as ItemRarity[]).map((k) => [k, w[k]] as [ItemRarity, number]),
    rng()
  );
  const pool = ITEMS.filter((i) => i.rarity === rarity);
  return weighted(pool.map((i) => [i, i.weight] as [HeldItem, number]), rng());
}
