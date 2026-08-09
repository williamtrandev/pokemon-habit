import { describe, it, expect } from 'vitest';
import { toCombatant, Combatant, typeMultiplier, phasesOf } from '../battle';
import {
  startLive, stepLive, canAct, autoAction, bossAtPhase,
  LiveState, LiveAction, CHARGE_MUL, BERRY_COUNT, BERRY_HEAL, STAGGER_MAX,
  STAGGER_PARRY, LIVE_STALL_ROUNDS, matchupOf,
  SPECIAL_ENERGY, SPECIAL_MUL, STAGGER_SPECIAL,
} from '../battleLive';

const stats = (hp: number, atk: number, def = 60, spd = 60) => [
  { name: 'hp', value: hp }, { name: 'attack', value: atk }, { name: 'defense', value: def },
  { name: 'special-attack', value: atk }, { name: 'special-defense', value: def }, { name: 'speed', value: spd },
];
const mk = (key: string, hp: number, atk: number, types: string[], def = 60, spd = 60): Combatant =>
  toCombatant(key, 1, key, types, stats(hp, atk, def, spd));

// Đưa state tới đúng ý đồ boss cần thử: chạy tay các lượt "vô hại" cho tới khi khớp.
function until(s: LiveState, intent: LiveState['intent'], act: (st: LiveState) => LiveAction = () => ({ kind: 'attack' })): LiveState {
  for (let i = 0; i < 200 && !s.over; i++) {
    if (s.intent === intent) return s;
    s = stepLive(s, act(s));
  }
  return s;
}

const auras: [string, string] = ['grass', 'flying'];

describe('startLive', () => {
  it('máu đầy, boss đầy, pha 1, có berry, có ý đồ báo trước', () => {
    const s = startLive([mk('a', 80, 100, ['water'])], mk('boss', 200, 80, ['fire']), 7, auras);
    expect(s.hp).toEqual([s.team[0].maxHp]);
    expect(s.bossHp).toBe(s.boss.maxHp);
    expect(s.phase).toBe(0);
    expect(s.berries).toBe(BERRY_COUNT);
    expect(s.over).toBeNull();
    expect(['strike', 'heavy', 'guard', 'drain']).toContain(s.intent);
  });

  it('đội rỗng -> thua ngay', () => {
    expect(startLive([], mk('boss', 200, 80, ['fire']), 1, auras).over).toBe('lose');
  });

  it('pha 1 dùng hệ gốc, pha 2-3 dùng hào quang', () => {
    const s = startLive([mk('a', 80, 100, ['water'])], mk('boss', 200, 80, ['fire']), 7, auras);
    expect(bossAtPhase(s.boss, s.phases, 0).types).toEqual(['fire']);
    expect(bossAtPhase(s.boss, s.phases, 1).types).toEqual(['grass']);
    expect(bossAtPhase(s.boss, s.phases, 2).types).toEqual(['flying']);
  });
});

describe('tất định', () => {
  it('cùng seed + cùng chuỗi lệnh -> cùng kết quả', () => {
    const run = () => {
      let s = startLive(
        [mk('a', 80, 100, ['water']), mk('b', 80, 100, ['ice'])],
        mk('boss', 120, 90, ['fire']), 4242, auras
      );
      const seen: number[] = [];
      for (let i = 0; i < 40 && !s.over; i++) {
        s = stepLive(s, autoAction(s));
        seen.push(s.bossHp);
      }
      return { over: s.over, seen };
    };
    expect(run()).toEqual(run());
  });
});

describe('hành động của người chơi', () => {
  it('đánh -> boss mất máu, tích Áp Chế khi khắc hệ', () => {
    let s = startLive([mk('a', 80, 120, ['water'])], mk('boss', 300, 40, ['fire']), 11, auras);
    const before = s.bossHp;
    s = stepLive(s, { kind: 'attack' });
    expect(s.bossHp).toBeLessThan(before);
    expect(s.stagger).toBeGreaterThan(0); // water vs fire = x2
  });

  it('đòn VÔ HIỆU không tích Áp Chế và không trừ máu boss', () => {
    // electric vs ground = x0
    let s = startLive([mk('a', 80, 120, ['electric'])], mk('boss', 300, 10, ['ground']), 5, auras);
    const before = s.bossHp;
    s = stepLive(s, { kind: 'attack' });
    expect(s.bossHp).toBe(before);
    expect(s.stagger).toBe(0);
  });

  it('dồn lực -> đòn kế tiếp mạnh hơn hẳn, và chỉ dồn được một lần', () => {
    const team = [mk('a', 200, 120, ['water'])];
    const boss = mk('boss', 800, 1, ['fire'], 60, 1); // boss gần như không gây sát thương -> so sánh sạch
    // Đánh thẳng
    let plain = startLive(team, boss, 99, auras);
    plain = stepLive(plain, { kind: 'attack' });
    const plainDmg = plain.boss.maxHp - plain.bossHp;
    // Dồn lực rồi đánh
    let charged = startLive(team, boss, 99, auras);
    charged = stepLive(charged, { kind: 'charge' });
    expect(charged.charge).toBe(true);
    expect(canAct(charged, { kind: 'charge' })).toBe(false); // dồn thêm là vô nghĩa
    const mid = charged.bossHp;
    charged = stepLive(charged, { kind: 'attack' });
    const chargedDmg = mid - charged.bossHp;
    expect(chargedDmg).toBeGreaterThan(plainDmg * (CHARGE_MUL - 0.5));
    expect(charged.charge).toBe(false); // bung ra là hết
  });

  it('berry hồi máu, hết berry thì không bấm được', () => {
    let s = startLive([mk('a', 200, 20, ['water'])], mk('boss', 400, 120, ['fire'], 60, 200), 3, auras);
    s = stepLive(s, { kind: 'attack' }); // ăn một đòn cho mất máu
    const hurt = s.hp[0];
    expect(hurt).toBeLessThan(s.team[0].maxHp);
    s = stepLive(s, { kind: 'berry' });
    expect(s.hp[0]).toBeGreaterThan(hurt);
    expect(s.hp[0] - hurt).toBeLessThanOrEqual(Math.round(s.team[0].maxHp * BERRY_HEAL));
    expect(s.berries).toBe(BERRY_COUNT - 1);
    // Máu đầy -> berry vô nghĩa, khoá nút.
    const full = startLive([mk('a', 200, 20, ['water'])], mk('boss', 400, 10, ['fire']), 3, auras);
    expect(canAct(full, { kind: 'berry' })).toBe(false);
  });

  it('đổi con: không đổi sang chính nó, không đổi sang con đã gục', () => {
    const s = startLive([mk('a', 80, 100, ['water']), mk('b', 80, 100, ['ice'])], mk('boss', 300, 50, ['fire']), 8, auras);
    expect(canAct(s, { kind: 'swap', index: 0 })).toBe(false);
    expect(canAct(s, { kind: 'swap', index: 1 })).toBe(true);
    const dead: LiveState = { ...s, hp: [s.hp[0], 0] };
    expect(canAct(dead, { kind: 'swap', index: 1 })).toBe(false);
  });

  it('con rút về GIỮ máu đã mất, không hồi khi vào lại', () => {
    let s = startLive(
      [mk('a', 80, 60, ['water']), mk('b', 200, 60, ['ice'])],
      mk('boss', 400, 100, ['fire'], 60, 200), 17, auras
    );
    s = stepLive(s, { kind: 'attack' });
    const hurtA = s.hp[0];
    expect(hurtA).toBeLessThan(s.team[0].maxHp);
    s = stepLive(s, { kind: 'swap', index: 1 });
    s = stepLive(s, { kind: 'swap', index: 0 });
    expect(s.hp[0]).toBeLessThanOrEqual(hurtA);
  });
});

describe('đọc ý đồ boss', () => {
  it('ĐỠ ĐÒN giảm hẳn sát thương phải nhận', () => {
    const team = [mk('a', 200, 30, ['water'])];
    const boss = mk('boss', 900, 130, ['fire'], 60, 200);
    let a = until(startLive(team, boss, 61, auras), 'heavy');
    if (a.over) throw new Error('không tới được lượt ĐÒN NẶNG');
    // Thanh Áp Chế phải về 0: gần đầy thì cú ĐÁNH lại làm boss choáng (khỏi ăn đòn),
    // và phép so "đỡ vs đánh" hoá ra so hai thứ khác nhau.
    a = { ...a, stagger: 0 };
    const b: LiveState = { ...a }; // cùng state, cùng rng -> so sánh sạch
    const hpBefore = a.hp[0];
    a = stepLive(a, { kind: 'block' });
    const bAfter = stepLive(b, { kind: 'attack' });
    expect(hpBefore - a.hp[0]).toBeLessThan(hpBefore - bAfter.hp[0]);
  });

  it('ĐỠ TRÚNG đòn nặng -> phản đòn tích Áp Chế; đỡ lượt thường thì không', () => {
    const team = [mk('a', 300, 30, ['water'])];
    const boss = mk('boss', 900, 60, ['fire'], 60, 200);
    const heavy = until(startLive(team, boss, 61, auras), 'heavy');
    if (heavy.over) throw new Error('không tới được lượt ĐÒN NẶNG');
    expect(stepLive(heavy, { kind: 'block' }).stagger).toBe(heavy.stagger + STAGGER_PARRY);

    const strike = until(startLive(team, boss, 61, auras), 'strike');
    if (!strike.over) expect(stepLive(strike, { kind: 'block' }).stagger).toBe(strike.stagger);
  });

  it('ĐÒN NẶNG phá vỡ Dồn lực, nhưng đỡ được thì giữ', () => {
    const team = [mk('a', 400, 30, ['water'])];
    const boss = mk('boss', 900, 60, ['fire'], 60, 200);
    // Tới lượt boss báo ĐÒN NẶNG rồi mới dồn lực -> phải tới trước đó một lượt.
    let s = startLive(team, boss, 61, auras);
    for (let i = 0; i < 200 && !s.over; i++) {
      if (s.intent === 'heavy' && !s.charge) break;
      s = stepLive(s, { kind: 'attack' });
    }
    if (s.over) throw new Error('không tới được lượt ĐÒN NẶNG');
    const charged: LiveState = { ...s, charge: true };
    expect(stepLive(charged, { kind: 'attack' }).charge).toBe(false); // đã bung
    expect(stepLive(charged, { kind: 'block' }).charge).toBe(true);   // đỡ -> giữ
    expect(stepLive(charged, { kind: 'berry' }).charge).toBe(false);  // ăn đòn -> vỡ
  });

  it('boss PHÒNG THỦ thì không ra đòn', () => {
    const team = [mk('a', 300, 30, ['water'])];
    const boss = mk('boss', 900, 120, ['fire'], 60, 200);
    const s = until(startLive(team, boss, 23, auras), 'guard');
    if (s.over) throw new Error('không tới được lượt PHÒNG THỦ');
    expect(stepLive(s, { kind: 'charge' }).hp[0]).toBe(s.hp[0]);
  });

  it('boss HÚT MÁU thì hồi lại một phần sát thương gây ra', () => {
    const team = [mk('a', 300, 30, ['water'])];
    const boss = mk('boss', 900, 120, ['fire'], 60, 200);
    let s = until(startLive(team, boss, 77, auras), 'drain');
    if (s.over) throw new Error('không tới được lượt HÚT MÁU');
    s = { ...s, bossHp: Math.round(s.boss.maxHp * 0.9) }; // chừa chỗ để hồi
    const next = stepLive(s, { kind: 'attack' });
    expect(next.log.some((e) => e.kind === 'drain')).toBe(true);
  });
});

describe('Áp Chế và pha', () => {
  it('đầy thanh -> boss CHOÁNG, mất lượt, thanh về 0', () => {
    const s = startLive([mk('a', 200, 100, ['water'])], mk('boss', 900, 120, ['fire'], 60, 200), 31, auras);
    const primed: LiveState = { ...s, stagger: STAGGER_MAX - 1, intent: 'strike' };
    const hpBefore = primed.hp[0];
    const next = stepLive(primed, { kind: 'attack' }); // water vs fire x2 -> đầy thanh
    expect(next.log.some((e) => e.kind === 'break')).toBe(true);
    expect(next.stagger).toBe(0);
    expect(next.hp[0]).toBe(hpBefore); // boss không kịp đánh
  });

  it('con gục -> XOÁ thanh Áp Chế (gục không phải cách đổi con miễn phí)', () => {
    const s = startLive(
      [mk('a', 40, 100, ['water']), mk('b', 200, 100, ['ice'])],
      mk('boss', 900, 200, ['fire'], 60, 200), 43, auras
    );
    const primed: LiveState = { ...s, stagger: STAGGER_MAX - 1, hp: [1, s.hp[1]], intent: 'strike' };
    const next = stepLive(primed, { kind: 'charge' }); // không đánh -> không tích thêm
    expect(next.log.some((e) => e.kind === 'faint')).toBe(true);
    expect(next.stagger).toBe(0);
    expect(next.active).toBe(1);
  });

  it('máu boss xuống mốc -> đổi pha, đổi hệ', () => {
    const s = startLive([mk('a', 200, 100, ['water'])], mk('boss', 300, 10, ['fire']), 51, auras);
    const low: LiveState = { ...s, bossHp: Math.round(s.boss.maxHp * 0.7) };
    const next = stepLive(low, { kind: 'attack' });
    expect(next.phase).toBe(1);
    expect(next.log.some((e) => e.kind === 'phase')).toBe(true);
    expect(bossAtPhase(next.boss, next.phases, next.phase).types).toEqual(['grass']);
  });

  it('rùa quá lâu trong một pha -> boss hồi máu', () => {
    const s = startLive([mk('a', 900, 100, ['water'])], mk('boss', 400, 1, ['fire'], 200, 1), 67, auras);
    const stalled: LiveState = { ...s, roundsInPhase: LIVE_STALL_ROUNDS, bossHp: Math.round(s.boss.maxHp * 0.95) };
    const next = stepLive(stalled, { kind: 'block' }); // không gây sát thương -> không đổi pha
    expect(next.log.some((e) => e.kind === 'regen')).toBe(true);
  });
});

describe('kết trận', () => {
  it('hạ hết máu boss -> thắng, và state đóng lại', () => {
    const s = startLive([mk('a', 200, 200, ['water'])], mk('boss', 1, 1, ['fire']), 13, auras);
    const almost: LiveState = { ...s, bossHp: 1 };
    const won = stepLive(almost, { kind: 'attack' });
    expect(won.over).toBe('win');
    expect(stepLive(won, { kind: 'attack' })).toBe(won); // hết trận thì không đánh nữa
  });

  it('gục hết -> thua', () => {
    const s = startLive([mk('a', 40, 10, ['grass'])], mk('boss', 900, 250, ['fire'], 60, 250), 19, auras);
    let cur = s;
    for (let i = 0; i < 60 && !cur.over; i++) cur = stepLive(cur, { kind: 'attack' });
    expect(cur.over).toBe('lose');
  });
});

describe('matchupOf — khớp hệ hai chiều', () => {
  const phases = phasesOf(['steel', 'psychic'], ['water', 'fire']);

  it('đếm đúng pha ta KHẮC và pha ta ĂN NẶNG', () => {
    // Đá/Bóng tối: gây x2 vào thép(pha1) và lửa(pha3); nhận x2 từ thép(pha1) và nước(pha2).
    const m = matchupOf(['rock', 'dark'], phases);
    expect(m.mults).toEqual([2, 1, 2]);
    expect(m.taken).toEqual([2, 2, 0.5]);
    expect(m.cover).toBe(2);
    expect(m.risk).toBe(2);
    expect(m.score).toBe(0);
  });

  it('con đánh mạnh mà chịu đòn tốt phải hơn điểm con đánh mạnh mà mềm', () => {
    const glass = matchupOf(['rock', 'dark'], phases);      // khắc 2, ăn nặng 2
    const solid = matchupOf(['ground', 'fire'], phases);    // khắc 2 (thép, ...), ăn nhẹ hơn
    expect(solid.score).toBeGreaterThan(glass.score);
  });

  it('đếm pha bị VÔ HIỆU', () => {
    // Thường vô hiệu với Ma -> đưa Ma vào một pha để kiểm.
    const m = matchupOf(['normal'], phasesOf(['ghost'], ['water', 'fire']));
    expect(m.mults[0]).toBe(0);
    expect(m.immune).toBe(1);
  });
});

describe('autoAction', () => {
  it('boss phòng thủ -> dồn lực; boss báo đòn nặng -> đỡ', () => {
    const team = [mk('a', 300, 60, ['water'])];
    const boss = mk('boss', 900, 100, ['fire'], 60, 200);
    // Xả nộ về 0 trước khi so: `until` đánh mỗi lượt nên nộ thường ĐẦY khi tới nơi,
    // và autoAction (đúng luật) sẽ ưu tiên bung tuyệt chiêu thay vì dồn lực.
    const drain = (s: LiveState) => ({ ...s, energy: s.energy.map(() => 0) });
    const g = until(startLive(team, boss, 23, auras), 'guard');
    if (!g.over) expect(autoAction({ ...drain(g), charge: false }).kind).toBe('charge');
    const h = until(startLive(team, boss, 61, auras), 'heavy');
    if (!h.over) expect(autoAction({ ...drain(h), charge: false }).kind).toBe('block');
    // Đang dồn lực mà đòn nặng tới -> bung ra ngay thay vì để bị phá.
    if (!h.over) expect(autoAction({ ...drain(h), charge: true }).kind).toBe('attack');
  });

  it('đổi sang con khắc hệ khi đòn đang VÔ HIỆU', () => {
    const s = startLive(
      [mk('a', 200, 100, ['electric']), mk('b', 200, 100, ['water'])],
      mk('boss', 400, 50, ['ground']), 29, auras
    );
    expect(typeMultiplier(s.team[0].types, s.boss.types)).toBe(0);
    const a = autoAction({ ...s, intent: 'strike' });
    expect(a).toEqual({ kind: 'swap', index: 1 });
  });

  it('luôn trả về nước đi HỢP LỆ', () => {
    let s = startLive(
      [mk('a', 80, 100, ['water']), mk('b', 80, 100, ['ice']), mk('c', 80, 100, ['rock'])],
      mk('boss', 500, 90, ['fire']), 5150, auras
    );
    for (let i = 0; i < 120 && !s.over; i++) {
      const a = autoAction(s);
      expect(canAct(s, a)).toBe(true);
      s = stepLive(s, a);
    }
    expect(s.over).not.toBeNull();
  });
});

describe('tuyệt chiêu (special)', () => {
  const team = [mk('a', 200, 100, ['water'])];
  const boss = () => mk('boss', 800, 60, ['fire']);

  it('bắt đầu 0 nộ, chưa bung được', () => {
    const s = startLive(team, boss(), 11, auras);
    expect(s.energy).toEqual([0]);
    expect(canAct(s, { kind: 'special' })).toBe(false);
  });

  it('ra đòn tích nộ; trúng đòn boss cũng tích; trần là SPECIAL_ENERGY', () => {
    // Boss trâu để trận KHÔNG kết thúc trước khi nộ đầy (over thì canAct luôn false).
    let s = startLive([mk('a', 400, 40, ['water'])], mk('boss', 5000, 30, ['fire']), 11, auras);
    for (let i = 0; i < 30 && !s.over && s.energy[0] < SPECIAL_ENERGY; i++) s = stepLive(s, { kind: 'attack' });
    expect(s.over).toBeNull();
    expect(s.energy[0]).toBe(SPECIAL_ENERGY);
    expect(canAct(s, { kind: 'special' })).toBe(true);
    // Đánh thêm một lượt nữa: nộ không vượt trần.
    const more = stepLive(s, { kind: 'attack' });
    expect(more.energy[0]).toBeLessThanOrEqual(SPECIAL_ENERGY);
  });

  it('bung: reset nộ về 0 và cộng thẳng STAGGER_SPECIAL Áp Chế', () => {
    let s = startLive(team, boss(), 11, auras);
    for (let i = 0; i < 30 && !s.over && s.energy[0] < SPECIAL_ENERGY; i++) s = stepLive(s, { kind: 'attack' });
    const st0 = { ...s, stagger: 0 };
    const next = stepLive(st0, { kind: 'special' });
    expect(next.energy[0]).toBe(0);
    expect(next.stagger).toBeGreaterThanOrEqual(STAGGER_SPECIAL);
    const hit = next.log.find((e) => e.kind === 'special');
    expect(hit).toBeTruthy();
    expect(hit!.dmg!).toBeGreaterThan(0);
  });

  it('XUYÊN phòng thủ: cùng state lúc boss guard, tuyệt chiêu gây nhiều hơn đòn thường', () => {
    let s = startLive(team, boss(), 11, auras);
    s = until(s, 'guard');
    if (s.over) return; // seed không ra guard trong 200 lượt — bỏ qua (until đã chặn vòng lặp)
    const full = { ...s, energy: [SPECIAL_ENERGY] };
    const dmgSpecial = stepLive(full, { kind: 'special' }).log.find((e) => e.kind === 'special')!.dmg!;
    const dmgAttack = stepLive(full, { kind: 'attack' }).log.find((e) => e.kind === 'player-hit')!.dmg!;
    // Cùng rng: đòn thường dính GUARD_TAKEN 0.5, tuyệt chiêu thì ×SPECIAL_MUL không giảm.
    expect(dmgSpecial).toBeGreaterThan(dmgAttack * SPECIAL_MUL);
  });

  it('autoAction bung tuyệt chiêu khi nộ đầy (trừ lượt ĐÒN NẶNG)', () => {
    let s = startLive(team, boss(), 11, auras);
    s = until(s, 'strike');
    if (s.over) return;
    expect(autoAction({ ...s, energy: [SPECIAL_ENERGY] }).kind).toBe('special');
    const h = until(s, 'heavy');
    if (!h.over) expect(autoAction({ ...h, energy: [SPECIAL_ENERGY], charge: false }).kind).toBe('block');
  });
});
