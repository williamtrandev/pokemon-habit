import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type BossPhase, type Combatant, phasesOf, pickMove, signatureMove } from '@app/battle';
import {
  BERRY_COUNT,
  BLOCK_TAKEN,
  CHARGE_MUL,
  INTENT_VI,
  type LiveAction,
  type LiveEvent,
  type LiveState,
  MAX_LINEUP,
  SPECIAL_ENERGY,
  SPECIAL_MUL,
  STAGGER_MAX,
  autoAction,
  bossAtPhase,
  canAct,
  matchupOf,
  startLive,
  stepLive,
} from '@app/battleLive';
import { typeColor, typeLabel } from '@app/pokemonTypes';
import { RARITY, type HeldItem } from '@app/items';
import { feedbackComplete, feedbackEvolve, feedbackTap } from '@app/feedback';
import { CreatureImage, ItemSprite } from '@web/ui/components/Bits';

// bst = tổng chỉ số gốc; cộng lại thành SỨC MẠNH ĐỘI HÌNH để scale boss theo đội đã chọn.
export interface Fighter {
  c: Combatant;
  shiny: boolean;
  bst: number;
  // Món đang đeo — chỉ để HIỂN THỊ; buff đã nằm sẵn trong `c` qua applyHeld.
  item?: HeldItem | null;
}

interface Props {
  onClose: () => void;
  team: Fighter[];
  /** Boss để XEM TRƯỚC (tên/hệ/ảnh). Máu-công thật dựng lúc xuất chiến qua makeBoss. */
  boss: Combatant;
  tier: { label: string; color: string };
  seed: number;
  /** Hệ của pha 2 và pha 3 — mỗi pha boss đổi hệ nên đội phải phủ nhiều hệ. */
  auraTypes: [string, string];
  /** Dựng boss theo SỨC MẠNH ĐỘI HÌNH đã chọn (xem lineupScale trong battle.ts). */
  makeBoss: (lineupPower: number) => Combatant;
  onWin: () => { candy: number; egg: boolean; item: HeldItem | null; already: boolean };
}

// ===== Đấu đạo trường (bản web) =====
//
// Chạy CÙNG một lõi với app native: ../src/battleLive.ts. Trước đây bản web còn gọi
// `simulateBattle` — trận tính sẵn rồi chỉ phát lại như phim — nên cùng một lượt boss mà app
// và web cho kết quả khác nhau, và trên web người chơi không hề được ra quyết định.
//
// Nhưng bố cục thì KHÔNG bắt chước điện thoại:
//   • Nhật ký trận nằm hẳn thành một cột cuộn được, thay cho ô thoại một dòng của app. Màn
//     rộng thì đọc lại được cả trận — thứ điện thoại không có chỗ để làm.
//   • Mỗi lệnh có phím tắt 1-5 (và A = tự đánh, Esc = bỏ trận), hiện luôn trên nút.
//   • Màn chọn quân là BẢNG nhiều cột: mỗi con một dòng, hệ số gây/nhận của cả 3 pha nằm
//     cạnh nhau để so bằng mắt, thay vì lưới ô vuông phải chạm từng con mới thấy.
const STEP = 560; // ms mỗi mẩu sự kiện trong một lượt
const HIT = 180; // ms từ lúc lao tới lúc trúng đòn
const AUTO_GAP = 240; // nghỉ giữa hai lượt khi bật Tự đánh

const hpColor = (r: number) => (r > 0.5 ? '#22C55E' : r > 0.2 ? '#EAB308' : '#EF4444');
const multColor = (m: number) => (m === 0 ? '#94A3B8' : m >= 2 ? '#22C55E' : m < 1 ? '#EF4444' : '#CBD5E1');
// Chiều NHẬN thì ngược lại: ×2 là xấu (đỏ), ×0.5 hoặc ×0 là tốt (xanh).
const takenColor = (m: number) => (m === 0 ? '#22C55E' : m >= 2 ? '#EF4444' : m < 1 ? '#22C55E' : '#94A3B8');
const fmtMult = (m: number) => (m === 0 ? '×0' : m === 0.25 ? '×¼' : m === 0.5 ? '×½' : `×${m}`);

// Bảng khắc hệ chạy CẢ HAI CHIỀU, nên xếp quân theo cả hai: cover (số pha ta gây ×2) trừ
// risk (số pha ta nhận ×2). Không trừ risk thì một con "đánh mạnh nhưng ăn đòn nặng" leo
// lên đầu bảng rồi bị boss xé trong hai lượt.
function rankRoster(roster: Fighter[], phases: BossPhase[]) {
  return roster
    .map((f) => ({ f, ...matchupOf(f.c.types, phases) }))
    .sort((a, b) => b.score - a.score || b.cover - a.cover || a.immune - b.immune || b.f.bst - a.f.bst);
}

// Thanh máu/vị trí đang VẼ. Tách khỏi LiveState vì state nhảy nguyên một lượt, còn hình thì
// phải nhích theo từng sự kiện mới thấy được đòn nào ăn bao nhiêu.
interface View {
  bossHp: number;
  hp: number[];
  active: number;
}

export default function BattleArena({ onClose, team, boss, tier, seed, auraTypes, makeBoss, onWin }: Props) {
  const [screen, setScreen] = useState<'select' | 'fight'>('select');
  const [picked, setPicked] = useState<string[]>([]);
  const previewPhases = useMemo(() => phasesOf(boss.types, auraTypes), [boss.types, auraTypes]);
  const ranked = useMemo(() => rankRoster(team, previewPhases), [team, previewPhases]);

  const [st, setSt] = useState<LiveState | null>(null);
  const [view, setView] = useState<View>({ bossHp: 0, hp: [], active: 0 });
  const [journal, setJournal] = useState<LiveEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [fx, setFx] = useState<{
    lunge: 'player' | 'boss' | null;
    hit: 'player' | 'boss' | null;
    guard: boolean;
    flash: 'crit' | 'special' | null; // chớp toàn màn: chí mạng / tuyệt chiêu
    tick: number;
  }>({ lunge: null, hit: null, guard: false, flash: null, tick: 0 });
  const [dmg, setDmg] = useState<{ id: number; val: number; side: 'boss' | 'player'; mult: number; crit: boolean } | null>(
    null
  );
  const [reward, setReward] = useState<{ candy: number; egg: boolean; item: HeldItem | null; already: boolean } | null>(null);

  const timers = useRef<number[]>([]);
  const dmgSeq = useRef(0);
  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);
  useEffect(() => clearTimers, [clearTimers]);

  // Trạng thái thật của trận đi qua ref, KHÔNG qua updater của setState.
  // Nếu tính lượt bên trong `setSt(cur => …)` thì StrictMode gọi updater hai lần -> hẹn giờ
  // hoạt ảnh bị đặt hai bộ, thanh máu tụt gấp đôi. Ref thì chỉ chạy một lần.
  const stRef = useRef<LiveState | null>(null);
  const busyRef = useRef(false);

  const lineup = useMemo(
    () => picked.map((k) => team.find((f) => f.c.key === k)).filter((f): f is Fighter => !!f),
    [picked, team]
  );

  const togglePick = (key: string) => {
    feedbackTap();
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : p.length < MAX_LINEUP ? [...p, key] : p));
  };

  const start = () => {
    if (!lineup.length) return;
    feedbackTap();
    // Boss mạnh theo đội hình ĐÃ CHỌN: mang đội khủng thì boss khủng theo (lineupScale).
    const power = lineup.reduce((s, f) => s + f.bst, 0);
    const s0 = startLive(lineup.map((f) => f.c), makeBoss(power), seed, auraTypes);
    stRef.current = s0;
    busyRef.current = false;
    setSt(s0);
    setView({ bossHp: s0.bossHp, hp: [...s0.hp], active: s0.active });
    setJournal([{ kind: 'phase', text: `Trận bắt đầu — ${s0.team[0].name} tiến lên!` }]);
    setScreen('fight');
  };

  // ===== Một lượt: gọi lõi rồi PHÁT LẠI từng sự kiện thành hoạt ảnh =====
  const act = useCallback(
    (action: LiveAction) => {
      const cur = stRef.current;
      if (!cur || cur.over || busyRef.current || !canAct(cur, action)) return;

      const next = stepLive(cur, action);
      stRef.current = next;
      busyRef.current = true;
      setSt(next);
      setBusy(true);
      setJournal((j) => [...j, ...next.log]);

      next.log.forEach((e, i) => {
        timers.current.push(
          window.setTimeout(() => {
            // Hoạt ảnh theo loại sự kiện.
            if (e.kind === 'player-hit' || e.kind === 'special') {
              if (e.kind === 'special') feedbackEvolve();
              setFx((f) => ({ ...f, lunge: 'player', hit: null, guard: false, flash: null, tick: f.tick + 1 }));
              timers.current.push(
                window.setTimeout(() => {
                  feedbackTap();
                  setFx((f) => ({
                    ...f,
                    hit: 'boss',
                    flash: e.kind === 'special' ? 'special' : e.crit ? 'crit' : f.flash,
                    tick: f.tick + 1,
                  }));
                  setView((v) => ({ ...v, bossHp: Math.max(0, v.bossHp - (e.dmg ?? 0)) }));
                  setDmg({ id: dmgSeq.current++, val: e.dmg ?? 0, side: 'boss', mult: e.mult ?? 1, crit: !!e.crit });
                }, HIT)
              );
            } else if (e.kind === 'boss-hit') {
              setFx((f) => ({ ...f, lunge: 'boss', hit: null, guard: false, flash: null, tick: f.tick + 1 }));
              timers.current.push(
                window.setTimeout(() => {
                  feedbackTap();
                  setFx((f) => ({ ...f, hit: 'player', flash: e.crit ? 'crit' : f.flash, tick: f.tick + 1 }));
                  setView((v) => {
                    const hp = [...v.hp];
                    hp[v.active] = Math.max(0, hp[v.active] - (e.dmg ?? 0));
                    return { ...v, hp };
                  });
                  setDmg({ id: dmgSeq.current++, val: e.dmg ?? 0, side: 'player', mult: e.mult ?? 1, crit: !!e.crit });
                }, HIT)
              );
            } else if (e.kind === 'block' || e.kind === 'charge') {
              setFx((f) => ({ ...f, guard: true, tick: f.tick + 1 }));
            } else if (e.kind === 'berry') {
              setView((v) => {
                const hp = [...v.hp];
                hp[v.active] = Math.min(cur.team[v.active].maxHp, hp[v.active] + (e.heal ?? 0));
                return { ...v, hp };
              });
            } else if (e.kind === 'drain' || e.kind === 'regen') {
              setView((v) => ({ ...v, bossHp: Math.min(cur.boss.maxHp, v.bossHp + (e.heal ?? 0)) }));
            } else if (e.kind === 'swap' && e.key) {
              const idx = cur.team.findIndex((c) => c.key === e.key);
              if (idx >= 0) setView((v) => ({ ...v, active: idx }));
            } else if (e.kind === 'faint' && e.key) {
              const idx = cur.team.findIndex((c) => c.key === e.key);
              if (idx >= 0)
                setView((v) => {
                  const hp = [...v.hp];
                  hp[idx] = 0;
                  return { ...v, hp };
                });
            }
          }, i * STEP)
        );
      });

      // Hết lượt: đồng bộ CỨNG về state thật để hình không lệch dần theo sai số cộng-trừ.
      const done = next.log.length * STEP;
      timers.current.push(
        window.setTimeout(() => {
          setView({ bossHp: next.bossHp, hp: [...next.hp], active: next.active });
          setDmg(null);
          setFx({ lunge: null, hit: null, guard: false, flash: null, tick: 0 });
          busyRef.current = false;
          setBusy(false);
          if (next.over === 'win') {
            feedbackEvolve();
            setReward(onWin());
          } else if (next.over === 'lose') {
            feedbackComplete();
          }
        }, done + 60)
      );
    },
    [onWin]
  );

  // Tự đánh: chờ lượt trước vẽ xong rồi đi tiếp.
  useEffect(() => {
    if (!auto || !st || st.over || busy) return;
    const id = window.setTimeout(() => act(autoAction(st)), AUTO_GAP);
    return () => window.clearTimeout(id);
  }, [auto, st, busy, act]);

  // ===== Phím tắt =====
  // Đây là thứ bản điện thoại không thể có, và là lý do chính khiến đánh boss trên máy tính
  // nhanh hơn: cả trận chơi được bằng một bàn tay, không rời mắt khỏi ý đồ của boss.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (screen === 'select') {
        if (e.key === 'Enter' && picked.length) {
          e.preventDefault();
          start();
        }
        return;
      }
      if (!st || st.over || busy) return;

      const map: Record<string, LiveAction> = {
        '1': { kind: 'attack' },
        '2': { kind: 'block' },
        '3': { kind: 'charge' },
        '4': { kind: 'berry' },
        '6': { kind: 'special' },
      };
      const hit = map[e.key];
      if (hit) {
        e.preventDefault();
        if (canAct(st, hit)) act(hit);
        return;
      }
      // 5 = đổi sang con dự bị còn sống đầu tiên.
      if (e.key === '5') {
        e.preventDefault();
        const idx = st.hp.findIndex((h, i) => h > 0 && i !== st.active);
        if (idx >= 0) act({ kind: 'swap', index: idx });
        return;
      }
      if (e.key === 'a' || e.key === 'A') {
        e.preventDefault();
        setAuto((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, st, busy, picked, act, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <div className="app-bg absolute inset-0 opacity-60" />

      {screen === 'select' ? (
        <SelectView
          boss={boss}
          tier={tier}
          phases={previewPhases}
          ranked={ranked}
          picked={picked}
          onToggle={togglePick}
          onStart={start}
          onClose={onClose}
        />
      ) : (
        st && (
          <FightView
            st={st}
            view={view}
            team={team}
            journal={journal}
            tier={tier}
            busy={busy}
            auto={auto}
            fx={fx}
            dmg={dmg}
            reward={reward}
            onAct={act}
            onToggleAuto={() => setAuto((v) => !v)}
            onClose={onClose}
          />
        )
      )}
    </div>
  );
}

/* ===================== MÀN CHỌN QUÂN ===================== */

function SelectView({
  boss,
  tier,
  phases,
  ranked,
  picked,
  onToggle,
  onStart,
  onClose,
}: {
  boss: Combatant;
  tier: { label: string; color: string };
  phases: BossPhase[];
  ranked: ReturnType<typeof rankRoster>;
  picked: string[];
  onToggle: (k: string) => void;
  onStart: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <header className="safe-top relative flex items-center justify-between gap-4 border-b border-line px-5 py-4 lg:px-8">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-ink lg:text-2xl">Chọn quân xuất chiến</h2>
          <p className="mt-0.5 text-[13px] text-ink-dim">
            Tối đa {MAX_LINEUP} con · thứ tự bấm = thứ tự ra sân · boss đổi hệ mỗi pha nên hãy phủ đủ 3 pha
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex shrink-0 items-center gap-2 rounded-pill border border-line bg-card px-4 py-2 text-[13px] font-extrabold text-ink-dim transition-colors hover:text-ink"
        >
          Để sau
          <Kbd>Esc</Kbd>
        </button>
      </header>

      <div className="scroller relative min-h-0 flex-1">
        <div className="mx-auto grid max-w-[1500px] items-start gap-6 p-5 lg:grid-cols-[360px_minmax(0,1fr)] lg:p-8">
          <BossBrief boss={boss} tier={tier} phases={phases} />

          <div>
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h3 className="text-[15px] font-extrabold text-ink">
                Bầy của bạn <span className="font-semibold text-ink-dim">({ranked.length} con)</span>
              </h3>
              <p className="text-[12.5px] text-ink-dim">Đã xếp con đáng mang nhất lên đầu</p>
            </div>

            {/* Bảng, không phải lưới ô vuông: mỗi dòng một con, cột ⚔/🛡 của cả 3 pha nằm
                cạnh nhau nên so được bằng mắt mà không phải chạm vào từng con. */}
            <div className="overflow-hidden rounded-card border border-line bg-card">
              <div className="hidden items-center gap-3 border-b border-line bg-card-alt/60 px-4 py-2 text-[11px] font-extrabold tracking-wide text-ink-dim uppercase sm:flex">
                <span className="w-11" />
                <span className="min-w-0 flex-1">Pokémon</span>
                <span className="w-[186px] text-center">
                  Hệ số theo pha
                  <span className="ml-1.5 font-bold normal-case">(trên: ta gây · dưới: ta nhận)</span>
                </span>
                <span className="nums w-12 text-right">Lực</span>
                <span className="w-16" />
              </div>
              <ul>
                {ranked.map(({ f, mults, taken, cover, risk, immune }) => {
                  const order = picked.indexOf(f.c.key);
                  const on = order >= 0;
                  const full = picked.length >= MAX_LINEUP && !on;
                  return (
                    <li key={f.c.key} className="border-b border-line/60 last:border-b-0">
                      <button
                        type="button"
                        onClick={() => onToggle(f.c.key)}
                        aria-pressed={on}
                        aria-label={
                          `${f.c.name} — lực ${f.bst}, gây ${mults.map(fmtMult).join('/')}, nhận ${taken
                            .map(fmtMult)
                            .join('/')}` + (on ? `, đang chọn thứ ${order + 1}` : '')
                        }
                        // Lưới đặt ô TƯỜNG MINH cho hai cỡ màn, không dùng flex-wrap.
                        // flex-wrap để tự xuống dòng thì trên 375px cột 186px của phần hệ số
                        // bóp cột tên còn ~60px: tên thành "Sno…" và mấy pill "ĂN NẶNG 1 PHA"
                        // co lại thành hình tròn có chữ gãy bên trong.
                        //   điện thoại: [ảnh][tên      ][chọn]
                        //               [ảnh][hệ số    ][lực ]
                        //   sm trở lên: [ảnh][tên][hệ số][lực][chọn]  — một dòng
                        className={
                          'grid w-full grid-cols-[44px_minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-4 py-3 text-left transition-colors sm:grid-cols-[44px_minmax(0,1fr)_186px_3rem_4.5rem] sm:items-center sm:gap-y-0 sm:py-2.5 ' +
                          (on ? 'bg-primary/12' : full ? 'opacity-45 hover:bg-card-alt/40' : 'hover:bg-card-alt/60')
                        }
                      >
                        <span className="relative col-start-1 row-start-1 row-span-2 grid size-11 shrink-0 place-items-center self-center sm:row-span-1">
                          <CreatureImage formId={f.c.id} shiny={f.shiny} size={44} />
                          {on && (
                            <span
                              className="nums absolute -top-1 -left-1 grid size-5 place-items-center rounded-full text-[11px] font-black text-white"
                              style={{ background: tier.color }}
                            >
                              {order + 1}
                            </span>
                          )}
                        </span>

                        <span className="col-start-2 row-start-1 min-w-0">
                          <span className="block truncate text-[14.5px] font-bold text-ink capitalize">
                            {f.shiny ? '✨ ' : ''}
                            {f.c.name}
                            {f.item && (
                              <span className="ml-1.5 inline-block align-middle" title={`${f.item.name} · ${f.item.desc}`}>
                                <ItemSprite item={f.item} size={18} />
                              </span>
                            )}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            {f.c.types.map((t) => (
                              <TypeChip key={t} t={t} small />
                            ))}
                            {immune > 0 && (
                              <span className="rounded-pill bg-line px-1.5 py-px text-[9.5px] font-black whitespace-nowrap text-ink-dim">
                                VÔ HIỆU {immune} PHA
                              </span>
                            )}
                            {risk > 0 && (
                              <span className="rounded-pill bg-red/20 px-1.5 py-px text-[9.5px] font-black whitespace-nowrap text-red">
                                ĂN NẶNG {risk} PHA
                              </span>
                            )}
                            {cover > 0 && risk === 0 && (
                              <span className="rounded-pill bg-green/20 px-1.5 py-px text-[9.5px] font-black whitespace-nowrap text-green">
                                KHẮC {cover} PHA
                              </span>
                            )}
                          </span>
                        </span>

                        <span className="col-start-2 row-start-2 flex gap-1.5 sm:col-start-3 sm:row-start-1">
                          {/* Hai số xếp trên/dưới: trên = đòn TA gây, dưới = đòn ta NHẬN.
                              Không nhét emoji ⚔/🛡 vào ô 56px — ở cỡ đó chúng thành vệt mờ
                              vô nghĩa; hàng tiêu đề của cột đã nói rõ trên/dưới là gì. */}
                          {phases.map((_, i) => (
                            <span
                              key={i}
                              title={`Pha ${i + 1}: ta gây ${fmtMult(mults[i])}, ta nhận ${fmtMult(taken[i])}`}
                              className="nums grid flex-1 gap-0.5 rounded-ctl border border-line bg-card-alt px-1 py-1 text-center"
                            >
                              <span className="text-[9px] font-bold text-ink-dim">PHA {i + 1}</span>
                              <span className="text-[13px] font-black" style={{ color: multColor(mults[i]) }}>
                                {fmtMult(mults[i])}
                              </span>
                              <span
                                className="border-t border-line/70 pt-0.5 text-[11.5px] font-black"
                                style={{ color: takenColor(taken[i]) }}
                              >
                                {fmtMult(taken[i])}
                              </span>
                            </span>
                          ))}
                        </span>

                        <span className="nums col-start-3 row-start-2 self-center justify-self-end text-[13px] font-extrabold text-accent sm:col-start-4 sm:row-start-1 sm:justify-self-stretch sm:text-right">
                          ⚡{f.bst}
                        </span>

                        <span
                          className={
                            // self-start: ô lưới mặc định giãn hết chiều cao dòng, nên trên
                            // điện thoại (dòng cao vì có tên + pill) viên pill này phình
                            // thành hình bầu dục cao bằng cả dòng.
                            'col-start-3 row-start-1 justify-self-end self-start rounded-pill px-3 py-1 text-center text-[11.5px] font-extrabold sm:col-start-5 sm:row-start-1 sm:w-full sm:justify-self-stretch sm:self-center sm:px-2 ' +
                            (on ? 'text-white' : 'border border-line text-ink-dim')
                          }
                          style={on ? { background: tier.color } : undefined}
                        >
                          {on ? `#${order + 1}` : 'Chọn'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      </div>

      <footer className="safe-bottom relative flex flex-wrap items-center justify-between gap-4 border-t border-line bg-bg-soft px-5 py-4 lg:px-8">
        <div className="flex min-w-0 items-center gap-2">
          {Array.from({ length: MAX_LINEUP }, (_, i) => {
            const k = picked[i];
            const f = k ? ranked.find((r) => r.f.c.key === k)?.f : null;
            return (
              <span
                key={i}
                className={
                  'grid size-12 place-items-center rounded-ctl border ' +
                  (f ? 'border-primary bg-primary/10' : 'border-dashed border-line')
                }
              >
                {f ? (
                  <CreatureImage formId={f.c.id} shiny={f.shiny} size={40} />
                ) : (
                  <span className="nums text-[15px] font-black text-ink-dim">{i + 1}</span>
                )}
              </span>
            );
          })}
          <p className="ml-2 max-w-md text-[12.5px] leading-snug text-ink-dim">
            Đội càng mạnh thì boss cũng mạnh theo, nên chọn con <span className="font-bold text-ink">khắc hệ</span> quan
            trọng hơn chọn con nhiều lực.
          </p>
        </div>
        <button
          type="button"
          onClick={onStart}
          disabled={!picked.length}
          className="flex items-center gap-2 rounded-pill bg-primary px-7 py-3 font-extrabold text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Xuất chiến ({picked.length}/{MAX_LINEUP})
          <Kbd dark>Enter</Kbd>
        </button>
      </footer>
    </>
  );
}

// Thẻ boss ở màn chọn: ảnh + 3 pha, để biết trận sẽ đổi sang hệ gì.
function BossBrief({ boss, tier, phases }: { boss: Combatant; tier: { label: string; color: string }; phases: BossPhase[] }) {
  return (
    <div className="rounded-card border border-line bg-card p-5 lg:sticky lg:top-8">
      <div className="flex items-center gap-4">
        <span
          className="grid size-24 shrink-0 place-items-center rounded-card border-[1.5px] bg-card-alt"
          style={{ borderColor: tier.color }}
        >
          <CreatureImage formId={boss.id} size={88} />
        </span>
        <div className="min-w-0">
          <span
            className="inline-block rounded-pill px-2.5 py-0.5 text-[11px] font-black text-white"
            style={{ background: tier.color }}
          >
            {tier.label}
          </span>
          <h3 className="mt-1.5 truncate text-xl font-extrabold text-ink capitalize">{boss.name}</h3>
          <p className="nums mt-0.5 text-[13px] font-bold text-ink-dim">{boss.maxHp} HP cơ bản</p>
        </div>
      </div>

      <h4 className="mt-5 mb-2 text-[12.5px] font-extrabold text-ink">Boss đổi hệ theo 3 pha máu</h4>
      <ol className="grid gap-1.5">
        {phases.map((p, i) => (
          <li
            key={i}
            className="flex items-center gap-2 rounded-ctl border border-line bg-card-alt px-3 py-2"
          >
            <span className="nums w-12 shrink-0 text-[11px] font-black text-ink-dim">PHA {i + 1}</span>
            <span className="flex flex-1 flex-wrap gap-1">
              {p.types.map((t) => (
                <TypeChip key={t} t={t} />
              ))}
            </span>
            {p.enraged && (
              <span className="shrink-0 rounded-pill bg-red/20 px-2 py-0.5 text-[10px] font-black text-red">
                NỔI GIẬN
              </span>
            )}
          </li>
        ))}
      </ol>

      <h4 className="mt-5 mb-2 text-[12.5px] font-extrabold text-ink">Cách thắng</h4>
      <ul className="grid gap-1.5 text-[12.5px] leading-relaxed text-ink-dim">
        <li>
          Boss <span className="font-bold text-ink">báo trước</span> đòn của lượt sau — đọc rồi mới chọn lệnh.
        </li>
        <li>
          <span className="font-bold text-ink">Đỡ</span> đúng ĐÒN NẶNG chặn {Math.round((1 - BLOCK_TAKEN) * 100)}% sát
          thương và phản lại Áp Chế.
        </li>
        <li>
          <span className="font-bold text-ink">Dồn lực</span> ×{CHARGE_MUL} — để dành cho lượt boss phòng thủ.
        </li>
        <li>
          Đủ {STAGGER_MAX} Áp Chế là boss <span className="font-bold text-ink">choáng</span>, mất nguyên một lượt.
        </li>
        <li>
          Ra đòn / trúng đòn tích NỘ — đầy {SPECIAL_ENERGY} điểm là bung{' '}
          <span className="font-bold text-ink">TUYỆT CHIÊU</span> ×{SPECIAL_MUL} xuyên phòng thủ.
        </li>
      </ul>
    </div>
  );
}

/* ===================== MÀN ĐẤU ===================== */

function FightView({
  st,
  view,
  team,
  journal,
  tier,
  busy,
  auto,
  fx,
  dmg,
  reward,
  onAct,
  onToggleAuto,
  onClose,
}: {
  st: LiveState;
  view: View;
  team: Fighter[];
  journal: LiveEvent[];
  tier: { label: string; color: string };
  busy: boolean;
  auto: boolean;
  fx: { lunge: 'player' | 'boss' | null; hit: 'player' | 'boss' | null; guard: boolean; flash: 'crit' | 'special' | null; tick: number };
  dmg: { id: number; val: number; side: 'boss' | 'player'; mult: number; crit: boolean } | null;
  reward: { candy: number; egg: boolean; item: HeldItem | null; already: boolean } | null;
  onAct: (a: LiveAction) => void;
  onToggleAuto: () => void;
  onClose: () => void;
}) {
  const shinyOf = (key: string) => team.find((f) => f.c.key === key)?.shiny ?? false;
  const itemOf = (key: string) => team.find((f) => f.c.key === key)?.item ?? null;
  const me = st.team[view.active];
  const bossNow = bossAtPhase(st.boss, st.phases, st.phase);
  const intent = INTENT_VI[st.intent];
  const alive = st.hp.filter((h) => h > 0).length;
  // Chiêu SẼ dùng ở lượt này (khớp rollDamage) — hiện ngay trên nút Đánh cho sinh động.
  const myMove = pickMove(me, bossNow.types);
  const mySig = signatureMove(me);

  return (
    <>
      <header className="safe-top relative flex items-center justify-between gap-4 border-b border-line px-5 py-3 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="shrink-0 rounded-pill px-2.5 py-0.5 text-[11px] font-black text-white"
            style={{ background: tier.color }}
          >
            {tier.label}
          </span>
          <h2 className="truncate text-[17px] font-extrabold text-ink capitalize">{st.boss.name}</h2>
          <PhasePips phase={st.phase} phases={st.phases} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="nums hidden text-[12.5px] font-bold text-ink-dim sm:inline">Lượt {st.turn}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex items-center gap-2 rounded-pill border border-line bg-card px-3.5 py-1.5 text-[12.5px] font-extrabold text-ink-dim transition-colors hover:text-red"
          >
            Bỏ trận
            <Kbd>Esc</Kbd>
          </button>
        </div>
      </header>

      <div className="relative grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* Chớp toàn màn: trắng đỏ khi CHÍ MẠNG, tím khi TUYỆT CHIÊU — đòn to phải rung màn. */}
        {fx.flash && (
          <div
            key={`fl-${fx.tick}`}
            className="anim-flash pointer-events-none absolute inset-0 z-20"
            style={{
              background:
                fx.flash === 'special'
                  ? 'radial-gradient(circle, #E879F9AA 0%, #A855F755 45%, transparent 75%)'
                  : 'radial-gradient(circle, #FFFFFFCC 0%, #F8717155 50%, transparent 80%)',
            }}
          />
        )}
        {/* ===== Sân đấu ===== */}
        <div className="scroller flex min-h-0 flex-col gap-4 p-5 lg:p-8">
          {/* Ý đồ boss: to và nằm trên cùng, vì đây là thông tin quyết định cả lượt. */}
          <div
            className="flex flex-wrap items-center gap-3 rounded-card border-[1.5px] px-4 py-3"
            style={{ borderColor: intent.color, background: intent.color + '18' }}
            aria-live="polite"
          >
            <span className="text-[12px] font-extrabold tracking-wide text-ink-dim uppercase">Lượt tới boss sẽ</span>
            <span className="text-[17px] font-black" style={{ color: intent.color }}>
              {intent.label}
            </span>
            <span className="text-[12.5px] font-semibold text-ink-dim">{intent.hint}</span>
          </div>

          <div className="grid flex-1 content-center gap-2">
            {/* Boss */}
            <div className="flex items-start justify-between gap-4">
              <HpCard
                name={st.boss.name}
                types={bossNow.types}
                cur={view.bossHp}
                max={st.boss.maxHp}
                wide
                extra={<StaggerMeter value={st.stagger} />}
              />
              <div
                key={`b-${fx.tick}`}
                className={
                  'relative grid shrink-0 place-items-center ' +
                  (fx.lunge === 'boss' ? 'anim-lunge-down ' : '') +
                  (fx.hit === 'boss' ? 'anim-hit' : '')
                }
              >
                <Platform />
                <CreatureImage formId={st.boss.id} size={148} className="relative" />
                {dmg?.side === 'boss' && <DmgNumber key={dmg.id} {...dmg} />}
              </div>
            </div>

            <p className="text-center text-[11px] font-black tracking-[0.2em] text-ink-dim">VS</p>

            {/* Con đang ra sân */}
            <div className="flex items-end justify-between gap-4">
              <div
                key={`p-${fx.tick}`}
                className={
                  'relative grid shrink-0 place-items-center ' +
                  (fx.lunge === 'player' ? 'anim-lunge-up ' : '') +
                  (fx.hit === 'player' ? 'anim-hit ' : '') +
                  (fx.guard ? 'anim-guard' : '')
                }
              >
                <Platform />
                <CreatureImage formId={me.id} shiny={shinyOf(me.key)} size={148} className="relative" />
                {dmg?.side === 'player' && <DmgNumber key={dmg.id} {...dmg} />}
              </div>
              <HpCard
                name={me.name}
                types={me.types}
                cur={view.hp[view.active] ?? 0}
                max={me.maxHp}
                extra={
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {st.charge && (
                      <span className="rounded-pill bg-accent/20 px-2 py-0.5 text-[10.5px] font-black text-accent">
                        ⚡ DỒN LỰC ×{CHARGE_MUL}
                      </span>
                    )}
                    {itemOf(me.key) && (
                      <span
                        className="flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10.5px] font-black"
                        style={{ color: RARITY[itemOf(me.key)!.rarity].color, background: RARITY[itemOf(me.key)!.rarity].color + '22' }}
                        title={`[${RARITY[itemOf(me.key)!.rarity].label}] ${itemOf(me.key)!.name} · ${itemOf(me.key)!.desc}`}
                      >
                        <ItemSprite item={itemOf(me.key)!} size={16} /> {itemOf(me.key)!.desc}
                      </span>
                    )}
                    <span className="nums rounded-pill bg-card-alt px-2 py-0.5 text-[10.5px] font-black text-ink-dim">
                      🍓 {st.berries}/{BERRY_COUNT}
                    </span>
                    <span className="nums rounded-pill bg-card-alt px-2 py-0.5 text-[10.5px] font-black text-ink-dim">
                      Còn {alive}/{st.team.length} con
                    </span>
                  </div>
                }
              />
            </div>
          </div>

          <BenchStrip st={st} view={view} shinyOf={shinyOf} itemOf={itemOf} busy={busy} onSwap={(i) => onAct({ kind: 'swap', index: i })} />

          {/* Màn hẹp không đủ chỗ cho cột nhật ký, nhưng bỏ hẳn thì người chơi mất luôn lời
              thuật — còn tệ hơn bản điện thoại cũ (vốn có một dòng thoại). Nên ở đây giữ
              dòng MỚI NHẤT, cùng màu với loại sự kiện. */}
          {journal.length > 0 && (
            <p
              aria-live="polite"
              className={
                'border-l-2 pl-2.5 text-[13px] leading-snug font-semibold lg:hidden ' +
                (LOG_TONE[journal[journal.length - 1].kind] ?? 'border-line text-ink-dim')
              }
            >
              {journal[journal.length - 1].text}
            </p>
          )}
        </div>

        {/* ===== Nhật ký trận =====
            Cột riêng, cuộn được, giữ CẢ trận. Trên điện thoại chỉ có một dòng thoại nên mất
            lượt là mất thông tin; ở đây đọc lại được vì sao mình thua. */}
        <LogPanel journal={journal} />
      </div>

      {/* ===== Bảng lệnh ===== */}
      <footer className="safe-bottom relative border-t border-line bg-bg-soft px-5 py-4 lg:px-8">
        {st.over ? (
          <ResultBar win={st.over === 'win'} reward={reward} onClose={onClose} />
        ) : (
          <div className="flex flex-wrap items-center gap-2.5">
            <CmdBtn k="1" label="Đánh" hint={myMove ? `${myMove.move.name} ×${myMove.mult}` : 'Ra đòn'}
              tone="primary" disabled={busy} onClick={() => onAct({ kind: 'attack' })} />
            <CmdBtn
              k="2"
              label="Đỡ đòn"
              hint={`Chặn ${Math.round((1 - BLOCK_TAKEN) * 100)}%`}
              tone="blue"
              disabled={busy}
              onClick={() => onAct({ kind: 'block' })}
            />
            <CmdBtn
              k="3"
              label="Dồn lực"
              hint={`Đòn sau ×${CHARGE_MUL}`}
              tone="amber"
              disabled={busy || !canAct(st, { kind: 'charge' })}
              onClick={() => onAct({ kind: 'charge' })}
            />
            <CmdBtn
              k="4"
              label="Berry"
              hint={`Hồi máu · còn ${st.berries}`}
              tone="green"
              disabled={busy || !canAct(st, { kind: 'berry' })}
              onClick={() => onAct({ kind: 'berry' })}
            />
            <CmdBtn
              k="6"
              label={`🌟 ${mySig?.name ?? 'Tuyệt chiêu'} ${Math.min(st.energy[st.active] ?? 0, SPECIAL_ENERGY)}/${SPECIAL_ENERGY}`}
              hint={`tuyệt chiêu ×${SPECIAL_MUL} · xuyên phòng thủ · +Áp Chế`}
              tone="violet"
              disabled={busy || !canAct(st, { kind: 'special' })}
              onClick={() => onAct({ kind: 'special' })}
            />
            <CmdBtn
              k="5"
              label="Đổi con"
              hint="Mất lượt này"
              tone="plain"
              disabled={busy || alive < 2}
              onClick={() => {
                const idx = st.hp.findIndex((h, i) => h > 0 && i !== st.active);
                if (idx >= 0) onAct({ kind: 'swap', index: idx });
              }}
            />

            <button
              type="button"
              onClick={onToggleAuto}
              aria-pressed={auto}
              className={
                'ml-auto flex items-center gap-2 rounded-pill border px-4 py-2.5 text-[13px] font-extrabold transition-colors ' +
                (auto ? 'border-accent bg-accent/15 text-accent' : 'border-line bg-card text-ink-dim hover:text-ink')
              }
            >
              {auto ? 'Đang tự đánh…' : 'Tự đánh'}
              <Kbd>A</Kbd>
            </button>
          </div>
        )}
      </footer>

      {st.over === 'win' && <Confetti />}
    </>
  );
}

/* ===================== MẢNH GHÉP ===================== */

// Phím tắt chỉ hiện từ `sm` trở lên: in hình keycap "Esc"/"Enter"/"1" trên máy cảm ứng là
// dạy người dùng một thứ họ không bấm được.
function Kbd({ children, dark }: { children: string; dark?: boolean }) {
  return (
    <kbd
      className={
        'hidden rounded border px-1.5 py-px font-sans text-[10px] font-black sm:inline-block ' +
        (dark ? 'border-white/40 text-white/85' : 'border-line text-ink-dim')
      }
    >
      {children}
    </kbd>
  );
}

function Platform() {
  return <span className="absolute bottom-1 h-[22px] w-32 rounded-[50%] bg-black/25 blur-[2px]" />;
}

function TypeChip({ t, small }: { t: string; small?: boolean }) {
  return (
    <span
      className={
        'rounded-pill font-extrabold text-white ' + (small ? 'px-1.5 py-px text-[9.5px]' : 'px-2 py-0.5 text-[11px]')
      }
      style={{ background: typeColor(t) }}
    >
      {typeLabel(t)}
    </span>
  );
}

function PhasePips({ phase, phases }: { phase: number; phases: BossPhase[] }) {
  return (
    <span className="hidden items-center gap-1 sm:flex" aria-label={`Pha ${phase + 1} trên ${phases.length}`}>
      {phases.map((p, i) => (
        <span
          key={i}
          title={`Pha ${i + 1}: ${p.types.map(typeLabel).join(' / ')}`}
          className={'h-1.5 rounded-pill transition-all ' + (i === phase ? 'w-7' : 'w-3.5')}
          style={{ background: i <= phase ? (p.enraged ? '#EF4444' : typeColor(p.types[0])) : 'var(--color-line)' }}
        />
      ))}
    </span>
  );
}

function HpBar({ cur, max }: { cur: number; max: number }) {
  const r = max > 0 ? Math.max(0, Math.min(1, cur / max)) : 0;
  return (
    <span className="block h-2.5 w-full overflow-hidden rounded-pill bg-track">
      <span
        className="block h-full rounded-pill transition-[width] duration-300 ease-out"
        style={{ width: `${r * 100}%`, background: hpColor(r) }}
      />
    </span>
  );
}

function HpCard({
  name,
  types,
  cur,
  max,
  extra,
  wide,
}: {
  name: string;
  types: string[];
  cur: number;
  max: number;
  extra?: ReactNode;
  wide?: boolean;
}) {
  const r = max > 0 ? cur / max : 0;
  return (
    // Co được trên màn hẹp: bề rộng cứng 288/320px cộng với con sprite là quá 375px, nên tên
    // bị cắt thành "Jir…". Từ `sm` mới chốt bề rộng để hai thẻ thẳng hàng nhau.
    <div
      className={
        'min-w-0 flex-1 rounded-card border border-line bg-card/90 p-3 backdrop-blur-sm sm:flex-none ' +
        (wide ? 'sm:w-80' : 'sm:w-72')
      }
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[15px] font-extrabold text-ink capitalize">{name}</p>
        <span className="flex shrink-0 gap-1">
          {types.map((t) => (
            <TypeChip key={t} t={t} small />
          ))}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <HpBar cur={cur} max={max} />
        <span className="nums shrink-0 text-[12px] font-extrabold" style={{ color: hpColor(r) }}>
          {Math.max(0, Math.round(cur))}/{max}
        </span>
      </div>
      {extra}
    </div>
  );
}

// Thanh Áp Chế của boss: đầy là boss choáng mất một lượt.
function StaggerMeter({ value }: { value: number }) {
  const full = value >= STAGGER_MAX;
  return (
    <div className="mt-2" title="Đánh khắc hệ hoặc đỡ trúng ĐÒN NẶNG để tích. Đầy thanh: boss choáng một lượt.">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-extrabold tracking-wide text-ink-dim uppercase">Áp chế</span>
        <span className={'nums text-[10.5px] font-black ' + (full ? 'text-accent' : 'text-ink-dim')}>
          {Math.min(value, STAGGER_MAX)}/{STAGGER_MAX}
        </span>
      </div>
      <div className="mt-1 flex gap-1">
        {Array.from({ length: STAGGER_MAX }, (_, i) => (
          <span
            key={i}
            className={'h-1.5 flex-1 rounded-pill transition-colors ' + (i < value ? 'bg-accent' : 'bg-track')}
          />
        ))}
      </div>
    </div>
  );
}

// Đội hình dự bị: bấm để đổi (mất lượt). Con gục thì mờ và không bấm được.
function BenchStrip({
  st,
  view,
  shinyOf,
  itemOf,
  busy,
  onSwap,
}: {
  st: LiveState;
  view: View;
  shinyOf: (k: string) => boolean;
  itemOf: (k: string) => HeldItem | null;
  busy: boolean;
  onSwap: (i: number) => void;
}) {
  if (st.team.length < 2) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[11px] font-extrabold tracking-wide text-ink-dim uppercase">Đội hình</span>
      {st.team.map((c, i) => {
        const hp = view.hp[i] ?? 0;
        const out = hp <= 0;
        const on = i === view.active;
        return (
          <button
            key={c.key}
            type="button"
            disabled={out || on || busy || !!st.over}
            onClick={() => onSwap(i)}
            title={out ? `${c.name} đã gục` : on ? `${c.name} đang ra sân` : `Đổi sang ${c.name}`}
            className={
              'flex items-center gap-2 rounded-ctl border px-2 py-1.5 transition-colors ' +
              (on
                ? 'border-primary bg-primary/12'
                : out
                  ? 'border-line opacity-40'
                  : 'border-line bg-card hover:border-primary/60')
            }
          >
            <CreatureImage formId={c.id} shiny={shinyOf(c.key)} size={30} />
            <span className="grid gap-0.5 text-left">
              <span className="max-w-24 truncate text-[11.5px] font-bold text-ink capitalize">
                {itemOf(c.key) ? `${itemOf(c.key)!.emoji} ` : ''}{c.name}
              </span>
              <span className="block w-16">
                <HpBar cur={hp} max={c.maxHp} />
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Màu/khối cho từng loại sự kiện trong nhật ký.
const LOG_TONE: Record<LiveEvent['kind'], string> = {
  'player-hit': 'text-green border-green/40',
  special: 'text-[#E879F9] border-[#E879F9]/50',
  'boss-hit': 'text-red border-red/40',
  charge: 'text-accent border-accent/40',
  block: 'text-[#60A5FA] border-[#60A5FA]/40',
  swap: 'text-primary-soft border-primary/40',
  berry: 'text-green border-green/40',
  break: 'text-accent border-accent/60',
  guard: 'text-[#60A5FA] border-[#60A5FA]/40',
  drain: 'text-[#C084FC] border-[#C084FC]/40',
  faint: 'text-red border-red/50',
  phase: 'text-ink border-line',
  regen: 'text-[#C084FC] border-[#C084FC]/40',
  shatter: 'text-red border-red/50',
};

function LogPanel({ journal }: { journal: LiveEvent[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' });
  }, [journal.length]);

  return (
    <aside className="hidden min-h-0 flex-col border-l border-line bg-bg-soft/60 lg:flex">
      <h3 className="border-b border-line px-4 py-3 text-[12px] font-extrabold tracking-wide text-ink-dim uppercase">
        Nhật ký trận
      </h3>
      <div className="scroller min-h-0 flex-1 px-4 py-3">
        <ol className="grid gap-1.5">
          {journal.map((e, i) => (
            <li
              key={i}
              className={'border-l-2 pl-2.5 text-[12.5px] leading-snug font-semibold ' + (LOG_TONE[e.kind] ?? 'text-ink-dim border-line')}
            >
              {e.text}
            </li>
          ))}
        </ol>
        <div ref={end} />
      </div>
    </aside>
  );
}

type CmdTone = 'primary' | 'blue' | 'amber' | 'green' | 'violet' | 'plain';

function CmdBtn({
  k,
  label,
  hint,
  tone,
  disabled,
  onClick,
}: {
  k: string;
  label: string;
  hint: string;
  tone: CmdTone;
  disabled?: boolean;
  onClick: () => void;
}) {
  const skin: Record<CmdTone, string> = {
    primary: 'border-primary bg-primary text-white hover:brightness-110',
    blue: 'border-[#3B82F6] bg-[#3B82F6]/15 text-[#93C5FD] hover:bg-[#3B82F6]/25',
    amber: 'border-accent bg-accent/15 text-accent hover:bg-accent/25',
    green: 'border-green bg-green/15 text-green hover:bg-green/25',
    violet: 'border-[#A855F7] bg-[#A855F7]/15 text-[#E879F9] hover:bg-[#A855F7]/25',
    plain: 'border-line bg-card text-ink hover:border-primary/60',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'grid min-w-28 gap-0.5 rounded-ctl border-[1.5px] px-4 py-2.5 text-left transition-all active:translate-y-px disabled:cursor-not-allowed disabled:opacity-35 ' +
        skin[tone]
      }
    >
      <span className="flex items-center gap-2">
        <span className="text-[14px] font-extrabold">{label}</span>
        <span className="ml-auto hidden rounded border border-current px-1 text-[10px] font-black opacity-60 sm:inline-block">
          {k}
        </span>
      </span>
      <span className="text-[11px] font-semibold opacity-70">{hint}</span>
    </button>
  );
}

function DmgNumber({ val, mult, crit }: { val: number; mult: number; crit: boolean }) {
  const color = crit ? '#F87171' : mult === 0 ? '#94A3B8' : mult >= 2 ? '#FDE047' : mult < 1 ? '#93C5FD' : '#fff';
  const size = crit ? 46 : mult >= 2 ? 38 : 30;
  return (
    <>
      {/* Vụ nổ va chạm: vòng xung kích + quầng sáng màu theo đòn — số bay lên không thôi
          thì cú đánh không có "trọng lượng". */}
      {val > 0 && (
        <>
          <span
            className="anim-burst pointer-events-none absolute inset-0 m-auto rounded-full"
            style={{ width: crit ? 120 : 92, height: crit ? 120 : 92, border: `3px solid ${color}` }}
          />
          <span
            className="anim-burst-glow pointer-events-none absolute inset-0 m-auto rounded-full"
            style={{ width: 70, height: 70, background: `radial-gradient(circle, ${color}66 0%, transparent 70%)` }}
          />
        </>
      )}
      <span className="nums anim-dmg pointer-events-none absolute top-1 font-black drop-shadow" style={{ fontSize: size, color }}>
        -{val}
        {crit ? '!' : ''}
      </span>
    </>
  );
}

function ResultBar({
  win,
  reward,
  onClose,
}: {
  win: boolean;
  reward: { candy: number; egg: boolean; item: HeldItem | null; already: boolean } | null;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <p className={'text-xl font-extrabold tracking-tight ' + (win ? 'text-green' : 'text-ink')}>
          {win ? '🏆 Chiến thắng!' : '💫 Thất bại'}
        </p>
        <p className="mt-0.5 text-[13px] font-semibold text-ink-dim">
          {win
            ? `${
                reward && reward.candy > 0
                  ? `Phần thưởng: 🍬 +${reward.candy} kẹo`
                  : 'Lượt boss này đã hạ trước đó — không thêm kẹo, nhưng luyện tập tốt'
              }${reward?.egg ? ' · 🥚 +1 trứng thưởng' : ''}`
            : 'Cả đội đã kiệt sức. Nuôi lớn thêm rồi quay lại phục thù.'}
        </p>
        {/* Món rơi: hàng riêng có ẢNH + màu bậc hiếm — chiến lợi phẩm phải ra dáng chiến lợi phẩm. */}
        {win && reward?.item && (
          <p
            className="anim-pop mt-1.5 inline-flex items-center gap-2 rounded-pill border-[1.5px] px-3 py-1 text-[12.5px] font-extrabold"
            style={{ borderColor: RARITY[reward.item.rarity].color, color: RARITY[reward.item.rarity].color, background: RARITY[reward.item.rarity].color + '14' }}
          >
            <ItemSprite item={reward.item} size={24} />
            Rơi [{RARITY[reward.item.rarity].label}] {reward.item.name} · {reward.item.desc}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="rounded-pill bg-primary px-7 py-3 font-extrabold text-white transition-colors hover:brightness-110"
      >
        Xong
      </button>
    </div>
  );
}

function Confetti() {
  const items = ['🎉', '✨', '🎊', '⭐', '🍬', '🎉', '✨', '⭐', '🎊', '⭐'];
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden="true">
      {items.map((e, i) => (
        <span
          key={i}
          className="anim-confetti absolute text-2xl"
          style={{
            left: `${(i * 37) % 100}%`,
            animationDuration: `${1800 + (i % 4) * 300}ms`,
            ['--spin' as string]: `${(i % 2 ? 1 : -1) * 360}deg`,
          }}
        >
          {e}
        </span>
      ))}
    </div>
  );
}
