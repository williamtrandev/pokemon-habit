import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type Combatant,
  type BattleEvent,
  countersOf,
  effLabel,
  simulateBattle,
  typeMultiplier,
} from '@app/battle';
import { typeColor, typeLabel } from '@app/pokemonTypes';
import { feedbackComplete, feedbackEvolve, feedbackTap } from '@app/feedback';
import { CreatureImage } from '@web/ui/components/Bits';

export interface Fighter {
  c: Combatant;
  shiny: boolean;
}

interface Props {
  onClose: () => void;
  team: Fighter[];
  boss: Combatant;
  tier: { label: string; color: string };
  seed: number;
  onWin: () => { candy: number; egg: boolean; already: boolean };
}

const STEP = 900; // ms mỗi sự kiện
const HIT = 220; // ms từ lúc lao tới lúc trúng đòn
const MAX_LINEUP = 3; // số Pokémon tối đa mang ra đấu (công bằng cho boss)

const hpColor = (r: number) => (r > 0.5 ? '#22C55E' : r > 0.2 ? '#EAB308' : '#EF4444');

// Nhãn khắc hệ của MỘT con (tấn công) lên boss.
function effBadge(mult: number): { text: string; color: string } {
  if (mult === 0) return { text: 'Vô hiệu', color: '#94A3B8' };
  if (mult >= 2) return { text: `Khắc ×${mult}`, color: '#22C55E' };
  if (mult < 1) return { text: `Kém ×${mult}`, color: '#EF4444' };
  return { text: 'Thường', color: '#94A3B8' };
}

// Bản web của ../src/components/BattleArena.tsx.
// Trận đấu do simulateBattle() (DÙNG CHUNG với app) tính trước theo seed; phần này chỉ phát
// lại từng sự kiện thành hoạt ảnh, nên kết quả trên web và app y hệt nhau với cùng seed.
export default function BattleArena({ onClose, team, boss, tier, seed, onWin }: Props) {
  const teamMap = useMemo(() => new Map(team.map((f) => [f.c.key, f])), [team]);

  const [phase, setPhase] = useState<'select' | 'playing' | 'win' | 'lose'>('select');
  const [picked, setPicked] = useState<string[]>([]); // key theo THỨ TỰ ra sân
  const lineup = useMemo(() => picked.map((k) => teamMap.get(k)!).filter(Boolean), [picked, teamMap]);
  const result = useMemo(() => simulateBattle(lineup.map((f) => f.c), boss, seed), [lineup, boss, seed]);

  const [curKey, setCurKey] = useState('');
  const [faints, setFaints] = useState(0);
  const [log, setLog] = useState('');
  const [banner, setBanner] = useState<{ text: string; good: boolean } | null>(null);
  const [dmg, setDmg] = useState<{ id: number; val: number; side: 'boss' | 'player'; mult: number; crit: boolean } | null>(null);
  const [reward, setReward] = useState<{ candy: number; egg: boolean; already: boolean } | null>(null);

  const [bossHpN, setBossHpN] = useState(boss.maxHp);
  const [playerHpN, setPlayerHpN] = useState(0);
  const [bossHpR, setBossHpR] = useState(1);
  const [playerHpR, setPlayerHpR] = useState(1);
  const [playerMax, setPlayerMax] = useState(0);

  // Hoạt ảnh: đổi key -> animation CSS chạy lại (thay cho Animated.Value của native).
  const [lungeSide, setLungeSide] = useState<'player' | 'boss' | null>(null);
  const [lungeTick, setLungeTick] = useState(0);
  const [hitSide, setHitSide] = useState<'player' | 'boss' | null>(null);
  const [hitTick, setHitTick] = useState(0);
  const [playerOut, setPlayerOut] = useState(false);

  const timers = useRef<number[]>([]);
  const dmgSeq = useRef(0);
  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  const togglePick = (key: string) => {
    feedbackTap();
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : p.length < MAX_LINEUP ? [...p, key] : p));
  };

  const start = () => {
    if (!lineup.length) return;
    feedbackTap();
    const lead = lineup[0].c;
    setCurKey(lead.key);
    setPlayerHpN(lead.maxHp);
    setPlayerMax(lead.maxHp);
    setPlayerHpR(1);
    setPhase('playing');
    setLog(`Trận đấu bắt đầu! ${lead.name} tiến lên!`);
    play(0);
  };

  const play = (i: number) => {
    const events = result.events;
    if (i >= events.length) return finish();
    const e = events[i];
    const attackerName = e.attacker === 'player' ? (teamMap.get(e.attackerKey)?.c.name ?? 'Pokémon') : boss.name;

    setLungeSide(e.attacker);
    setLungeTick((t) => t + 1);

    timers.current.push(window.setTimeout(() => applyHit(e, attackerName), HIT));
    timers.current.push(window.setTimeout(() => play(i + 1), STEP));
  };

  const applyHit = (e: BattleEvent, attackerName: string) => {
    feedbackTap();
    const eff = effLabel(e.mult);
    const bannerText = e.crit ? (eff ? `Chí mạng! ${eff}` : 'Chí mạng! 💥') : eff;
    setBanner(bannerText ? { text: bannerText, good: e.crit || e.mult >= 2 } : null);
    const id = dmgSeq.current++;
    const critTag = e.crit ? ' Chí mạng! 💥' : '';

    if (e.attacker === 'player') {
      setBossHpN(e.bossHp);
      setBossHpR(boss.maxHp ? e.bossHp / boss.maxHp : 0);
      setHitSide('boss');
      setHitTick((t) => t + 1);
      setDmg({ id, val: e.dmg, side: 'boss', mult: e.mult, crit: e.crit });
      setLog(`${attackerName} ra đòn! Gây ${e.dmg} sát thương.${critTag}`);
    } else {
      const max = teamMap.get(e.defenderKey)?.c.maxHp ?? 1;
      setPlayerHpN(e.playerHp);
      setPlayerMax(max);
      setPlayerHpR(max ? e.playerHp / max : 0);
      setHitSide('player');
      setHitTick((t) => t + 1);
      setDmg({ id, val: e.dmg, side: 'player', mult: e.mult, crit: e.crit });
      setLog(`${boss.name} phản công! ${teamMap.get(e.defenderKey)?.c.name ?? ''} mất ${e.dmg} HP.${critTag}`);

      if (e.faintedKey) {
        setPlayerOut(true);
        setLog(`${teamMap.get(e.faintedKey)?.c.name ?? 'Pokémon'} gục ngã!`);
        setFaints((n) => n + 1);
        if (e.incomingKey) {
          const inc = e.incomingKey;
          const incMax = teamMap.get(inc)?.c.maxHp ?? 0;
          timers.current.push(
            window.setTimeout(() => {
              setCurKey(inc);
              setPlayerHpN(incMax);
              setPlayerMax(incMax);
              setPlayerHpR(1);
              setPlayerOut(false);
              setLog(`Tiến lên, ${teamMap.get(inc)?.c.name ?? 'Pokémon'}!`);
            }, 380)
          );
        }
      }
    }
    timers.current.push(window.setTimeout(() => setDmg(null), STEP - HIT - 80));
  };

  const finish = () => {
    if (result.win) {
      feedbackEvolve();
      setReward(onWin());
      setPhase('win');
    } else {
      feedbackComplete();
      setPhase('lose');
    }
  };

  const skip = () => {
    clearTimers();
    const last = result.events[result.events.length - 1];
    if (last) {
      setBossHpN(last.bossHp);
      setBossHpR(boss.maxHp ? last.bossHp / boss.maxHp : 0);
    }
    setBanner(null);
    setDmg(null);
    finish();
  };

  const curFighter = teamMap.get(curKey) ?? lineup[0] ?? team[0];

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-bg">
      {phase === 'select' ? (
        <SelectScreen
          boss={boss}
          tier={tier}
          roster={team}
          picked={picked}
          onToggle={togglePick}
          onStart={start}
          onClose={onClose}
        />
      ) : (
        <>
          {/* ===== Sân đấu ===== */}
          <div className="safe-top relative flex min-h-0 flex-1 flex-col justify-around px-4 pt-4">
            {/* Boss (trên) */}
            <div className="flex items-start justify-between gap-2">
              <HpCard name={boss.name} types={boss.types} hpR={bossHpR} cur={bossHpN} max={boss.maxHp} />
              <div
                key={`bl-${lungeTick}-${hitTick}`}
                className={
                  'relative grid place-items-center ' +
                  (lungeSide === 'boss' ? 'anim-lunge-down ' : '') +
                  (hitSide === 'boss' && dmg?.side === 'boss' ? 'anim-hit' : '')
                }
              >
                <Platform />
                <CreatureImage formId={boss.id} size={116} className="relative" />
                {dmg?.side === 'boss' && <DmgNumber key={dmg.id} val={dmg.val} mult={dmg.mult} crit={dmg.crit} />}
              </div>
            </div>

            {/* Player (dưới) */}
            <div className="flex items-end justify-between gap-2">
              <div
                key={`pl-${lungeTick}-${hitTick}`}
                className={
                  'relative grid place-items-center transition-opacity duration-300 ' +
                  (playerOut ? 'opacity-0 ' : 'opacity-100 ') +
                  (lungeSide === 'player' ? 'anim-lunge-up ' : '') +
                  (hitSide === 'player' && dmg?.side === 'player' ? 'anim-hit' : '')
                }
              >
                <Platform />
                <CreatureImage formId={curFighter?.c.id ?? 1} shiny={curFighter?.shiny} size={120} className="relative" />
                {dmg?.side === 'player' && <DmgNumber key={dmg.id} val={dmg.val} mult={dmg.mult} crit={dmg.crit} />}
              </div>
              <HpCard
                name={curFighter?.c.name ?? ''}
                types={curFighter?.c.types ?? []}
                hpR={playerHpR}
                cur={playerHpN}
                max={playerMax || (curFighter?.c.maxHp ?? 0)}
              />
            </div>

            {banner && (
              <div
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-pill px-4 py-1.5"
                style={{ background: banner.good ? '#F97316' : '#475569' }}
              >
                <p className="text-sm font-extrabold text-white">{banner.text}</p>
              </div>
            )}

            {/* Đội hình xuất chiến (còn sống) */}
            <div className="flex items-center justify-center gap-1.5 pb-1">
              {lineup.map((f, i) => (
                <span
                  key={f.c.key}
                  className={
                    'size-2.5 rounded-full ' + (i < lineup.length - faints ? 'bg-green' : 'bg-line')
                  }
                />
              ))}
              <span className="ml-2 text-[11px] font-bold text-ink-dim">
                Còn {Math.max(0, lineup.length - faints)}/{lineup.length}
              </span>
            </div>
          </div>

          {/* ===== Bảng thoại / điều khiển ===== */}
          <div className="safe-bottom border-t border-line bg-bg-soft p-4">
            {phase === 'playing' && (
              <>
                <p className="min-h-11 text-[13px] leading-snug font-semibold text-ink">{log}</p>
                <button
                  type="button"
                  onClick={skip}
                  className="mt-2 w-full rounded-pill border border-line bg-card py-3 font-extrabold text-ink"
                >
                  Bỏ qua ⏩
                </button>
              </>
            )}
            {(phase === 'win' || phase === 'lose') && (
              <ResultPanel win={phase === 'win'} reward={reward} onClose={onClose} />
            )}
          </div>

          {phase === 'win' && <Confetti />}
        </>
      )}
    </div>
  );
}

// Bệ đứng dưới chân Pokémon.
function Platform() {
  return (
    <span className="absolute bottom-1 size-24 rounded-[50%] bg-black/25 blur-[2px]" style={{ height: 18 }} />
  );
}

// Màn CHỌN Pokémon xuất chiến + gợi ý khắc hệ boss.
function SelectScreen({
  boss,
  tier,
  roster,
  picked,
  onToggle,
  onStart,
  onClose,
}: {
  boss: Combatant;
  tier: { label: string; color: string };
  roster: Fighter[];
  picked: string[];
  onToggle: (k: string) => void;
  onStart: () => void;
  onClose: () => void;
}) {
  const counters = countersOf(boss.types); // hệ nên mang để khắc chế boss

  return (
    <>
      <div className="screen safe-top min-h-0 flex-1 p-4">
        <h2 className="mb-3 text-xl font-extrabold text-ink">Chọn Pokémon xuất chiến</h2>

        <div className="mb-3 flex items-start rounded-card border border-line bg-card p-3">
          <CreatureImage formId={boss.id} size={72} />
          <div className="ml-3 min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-extrabold text-ink capitalize">{boss.name}</p>
              <span
                className="rounded-pill px-2 py-0.5 text-[10.5px] font-black text-white"
                style={{ background: tier.color }}
              >
                {tier.label}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {boss.types.map((t) => (
                <TypeChip key={t} t={t} />
              ))}
            </div>
            <p className="mt-2 text-[11.5px] font-bold text-ink-dim">Khắc chế boss (dame ↑):</p>
            <div className="mt-1 flex flex-wrap gap-1">
              {counters.length ? (
                counters.map((t) => <TypeChip key={t} t={t} />)
              ) : (
                <span className="text-[11.5px] text-ink-dim">Không hệ nào khắc — chọn con Công/Đ.Công cao</span>
              )}
            </div>
          </div>
        </div>

        <p className="mb-2 text-[12px] text-ink-dim">
          Chạm chọn tối đa {MAX_LINEUP} · thứ tự chạm = thứ tự ra sân
        </p>

        <div className="grid grid-cols-3 gap-2">
          {roster.map((f) => {
            const mult = typeMultiplier(f.c.types, boss.types);
            const badge = effBadge(mult);
            const order = picked.indexOf(f.c.key);
            const on = order >= 0;
            return (
              <button
                key={f.c.key}
                type="button"
                onClick={() => onToggle(f.c.key)}
                className={
                  'relative grid justify-items-center gap-1 rounded-[12px] border bg-card-alt p-2 ' +
                  (on ? 'border-[2.5px]' : 'border-line')
                }
                style={on ? { borderColor: tier.color } : undefined}
              >
                {on && (
                  <span
                    className="absolute top-1 left-1 grid size-5 place-items-center rounded-full text-[11px] font-black text-white"
                    style={{ background: tier.color }}
                  >
                    {order + 1}
                  </span>
                )}
                <CreatureImage formId={f.c.id} shiny={f.shiny} size={56} />
                <span className="w-full truncate text-center text-[11px] font-bold text-ink capitalize">
                  {f.shiny ? '✨ ' : ''}
                  {f.c.name}
                </span>
                <span className="flex flex-wrap justify-center gap-0.5">
                  {f.c.types.map((t) => (
                    <TypeChip key={t} t={t} small />
                  ))}
                </span>
                <span className="text-[10.5px] font-extrabold" style={{ color: badge.color }}>
                  {badge.text}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="safe-bottom border-t border-line bg-bg-soft p-4">
        <p className="text-[13px] font-semibold text-ink">
          Chọn con KHẮC hệ boss để gây dame gấp bội. Đội càng ít, thắng càng vẻ vang!
        </p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onStart}
            disabled={!picked.length}
            className="flex-1 rounded-pill bg-primary py-3 font-extrabold text-white disabled:opacity-50"
          >
            Xuất chiến ({picked.length}/{MAX_LINEUP})
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-pill border border-line bg-card px-5 py-3 font-extrabold text-ink"
          >
            Để sau
          </button>
        </div>
      </div>
    </>
  );
}

function TypeChip({ t, small }: { t: string; small?: boolean }) {
  return (
    <span
      className={
        'rounded-pill font-extrabold text-white ' + (small ? 'px-1.5 py-px text-[9px]' : 'px-2 py-0.5 text-[11px]')
      }
      style={{ background: typeColor(t) }}
    >
      {typeLabel(t)}
    </span>
  );
}

function HpCard({ name, types, hpR, cur, max }: { name: string; types: string[]; hpR: number; cur: number; max: number }) {
  return (
    <div className="w-52 max-w-[62%] rounded-[12px] border border-line bg-card p-2">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[13px] font-extrabold text-ink capitalize">{name}</p>
        <span className="flex shrink-0 gap-0.5">
          {types.map((t) => (
            <TypeChip key={t} t={t} small />
          ))}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-track">
          <span
            className="block h-full rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(0, Math.min(1, hpR)) * 100}%`, background: hpColor(hpR) }}
          />
        </span>
        <span className="text-[11px] font-extrabold tabular-nums" style={{ color: hpColor(hpR) }}>
          {Math.max(0, Math.round(cur))}/{max}
        </span>
      </div>
    </div>
  );
}

function DmgNumber({ val, mult, crit }: { val: number; mult: number; crit: boolean }) {
  const color = crit ? '#F87171' : mult === 0 ? '#94A3B8' : mult >= 2 ? '#FDE047' : mult < 1 ? '#93C5FD' : '#fff';
  const size = crit ? 40 : mult >= 2 ? 34 : 26;
  return (
    <span
      className="anim-dmg pointer-events-none absolute top-1.5 font-black"
      style={{ fontSize: size, color }}
    >
      -{val}
      {crit ? '!' : ''}
    </span>
  );
}

function ResultPanel({
  win,
  reward,
  onClose,
}: {
  win: boolean;
  reward: { candy: number; egg: boolean; already: boolean } | null;
  onClose: () => void;
}) {
  return (
    <>
      <p className="text-lg font-extrabold text-ink">{win ? '🏆 Chiến thắng!' : '💫 Thất bại...'}</p>
      <p className="mt-1 text-[13px] font-semibold text-ink">
        {win
          ? `${
              reward && reward.candy > 0
                ? `Phần thưởng: 🍬 +${reward.candy} kẹo!`
                : 'Lượt boss này đã hạ rồi — không thêm kẹo, nhưng luyện tập tốt!'
            }${reward?.egg ? '  ·  🥚 +Trứng thưởng!' : ''}`
          : 'Cả bầy đã kiệt sức. Nuôi lớn thêm rồi quay lại phục thù!'}
      </p>
      <button type="button" onClick={onClose} className="mt-3 w-full rounded-pill bg-primary py-3 font-extrabold text-white">
        Xong
      </button>
    </>
  );
}

function Confetti() {
  const items = ['🎉', '✨', '🎊', '⭐', '🍬', '🎉', '✨', '⭐'];
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {items.map((e, i) => (
        <span
          key={i}
          className="anim-confetti absolute text-2xl"
          style={{
            left: `${(i * 47) % 100}%`,
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
