import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppData, CURRENT_VERSION } from './types';
import { todayStr } from './date';

const KEY = 'pokemon-habit:data:v3';

export function defaultData(): AppData {
  return {
    habits: [],
    lastActiveDate: todayStr(),
    soundOn: true,
    hapticsOn: true,
    version: CURRENT_VERSION,
  };
}

export async function loadData(): Promise<AppData> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw) as Partial<AppData>;
    const base = defaultData();
    return {
      ...base,
      ...parsed,
      habits: Array.isArray(parsed.habits) ? (parsed.habits as AppData['habits']) : [],
    };
  } catch (e) {
    console.warn('loadData failed', e);
    return defaultData();
  }
}

export async function saveData(data: AppData): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('saveData failed', e);
  }
}

export async function clearData(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch (e) {
    console.warn('clearData failed', e);
  }
}
