import type { AppData, Habit, ReminderTime } from '../types';

export function mkHabit(
  id: string,
  completions: Record<string, boolean> = {},
  reminder: ReminderTime | null = null
): Habit {
  return {
    id,
    title: 'H' + id,
    reminder,
    notificationId: null,
    createdAt: 0,
    completions,
  };
}

export function mkData(habits: Habit[], lastActiveDate: string): AppData {
  return {
    habits,
    lastActiveDate,
    soundOn: true,
    hapticsOn: true,
    musicOn: false,
    version: 4,
    updatedAt: 0,
    collection: {},
    party: [],
    candy: 0,
    pendingEggs: [],
    streakClaimed: [],
    hatchMeter: 0,
    hatchDay: lastActiveDate,
    hatchDayAdded: 0,
  };
}
