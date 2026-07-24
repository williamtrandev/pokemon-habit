import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppData, Habit, ReminderTime } from './types';
import { defaultData, loadData, saveData, clearData } from './storage';
import { applyDailyDecay, toggleCompletion, newCreature } from './gameLogic';
import { cancelReminder, scheduleReminder, setupChannel } from './notifications';
import { configureFeedback, feedbackComplete, feedbackEvolve } from './feedback';
import { fetchRandomLine, finalId, MegaForm } from './species';
import { fetchMegas } from './megaForms';
import { todayStr } from './date';

export interface EvolveEvent {
  ts: number;
  habitId: string;
  stage: number;
  revived: boolean;
}

interface AppContextValue {
  data: AppData;
  ready: boolean;
  evolveEvent: EvolveEvent | null;
  clearEvolveEvent: () => void;
  addHabit: (input: { title: string; reminder: ReminderTime | null }) => Promise<void>;
  updateHabit: (id: string, input: { title: string; reminder: ReminderTime | null }) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  toggleToday: (id: string) => void;
  setMegaPick: (id: string, index: number) => void;
  setSound: (on: boolean) => void;
  setHaptics: (on: boolean) => void;
  resetAll: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(defaultData());
  const [ready, setReady] = useState(false);
  const [evolveEvent, setEvolveEvent] = useState<EvolveEvent | null>(null);
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    (async () => {
      setupChannel();
      const loaded = await loadData();
      const decayed = applyDailyDecay(loaded);
      configureFeedback({ sound: decayed.soundOn, haptics: decayed.hapticsOn });
      setData(decayed);
      setReady(true);
      if (decayed !== loaded) saveData(decayed);
    })();
  }, []);

  useEffect(() => {
    if (ready) saveData(data);
  }, [data, ready]);

  // Tra dạng Mega cho các sinh vật chưa có thông tin (tạo trước khi có tính năng, hoặc lúc offline).
  const megaBackfilled = useRef(false);
  useEffect(() => {
    if (!ready || megaBackfilled.current) return;
    const pending = dataRef.current.habits.filter((h) => h.creature.megas === undefined);
    megaBackfilled.current = true;
    if (pending.length === 0) return;
    (async () => {
      const updates = new Map<string, MegaForm[]>();
      for (const h of pending) updates.set(h.id, await fetchMegas(finalId(h.creature)));
      setData((d) => ({
        ...d,
        habits: d.habits.map((h) =>
          updates.has(h.id)
            ? { ...h, creature: { ...h.creature, megas: updates.get(h.id)!, megaPick: h.creature.megaPick ?? 0 } }
            : h
        ),
      }));
    })();
  }, [ready]);

  const addHabit = useCallback(async (input: { title: string; reminder: ReminderTime | null }) => {
    const avoid = dataRef.current.habits.map((h) => finalId(h.creature));
    const { line, color } = await fetchRandomLine(avoid);
    const megas = await fetchMegas(line[line.length - 1].id);
    let notificationId: string | null = null;
    if (input.reminder) {
      notificationId = await scheduleReminder(
        `Đến giờ: ${input.title}`,
        'Hoàn thành để nuôi lớn sinh vật của bạn nhé! 🥚',
        input.reminder
      );
    }
    const habit: Habit = {
      id: genId(),
      title: input.title.trim(),
      reminder: input.reminder,
      notificationId,
      createdAt: Date.now(),
      completions: {},
      creature: { ...newCreature(line, color), megas, megaPick: 0 },
    };
    setData((d) => ({ ...d, habits: [...d.habits, habit] }));
  }, []);

  const updateHabit = useCallback(
    async (id: string, input: { title: string; reminder: ReminderTime | null }) => {
      const existing = dataRef.current.habits.find((h) => h.id === id);
      if (!existing) return;
      let notificationId = existing.notificationId;
      const changed =
        existing.reminder?.hour !== input.reminder?.hour ||
        existing.reminder?.minute !== input.reminder?.minute ||
        existing.title !== input.title;
      if (changed) {
        await cancelReminder(existing.notificationId);
        notificationId = input.reminder
          ? await scheduleReminder(
              `Đến giờ: ${input.title}`,
              'Hoàn thành để nuôi lớn sinh vật của bạn nhé! 🥚',
              input.reminder
            )
          : null;
      }
      setData((d) => ({
        ...d,
        habits: d.habits.map((h) =>
          h.id === id ? { ...h, title: input.title.trim(), reminder: input.reminder, notificationId } : h
        ),
      }));
    },
    []
  );

  const deleteHabit = useCallback(async (id: string) => {
    const existing = dataRef.current.habits.find((h) => h.id === id);
    if (existing?.notificationId) await cancelReminder(existing.notificationId);
    setData((d) => ({ ...d, habits: d.habits.filter((h) => h.id !== id) }));
  }, []);

  const toggleToday = useCallback((id: string) => {
    setData((d) => {
      const res = toggleCompletion(d, id, todayStr());
      if (res.nowCompleted) {
        if (res.evolvedTo) {
          feedbackEvolve();
          setEvolveEvent({ ts: Date.now(), habitId: id, stage: res.evolvedTo, revived: res.revived });
        } else {
          feedbackComplete();
          if (res.revived) setEvolveEvent({ ts: Date.now(), habitId: id, stage: -1, revived: true });
        }
      }
      return res.data;
    });
  }, []);

  // Đổi dạng Mega đang chọn (loài có nhiều dạng, vd Charizard X/Y).
  const setMegaPick = useCallback((id: string, index: number) => {
    setData((d) => ({
      ...d,
      habits: d.habits.map((h) => (h.id === id ? { ...h, creature: { ...h.creature, megaPick: index } } : h)),
    }));
  }, []);

  const clearEvolveEvent = useCallback(() => setEvolveEvent(null), []);

  const setSound = useCallback((on: boolean) => {
    configureFeedback({ sound: on });
    setData((d) => ({ ...d, soundOn: on }));
  }, []);

  const setHaptics = useCallback((on: boolean) => {
    configureFeedback({ haptics: on });
    setData((d) => ({ ...d, hapticsOn: on }));
  }, []);

  const resetAll = useCallback(async () => {
    for (const h of dataRef.current.habits) {
      if (h.notificationId) await cancelReminder(h.notificationId);
    }
    await clearData();
    setData(defaultData());
  }, []);

  return (
    <AppContext.Provider
      value={{
        data,
        ready,
        evolveEvent,
        clearEvolveEvent,
        addHabit,
        updateHabit,
        deleteHabit,
        toggleToday,
        setMegaPick,
        setSound,
        setHaptics,
        resetAll,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp phải nằm trong <AppProvider>');
  return ctx;
}
