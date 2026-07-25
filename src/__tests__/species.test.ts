import { describe, it, expect } from 'vitest';
import {
  STAGE_XP, MEGA_XP, MEGA_STAGE, stageForXp, formIdAt, formNameAt,
  resolveForm, hasMega, megaReady, activeMega, displayFormId, evoProgress, colorForId,
} from '../species';
import { newCreature } from '../gameLogic';
import type { Creature } from '../types';

const LINE = [{ id: 1, name: 'Bulbasaur' }, { id: 2, name: 'Ivysaur' }, { id: 3, name: 'Venusaur' }];
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
