import { Fragment, useEffect, useState } from 'react';
import { useApp } from '@app/AppContext';
import type { PartyMon } from '@app/types';
import {
  EGG_PRICE,
  EVO_AFFECTION,
  FEED_CHUNK,
  MEGA_AFFECTION,
  RARE_EGG_PRICE,
  currentForm,
  stageFromAffection,
  streakFire,
} from '@app/collection';
import { habitStreak } from '@app/gameLogic';
import { todayStr } from '@app/date';
import { fetchMegas } from '@app/megaForms';
import { type MegaForm, type MoveInfo, type PokeInfo, fetchMoves, fetchPokeInfo } from '@app/species';
import { typeColor, typeLabel } from '@app/pokemonTypes';
import {
  type BossEncounter,
  type BossTier,
  type Combatant,
  TEAM_POWER_MILESTONES,
  activeBoss,
  bstFromStats,
  nextBoss,
  toCombatant,
} from '@app/battle';
import { feedbackComplete, feedbackTap } from '@app/feedback';
import { CreatureImage, ProgressBar } from '@web/ui/components/Bits';
import BattleArena, { type Fighter } from '@web/ui/components/BattleArena';

// Đếm ngược ms -> "1g 05p" / "12:34".
function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}g ${String(m).padStart(2, '0')}p`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function clockAt(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const STAT_VI: Record<string, string> = {
  hp: 'HP',
  attack: 'Công',
  defense: 'Thủ',
  'special-attack': 'Đ.Công',
  'special-defense': 'Đ.Thủ',
  speed: 'Tốc',
};

// Dạng hiển thị + tiến trình nuôi của RIÊNG một con (giữ nguyên logic bản native).
function view(mon: PartyMon) {
  const stage = Math.min(stageFromAffection(mon.affection), mon.line.length - 1);
  const maxedEvo = stage >= mon.line.length - 1;
  const isMega = mon.megaId != null && mon.affection >= MEGA_AFFECTION;
  const form = isMega ? { id: mon.megaId!, name: mon.megaName ?? 'Mega' } : mon.line[stage];

  let ratio = 1;
  if (isMega) ratio = 1;
  else if (!maxedEvo) {
    const cur = EVO_AFFECTION[stage] ?? 0;
    const next = EVO_AFFECTION[stage + 1];
    ratio = Math.max(0, Math.min(1, (mon.affection - cur) / (next - cur)));
  } else {
    // đã tối đa bậc thường -> tiến trình tới Mega
    const cur = EVO_AFFECTION[EVO_AFFECTION.length - 1];
    ratio = Math.max(0, Math.min(1, (mon.affection - cur) / (MEGA_AFFECTION - cur)));
  }
  return { stage, maxedEvo, isMega, form, ratio };
}

// Trạng thái NUÔI của một con — dùng cho tag ở dải chọn và cho nút "Cho ăn".
//
// Phải khớp đúng luật trong AppContext.feedPokemon:
//   spend = min(kẹo, FEED_CHUNK, MEGA_AFFECTION - affection); spend <= 0 -> không làm gì.
// Nghĩa là chạm trần MEGA_AFFECTION là hết đường nuôi, kể cả khi loài không có Mega.
// `megas === undefined` = chưa tra xong PokéAPI.
function growth(mon: PartyMon, megas: MegaForm[] | undefined) {
  const v = view(mon);
  const hasMega = (megas?.length ?? 0) > 0;
  const atCap = mon.affection >= MEGA_AFFECTION; // trần tuyệt đối, cho ăn thêm vô ích

  // Mốc kế tiếp: bậc tiến hoá sau, hoặc mốc Mega nếu đã tối đa bậc thường và loài có Mega.
  const nextAt = atCap ? null : !v.maxedEvo ? EVO_AFFECTION[v.stage + 1] : hasMega ? MEGA_AFFECTION : null;

  return {
    ...v,
    hasMega,
    megasKnown: megas !== undefined,
    // Còn bao nhiêu kẹo nữa thì lên dạng kế tiếp (0 = đã đủ, null = hết đường nuôi).
    need: nextAt == null ? null : Math.max(0, Math.ceil(nextAt - mon.affection)),
    // Nuôi tiếp còn tác dụng không.
    growable: nextAt != null,
  };
}

export default function PartyScreen() {
  const { data, feedPokemon, reportBattleWin, claimTeamPower, buyEgg, hatchEgg } = useApp();

  const party = [...(data.party ?? [])].sort((a, b) => b.affection - a.affection || b.at - a.at);
  const [selKey, setSelKey] = useState<string | null>(null);
  const sel = party.find((m) => m.key === selKey) ?? party[0] ?? null;
  const candy = Math.floor(data.candy ?? 0);
  const pendingEggs = data.pendingEggs?.length ?? 0;
  const bestStreak = data.habits.reduce((m, h) => Math.max(m, habitStreak(h, todayStr())), 0);
  const fire = streakFire(bestStreak);

  // Chỉ số gốc của DẠNG hiện tại mỗi con -> Sức mạnh bầy + dữ liệu đấu boss.
  const [infos, setInfos] = useState<Record<number, PokeInfo>>({});
  const curIds = party.map((m) => currentForm(m).id).join(',');
  useEffect(() => {
    let alive = true;
    const ids = curIds ? curIds.split(',').map(Number) : [];
    Promise.all(ids.map((id) => fetchPokeInfo(id).then((i) => [id, i] as const))).then((pairs) => {
      if (!alive) return;
      setInfos((prev) => {
        const next = { ...prev };
        for (const [id, i] of pairs) if (i) next[id] = i;
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [curIds]);

  // Dạng Mega của TỪNG con (tra theo bậc cuối của dòng tiến hoá) -> biết con nào còn nuôi
  // được tiếp. fetchMegas có cache riêng nên gọi cho cả bầy vẫn rẻ.
  const [megaMap, setMegaMap] = useState<Record<number, MegaForm[]>>({});
  const finalIds = party.map((m) => m.line[m.line.length - 1].id).join(',');
  useEffect(() => {
    let alive = true;
    const ids = finalIds ? [...new Set(finalIds.split(',').map(Number))] : [];
    Promise.all(ids.map((id) => fetchMegas(id).then((ms) => [id, ms] as const))).then((pairs) => {
      if (!alive) return;
      setMegaMap((prev) => {
        const next = { ...prev };
        for (const [id, ms] of pairs) next[id] = ms;
        return next;
      });
    });
    return () => {
      alive = false;
    };
  }, [finalIds]);

  const megasOf = (m: PartyMon) => megaMap[m.line[m.line.length - 1].id];
  // "Sẵn sàng" = kẹo đang có đủ để đẩy con đó lên dạng kế tiếp.
  // (need không bao giờ bằng 0: bậc suy ra từ affection nên luôn còn thiếu ít nhất 1.)
  const readyCount = party.filter((m) => {
    const g = growth(m, megasOf(m));
    return g.need != null && candy >= g.need;
  }).length;

  const teamPower = party.reduce((s, m) => {
    const info = infos[currentForm(m).id];
    return s + (info ? bstFromStats(info.stats) : 0);
  }, 0);
  const allLoaded = party.length > 0 && party.every((m) => infos[currentForm(m).id]);

  // Đạt mốc Sức mạnh bầy -> trao kẹo (1 lần/mốc).
  useEffect(() => {
    if (allLoaded && teamPower > 0) claimTeamPower(teamPower);
  }, [teamPower, allLoaded, claimTeamPower]);

  const nextMilestone = TEAM_POWER_MILESTONES.find((m) => teamPower < m.power);
  const prevMilestone = [...TEAM_POWER_MILESTONES].reverse().find((m) => teamPower >= m.power);
  const mBase = prevMilestone?.power ?? 0;
  const mRatio = nextMilestone ? Math.max(0, Math.min(1, (teamPower - mBase) / (nextMilestone.power - mBase))) : 1;

  // ===== Đấu đạo trường: boss xuất hiện ngẫu nhiên có hẹn giờ =====
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000); // đếm ngược spawn/expire
    return () => window.clearInterval(id);
  }, []);
  const encounter = activeBoss(now);
  const upcoming = nextBoss(now);
  const beaten = encounter != null && (data.bossBeaten ?? []).includes(encounter.id);

  const [bossInfo, setBossInfo] = useState<PokeInfo | null>(null);
  const bossId = encounter?.species.id;
  useEffect(() => {
    if (bossId == null) {
      setBossInfo(null);
      return;
    }
    let alive = true;
    fetchPokeInfo(bossId).then((i) => {
      if (alive) setBossInfo(i);
    });
    return () => {
      alive = false;
    };
  }, [bossId]);
  const bossReady = allLoaded && !!bossInfo && encounter != null;
  const rewardPreview =
    bossInfo && encounter ? Math.round(bstFromStats(bossInfo.stats) * 0.3 * encounter.tier.candyMul) : 0;

  const [arena, setArena] = useState<{
    team: Fighter[];
    boss: Combatant;
    tier: BossTier;
    enc: BossEncounter;
    bossBst: number;
    seed: number;
  } | null>(null);

  const openArena = () => {
    if (!bossReady || !encounter || !bossInfo || beaten) return;
    feedbackTap();
    const fighters: Fighter[] = party
      .map((m) => {
        const f = currentForm(m);
        const info = infos[f.id]!;
        return { c: toCombatant(m.key, f.id, f.name || `#${f.id}`, info.types, info.stats), shiny: m.shiny };
      })
      .sort((a, b) => b.c.maxHp + b.c.atk - (a.c.maxHp + a.c.atk));
    const bossBst = bstFromStats(bossInfo.stats);
    const t = encounter.tier;
    const boss = toCombatant(
      'boss',
      encounter.species.id,
      encounter.species.name,
      bossInfo.types,
      bossInfo.stats,
      t.hpMul,
      t.atkMul
    );
    setArena({ team: fighters, boss, tier: t, enc: encounter, bossBst, seed: (encounter.seed + Date.now()) >>> 0 });
  };

  return (
    <>
      <div className="px-4 pt-6 pb-26">
        <header className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[26px] leading-tight font-extrabold text-ink">Bầy của tôi</h1>
            <p className="mt-0.5 text-[13px] text-ink-dim">
              {party.length} Pokémon · {fire.emoji} chuỗi {bestStreak} ngày{fire.label ? ` (${fire.label})` : ''}
            </p>
          </div>
          <span className="shrink-0 rounded-pill border border-accent bg-accent/15 px-3 py-1.5 text-[15px] font-extrabold text-accent">
            🍬 {candy}
          </span>
        </header>

        {party.length > 0 && (
          <>
            {/* Sức mạnh bầy — tổng chỉ số gốc dạng hiện tại */}
            <section className="mb-3 rounded-card border border-line bg-card p-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-sm font-extrabold text-ink">⚡ Sức mạnh bầy</p>
                <p className="text-lg font-black text-accent">{allLoaded ? teamPower : '…'}</p>
              </div>
              <ProgressBar ratio={mRatio} color="var(--color-accent)" />
              <p className="mt-1 text-[11.5px] text-ink-dim">
                {nextMilestone
                  ? `Còn ${Math.max(0, nextMilestone.power - teamPower)} → mốc ${nextMilestone.power} thưởng 🍬${nextMilestone.candy}`
                  : 'Đã đạt mốc cao nhất — quá mạnh! 💪'}
              </p>
            </section>

            {/* Đấu đạo trường — boss xuất hiện ngẫu nhiên có hẹn giờ */}
            {encounter ? (
              <button
                type="button"
                onClick={openArena}
                disabled={!bossReady || beaten}
                style={{ borderColor: encounter.tier.color }}
                className={
                  'mb-3 flex w-full items-center rounded-card border-[1.5px] bg-primary/10 p-3 text-left ' +
                  (!bossReady || beaten ? 'opacity-60' : '')
                }
              >
                <span
                  className="grid size-15 shrink-0 place-items-center rounded-[12px] border-[1.5px] bg-card-alt"
                  style={{ borderColor: encounter.tier.color }}
                >
                  <CreatureImage formId={encounter.species.id} size={56} />
                </span>
                <span className="mx-3 min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-black text-ink capitalize">
                      ⚔️ {encounter.species.name}
                    </span>
                    <span
                      className="shrink-0 rounded-pill px-2 py-0.5 text-[10.5px] font-black text-white"
                      style={{ background: encounter.tier.color }}
                    >
                      {encounter.tier.label}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs font-semibold text-ink-dim">
                    {beaten
                      ? '✓ Đã hạ lượt này'
                      : `⏳ Biến mất sau ${countdown(encounter.expireAt - now)}  ·  thắng 🍬~${rewardPreview}`}
                  </span>
                </span>
                <span className="text-xl font-black" style={{ color: encounter.tier.color }}>
                  {beaten ? '✓' : bossReady ? '▶' : '…'}
                </span>
              </button>
            ) : (
              <div className="mb-3 flex items-center rounded-card border-[1.5px] border-dashed border-line bg-card-alt p-3">
                <span className="grid size-15 shrink-0 place-items-center rounded-[12px] bg-card text-[26px]">💤</span>
                <span className="ml-3 min-w-0 flex-1">
                  <span className="block text-[15px] font-black text-ink">Chưa có boss</span>
                  <span className="mt-0.5 block text-xs font-semibold text-ink-dim">
                    Xuất hiện lúc {clockAt(upcoming.spawnAt)} · còn {countdown(upcoming.spawnAt - now)}
                  </span>
                </span>
              </div>
            )}
          </>
        )}

        {/* Cửa hàng trứng — đổi kẹo lấy trứng để thu thêm Pokémon */}
        <section className="mb-3 rounded-card border border-line bg-card p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-extrabold text-ink">🛒 Cửa hàng trứng</p>
            {pendingEggs > 0 && (
              <button
                type="button"
                onClick={() => {
                  feedbackTap();
                  hatchEgg();
                }}
                className="rounded-pill bg-accent px-3 py-1 text-xs font-extrabold text-white"
              >
                Nở ngay 🥚 ×{pendingEggs}
              </button>
            )}
          </div>
          <p className="mt-0.5 mb-2 text-[11.5px] text-ink-dim">
            Đổi kẹo 🍬 lấy trứng — cách nhanh để thu thêm Pokémon
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={candy < EGG_PRICE}
              onClick={() => buyEgg(false)}
              className="grid flex-1 justify-items-center gap-1 rounded-[12px] border border-line bg-card-alt py-3 disabled:opacity-40"
            >
              <span className="text-[12.5px] font-extrabold text-ink">🥚 Trứng thường</span>
              <span className="text-[13px] font-black text-primary">🍬 {EGG_PRICE}</span>
            </button>
            <button
              type="button"
              disabled={candy < RARE_EGG_PRICE}
              onClick={() => buyEgg(true)}
              className="grid flex-1 justify-items-center gap-1 rounded-[12px] border border-accent bg-card-alt py-3 disabled:opacity-40"
            >
              <span className="text-[12.5px] font-extrabold text-ink">🥚✨ Trứng hiếm</span>
              <span className="text-[13px] font-black text-accent">🍬 {RARE_EGG_PRICE}</span>
            </button>
          </div>
        </section>

        {party.length === 0 ? (
          <div className="mt-6 grid justify-items-center gap-1 rounded-card border border-dashed border-line bg-card p-6 text-center">
            <span className="text-5xl">🥚</span>
            <p className="mt-2 text-base font-extrabold text-ink">Bầy còn trống</p>
            <p className="text-[13px] text-ink-dim">Hoàn thành mục tiêu để nở trứng và thu phục Pokémon!</p>
          </div>
        ) : (
          <>
            {/* Lưới chọn con muốn xem & nuôi.
                Trước đây là dải cuộn NGANG — trên điện thoại vừa khó thấy hết bầy vừa hay
                cướp cử chỉ cuộn dọc của trang. Giờ tự xuống dòng: không còn cuộn ngang. */}
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <h2 className="text-[13px] font-extrabold text-ink">Chọn con để nuôi</h2>
              {readyCount > 0 && (
                <span className="rounded-pill bg-green/15 px-2 py-0.5 text-[11px] font-extrabold text-green">
                  {readyCount} con đủ kẹo tiến hoá
                </span>
              )}
            </div>
            <div className="mb-3 grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-2">
              {party.map((m) => (
                <RosterCell
                  key={m.key}
                  mon={m}
                  megas={megasOf(m)}
                  selected={sel?.key === m.key}
                  candy={candy}
                  onSelect={() => {
                    feedbackTap();
                    setSelKey(m.key);
                  }}
                />
              ))}
            </div>
            <p className="mb-3 text-[11px] leading-relaxed text-ink-dim">
              Số trên tag = kẹo cần để lên dạng kế tiếp. <span className="font-extrabold text-green">▲</span> đủ kẹo,
              nuôi được ngay · <span className="font-extrabold text-accent">🍬</span> chưa đủ ·{' '}
              <span className="font-extrabold text-ink-dim">MAX</span> hết đường nuôi
            </p>

            {sel && <CarePanel key={sel.key} mon={sel} candy={candy} onFeed={() => feedPokemon(sel.key)} />}
          </>
        )}
      </div>

      {arena && (
        <BattleArena
          team={arena.team}
          boss={arena.boss}
          tier={arena.tier}
          seed={arena.seed}
          onWin={() => reportBattleWin(arena.enc.id, arena.bossBst, arena.tier.candyMul, arena.tier.winEgg)}
          onClose={() => setArena(null)}
        />
      )}
    </>
  );
}

// Một ô trong lưới chọn: sprite + tag cho biết con này CÓ CẦN cho ăn không.
//   ▲ xanh  = đủ kẹo, cho ăn là tiến hoá ngay
//   🍬 N    = còn thiếu N kẹo nữa mới lên dạng kế tiếp
//   MAX     = chạm trần, cho ăn thêm vô ích
function RosterCell({
  mon,
  megas,
  selected,
  candy,
  onSelect,
}: {
  mon: PartyMon;
  megas: MegaForm[] | undefined;
  selected: boolean;
  candy: number;
  onSelect: () => void;
}) {
  const g = growth(mon, megas);
  const name = g.form.name || `#${g.form.id}`;

  // Đang có ĐỦ kẹo để đẩy con này lên dạng kế tiếp hay chưa.
  const ready = g.need != null && candy >= g.need;

  const tag = !g.megasKnown
    ? null // chưa tra xong dạng đặc biệt -> chưa dám kết luận MAX
    : g.need == null
      ? { text: 'MAX', cls: 'bg-line text-ink-dim', hint: 'đã tối đa' }
      : ready
        // Dải màu NHẠT chứ không đặc: bầy đông thì 20 dải xanh đặc nhìn rất gắt.
        ? { text: `▲${g.need}`, cls: 'bg-green/20 text-green', hint: `đủ kẹo, cần ${g.need} để tiến hoá` }
        : { text: `🍬${g.need}`, cls: 'bg-accent/20 text-accent', hint: `còn thiếu ${g.need - candy} kẹo` };

  return (
    <button
      type="button"
      onClick={onSelect}
      title={name}
      aria-label={name + (tag ? ` — ${tag.hint}` : '')}
      className={
        'flex flex-col overflow-hidden rounded-[12px] bg-card-alt transition-transform active:scale-95 ' +
        (selected ? 'border-2 border-primary' : 'border border-line')
      }
    >
      {/* Tag là DẢI NẰM TRONG ô (không cưỡi lên viền) nên các hàng thẳng nhau. */}
      <span className="relative grid aspect-square place-items-center">
        <CreatureImage formId={g.form.id} shiny={mon.shiny} size={46} />
        {mon.shiny && <span className="absolute top-0.5 left-1 text-[10px]">✨</span>}
      </span>
      <span
        className={
          'grid h-[17px] place-items-center text-[10px] leading-none font-black tabular-nums ' + (tag?.cls ?? '')
        }
      >
        {tag?.text ?? ''}
      </span>
    </button>
  );
}

function CarePanel({ mon, candy, onFeed }: { mon: PartyMon; candy: number; onFeed: () => void }) {
  const { pickMega } = useApp();
  const v = view(mon);
  const [megas, setMegas] = useState<MegaForm[] | null>(null);
  const [moves, setMoves] = useState<MoveInfo[] | null>(null);
  const [info, setInfo] = useState<PokeInfo | null>(null);
  const [hearts, setHearts] = useState<number[]>([]);
  const [jump, setJump] = useState(0);

  useEffect(() => {
    let alive = true;
    setMegas(null);
    fetchMegas(mon.line[mon.line.length - 1].id).then((ms) => {
      if (alive) setMegas(ms);
    });
    return () => {
      alive = false;
    };
  }, [mon.key, mon.line]);

  // Chiêu thức + thông tin của DẠNG hiện tại (đổi khi tiến hoá).
  useEffect(() => {
    let alive = true;
    setMoves(null);
    setInfo(null);
    fetchMoves(v.form.id).then((ms) => {
      if (alive) setMoves(ms);
    });
    fetchPokeInfo(v.form.id).then((i) => {
      if (alive) setInfo(i);
    });
    return () => {
      alive = false;
    };
  }, [v.form.id]);

  const feed = () => {
    if (candy <= 0) return;
    feedbackComplete();
    setJump((j) => j + 1);
    const base = Date.now();
    const ids = [base, base + 1, base + 2];
    setHearts((h) => [...h, ...ids]);
    window.setTimeout(() => setHearts((h) => h.filter((x) => !ids.includes(x))), 1100);
    onFeed();
  };

  const hasMega = megas != null && megas.length > 0;
  const multiMega = hasMega && megas.length > 1; // nhiều dạng -> cho chọn (Mega/Ash, X/Y)
  const chosenId = hasMega ? (mon.megaChoice ?? megas[0].id) : undefined; // dạng SẼ hoá
  const superName = hasMega ? (megas.find((m) => m.id === chosenId)?.name ?? megas[0].name) : 'dạng đặc biệt';
  const hot = v.isMega || (v.maxedEvo && hasMega); // sắp/đang dạng đặc biệt -> quầng cam

  const g = growth(mon, megas ?? undefined);

  const label = v.isMega
    ? `🔮 Đã hoá ${v.form.name}!`
    : v.maxedEvo
      ? hasMega
        ? `Nuôi tiếp để mở ${superName} 🔮`
        : '🌟 Đã tiến hoá tối đa'
      : `Bậc ${v.stage + 1}/${mon.line.length} · cho ăn để tiến hoá`;

  // Con đã chạm trần MEGA_AFFECTION thì AppContext.feedPokemon không làm gì (spend <= 0),
  // nên nút phải TẮT — trước đây con đã hoá Mega vẫn bấm được mà không có tác dụng.
  const canFeed = candy > 0 && g.growable;
  const feedLabel = !g.growable
    ? v.isMega
      ? `🔮 Đã hoá ${v.form.name} — hết đường nuôi`
      : 'Đã nuôi tối đa 🌟'
    : candy <= 0
      ? 'Chưa có kẹo — giữ chuỗi để tích thêm'
      : `Cho ăn  🍬 ${Math.min(candy, FEED_CHUNK)}`;

  return (
    <section className="mb-4 grid justify-items-center rounded-card border border-line bg-card p-4">
      {/* Sân khấu: quầng sáng nhấp nháy + tim bay khi cho ăn */}
      <div className="relative grid h-38 w-full place-items-center">
        <span
          className="absolute size-32 animate-pulse rounded-full"
          style={{ background: (hot ? 'var(--color-accent)' : 'var(--color-primary)') + '55' }}
        />
        {v.isMega && <span className="absolute top-2 text-[26px]">✨</span>}
        {hearts.map((h, i) => (
          <span
            key={h}
            className="anim-heart pointer-events-none absolute bottom-17 text-[22px]"
            style={{ ['--dx' as string]: `${(i - 1) * 26}px` }}
          >
            ❤️
          </span>
        ))}
        <span key={jump} className={jump > 0 ? 'anim-jump relative' : 'relative'}>
          <CreatureImage formId={v.form.id} shiny={mon.shiny} size={120} />
        </span>
      </div>

      <p className="mt-2 text-lg font-extrabold text-ink capitalize">
        {mon.shiny ? '✨ ' : ''}
        {v.form.name || `#${String(v.form.id).padStart(4, '0')}`}
      </p>
      <p className="mt-0.5 mb-2 text-xs font-bold text-ink-dim">{label}</p>
      <div className="w-full">
        <ProgressBar
          ratio={v.ratio}
          color={hot ? 'var(--color-accent)' : v.maxedEvo ? 'var(--color-green)' : 'var(--color-primary)'}
        />
      </div>

      <button
        type="button"
        onClick={feed}
        disabled={!canFeed}
        className={
          'mt-3 w-full rounded-pill py-3 text-sm font-extrabold ' +
          (canFeed ? 'bg-primary text-white' : 'bg-card-alt text-ink-dim')
        }
      >
        {feedLabel}
      </button>

      {/* Còn thiếu bao nhiêu kẹo nữa thì lên dạng kế tiếp — khớp tag ở lưới chọn phía trên. */}
      {g.need != null && (
        <p className="mt-2 text-center text-[11.5px] font-bold text-ink-dim">
          {candy >= g.need
            ? `▲ Đủ kẹo! Cần 🍬 ${g.need} nữa là lên dạng kế tiếp (mỗi lần cho ăn ${FEED_CHUNK})`
            : `Còn thiếu 🍬 ${g.need - candy} — cần ${g.need}, đang có ${candy}`}
        </p>
      )}

      <h3 className="mt-4 mb-2 w-full text-[13px] font-extrabold text-ink">Cây tiến hoá của con này</h3>
      {/* Tự xuống dòng thay vì cuộn ngang: dòng có Mega dài quá màn điện thoại. */}
      <div className="flex w-full flex-wrap items-center justify-center gap-1 pb-1">
        {mon.line.map((f, i) => {
          const reached = i <= v.stage;
          return (
            <Fragment key={f.id}>
              {i > 0 && <span className="text-[22px] text-ink-dim">›</span>}
              <RailNode
                formId={f.id}
                name={f.name || `#${f.id}`}
                reached={reached}
                tag={reached ? (i === v.stage && !v.isMega ? '● hiện tại' : '✓') : 'nuôi để mở'}
                accent="var(--color-primary)"
              />
            </Fragment>
          );
        })}
        {hasMega && (
          <>
            <span className="text-[22px] text-ink-dim">»</span>
            {megas.map((m) => {
              const selected = v.isMega ? m.id === mon.megaId : m.id === chosenId;
              const tag = v.isMega
                ? m.id === mon.megaId
                  ? '🔮 đang dùng'
                  : 'chạm để đổi'
                : selected
                  ? '● sẽ hoá'
                  : 'chạm chọn';
              return (
                <RailNode
                  key={m.id}
                  formId={m.id}
                  name={m.name}
                  reached={v.isMega || selected}
                  tag={tag}
                  accent="var(--color-accent)"
                  selected={selected}
                  onPress={multiMega || v.isMega ? () => pickMega(mon.key, m.id, m.name) : undefined}
                />
              );
            })}
          </>
        )}
      </div>
      {hasMega && (
        <p className="mt-2 text-center text-[11.5px] text-ink-dim">
          {multiMega
            ? v.isMega
              ? 'Chạm một dạng ở trên để ĐỔI hình thái 🔮'
              : `Chạm chọn dạng · nuôi đầy thanh để hoá ${superName} 🔮`
            : v.isMega
              ? ''
              : `Cho RIÊNG con này ăn tới khi đầy thanh để mở ${superName} 🔮`}
        </p>
      )}

      {info && (
        <>
          <div className="mt-3 flex w-full flex-wrap gap-2">
            {info.types.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-extrabold"
                style={{ background: typeColor(t) + '26', borderColor: typeColor(t) + '66', color: typeColor(t) }}
              >
                <span className="size-2 rounded-full" style={{ background: typeColor(t) }} />
                {typeLabel(t)}
              </span>
            ))}
          </div>
          <p className="mt-1.5 w-full text-xs font-bold text-ink-dim">
            {info.genus ? `${info.genus} · ` : ''}
            {info.heightM.toFixed(1)}m · {info.weightKg.toFixed(1)}kg
          </p>
          {info.flavor && <p className="mt-2 w-full text-[12.5px] leading-relaxed text-ink italic">“{info.flavor}”</p>}

          <div className="mt-4 flex w-full items-center justify-between">
            <h3 className="text-[13px] font-extrabold text-ink">Chỉ số gốc</h3>
            <span className="text-[13px] font-black text-accent">⚡ {bstFromStats(info.stats)}</span>
          </div>
          <p className="mb-2 w-full text-[11px] text-ink-dim">Chỉ số quyết định sức mạnh khi đấu đạo trường.</p>
          <div className="grid w-full gap-1.5">
            {info.stats.map((s) => (
              <div key={s.name} className="flex items-center gap-2">
                <span className="w-12 text-[11px] font-bold text-ink-dim">{STAT_VI[s.name] ?? s.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-track">
                  <span
                    className="block h-full rounded-full"
                    style={{
                      width: `${Math.min(100, (s.value / 180) * 100)}%`,
                      background: s.value >= 100 ? 'var(--color-accent)' : 'var(--color-primary)',
                    }}
                  />
                </span>
                <span className="w-7 text-right text-[11px] font-extrabold text-ink tabular-nums">{s.value}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="mt-4 mb-2 w-full text-[13px] font-extrabold text-ink">Chiêu thức</h3>
      {moves == null ? (
        <p className="w-full text-[11.5px] text-ink-dim">Đang tải…</p>
      ) : moves.length === 0 ? (
        <p className="w-full text-[11.5px] text-ink-dim">Chưa có dữ liệu chiêu.</p>
      ) : (
        <div className="flex w-full flex-wrap gap-2">
          {moves.map((mv) => (
            <span
              key={mv.id + mv.name}
              className="inline-flex items-center gap-1.5 rounded-pill border bg-card-alt px-2.5 py-1"
              style={{ borderColor: typeColor(mv.type) + '88' }}
            >
              <span className="size-2 rounded-full" style={{ background: typeColor(mv.type) }} />
              <span className="text-xs font-extrabold text-ink capitalize">{mv.name}</span>
              <span className="text-[10.5px] font-bold text-ink-dim">
                {typeLabel(mv.type)}
                {mv.power ? ` · ${mv.power}` : ''}
              </span>
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function RailNode({
  formId,
  name,
  reached,
  tag,
  accent,
  selected,
  onPress,
}: {
  formId: number;
  name: string;
  reached: boolean;
  tag: string;
  accent: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const dim = !reached && !selected;
  const inner = (
    <>
      <span className={dim ? 'opacity-30' : undefined}>
        <CreatureImage formId={formId} size={48} />
      </span>
      <span className="w-full truncate px-1 text-center text-[11px] font-bold text-ink capitalize">{name}</span>
      <span
        className="w-full truncate px-1 text-center text-[9.5px] font-bold"
        style={{ color: reached || selected ? accent : 'var(--color-ink-dim)' }}
      >
        {tag}
      </span>
    </>
  );

  const cls =
    'grid w-20 shrink-0 justify-items-center gap-0.5 rounded-[12px] bg-card-alt py-2 ' +
    (selected ? 'border-[2.5px]' : 'border-[1.5px]');
  const style = { borderColor: reached || selected ? accent : 'var(--color-line)' };

  return onPress ? (
    <button
      type="button"
      onClick={() => {
        feedbackTap();
        onPress();
      }}
      className={cls}
      style={style}
    >
      {inner}
    </button>
  ) : (
    <div className={cls} style={style}>
      {inner}
    </div>
  );
}
