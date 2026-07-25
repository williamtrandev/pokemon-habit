import { describe, it, expect } from 'vitest';
import { healthState } from '../types';

describe('healthState tiers', () => {
  it('maps vitality to state key', () => {
    expect(healthState(0, true).key).toBe('fainted');
    expect(healthState(90, false).key).toBe('radiant');
    expect(healthState(60, false).key).toBe('happy');
    expect(healthState(30, false).key).toBe('weak');
    expect(healthState(10, false).key).toBe('critical');
  });
  it('fainted flag overrides vitality', () => {
    expect(healthState(100, true).key).toBe('fainted');
  });
});
