import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppData, Habit, PartyMon, ReminderTime } from './types';
import { defaultData, loadData, saveData, clearData } from './storage';
import { applyDailyDecay, toggleCompletion, intervalMs, isDoneNow, habitStreak } from './gameLogic';
import { addHatchProgress, stageFromAffection, shinyChance, EVO_AFFECTION, MEGA_AFFECTION, FEED_CHUNK, completionCandy, STREAK_MILESTONES } from './collection';
import { fetchRandomLine, fetchChainForSpecies } from './species';
import { TEAM_POWER_MILESTONES, battleCandy, BATTLE_EGG_EVERY } from './battle';
import { fetchMegas } from './megaForms';
import { cancelReminder, scheduleReminder, setupChannel } from './notifications';
import { configureFeedback, feedbackComplete, feedbackEvolve } from './feedback';
import { todayStr } from './date';
import type { Session } from '@supabase/supabase-js';
import { authReady, ensureSession, onAuthChange } from './lib/auth';
import { reconcile } from './lib/sync';
import { pushState } from './lib/cloudState';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error';

// Sự kiện khoe: 'hatch' = nở con mới, 'evolve' = tiến hoá, 'milestone' = đạt mốc chuỗi.
export interface HatchEvent {
  ts: number;
  id: number; // pokedexId dạng hiển thị (0 nếu milestone)
  shiny: boolean;
  kind: 'hatch' | 'evolve' | 'milestone';
  streak?: number; // dùng cho milestone
}

interface AppContextValue {
  data: AppData;
  ready: boolean;
  hatchEvent: HatchEvent | null;
  clearHatchEvent: () => void;
  addHabit: (input: { title: string; reminder: ReminderTime | null }) => Promise<void>;
  updateHabit: (id: string, input: { title: string; reminder: ReminderTime | null }) => Promise<void>;
  deleteHabit: (id: string) => Promise<void>;
  toggleToday: (id: string) => void;
  feedPokemon: (key: string) => void;
  pickMega: (key: string, formId: number, formName: string) => void;
  hatchEgg: () => void;
  // Thắng boss -> trao thưởng cho LƯỢT boss đó (kẹo 1 lần/lượt theo độ khó, trứng mỗi 5 trận).
  reportBattleWin: (encounterId: number, bossBst: number, candyMul: number) => { candy: number; egg: boolean; already: boolean };
  // Sức mạnh bầy đạt mốc mới -> trao kẹo. Trả về tổng kẹo vừa trao (0 nếu không có mốc mới).
  claimTeamPower: (power: number) => number;
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
  const [hatchEvent, setHatchEvent] = useState<HatchEvent | null>(null);
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
    // Đẩy cloud NGẦM ngay (fire-and-forget), không debounce, không chặn UI.
    // Nhiều thay đổi liên tiếp -> nhiều lần upsert; last-write-wins theo updated_at lo phần đè.
    if (s) void pushState(s.user.id, data);
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

  const addHabit = useCallback(async (input: { title: string; reminder: ReminderTime | null }) => {
    const id = genId();
    const habit: Habit = {
      id,
      title: input.title.trim(),
      reminder: input.reminder,
      notificationId: null,
      createdAt: Date.now(),
      completions: {},
    };
    setData((d) => touch({ ...d, habits: [...d.habits, habit] }));

    // Nền: đặt lịch nhắc (nếu có).
    (async () => {
      try {
        let notificationId: string | null = null;
        if (input.reminder) {
          notificationId = await scheduleReminder(
            `Đến giờ: ${input.title}`,
            'Hoàn thành mục tiêu để nở Pokémon mới nhé! 🥚',
            input.reminder
          );
        }
        if (notificationId) {
          setData((d) => ({
            ...d,
            habits: d.habits.map((h) => (h.id === id ? { ...h, notificationId } : h)),
          }));
        }
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
    const now = Date.now();
    const d0 = dataRef.current;
    const before = d0.habits.find((h) => h.id === id);
    const res = toggleCompletion(d0, id, todayStr(), now);
    if (!res.nowCompleted) return; // đang khoá -> không đổi
    feedbackComplete();

    const today = todayStr(new Date(now));
    const allDone = res.data.habits.length > 0 && res.data.habits.every((h) => isDoneNow(h, now));
    const bestStreak = res.data.habits.reduce((m, h) => Math.max(m, habitStreak(h, today)), 0);
    const hr = addHatchProgress(res.data, { today, allDoneToday: allDone, bestStreak });
    // Kẹo/lượt = (theo chu kỳ habit) × SỐ PET.
    const iv = before ? intervalMs(before) : null;
    const perPet = completionCandy(iv != null ? iv / 60000 : 24 * 60);
    const candyGain = perPet * Math.max(1, hr.data.party.length);

    // Trứng đủ điểm -> vào HÀNG CHỜ (người chơi chạm để đập vỏ nở, không tự bung).
    const eggs = [...hr.data.pendingEggs];
    for (let i = 0; i < hr.newEggs; i++) eggs.push({ rare: false });

    // Mốc chuỗi (7/30/100) -> trứng HIẾM + ăn mừng (trao 1 lần).
    let claimed = hr.data.streakClaimed;
    let milestoneHit: number | null = null;
    for (const ms of STREAK_MILESTONES) {
      if (bestStreak >= ms && !claimed.includes(ms)) {
        eggs.push({ rare: true });
        claimed = [...claimed, ms];
        milestoneHit = ms;
      }
    }

    setData(touch({ ...hr.data, candy: (hr.data.candy ?? 0) + candyGain, pendingEggs: eggs, streakClaimed: claimed }));

    if (milestoneHit != null) {
      feedbackEvolve();
      setHatchEvent({ ts: now, id: 0, shiny: true, kind: 'milestone', streak: milestoneHit });
    }

    // Nền: hẹn lại nhắc nhở interval TỪ thời điểm tick.
    if (before && intervalMs(before) != null && before.reminder && !isDoneNow(before, now)) {
      (async () => {
        await cancelReminder(before.notificationId);
        const notificationId = await scheduleReminder(
          `Đến giờ: ${before.title}`,
          'Hoàn thành mục tiêu để nở Pokémon mới nhé! 🥚',
          before.reminder!
        );
        setData((d) => ({ ...d, habits: d.habits.map((h) => (h.id === id ? { ...h, notificationId } : h)) }));
      })();
    }
  }, [touch]);

  // Đập vỏ 1 trứng chờ -> nở 1 Pokémon MỚI (dạng cơ bản). Trứng hiếm -> shiny đảm bảo.
  const hatchEgg = useCallback(() => {
    const d0 = dataRef.current;
    if (!d0.pendingEggs.length) return;
    const now = Date.now();
    // ưu tiên trứng hiếm
    const eggIdx = d0.pendingEggs.findIndex((e) => e.rare);
    const idx = eggIdx >= 0 ? eggIdx : 0;
    const egg = d0.pendingEggs[idx];
    const remaining = d0.pendingEggs.filter((_, i) => i !== idx);
    setData((d) => touch({ ...d, pendingEggs: remaining }));

    const bestStreak = d0.habits.reduce((m, h) => Math.max(m, habitStreak(h, todayStr(new Date(now)))), 0);
    const shiny = egg.rare || Math.random() < shinyChance(bestStreak);
    (async () => {
      const avoid = dataRef.current.party.map((m) => m.line[m.line.length - 1]?.id).filter((x): x is number => !!x);
      const { line } = await fetchRandomLine(avoid);
      const baseId = line[0].id;
      const mon: PartyMon = { key: genId(), line: line.map((f) => ({ id: f.id, name: f.name })), affection: 0, shiny, at: now };
      setData((d) => touch({
        ...d,
        party: [...d.party, mon],
        collection: { ...d.collection, [baseId]: { shiny, at: now } },
      }));
      feedbackEvolve();
      setHatchEvent({ ts: now, id: baseId, shiny, kind: 'hatch' });
    })();
  }, [touch]);

  const clearHatchEvent = useCallback(() => setHatchEvent(null), []);

  // Thắng boss: kẹo trao 1 LẦN cho mỗi LƯỢT boss (theo độ khó); trứng hiếm mỗi BATTLE_EGG_EVERY trận.
  const reportBattleWin = useCallback((encounterId: number, bossBst: number, candyMul: number): { candy: number; egg: boolean; already: boolean } => {
    const now = Date.now();
    const d0 = dataRef.current;
    const already = (d0.bossBeaten ?? []).includes(encounterId);
    if (already) return { candy: 0, egg: false, already: true };

    const candy = battleCandy(Math.max(0, bossBst), candyMul);
    const wins = (d0.bossWins ?? 0) + 1;
    const egg = wins % BATTLE_EGG_EVERY === 0;

    setData((d) => {
      const eggs = egg ? [...d.pendingEggs, { rare: true }] : d.pendingEggs;
      const beaten = [...(d.bossBeaten ?? []), encounterId].slice(-40); // giữ 40 lượt gần nhất
      return touch({
        ...d,
        candy: (d.candy ?? 0) + candy,
        bossWins: wins,
        bossBeaten: beaten,
        pendingEggs: eggs,
      });
    });
    if (egg) {
      feedbackEvolve();
      setHatchEvent({ ts: now, id: 0, shiny: true, kind: 'milestone', streak: wins });
    }
    return { candy, egg, already: false };
  }, [touch]);

  // Sức mạnh bầy: trao kẹo cho mọi mốc <= power chưa nhận.
  const claimTeamPower = useCallback((power: number): number => {
    const d0 = dataRef.current;
    const claimed = d0.teamPowerClaimed ?? [];
    const fresh = TEAM_POWER_MILESTONES.filter((m) => power >= m.power && !claimed.includes(m.power));
    if (!fresh.length) return 0;
    const gained = fresh.reduce((s, m) => s + m.candy, 0);
    setData((d) => touch({
      ...d,
      candy: (d.candy ?? 0) + gained,
      teamPowerClaimed: [...(d.teamPowerClaimed ?? []), ...fresh.map((m) => m.power)],
    }));
    return gained;
  }, [touch]);

  // Cho 1 Pokémon (RIÊNG) ăn -> đổ tối đa FEED_CHUNK kẹo thành thân thiết (1:1). Đủ ngưỡng ->
  // tiến hoá bậc; tới MEGA_AFFECTION -> Mega (chỉ con này). KHÔNG ảnh hưởng con khác.
  const feedPokemon = useCallback((key: string) => {
    const now = Date.now();
    const d0 = dataRef.current;
    const avail = Math.floor(d0.candy ?? 0);
    if (avail <= 0) return;
    const idx = d0.party.findIndex((m) => m.key === key);
    if (idx < 0) return;
    const m = d0.party[idx];
    const spend = Math.min(avail, FEED_CHUNK, MEGA_AFFECTION - m.affection);
    if (spend <= 0) return; // đã tối đa
    const affection = m.affection + spend;
    const beforeIdx = Math.min(stageFromAffection(m.affection), m.line.length - 1);
    const afterIdx = Math.min(stageFromAffection(affection), m.line.length - 1);
    const formId = m.line[afterIdx].id;

    const party = [...d0.party];
    party[idx] = { ...m, affection };
    const collection = { ...d0.collection, [formId]: { shiny: m.shiny, at: d0.collection[formId]?.at ?? now } };
    setData(touch({ ...d0, candy: (d0.candy ?? 0) - spend, party, collection }));
    feedbackComplete();

    if (afterIdx > beforeIdx) {
      feedbackEvolve();
      setHatchEvent({ ts: Date.now(), id: formId, shiny: m.shiny, kind: 'evolve' });
    }

    // Đạt mốc đặc biệt lần đầu -> tra các dạng (Mega/Ash...) rồi hoá theo LỰA CHỌN của người chơi.
    if (affection >= MEGA_AFFECTION && m.megaId == null) {
      (async () => {
        const megas = await fetchMegas(m.line[m.line.length - 1].id);
        if (!megas.length) return; // loài không có dạng đặc biệt -> thôi
        const cur = dataRef.current.party.find((x) => x.key === key);
        const mega = megas.find((mm) => mm.id === cur?.megaChoice) ?? megas[0]; // theo lựa chọn, mặc định [0]
        setData((d) => {
          const j = d.party.findIndex((x) => x.key === key);
          if (j < 0) return d;
          const party2 = [...d.party];
          party2[j] = { ...party2[j], megaId: mega.id, megaName: mega.name };
          return touch({ ...d, party: party2, collection: { ...d.collection, [mega.id]: { shiny: party2[j].shiny, at: Date.now() } } });
        });
        feedbackEvolve();
        setHatchEvent({ ts: Date.now(), id: mega.id, shiny: m.shiny, kind: 'evolve' });
      })();
    }
  }, [touch]);

  // Chọn dạng đặc biệt sẽ hoá (Mega/Ash/X/Y). Nếu con ĐÃ hoá rồi -> đổi dạng ngay.
  const pickMega = useCallback((key: string, formId: number, formName: string) => {
    feedbackComplete();
    setData((d) => {
      const j = d.party.findIndex((x) => x.key === key);
      if (j < 0) return d;
      const party2 = [...d.party];
      const cur = party2[j];
      const switched = cur.megaId != null; // đã hoá -> đổi luôn
      party2[j] = { ...cur, megaChoice: formId, ...(switched ? { megaId: formId, megaName: formName } : {}) };
      const collection = switched ? { ...d.collection, [formId]: { shiny: cur.shiny, at: d.collection[formId]?.at ?? Date.now() } } : d.collection;
      return touch({ ...d, party: party2, collection });
    });
  }, [touch]);

  // Migration 1 lần: bầy cũ (collection từng form riêng) -> gộp theo dòng tiến hoá, đặt bậc đúng.
  const partyMigrated = useRef(false);
  useEffect(() => {
    if (!ready || partyMigrated.current) return;
    partyMigrated.current = true;
    const d0 = dataRef.current;
    if ((d0.party?.length ?? 0) > 0) return;
    const ids = Object.keys(d0.collection ?? {}).map(Number);
    if (!ids.length) return;
    (async () => {
      const fams = new Map<number, { line: { id: number; name: string }[]; owned: Set<number>; shiny: boolean }>();
      for (const id of ids) {
        const chain = await fetchChainForSpecies(id);
        if (!chain || !chain.line.length) {
          fams.set(id, { line: [{ id, name: '' }], owned: new Set([id]), shiny: !!d0.collection[id].shiny });
          continue;
        }
        const base = chain.line[0].id;
        const f = fams.get(base) ?? { line: chain.line, owned: new Set<number>(), shiny: false };
        f.owned.add(id);
        f.shiny = f.shiny || !!d0.collection[id].shiny;
        fams.set(base, f);
      }
      let i = 0;
      const party: PartyMon[] = [...fams.values()].map((f) => {
        const maxStage = Math.max(0, ...[...f.owned].map((id) => f.line.findIndex((x) => x.id === id)).filter((k) => k >= 0));
        return { key: genId() + i++, line: f.line, affection: EVO_AFFECTION[Math.min(maxStage, EVO_AFFECTION.length - 1)] ?? 0, shiny: f.shiny, at: 0 };
      });
      setData((dd) => touch({ ...dd, party }));
    })();
  }, [ready]);

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
        hatchEvent,
        clearHatchEvent,
        feedPokemon,
        pickMega,
        hatchEgg,
        reportBattleWin,
        claimTeamPower,
        addHabit,
        updateHabit,
        deleteHabit,
        toggleToday,
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
