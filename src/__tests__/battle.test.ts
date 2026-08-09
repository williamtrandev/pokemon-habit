import { describe, it, expect } from 'vitest';
import {
  typeMultiplier, effLabel, bstFromStats, toCombatant,
  simulateBattle, battleCandy, Combatant, BOSS_POOL, BOSS_TIERS,
  encounterForPeriod, activeBoss, nextBoss, BOSS_PERIOD_MS,
  phaseAt, phasesOf, lineupScale, lineupAtkScale, SCALE_BASE_POWER, SCALE_MAX, SCALE_ATK_SHARE,
  ENRAGE_ATK_MUL, ALL_TYPES,
  TEAM_POWER_MILESTONES, TEAM_POWER_STEP, teamMilestoneAt, teamMilestonesUpTo, nextTeamMilestone, teamRank,
  MoveRef, pickMove, signatureMove, rollDamage, movePowerFactor,
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

  it('boss ĐỔI HỆ theo pha -> một con không khắc được suốt trận', () => {
    const team = [mk('a', 200, 120, 90, ['water']), mk('b', 200, 120, 90, ['water']), mk('c', 200, 120, 90, ['water'])];
    const boss = mk('boss', 200, 40, 30, ['fire']);
    const r = simulateBattle(team, boss, 99, ['water', 'grass']);
    // Pha 1 hệ gốc (fire), pha 2 water, pha 3 grass -> hệ boss trong log phải đổi.
    const seen = new Set(r.events.map((e) => (e.bossTypes ?? []).join('/')));
    expect(seen.size).toBeGreaterThan(1);
    expect(seen.has('fire')).toBe(true);
  });

  it('đổi pha -> LUÂN PHIÊN sang con kế, thứ tự chọn = thứ tự gánh pha', () => {
    const team = [mk('a', 300, 90, 90, ['water']), mk('b', 300, 90, 90, ['water']), mk('c', 300, 90, 90, ['water'])];
    const boss = mk('boss', 260, 30, 20, ['fire']);
    const r = simulateBattle(team, boss, 5, ['water', 'water']);
    // Không con nào gục (boss quá yếu) nhưng vẫn phải có luân phiên do đổi pha.
    expect(r.events.some((e) => e.faintedKey)).toBe(false);
    expect(r.events.some((e) => e.incomingReason === 'phase')).toBe(true);
  });

  it('sự kiện luân phiên mang kèm MÁU THẬT của con vào sân (UI không vẽ đầy thanh)', () => {
    const team = [mk('a', 200, 90, 90, ['water']), mk('b', 200, 90, 90, ['water']), mk('c', 200, 90, 90, ['water'])];
    const boss = mk('boss', 240, 60, 40, ['fire']);
    const r = simulateBattle(team, boss, 33, ['water', 'water']);
    const swaps = r.events.filter((e) => e.incomingKey);
    expect(swaps.length).toBeGreaterThan(0);
    for (const e of swaps) {
      expect(e.incomingHp).toBeDefined();
      const max = team.find((c) => c.key === e.incomingKey)!.maxHp;
      expect(e.incomingHp!).toBeGreaterThan(0);
      expect(e.incomingHp!).toBeLessThanOrEqual(max);
    }
  });

  it('con rút về GIỮ máu đã mất, quay lại không được hồi', () => {
    const team = [mk('a', 60, 90, 90, ['water']), mk('b', 300, 90, 10, ['water'])];
    const boss = mk('boss', 300, 70, 50, ['fire']);
    const r = simulateBattle(team, boss, 11, ['water', 'water']);
    // Máu của mỗi con phải đơn điệu giảm theo thời gian — không có cú "hồi đầy" khi vào lại.
    const hpOf = new Map<string, number>();
    for (const e of r.events) {
      if (e.attacker !== 'boss') continue;
      const k = e.faintedKey ?? e.defenderKey;
      const prev = hpOf.get(k);
      if (prev != null) expect(e.playerHp).toBeLessThanOrEqual(prev);
      hpOf.set(k, e.playerHp);
    }
  });

  it('đánh quá chậm -> boss hồi máu (không rùa được)', () => {
    // Công thấp + thủ boss cao -> mỗi đòn gãi nhẹ, kéo dài quá STALL_ROUNDS.
    const team = [mk('a', 900, 12, 90, ['normal'])];
    const boss = mk('boss', 400, 8, 10, ['normal']);
    const r = simulateBattle(team, boss, 21, ['normal', 'normal']);
    expect(r.events.some((e) => (e.regen ?? 0) > 0)).toBe(true);
  });
});

describe('pha boss', () => {
  it('phaseAt theo mốc 2/3 và 1/3', () => {
    expect(phaseAt(1)).toBe(0);
    expect(phaseAt(0.7)).toBe(0);
    expect(phaseAt(2 / 3)).toBe(1);
    expect(phaseAt(0.4)).toBe(1);
    expect(phaseAt(1 / 3)).toBe(2);
    expect(phaseAt(0)).toBe(2);
  });

  it('phasesOf: 3 pha, pha 1 hệ gốc, chỉ pha cuối nổi giận', () => {
    const ps = phasesOf(['steel', 'psychic'], ['fire', 'dark']);
    expect(ps.length).toBe(3);
    expect(ps[0].types).toEqual(['steel', 'psychic']);
    expect(ps[1].types).toEqual(['fire']);
    expect(ps[2].types).toEqual(['dark']);
    expect(ps.map((p) => p.enraged)).toEqual([false, false, true]);
    expect(ENRAGE_ATK_MUL).toBeGreaterThan(1);
  });

  it('encounter mang 2 hệ hào quang hợp lệ và ổn định theo kỳ', () => {
    const a = encounterForPeriod(4242);
    const b = encounterForPeriod(4242);
    expect(a.auraTypes).toEqual(b.auraTypes);
    expect(ALL_TYPES).toContain(a.auraTypes[0]);
    expect(ALL_TYPES).toContain(a.auraTypes[1]);
  });
});

describe('lineupScale — boss theo kịp đội hình mang đi', () => {
  it('đội hình yếu -> không scale', () => {
    expect(lineupScale(0)).toBe(1);
    expect(lineupScale(SCALE_BASE_POWER)).toBe(1);
  });

  it('đội hình mạnh -> scale lên, có trần', () => {
    expect(lineupScale(SCALE_BASE_POWER * 1.5)).toBeCloseTo(1.5);
    expect(lineupScale(SCALE_BASE_POWER * 99)).toBe(SCALE_MAX);
  });

  it('bội CÔNG tăng chậm hơn bội MÁU (không one-shot cả đội)', () => {
    const hp = lineupScale(SCALE_BASE_POWER * 2);
    const atk = lineupAtkScale(SCALE_BASE_POWER * 2);
    expect(atk).toBeLessThan(hp);
    expect(atk).toBeCloseTo(1 + (SCALE_MAX - 1) * SCALE_ATK_SHARE);
    expect(lineupAtkScale(0)).toBe(1);
  });
});

describe('thang Sức mạnh bầy — không bao giờ hết mốc', () => {
  it('4 mốc đầu giữ đúng con số cũ (đã trao kẹo theo `power`, đổi là sai)', () => {
    expect(TEAM_POWER_MILESTONES.map((m) => m.power)).toEqual([2000, 5000, 10000, 20000]);
    expect(teamMilestoneAt(0)).toEqual({ power: 2000, candy: 150, index: 0 });
  });

  it('hết bảng thì sinh thêm mãi, kẹo mốc sau nhiều hơn mốc trước', () => {
    const first = teamMilestoneAt(TEAM_POWER_MILESTONES.length);
    const second = teamMilestoneAt(TEAM_POWER_MILESTONES.length + 1);
    expect(first.power).toBe(20000 + TEAM_POWER_STEP);
    expect(second.power).toBe(20000 + TEAM_POWER_STEP * 2);
    expect(second.candy).toBeGreaterThan(first.candy);
    // Rất mạnh vẫn còn mốc kế tiếp -> thẻ không còn dòng "đã đạt mốc cao nhất".
    expect(nextTeamMilestone(1_000_000).power).toBeGreaterThan(1_000_000);
  });

  it('mốc luôn TĂNG dần và nextTeamMilestone là mốc chưa đạt gần nhất', () => {
    for (let i = 1; i < 30; i++) {
      expect(teamMilestoneAt(i).power).toBeGreaterThan(teamMilestoneAt(i - 1).power);
    }
    const n = nextTeamMilestone(23_000);
    expect(n.power).toBe(30_000);
    expect(teamMilestonesUpTo(23_000).map((m) => m.power)).toEqual([2000, 5000, 10000, 20000]);
  });

  it('danh hiệu leo theo sức mạnh, hết hạng thì đếm SAO', () => {
    expect(teamRank(0).label).toBe('Tân binh');
    expect(teamRank(21_000).label).toBe('Quán quân');
    expect(teamRank(21_000).star).toBe(0);
    expect(teamRank(31_000).star).toBe(1); // vượt 1 mốc sinh thêm
    expect(teamRank(100_000).label).toBe('Truyền kỳ');
    expect(teamRank(100_000).star).toBeGreaterThan(1);
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

describe('chiêu thức (moves)', () => {
  const stats = [
    { name: 'hp', value: 80 }, { name: 'attack', value: 100 }, { name: 'defense', value: 60 },
    { name: 'special-attack', value: 90 }, { name: 'special-defense', value: 70 }, { name: 'speed', value: 50 },
  ];
  const rng1 = () => 0.5;
  const mkMon = (types: string[], moves?: MoveRef[]): Combatant => {
    const c = toCombatant('a', 1, 'a', types, stats);
    c.moves = moves;
    return c;
  };

  it('pickMove chọn chiêu PHỦ HỆ khắc ×2 thay vì chiêu cùng hệ ×1', () => {
    // Con hệ nước đánh boss cỏ: Ice Beam (×2, không STAB) phải thắng Surf (×0.5 dù STAB).
    const c = mkMon(['water'], [
      { name: 'Surf', type: 'water', power: 90 },
      { name: 'Ice Beam', type: 'ice', power: 90 },
      { name: 'Growl', type: 'normal', power: null },
    ]);
    const p = pickMove(c, ['grass']);
    expect(p!.move.name).toBe('Ice Beam');
    expect(p!.mult).toBe(2);
  });

  it('cùng hệ số khắc thì STAB thắng; toàn chiêu trạng thái -> null', () => {
    const c = mkMon(['water'], [
      { name: 'Surf', type: 'water', power: 90 },
      { name: 'Slam', type: 'normal', power: 90 },
    ]);
    expect(pickMove(c, ['fire'])!.move.name).toBe('Surf'); // cả hai ×2? không: water×2, normal×1 — vẫn Surf
    const statusOnly = mkMon(['water'], [{ name: 'Growl', type: 'normal', power: null }]);
    expect(pickMove(statusOnly, ['fire'])).toBeNull();
  });

  it('rollDamage có moves -> trả tên chiêu; không moves -> không có move, số cũ giữ nguyên', () => {
    const boss = toCombatant('boss', 2, 'boss', ['grass'], stats);
    const withMoves = rollDamage(mkMon(['water'], [{ name: 'Ice Beam', type: 'ice', power: 90 }]), boss, rng1);
    expect(withMoves.move).toBe('Ice Beam');
    const bare = rollDamage(mkMon(['water']), boss, rng1);
    expect(bare.move).toBeUndefined();
  });

  it('signatureMove = chiêu lực cao nhất', () => {
    const c = mkMon(['fire'], [
      { name: 'Ember', type: 'fire', power: 40 },
      { name: 'Flare Blitz', type: 'fire', power: 120 },
      { name: 'Growl', type: 'normal', power: null },
    ]);
    expect(signatureMove(c)!.name).toBe('Flare Blitz');
    expect(signatureMove(mkMon(['fire']))).toBeNull();
  });

  it('movePowerFactor kẹp 0.75..1.35, chiêu trạng thái = 1', () => {
    expect(movePowerFactor(null)).toBe(1);
    expect(movePowerFactor(70)).toBe(1);
    expect(movePowerFactor(20)).toBe(0.75);
    expect(movePowerFactor(250)).toBe(1.35);
  });
});
