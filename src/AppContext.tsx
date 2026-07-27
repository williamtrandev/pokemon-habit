import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppData, Habit, ReminderTime } from './types';
import { defaultData, loadData, saveData, clearData } from './storage';
import { applyDailyDecay, toggleCompletion, newCreature } from './gameLogic';
import { cancelReminder, scheduleReminder, setupChannel } from './notifications';
import { configureFeedback, feedbackComplete, feedbackEvolve } from './feedback';
import { fetchRandomLine, finalId, MegaForm } from './species';
import { fetchMegas } from './megaForms';
import { todayStr } from './date';
import type { Session } from '@supabase/supabase-js';
import { authReady, ensureSession, onAuthChange } from './lib/auth';
import { queuePush, reconcile } from './lib/sync';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error';

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
  setMusic: (on: boolean) => void;
  resetAll: () => Promise<void>;
  // Đồng bộ ẩn danh lên Supabase. authReady=false khi chưa cấu hình key.
  authReady: boolean;
  session: Session | null;
  syncStatus: SyncStatus;
}

const AppContext = createContext<AppContextValue | null>(null);

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(defaultData());
  const [ready, setReady] = useState(false);
  const [evolveEvent, setEvolveEvent] = useState<EvolveEvent | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(authReady ? 'idle' : 'off');
  const dataRef = useRef(data);
  dataRef.current = data;
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  // Đánh dấu thời điểm sửa để đồng bộ last-write-wins. CHỈ gọi ở thao tác của
  // người dùng — KHÔNG gọi khi load/merge, để cloud mới hơn còn thắng được.
  const touch = useCallback((d: AppData): AppData => ({ ...d, updatedAt: Date.now() }), []);

  useEffect(() => {
    (async () => {
      setupChannel();
      const loaded = await loadData();
      const decayed = applyDailyDecay(loaded);
      configureFeedback({ sound: decayed.soundOn, haptics: decayed.hapticsOn, music: decayed.musicOn });
      setData(decayed);
      setReady(true);
      if (decayed !== loaded) saveData(decayed);
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    saveData(data);
    const s = sessionRef.current;
    if (s) queuePush(s.user.id, data); // write-behind: đẩy cloud nền, không chặn UI
  }, [data, ready]);

  // Đồng bộ ẩn danh: tự tạo/khôi phục phiên, không cần đăng nhập.
  useEffect(() => {
    if (!authReady) return;
    let unsub = () => {};
    (async () => {
      const s = await ensureSession();
      setSession(s);
      unsub = onAuthChange((next) => setSession(next));
    })();
    return () => unsub();
  }, []);

  // Có phiên -> merge cloud <-> local (một lần cho mỗi user). Local-first: UI đã
  // hiển thị từ AsyncStorage; bước này chỉ kéo về nếu cloud mới hơn.
  const reconciledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!ready) return;
    if (!session) {
      reconciledFor.current = null;
      return;
    }
    const uid = session.user.id;
    if (reconciledFor.current === uid) return;
    reconciledFor.current = uid;
    (async () => {
      setSyncStatus('syncing');
      try {
        const res = await reconcile(uid, dataRef.current);
        if (res.source === 'cloud') {
          setData(res.data);
          saveData(res.data);
        }
        setSyncStatus('idle');
      } catch {
        setSyncStatus('error');
      }
    })();
  }, [ready, session]);

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
    const id = genId();
    // Optimistic: hiện trứng NGAY, không chờ mạng. megas=[] để backfill không đụng vào.
    const habit: Habit = {
      id,
      title: input.title.trim(),
      reminder: input.reminder,
      notificationId: null,
      createdAt: Date.now(),
      completions: {},
      creature: { ...newCreature([], '#8B5CF6'), megas: [], megaPick: 0 },
    };
    setData((d) => touch({ ...d, habits: [...d.habits, habit] }));

    // Nền: lấy loài + mega từ PokéAPI + đặt lịch nhắc, rồi cập nhật sinh vật.
    (async () => {
      try {
        const avoid = dataRef.current.habits.map((h) => finalId(h.creature)).filter((x) => x > 0);
        const { line, color } = await fetchRandomLine(avoid);
        const megas = await fetchMegas(line[line.length - 1].id);
        let notificationId: string | null = null;
        if (input.reminder) {
          notificationId = await scheduleReminder(
            `Đến giờ: ${input.title}`,
            'Hoàn thành để nuôi lớn Pokémon của bạn nhé! 🥚',
            input.reminder
          );
        }
        setData((d) => ({
          ...d,
          habits: d.habits.map((h) =>
            h.id === id ? { ...h, notificationId, creature: { ...h.creature, line, color, megas } } : h
          ),
        }));
      } catch (e) {
        console.warn('addHabit background failed', e);
      }
    })();
  }, [touch]);

  const updateHabit = useCallback(
    async (id: string, input: { title: string; reminder: ReminderTime | null }) => {
      const existing = dataRef.current.habits.find((h) => h.id === id);
      if (!existing) return;

      // Cập nhật UI NGAY.
      setData((d) =>
        touch({
          ...d,
          habits: d.habits.map((h) =>
            h.id === id ? { ...h, title: input.title.trim(), reminder: input.reminder } : h
          ),
        })
      );

      const changed =
        existing.title !== input.title ||
        JSON.stringify(existing.reminder ?? null) !== JSON.stringify(input.reminder ?? null);
      if (!changed) return;

      // Nền: đổi lịch nhắc.
      (async () => {
        await cancelReminder(existing.notificationId);
        const notificationId = input.reminder
          ? await scheduleReminder(
              `Đến giờ: ${input.title}`,
              'Hoàn thành để nuôi lớn Pokémon của bạn nhé! 🥚',
              input.reminder
            )
          : null;
        setData((d) => ({
          ...d,
          habits: d.habits.map((h) => (h.id === id ? { ...h, notificationId } : h)),
        }));
      })();
    },
    [touch]
  );

  const deleteHabit = useCallback(async (id: string) => {
    const existing = dataRef.current.habits.find((h) => h.id === id);
    setData((d) => touch({ ...d, habits: d.habits.filter((h) => h.id !== id) })); // ngay
    if (existing?.notificationId) void cancelReminder(existing.notificationId); // nền
  }, [touch]);

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
      return touch(res.data);
    });
  }, [touch]);

  // Đổi dạng Mega đang chọn (loài có nhiều dạng, vd Charizard X/Y).
  const setMegaPick = useCallback((id: string, index: number) => {
    setData((d) =>
      touch({
        ...d,
        habits: d.habits.map((h) => (h.id === id ? { ...h, creature: { ...h.creature, megaPick: index } } : h)),
      })
    );
  }, [touch]);

  const clearEvolveEvent = useCallback(() => setEvolveEvent(null), []);

  const setSound = useCallback((on: boolean) => {
    configureFeedback({ sound: on });
    setData((d) => touch({ ...d, soundOn: on }));
  }, [touch]);

  const setHaptics = useCallback((on: boolean) => {
    configureFeedback({ haptics: on });
    setData((d) => touch({ ...d, hapticsOn: on }));
  }, [touch]);

  const setMusic = useCallback((on: boolean) => {
    configureFeedback({ music: on });
    setData((d) => touch({ ...d, musicOn: on }));
  }, [touch]);

  const resetAll = useCallback(async () => {
    for (const h of dataRef.current.habits) {
      if (h.notificationId) await cancelReminder(h.notificationId);
    }
    await clearData();
    setData(touch(defaultData()));
  }, [touch]);

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
        setMusic,
        resetAll,
        authReady,
        session,
        syncStatus,
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
