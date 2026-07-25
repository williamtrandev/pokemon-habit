import { newCreature } from '../gameLogic';
import type { AppData, Creature, Habit } from '../types';

export const LINE = [
  { id: 1, name: 'Bulbasaur' },
  { id: 2, name: 'Ivysaur' },
  { id: 3, name: 'Venusaur' },
];

export function mkHabit(
  id: string,
  completions: Record<string, boolean> = {},
  creature: Partial<Creature> = {}
): Habit {
  return {
    id,
    title: 'H' + id,
    reminder: null,
    notificationId: null,
    createdAt: 0,
    completions,
    creature: { ...newCreature(LINE, '#22C55E'), ...creature },
  };
}

export function mkData(habits: Habit[], lastActiveDate: string): AppData {
  return { habits, lastActiveDate, soundOn: true, hapticsOn: true, version: 3 };
}
