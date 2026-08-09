import { describe, it, expect } from 'vitest';
import {
  addHatchProgress, stageFromAffection, EVO_AFFECTION, completionCandy, CANDY_PER_DAY,
  HATCH_DAILY_CAP, PERFECT_DAY_BONUS, HATCH_THRESHOLD, hatchPoints,
  baseIdOf, lineKeyOf, hatchAvoidKeys, isNewCatch, recordCaught, dedupeParty, dedupeData,
} from '../collection';
import type { PartyMon } from '../types';

// Tổng điểm nở một lượt cộng (kể cả phần đã quy ra trứng).
const added = (before: number, r: { data: { hatchMeter: number }; newEggs: number }) =>
  r.data.hatchMeter - before + r.newEggs * HATCH_THRESHOLD;
import { mkData, mkHabit } from './helpers';

const T = '2026-07-25';
const base = () => mkData([mkHabit('a')], T);

describe('addHatchProgress — trần điểm/ngày', () => {
  it('không cộng quá HATCH_DAILY_CAP trong một ngày', () => {
    let data = base();
    for (let i = 0; i < HATCH_DAILY_CAP + 5; i++) {
      data = addHatchProgress(data, { today: T, allDoneToday: false, bestStreak: 0 }).data;
    }
    expect(data.hatchDayAdded).toBe(HATCH_DAILY_CAP);
  });

  it('sang ngày mới thì reset bộ đếm/ngày', () => {
    let data = addHatchProgress(base(), { today: T, allDoneToday: false, bestStreak: 0 }).data;
    data = addHatchProgress(data, { today: '2026-07-26', allDoneToday: false, bestStreak: 0 }).data;
    expect(data.hatchDayAdded).toBe(hatchPoints(0)); // 1 lượt trong ngày mới
    expect(data.hatchDay).toBe('2026-07-26');
  });
});

describe('addHatchProgress — thưởng "xong hết" (1 lần/ngày)', () => {
  it('cộng PERFECT_DAY_BONUS đúng 1 lần', () => {
    const r1 = addHatchProgress(base(), { today: T, allDoneToday: true, bestStreak: 0 });
    expect(added(0, r1)).toBe(hatchPoints(0) + PERFECT_DAY_BONUS); // lượt + bonus
    const r2 = addHatchProgress(r1.data, { today: T, allDoneToday: true, bestStreak: 0 });
    expect(added(r1.data.hatchMeter, r2)).toBe(hatchPoints(0)); // không cộng bonus lần 2
  });
});

describe('addHatchProgress — báo trứng khi đủ ngưỡng', () => {
  it('đủ HATCH_THRESHOLD -> newEggs>=1, trừ ngưỡng', () => {
    let data = base();
    let eggs = 0;
    let day = 20;
    for (let i = 0; i < HATCH_THRESHOLD + 1; i++) {
      const r = addHatchProgress(data, { today: `2026-08-${day++}`, allDoneToday: false, bestStreak: 0 });
      data = r.data;
      eggs += r.newEggs;
    }
    expect(eggs).toBeGreaterThanOrEqual(1);
    expect(data.hatchMeter).toBeLessThan(HATCH_THRESHOLD);
  });
});

describe('completionCandy — tỉ lệ chu kỳ, chuẩn hoá theo ngày', () => {
  it('habit hằng ngày (1440p) = CANDY_PER_DAY mỗi lượt', () => {
    expect(completionCandy(1440)).toBeCloseTo(CANDY_PER_DAY, 5);
  });
  it('habit mỗi 20p: 72 lượt/ngày = tổng CANDY_PER_DAY', () => {
    expect(completionCandy(20) * 72).toBeCloseTo(CANDY_PER_DAY, 5);
  });
});

describe('stageFromAffection', () => {
  it('ánh xạ thân thiết -> bậc', () => {
    expect(stageFromAffection(0)).toBe(0);
    expect(stageFromAffection(EVO_AFFECTION[1] - 1)).toBe(0);
    expect(stageFromAffection(EVO_AFFECTION[1])).toBe(1);
    expect(stageFromAffection(EVO_AFFECTION[2])).toBe(2);
    expect(stageFromAffection(9999)).toBe(2);
  });
});

// ===== Bầy phải DUY NHẤT =====
// Lỗi gốc: fetchRandomLine chỉ "cố né" trùng trong 4/6 lượt rồi trả về loài trùng vô điều
// kiện, và né theo id BẬC CUỐI nên Charmander vs Charizard bị coi là hai loài khác nhau.
const mon = (baseId: number, shiny = false, line?: { id: number; name: string }[]): PartyMon => ({
  key: 'k' + baseId + (shiny ? 's' : ''),
  line: line ?? [{ id: baseId, name: 'b' }, { id: baseId + 1, name: 'e' }],
  affection: 0,
  shiny,
  at: 0,
});

describe('duy nhất theo (họ, shiny)', () => {
  it('baseIdOf lấy DẠNG CƠ BẢN, không phải dạng đang hiển thị', () => {
    // Charmander(4) → Charmeleon(5) → Charizard(6): nuôi tới đâu vẫn là họ số 4.
    const charizard = mon(4, false, [{ id: 4, name: 'Charmander' }, { id: 5, name: 'C' }, { id: 6, name: 'Charizard' }]);
    expect(baseIdOf(charizard)).toBe(4);
  });

  it('trứng thường né MỌI dòng đã có', () => {
    const party = [mon(1), mon(4, true)];
    expect(hatchAvoidKeys(party, false).sort()).toEqual(['1>2', '4>5']);
  });

  it('trứng shiny chỉ né dòng đã có SẴN bản shiny', () => {
    // Đã có Bulbasaur thường + Charmander shiny.
    // Shiny Bulbasaur là con CHƯA TỪNG CÓ -> được phép; shiny Charmander thì trùng.
    const party = [mon(1, false), mon(4, true)];
    expect(hatchAvoidKeys(party, true)).toEqual(['4>5']);
  });

  it('isNewCatch: thường trùng thường là KHÔNG mới', () => {
    const party = [mon(1, false)];
    expect(isNewCatch(party, '1>2', false)).toBe(false);
    expect(isNewCatch(party, '1>2', true)).toBe(true); // shiny của dòng đã có = mới
    expect(isNewCatch(party, '2>3', false)).toBe(true);
  });

  it('isNewCatch: shiny trùng shiny là KHÔNG mới', () => {
    const party = [mon(1, true)];
    expect(isNewCatch(party, '1>2', true)).toBe(false);
    expect(isNewCatch(party, '1>2', false)).toBe(true); // bản thường vẫn còn thiếu
  });

  it('HAI NHÁNH của cùng một họ là hai con KHÁC nhau', () => {
    // Charcadet(935) rẽ thành Armarouge(936) hoặc Ceruledge(937): nuôi lên là hai con
    // nhìn không liên quan gì nhau, gộp lại thì mất trắng một nhánh.
    const armarouge = { key: 'a', line: [{ id: 935, name: 'c' }, { id: 936, name: 'a' }], affection: 80, shiny: false, at: 0 };
    const ceruledge = { key: 'b', line: [{ id: 935, name: 'c' }, { id: 937, name: 'c' }], affection: 80, shiny: false, at: 0 };
    expect(lineKeyOf(armarouge)).toBe('935>936');
    expect(lineKeyOf(ceruledge)).toBe('935>937');
    expect(isNewCatch([armarouge], lineKeyOf(ceruledge), false)).toBe(true);
    expect(dedupeParty([armarouge, ceruledge]).removed).toBe(0);
  });
});

describe('recordCaught — không hạ cấp shiny', () => {
  it('đã ghi shiny thì bản thường KHÔNG ghi đè', () => {
    const c = recordCaught({ 6: { shiny: true, at: 100 } }, 6, false, 200);
    expect(c[6].shiny).toBe(true);
    expect(c[6].at).toBe(100); // giữ mốc thu phục ĐẦU TIÊN
  });

  it('đã ghi thường, bắt được shiny thì nâng cấp', () => {
    const c = recordCaught({ 6: { shiny: false, at: 100 } }, 6, true, 200);
    expect(c[6].shiny).toBe(true);
  });

  it('loài mới thì ghi thẳng', () => {
    expect(recordCaught({}, 25, true, 7)).toEqual({ 25: { shiny: true, at: 7 } });
  });
});

// ===== Dọn bầy đã trùng sẵn =====
// Luật duy nhất chỉ chặn con trùng MỚI; bầy đang chơi (148 con) đã đầy bản sao do lỗi cũ.
const monA = (key: string, baseId: number, affection: number, shiny = false, at = 0): PartyMon => ({
  key,
  line: [{ id: baseId, name: 'b' }, { id: baseId + 1, name: 'e' }],
  affection,
  shiny,
  at,
});

describe('dedupeParty', () => {
  it('gộp trùng, giữ con thân thiết cao nhất', () => {
    const r = dedupeParty([monA('x', 1, 50), monA('y', 1, 300), monA('z', 2, 10)]);
    expect(r.party.map((m) => m.key)).toEqual(['y', 'z']);
    expect(r.removed).toBe(1);
  });

  it('hoàn kẹo đúng bằng thân thiết của con bị gộp', () => {
    const r = dedupeParty([monA('x', 1, 300), monA('y', 1, 50), monA('z', 1, 20)]);
    expect(r.removed).toBe(2);
    expect(r.refund).toBe(70); // 50 + 20, con 300 được giữ
  });

  it('shiny KHÔNG bị gộp với bản thường cùng họ', () => {
    const r = dedupeParty([monA('x', 1, 10, false), monA('y', 1, 10, true)]);
    expect(r.removed).toBe(0);
    expect(r.party).toHaveLength(2);
  });

  it('trùng nhưng khác BẬC vẫn là trùng (so theo dạng cơ bản)', () => {
    // Cùng dòng Charmander, một con mới nở một con đã lên Charizard.
    const line = [{ id: 4, name: 'Charmander' }, { id: 5, name: 'C' }, { id: 6, name: 'Charizard' }];
    const r = dedupeParty([
      { key: 'lo', line, affection: 0, shiny: false, at: 1 },
      { key: 'hi', line, affection: 390, shiny: false, at: 2 },
    ]);
    expect(r.party.map((m) => m.key)).toEqual(['hi']);
  });

  it('ưu tiên con đã hoá dạng đặc biệt khi thân thiết bằng nhau', () => {
    const r = dedupeParty([
      { ...monA('plain', 1, 400) },
      { ...monA('mega', 1, 400), megaId: 10034, megaName: 'mega' },
    ]);
    expect(r.party[0].key).toBe('mega');
  });

  it('giữ nguyên thứ tự bầy sau khi dọn', () => {
    const r = dedupeParty([monA('a', 3, 5), monA('b', 1, 5), monA('c', 3, 99), monA('d', 2, 5)]);
    expect(r.party.map((m) => baseIdOf(m))).toEqual([3, 1, 2]);
    expect(r.party[0].key).toBe('c'); // giữ con xịn hơn, nhưng vẫn ở vị trí cũ
  });

  it('không trùng -> dedupeData trả về ĐÚNG object cũ (không ghi thừa mỗi lần load)', () => {
    const data = { ...mkData([], T), party: [monA('a', 1, 5), monA('b', 2, 5)], candy: 10 };
    expect(dedupeData(data)).toBe(data);
  });

  it('dedupeData cộng kẹo hoàn lại', () => {
    const data = { ...mkData([], T), party: [monA('a', 1, 200), monA('b', 1, 40)], candy: 10 };
    const out = dedupeData(data);
    expect(out.party).toHaveLength(1);
    expect(out.candy).toBe(50); // 10 + 40
  });
});
