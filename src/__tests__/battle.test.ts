import { describe, it, expect } from 'vitest';
import {
  typeMultiplier, effLabel, bstFromStats, toCombatant,
  simulateBattle, battleCandy, Combatant, BOSS_POOL, BOSS_TIERS,
  encounterForPeriod, activeBoss, nextBoss, BOSS_PERIOD_MS,
} from '../battle';

const stats = (hp: number, atk: number, spd: number) => [
  { name: 'hp', value: hp }, { name: 'attack', value: atk }, { name: 'defense', value: 60 },
  { name: 'special-attack', value: atk }, { name: 'special-defense', value: 60 }, { name: 'speed', value: spd },
];

describe('typeMultiplier — khắc hệ', () => {
  it('nước khắc lửa (x2)', () => expect(typeMultiplier(['water'], ['fire'])).toBe(2));
  it('lửa yếu trước nước (x0.5)', () => expect(typeMultiplier(['fire'], ['water'])).toBe(0.5));
  it('điện vô hiệu với đất (x0)', () => expect(typeMultiplier(['electric'], ['ground'])).toBe(0));
  it('nhân theo 2 hệ phòng thủ', () => expect(typeMultiplier(['rock'], ['fire', 'flying'])).toBe(4));
  it('kẻ 2 hệ chọn đòn tốt nhất', () => expect(typeMultiplier(['normal', 'water'], ['fire'])).toBe(2));
  it('thường vô hiệu với ma', () => expect(typeMultiplier(['normal'], ['ghost'])).toBe(0));
});

describe('effLabel', () => {
  it('nhãn theo hệ số', () => {
    expect(effLabel(2)).toContain('tuyệt vời');
    expect(effLabel(0.5)).toContain('Không hiệu quả');
    expect(effLabel(0)).toContain('Vô hiệu');
    expect(effLabel(1)).toBe('');
  });
});

describe('bstFromStats', () => {
  it('cộng tổng chỉ số', () => expect(bstFromStats(stats(100, 100, 100))).toBe(100 + 100 + 60 + 100 + 60 + 100));
});

describe('encounter boss — ngẫu nhiên, tất định theo kỳ', () => {
  it('cùng kỳ -> cùng lượt (loài/giờ/độ khó ổn định)', () => {
    expect(encounterForPeriod(1000)).toEqual(encounterForPeriod(1000));
  });
  it('lượt hợp lệ: nằm trong kỳ, loài trong bể, tier trong bảng', () => {
    const e = encounterForPeriod(1234);
    const start = 1234 * BOSS_PERIOD_MS;
    expect(e.spawnAt).toBeGreaterThanOrEqual(start);
    expect(e.expireAt).toBeLessThanOrEqual(start + BOSS_PERIOD_MS);
    expect(e.expireAt).toBeGreaterThan(e.spawnAt);
    expect(BOSS_POOL).toContainEqual(e.species);
    expect(BOSS_TIERS).toContainEqual(e.tier);
  });
  it('activeBoss đúng trong cửa sổ, null ngoài cửa sổ', () => {
    const e = encounterForPeriod(50);
    expect(activeBoss(e.spawnAt)?.id).toBe(e.id);
    expect(activeBoss(e.expireAt)).toBeNull(); // hết giờ -> biến mất
  });
  it('nextBoss trả lượt sắp tới', () => {
    const e = encounterForPeriod(50);
    const nb = nextBoss(e.spawnAt - 1000);
    expect(nb.spawnAt).toBeGreaterThan(e.spawnAt - 1000);
  });
});

describe('simulateBattle', () => {
  const mk = (key: string, hp: number, atk: number, spd: number, types: string[]): Combatant =>
    toCombatant(key, 1, key, types, stats(hp, atk, spd));

  it('cùng seed -> cùng kết quả (replay khớp)', () => {
    const team = [mk('a', 100, 120, 100, ['water'])];
    const boss = mk('boss', 100, 60, 50, ['fire']);
    const r1 = simulateBattle(team, boss, 12345);
    const r2 = simulateBattle(team, boss, 12345);
    expect(r1.win).toBe(r2.win);
    expect(r1.events.length).toBe(r2.events.length);
    expect(r1.events).toEqual(r2.events);
  });

  it('bầy mạnh + khắc hệ -> thắng', () => {
    const team = [mk('a', 120, 150, 120, ['water']), mk('b', 120, 150, 120, ['water'])];
    const boss = mk('boss', 90, 50, 40, ['fire']);
    expect(simulateBattle(team, boss, 7).win).toBe(true);
  });

  it('bầy yếu -> thua, đi hết lượt tiếp sức', () => {
    const team = [mk('a', 40, 30, 30, ['grass']), mk('b', 40, 30, 30, ['grass'])];
    const boss = mk('boss', 400, 200, 200, ['fire']);
    const r = simulateBattle(team, boss, 3);
    expect(r.win).toBe(false);
    // cả 2 con đều gục
    expect(r.events.filter((e) => e.faintedKey).length).toBe(2);
  });

  it('bầy rỗng -> thua ngay, không sự kiện', () => {
    const r = simulateBattle([], mk('boss', 100, 50, 50, ['fire']), 1);
    expect(r.win).toBe(false);
    expect(r.events.length).toBe(0);
  });
});

describe('thưởng', () => {
  it('battleCandy = round(bst*0.3*mul)', () => {
    expect(battleCandy(600)).toBe(180);
    expect(battleCandy(600, 2)).toBe(360); // độ khó cao -> kẹo nhiều hơn
  });
  it('tier khó hơn -> máu/công/kẹo bội cao hơn', () => {
    const easy = BOSS_TIERS.find((t) => t.key === 'easy')!;
    const elite = BOSS_TIERS.find((t) => t.key === 'elite')!;
    expect(elite.hpMul).toBeGreaterThan(easy.hpMul);
    expect(elite.atkMul).toBeGreaterThan(easy.atkMul);
    expect(elite.candyMul).toBeGreaterThan(easy.candyMul);
  });
});
