import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  STAGE_XP, MEGA_XP, MEGA_STAGE, stageForXp, formIdAt, formNameAt,
  resolveForm, hasMega, megaReady, activeMega, displayFormId, evoProgress, colorForId,
  fetchRandomLine, resetChainCache, MAX_EVO_CHAIN,
} from '../species';
import type { Creature } from '../types';

const LINE = [{ id: 1, name: 'Bulbasaur' }, { id: 2, name: 'Ivysaur' }, { id: 3, name: 'Venusaur' }];
const newCreature = (line: Creature['line'], color: string): Creature =>
  ({ line, color, xp: 0, vitality: 85, fainted: false, branch: null, bestStreak: 0, everFinal: false });
const base = (over: Partial<Creature> = {}): Creature => ({ ...newCreature(LINE, '#000'), ...over });

describe('species stage/xp', () => {
  it('stageForXp thresholds', () => {
    expect(stageForXp(0)).toBe(0);
    expect(stageForXp(39)).toBe(0);
    expect(stageForXp(40)).toBe(1);
    expect(stageForXp(120)).toBe(2);
    expect(stageForXp(STAGE_XP[3])).toBe(3);
    expect(stageForXp(9999)).toBe(3);
  });
  it('evoProgress mid + final', () => {
    expect(evoProgress(20).ratio).toBe(0.5);
    expect(evoProgress(STAGE_XP[3])).toEqual({ ratio: 1, remaining: 0, nextStage: null });
  });
  it('formIdAt egg/clamp', () => {
    expect(formIdAt(LINE, 0)).toBeNull();
    expect(formIdAt(LINE, 1)).toBe(1);
    expect(formIdAt(LINE, 3)).toBe(3);
  });
  it('formNameAt egg/legendary', () => {
    expect(formNameAt(LINE, 0, null)).toBe('Trứng');
    expect(formNameAt(LINE, 3, 'legendary')).toBe('Venusaur ✨');
  });
  it('colorForId deterministic', () => {
    expect(colorForId(6)).toBe(colorForId(6 + 12));
  });
});

describe('species mega', () => {
  const mega = base({ xp: MEGA_XP, megas: [{ id: 10033, name: 'Mega Venusaur' }] });
  it('detects + resolves mega', () => {
    expect(hasMega(mega)).toBe(true);
    expect(megaReady(mega)).toBe(true);
    expect(activeMega(mega)?.id).toBe(10033);
    expect(resolveForm(mega).stage).toBe(MEGA_STAGE);
    expect(resolveForm(mega).isMega).toBe(true);
    expect(displayFormId(mega)).toBe(10033);
  });
  it('no mega without megas even at xp', () => {
    const noMega = base({ xp: MEGA_XP });
    expect(megaReady(noMega)).toBe(false);
    expect(resolveForm(noMega).isMega).toBe(false);
  });
  it('megaPick clamps out-of-range', () => {
    const multi = base({ xp: MEGA_XP, megas: [{ id: 10034, name: 'X' }, { id: 10035, name: 'Y' }], megaPick: 9 });
    expect(activeMega(multi)?.id).toBe(10035);
  });
});

// ===== Bốc dòng tiến hoá: KHÔNG được trả về họ đã có =====
// Bản cũ chỉ né trùng ở 4/6 lượt, hai lượt cuối trả về loài trùng vô điều kiện.
describe('fetchRandomLine — không trùng họ đã có', () => {
  // PokéAPI giả: chain N = họ có base id N*10, hai bậc.
  const sp = (id: number) => ({ name: `mon-${id}`, url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` });
  const chainJson = (chainId: number) => ({
    chain: {
      species: sp(chainId * 10),
      evolves_to: [{ species: sp(chainId * 10 + 1), evolves_to: [] }],
    },
  });

  const mockApi = () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      const id = Number(url.match(/evolution-chain\/(\d+)/)?.[1]);
      return { ok: true, status: 200, json: async () => chainJson(id) } as unknown as Response;
    }));
  };

  beforeEach(() => {
    resetChainCache();
    mockApi();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('né được cả khi bầy đã có RẤT nhiều dòng', async () => {
    // Chiếm 500/549 dòng: bản cũ với 6 lượt bốc lại gần như chắc chắn trả về trùng.
    const owned = Array.from({ length: 500 }, (_, i) => `${(i + 1) * 10}>${(i + 1) * 10 + 1}`);
    for (let round = 0; round < 20; round++) {
      const { line, duplicate } = await fetchRandomLine(owned);
      expect(duplicate).toBe(false);
      expect(owned).not.toContain(`${line[0].id}>${line[line.length - 1].id}`);
    }
  });

  it('so theo CẢ DÒNG, moi được dòng cuối cùng còn thiếu', async () => {
    // Chiếm HẾT các dòng trừ đúng một dòng (70>71) -> chỉ còn một đáp án đúng.
    // Bản cũ bốc ngẫu nhiên 6 lượt nên gần như chắc chắn không tìm ra.
    const owned = Array.from({ length: MAX_EVO_CHAIN }, (_, i) => `${(i + 1) * 10}>${(i + 1) * 10 + 1}`)
      .filter((k) => k !== '70>71');
    const { line, duplicate } = await fetchRandomLine(owned);
    expect(line[0].id).toBe(70);
    expect(duplicate).toBe(false);
  });

  it('hết loài mới -> báo duplicate thay vì lặng lẽ trả hàng trùng', async () => {
    const allOwned = Array.from({ length: MAX_EVO_CHAIN }, (_, i) => `${(i + 1) * 10}>${(i + 1) * 10 + 1}`);
    const { duplicate } = await fetchRandomLine(allOwned);
    expect(duplicate).toBe(true);
  });

  it('không chuỗi nào dùng được -> vẫn có dòng dự phòng, kèm cờ duplicate', async () => {
    // 404 = chuỗi thật sự không tồn tại; fetchEvolutionChain cache null và KHÔNG retry,
    // nên bài test không phải chờ mấy vòng backoff.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 404 }) as unknown as Response));
    const { line, duplicate } = await fetchRandomLine([]);
    expect(line.length).toBeGreaterThan(0);
    expect(duplicate).toBe(true);
  });
});
