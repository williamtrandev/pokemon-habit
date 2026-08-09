import { describe, it, expect } from 'vitest';
import { ITEMS, RARITY, ItemRarity, itemByKey, applyHeld, itemDropFor } from '../items';
import { toCombatant, shinyStats, bstFromStats, SHINY_STAT_MUL, encounterForPeriod, BOSS_TIERS, BossEncounter } from '../battle';

const stats = [
  { name: 'hp', value: 80 }, { name: 'attack', value: 100 }, { name: 'defense', value: 60 },
  { name: 'special-attack', value: 90 }, { name: 'special-defense', value: 70 }, { name: 'speed', value: 50 },
];
const mk = () => toCombatant('a', 1, 'a', ['water'], stats);
const tier = (key: string) => BOSS_TIERS.find((t) => t.key === key)!;
const encAt = (p: number, tierKey: string): BossEncounter => ({ ...encounterForPeriod(p), tier: tier(tierKey) });

describe('shinyStats', () => {
  it('không shiny -> trả ĐÚNG mảng cũ, không copy thừa', () => {
    expect(shinyStats(stats, false)).toBe(stats);
  });

  it('shiny -> mọi chỉ số ×SHINY_STAT_MUL (làm tròn), BST tăng theo', () => {
    const s = shinyStats(stats, true);
    for (let i = 0; i < stats.length; i++) {
      expect(s[i].value).toBe(Math.round(stats[i].value * SHINY_STAT_MUL));
    }
    expect(bstFromStats(s)).toBeGreaterThan(bstFromStats(stats));
  });
});

describe('bảng ITEMS', () => {
  it('key duy nhất, bậc hiếm hợp lệ, mỗi bậc có ít nhất một món', () => {
    expect(new Set(ITEMS.map((i) => i.key)).size).toBe(ITEMS.length);
    const rarities = Object.keys(RARITY) as ItemRarity[];
    for (const it of ITEMS) expect(rarities).toContain(it.rarity);
    for (const r of rarities) expect(ITEMS.some((i) => i.rarity === r)).toBe(true);
  });

  it('mỗi món buff ÍT NHẤT một chỉ số, bội trong khoảng lành mạnh (1 < x <= 1.3)', () => {
    for (const it of ITEMS) {
      const muls = [it.hpMul, it.atkMul, it.defMul, it.spdMul].filter((m): m is number => m != null);
      expect(muls.length).toBeGreaterThan(0);
      for (const m of muls) {
        expect(m).toBeGreaterThan(1);
        expect(m).toBeLessThanOrEqual(1.3);
      }
    }
  });

  it('itemByKey tra được mọi item; key lạ -> null', () => {
    for (const it of ITEMS) expect(itemByKey(it.key)).toBe(it);
    expect(itemByKey(undefined)).toBeNull();
    expect(itemByKey('khong-ton-tai')).toBeNull();
  });
});

describe('applyHeld', () => {
  it('không item / key lạ -> giữ nguyên combatant', () => {
    const c = mk();
    expect(applyHeld(c, undefined)).toBe(c);
    expect(applyHeld(c, null)).toBe(c);
    expect(applyHeld(c, 'khong-ton-tai')).toBe(c);
  });

  it('mọi món: buff đúng các chỉ số khai báo, KHÔNG đụng chỉ số khác', () => {
    const c = mk();
    for (const it of ITEMS) {
      const b = applyHeld(c, it.key);
      expect(b.maxHp).toBe(Math.round(c.maxHp * (it.hpMul ?? 1)));
      expect(b.atk).toBe(Math.round(c.atk * (it.atkMul ?? 1)));
      expect(b.defP).toBe(Math.round(c.defP * (it.defMul ?? 1)));
      expect(b.defS).toBe(Math.round(c.defS * (it.defMul ?? 1)));
      expect(b.spd).toBe(Math.round(c.spd * (it.spdMul ?? 1)));
    }
  });
});

describe('itemDropFor', () => {
  it('tất định: cùng encounter -> cùng kết quả', () => {
    const enc = encounterForPeriod(123);
    expect(itemDropFor(enc)?.key).toBe(itemDropFor(enc)?.key);
  });

  it('boss Huyền thoại (itemChance = 1) LUÔN rơi; kết quả thuộc bảng ITEMS', () => {
    for (let p = 0; p < 50; p++) {
      const drop = itemDropFor(encAt(p, 'legendary'));
      expect(drop).not.toBeNull();
      expect(ITEMS.map((i) => i.key)).toContain(drop!.key);
    }
  });

  it('boss Dễ KHÔNG BAO GIỜ rơi đồ Huyền thoại (trọng số 0)', () => {
    for (let p = 0; p < 600; p++) {
      const drop = itemDropFor(encAt(p, 'easy'));
      if (drop) expect(drop.rarity).not.toBe('legendary');
    }
  });

  it('bậc hiếm lệch theo độ khó: boss Dễ chủ yếu đồ Thường, boss Huyền thoại phần lớn đồ Hiếm trở lên', () => {
    const share = (tierKey: string, pick: (r: ItemRarity) => boolean) => {
      let hit = 0, total = 0;
      for (let p = 0; p < 600; p++) {
        const d = itemDropFor(encAt(p, tierKey));
        if (!d) continue;
        total++;
        if (pick(d.rarity)) hit++;
      }
      return hit / total;
    };
    expect(share('easy', (r) => r === 'common')).toBeGreaterThan(0.7);       // ~85%
    expect(share('legendary', (r) => r !== 'common')).toBeGreaterThan(0.7);  // ~85%
    expect(share('legendary', (r) => r === 'legendary')).toBeGreaterThan(0.08); // ~18%
  });

  it('tỉ lệ rơi xấp xỉ itemChance của bậc (đo trên nhiều kỳ)', () => {
    const easy = tier('easy');
    let drops = 0;
    const N = 400;
    for (let p = 0; p < N; p++) if (itemDropFor(encAt(p, 'easy'))) drops++;
    const rate = drops / N;
    expect(rate).toBeGreaterThan(easy.itemChance! - 0.1);
    expect(rate).toBeLessThan(easy.itemChance! + 0.1);
  });

  it('mọi bậc boss đều khai báo itemChance', () => {
    for (const t of BOSS_TIERS) {
      expect(t.itemChance).toBeGreaterThan(0);
      expect(t.itemChance).toBeLessThanOrEqual(1);
    }
  });
});
