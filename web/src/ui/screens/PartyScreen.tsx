import { Fragment, useEffect, useMemo, useState } from 'react';
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
} from '@app/collection';
import { fetchMegas } from '@app/megaForms';
import { type MegaForm, type MoveInfo, type PokeInfo, fetchMoves, fetchPokeInfo } from '@app/species';
import { typeColor, typeLabel } from '@app/pokemonTypes';
import {
  type BossEncounter,
  type BossTier,
  type Combatant,
  activeBoss,
  bstFromStats,
  lineupAtkScale,
  lineupScale,
  nextBoss,
  nextTeamMilestone,
  shinyStats,
  SHINY_STAT_MUL,
  teamMilestonesUpTo,
  teamRank,
  toCombatant,
} from '@app/battle';
import { ITEMS, RARITY, applyHeld, itemByKey, itemDropFor } from '@app/items';
import { LIVE_ATK_MUL, LIVE_HP_MUL } from '@app/battleLive';
import { feedbackComplete, feedbackTap } from '@app/feedback';
import { CreatureImage, ProgressBar } from '@web/ui/components/Bits';
import { Card, Page, PageHead } from '@web/ui/components/Layout';
import Dialog from '@web/ui/components/Dialog';
import Icon from '@web/ui/Icon';
import BattleArena, { type Fighter } from '@web/ui/components/BattleArena';
import useMedia from '@web/ui/useMedia';

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

// Trạng thái NUÔI của một con — dùng cho tag ở lưới và cho nút "Cho ăn".
//
// Phải khớp đúng luật trong AppContext.feedPokemon:
//   spend = min(kẹo, FEED_CHUNK, MEGA_AFFECTION - affection); spend <= 0 -> không làm gì.
// Nghĩa là chạm trần MEGA_AFFECTION là hết đường nuôi, kể cả khi loài không có Mega.
// `megas === undefined` = chưa tra xong PokéAPI.
function growth(mon: PartyMon, megas: MegaForm[] | undefined) {
  const v = view(mon);
  const hasMega = (megas?.length ?? 0) > 0;
  const atCap = mon.affection >= MEGA_AFFECTION;
  const nextAt = atCap ? null : !v.maxedEvo ? EVO_AFFECTION[v.stage + 1] : hasMega ? MEGA_AFFECTION : null;

  return {
    ...v,
    hasMega,
    megasKnown: megas !== undefined,
    need: nextAt == null ? null : Math.max(0, Math.ceil(nextAt - mon.affection)),
    growable: nextAt != null,
  };
}

type SortKey = 'power' | 'affection' | 'need' | 'new';
type FilterKey = 'all' | 'ready' | 'growing' | 'max' | 'shiny';

const SORTS: { k: SortKey; label: string }[] = [
  { k: 'power', label: 'Mạnh nhất' },
  { k: 'affection', label: 'Thân thiết' },
  { k: 'need', label: 'Gần tiến hoá' },
  { k: 'new', label: 'Mới nhất' },
];

const FILTERS: { k: FilterKey; label: string }[] = [
  { k: 'all', label: 'Tất cả' },
  { k: 'ready', label: 'Đủ kẹo' },
  { k: 'growing', label: 'Đang nuôi' },
  { k: 'max', label: 'Tối đa' },
  { k: 'shiny', label: 'Shiny' },
];

function searchText(mon: PartyMon): string {
  return [...mon.line.map((f) => f.name), mon.megaName ?? ''].join(' ').toLowerCase();
}

// ===== Màn Bầy =====
//
// Vấn đề của bản cũ (và của bản điện thoại): lưới chọn con rồi NGAY DƯỚI nó là bảng chăm sóc
// dài cả nghìn pixel. Bầy 18 con là phải cuộn qua hết lưới mới thấy bảng, đổi con lại cuộn
// lên rồi cuộn xuống lại.
//
// Trên web có chiều ngang, nên: lưới bên trái, bảng chăm sóc là cột PHẢI DÍNH (sticky). Chọn
// con nào thì cột phải đổi ngay tại chỗ, không cuộn một pixel nào. Màn hẹp (< 1280px) thì
// bảng đó thành hộp thoại — vẫn không phải cuộn.
export default function PartyScreen() {
  const { data, feedPokemon, reportBattleWin, claimTeamPower, buyEgg, hatchEgg } = useApp();
  const wide = useMedia('(min-width: 1280px)');

  const party = useMemo(
    () => [...(data.party ?? [])].sort((a, b) => b.affection - a.affection || b.at - a.at),
    [data.party]
  );
  const candy = Math.floor(data.candy ?? 0);
  const pendingEggs = data.pendingEggs?.length ?? 0;

  // Không tự chọn sẵn con nào: mở màn là thấy CẢ bầy, chọn rồi mới hiện bảng chăm sóc.
  const [selKey, setSelKey] = useState<string | null>(null);
  const sel = selKey ? (party.find((m) => m.key === selKey) ?? null) : null;

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
  const readyCount = party.filter((m) => {
    const g = growth(m, megasOf(m));
    return g.need != null && candy >= g.need;
  }).length;

  // Shiny +10% chỉ số (shinyStats trong battle.ts) — BST hiển thị/xếp hạng phải khớp trận đấu.
  const bstOf = (m: PartyMon) => {
    const info = infos[currentForm(m).id];
    return info ? bstFromStats(shinyStats(info.stats, m.shiny)) : 0;
  };
  const teamPower = party.reduce((s, m) => s + bstOf(m), 0);
  const allLoaded = party.length > 0 && party.every((m) => infos[currentForm(m).id]);

  // Đạt mốc Sức mạnh bầy -> trao kẹo (1 lần/mốc).
  useEffect(() => {
    if (allLoaded && teamPower > 0) claimTeamPower(teamPower);
  }, [teamPower, allLoaded, claimTeamPower]);

  // Thang mốc VÔ HẠN (xem teamMilestoneAt trong battle.ts) — không còn "đã đạt mốc cao nhất".
  const reached = teamMilestonesUpTo(teamPower);
  const nextMilestone = nextTeamMilestone(teamPower);
  const mBase = reached.length ? reached[reached.length - 1].power : 0;
  const mRatio = Math.max(0, Math.min(1, (teamPower - mBase) / (nextMilestone.power - mBase)));
  const rank = teamRank(teamPower);

  // ===== Tìm / lọc / xếp =====
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sortBy, setSortBy] = useState<SortKey>('power');

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = party
      .map((m) => ({ m, g: growth(m, megasOf(m)), bst: bstOf(m) }))
      .filter(({ m, g }) => {
        if (needle && !searchText(m).includes(needle)) return false;
        if (filter === 'ready') return g.need != null && candy >= g.need;
        if (filter === 'growing') return g.growable;
        if (filter === 'max') return !g.growable && g.megasKnown;
        if (filter === 'shiny') return m.shiny;
        return true;
      });

    const cmp: Record<SortKey, (a: (typeof rows)[0], b: (typeof rows)[0]) => number> = {
      power: (a, b) => b.bst - a.bst || b.m.affection - a.m.affection,
      affection: (a, b) => b.m.affection - a.m.affection,
      // Gần tiến hoá nhất lên trước; con đã tối đa xuống cuối.
      need: (a, b) => (a.g.need ?? Infinity) - (b.g.need ?? Infinity),
      new: (a, b) => b.m.at - a.m.at,
    };
    return [...rows].sort(cmp[sortBy]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [party, q, filter, sortBy, candy, megaMap, infos]);

  // ===== Đấu đạo trường: boss xuất hiện ngẫu nhiên có hẹn giờ =====
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
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
    makeBoss: (p: number) => Combatant;
    tier: BossTier;
    enc: BossEncounter;
    bossBst: number;
    auraTypes: [string, string];
    seed: number;
  } | null>(null);

  const openArena = () => {
    if (!bossReady || !encounter || !bossInfo || beaten) return;
    feedbackTap();
    const fighters: Fighter[] = party
      .map((m) => {
        const f = currentForm(m);
        const info = infos[f.id]!;
        const stats = shinyStats(info.stats, m.shiny); // shiny mạnh hơn dạng thường
        return {
          // Trang bị áp SAU toCombatant, KHÔNG vào bst -> boss không scale theo (lợi thế ròng).
          c: applyHeld(toCombatant(m.key, f.id, f.name || `#${f.id}`, info.types, stats), m.item),
          shiny: m.shiny,
          item: itemByKey(m.item), // để màn chọn/trong trận hiện món đang đeo
          bst: bstFromStats(stats), // cộng thành Sức mạnh đội hình -> scale boss
        };
      })
      .sort((a, b) => b.c.maxHp + b.c.atk - (a.c.maxHp + a.c.atk));
    const bossBst = bstFromStats(bossInfo.stats);
    const t = encounter.tier;
    // Boss XEM TRƯỚC (chưa scale) cho màn chọn quân hiện tên/hệ/ảnh.
    const boss = toCombatant('boss', encounter.species.id, encounter.species.name, bossInfo.types, bossInfo.stats, t.hpMul, t.atkMul);
    // Boss THẬT dựng sau khi biết đội hình: mang đội mạnh thì boss mạnh theo, nên bầy lớn tới
    // đâu lượt boss vẫn đáng đánh. LIVE_* là bội riêng của chế độ đánh-theo-lượt: trận phải
    // dài 9-13 lượt mới đủ chỗ cho đọc dự báo / dồn lực / đỡ đòn (xem battleLive.ts).
    const stats = bossInfo.stats;
    const makeBoss = (lineupPower: number) =>
      toCombatant(
        'boss',
        encounter.species.id,
        encounter.species.name,
        bossInfo.types,
        stats,
        t.hpMul * lineupScale(lineupPower) * LIVE_HP_MUL,
        t.atkMul * lineupAtkScale(lineupPower) * LIVE_ATK_MUL
      );
    setArena({
      team: fighters,
      boss,
      makeBoss,
      tier: t,
      enc: encounter,
      bossBst,
      auraTypes: encounter.auraTypes,
      seed: (encounter.seed + Date.now()) >>> 0,
    });
  };

  const detail = sel ? (
    <CarePanel key={sel.key} mon={sel} candy={candy} onFeed={() => feedPokemon(sel.key)} />
  ) : null;

  return (
    <>
      <Page wide>
        <PageHead title="Bầy của tôi" sub={`${party.length} Pokémon · ${reached.length} mốc sức mạnh đã đạt`} />

        {party.length > 0 && (
          <div className="mb-6 grid gap-4 lg:grid-cols-3">
            {/* Sức mạnh bầy — tổng chỉ số gốc dạng hiện tại */}
            <Card
              title="⚡ Sức mạnh bầy"
              aside={<span className="nums text-xl font-black text-accent">{allLoaded ? teamPower : '…'}</span>}
            >
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="rounded-pill px-2.5 py-0.5 text-[11.5px] font-black text-white"
                  style={{ background: rank.color }}
                >
                  {rank.label}
                </span>
                {rank.star > 0 && (
                  <span className="text-[12px] text-accent" title={`${rank.star} mốc vượt bảng`}>
                    {'★'.repeat(Math.min(rank.star, 5))}
                    {rank.star > 5 ? `+${rank.star - 5}` : ''}
                  </span>
                )}
              </div>
              <ProgressBar ratio={mRatio} color="var(--color-accent)" />
              <p className="nums mt-2 text-[12.5px] text-ink-dim">
                Còn {Math.max(0, nextMilestone.power - teamPower)} → mốc {nextMilestone.power} thưởng 🍬
                {nextMilestone.candy}
              </p>
            </Card>

            {/* Đấu đạo trường */}
            {encounter ? (
              <Card
                title="⚔️ Đấu đạo trường"
                aside={
                  <span
                    className="rounded-pill px-2.5 py-0.5 text-[11px] font-black text-white"
                    style={{ background: encounter.tier.color }}
                  >
                    {encounter.tier.label}
                  </span>
                }
              >
                <div className="flex items-center gap-3">
                  <span
                    className="grid size-16 shrink-0 place-items-center rounded-ctl border-[1.5px] bg-card-alt"
                    style={{ borderColor: encounter.tier.color }}
                  >
                    <CreatureImage formId={encounter.species.id} size={58} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-extrabold text-ink capitalize">{encounter.species.name}</p>
                    <p className="nums mt-0.5 text-[12.5px] font-semibold text-ink-dim">
                      {beaten
                        ? '✓ Đã hạ lượt này'
                        : `Biến mất sau ${countdown(encounter.expireAt - now)} · thắng 🍬~${rewardPreview}`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openArena}
                  disabled={!bossReady || beaten}
                  className="mt-3 w-full rounded-pill bg-primary py-2.5 text-[13.5px] font-extrabold text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {beaten ? 'Đã hạ lượt này' : bossReady ? 'Vào trận' : 'Đang tải…'}
                </button>
              </Card>
            ) : (
              <Card title="⚔️ Đấu đạo trường">
                <div className="flex items-center gap-3">
                  <span className="grid size-16 shrink-0 place-items-center rounded-ctl border border-dashed border-line text-[26px]">
                    💤
                  </span>
                  <div className="min-w-0">
                    <p className="text-[15px] font-extrabold text-ink">Chưa có boss</p>
                    <p className="nums mt-0.5 text-[12.5px] font-semibold text-ink-dim">
                      Xuất hiện {clockAt(upcoming.spawnAt)} · còn {countdown(upcoming.spawnAt - now)}
                    </p>
                  </div>
                </div>
              </Card>
            )}

            {/* Cửa hàng trứng */}
            <Card
              title="🛒 Cửa hàng trứng"
              aside={
                pendingEggs > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      feedbackTap();
                      hatchEgg();
                    }}
                    className="rounded-pill bg-accent px-3 py-1 text-[11.5px] font-extrabold text-white transition-colors hover:brightness-110"
                  >
                    Nở ngay 🥚 ×{pendingEggs}
                  </button>
                ) : undefined
              }
            >
              <p className="mb-3 text-[12.5px] text-ink-dim">Đổi kẹo lấy trứng — cách nhanh để thu thêm Pokémon.</p>
              <div className="grid grid-cols-2 gap-2">
                <EggBtn label="🥚 Trứng thường" price={EGG_PRICE} candy={candy} onBuy={() => buyEgg(false)} />
                <EggBtn label="🥚✨ Trứng hiếm" price={RARE_EGG_PRICE} candy={candy} rare onBuy={() => buyEgg(true)} />
              </div>
            </Card>
          </div>
        )}

        {party.length === 0 ? (
          <div className="grid justify-items-center gap-2 rounded-card border border-dashed border-line bg-card px-6 py-16 text-center">
            <span className="text-5xl">🥚</span>
            <p className="mt-2 text-lg font-extrabold text-ink">Bầy còn trống</p>
            <p className="max-w-sm text-sm text-ink-dim">
              Hoàn thành mục tiêu để nở trứng và thu phục Pokémon đầu tiên.
            </p>
          </div>
        ) : (
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
            <div>
              {/* Thanh công cụ: tìm + lọc + xếp. Bầy đông thì đây là cách duy nhất để tìm
                  nhanh một con, thay vì đưa mắt quét cả lưới. */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <label className="relative flex-1 basis-52">
                  <span className="sr-only">Tìm Pokémon theo tên</span>
                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="Tìm theo tên…"
                    autoComplete="off"
                    className="w-full rounded-pill border border-line bg-card py-2 pr-3 pl-9 text-[13.5px] text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-primary"
                  />
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-dim">
                    <Icon name="search-outline" size={14} />
                  </span>
                </label>

                <div className="flex flex-wrap gap-1.5">
                  {FILTERS.map((f) => (
                    <button
                      key={f.k}
                      type="button"
                      onClick={() => setFilter(f.k)}
                      aria-pressed={filter === f.k}
                      className={
                        'rounded-pill border px-3 py-1.5 text-[12.5px] font-extrabold transition-colors ' +
                        (filter === f.k
                          ? 'border-primary bg-primary text-white'
                          : 'border-line bg-card text-ink-dim hover:text-ink')
                      }
                    >
                      {f.label}
                      {f.k === 'ready' && readyCount > 0 ? ` ${readyCount}` : ''}
                    </button>
                  ))}
                </div>

                <label className="ml-auto flex items-center gap-2 text-[12.5px] font-bold text-ink-dim">
                  Xếp theo
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as SortKey)}
                    className="rounded-pill border border-line bg-card px-3 py-1.5 text-[12.5px] font-extrabold text-ink outline-none focus:border-primary"
                  >
                    {SORTS.map((s) => (
                      <option key={s.k} value={s.k}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {shown.length === 0 ? (
                <p className="rounded-card border border-dashed border-line bg-card px-4 py-10 text-center text-sm text-ink-dim">
                  Không con nào khớp. Đổi từ khoá hoặc bộ lọc.
                </p>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5">
                  {shown.map(({ m, g, bst }) => (
                    <li key={m.key}>
                      <RosterCell
                        mon={m}
                        g={g}
                        bst={bst}
                        selected={sel?.key === m.key}
                        candy={candy}
                        onSelect={() => {
                          feedbackTap();
                          setSelKey(m.key);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-3 text-[12px] leading-relaxed text-ink-dim">
                Số trên thẻ = kẹo cần để lên dạng kế tiếp.{' '}
                <span className="font-extrabold text-green">▲</span> đủ kẹo, nuôi được ngay ·{' '}
                <span className="font-extrabold text-accent">🍬</span> chưa đủ ·{' '}
                <span className="font-extrabold text-ink-dim">MAX</span> hết đường nuôi
              </p>
            </div>

            {/* Cột chăm sóc DÍNH: đổi con là đổi tại chỗ, không cuộn. */}
            {wide && (
              <aside className="scroller sticky top-8 max-h-[calc(100dvh-5rem)] xl:block">
                {detail ?? (
                  <div className="grid justify-items-center gap-2 rounded-card border border-dashed border-line bg-card px-5 py-14 text-center">
                    <span className="text-4xl">👈</span>
                    <p className="text-[14.5px] font-extrabold text-ink">Chọn một con</p>
                    <p className="max-w-56 text-[12.5px] text-ink-dim">
                      Bảng chăm sóc, cây tiến hoá và chỉ số sẽ hiện ở đây.
                    </p>
                  </div>
                )}
              </aside>
            )}
          </div>
        )}
      </Page>

      {/* Màn hẹp: bảng chăm sóc thành hộp thoại — vẫn không phải cuộn qua cả lưới. */}
      {!wide && (
        <Dialog
          open={!!sel}
          onClose={() => setSelKey(null)}
          title={sel ? view(sel).form.name || `#${view(sel).form.id}` : ''}
          subtitle={`Kẹo đang có: 🍬 ${candy}`}
        >
          {detail}
        </Dialog>
      )}

      {arena && (
        <BattleArena
          team={arena.team}
          boss={arena.boss}
          makeBoss={arena.makeBoss}
          auraTypes={arena.auraTypes}
          tier={arena.tier}
          seed={arena.seed}
          onWin={() => reportBattleWin(arena.enc.id, arena.bossBst, arena.tier.candyMul, arena.tier.winEgg, itemDropFor(arena.enc)?.key ?? null)}
          onClose={() => setArena(null)}
        />
      )}
    </>
  );
}

function EggBtn({
  label,
  price,
  candy,
  rare,
  onBuy,
}: {
  label: string;
  price: number;
  candy: number;
  rare?: boolean;
  onBuy: () => void;
}) {
  const can = candy >= price;
  return (
    <button
      type="button"
      disabled={!can}
      onClick={onBuy}
      className={
        'grid justify-items-center gap-1 rounded-ctl border bg-card-alt py-3 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ' +
        (rare ? 'border-accent hover:bg-accent/10' : 'border-line hover:border-primary/60')
      }
    >
      <span className="text-[12.5px] font-extrabold text-ink">{label}</span>
      <span className={'nums text-[13px] font-black ' + (rare ? 'text-accent' : 'text-primary-soft')}>🍬 {price}</span>
    </button>
  );
}

// Một thẻ trong lưới. Bản cũ chỉ có sprite + một dải tag, tên bị cắt mất -> nhìn 18 ô vuông
// giống nhau không biết con nào là con nào. Giờ có tên, lực và tình trạng nuôi.
function RosterCell({
  mon,
  g,
  bst,
  selected,
  candy,
  onSelect,
}: {
  mon: PartyMon;
  g: ReturnType<typeof growth>;
  bst: number;
  selected: boolean;
  candy: number;
  onSelect: () => void;
}) {
  const name = g.form.name || `#${g.form.id}`;
  const ready = g.need != null && candy >= g.need;

  const tag = !g.megasKnown
    ? null // chưa tra xong dạng đặc biệt -> chưa dám kết luận MAX
    : g.need == null
      ? { text: 'MAX', cls: 'bg-line/60 text-ink-dim', hint: 'đã tối đa' }
      : ready
        ? { text: `▲ ${g.need}`, cls: 'bg-green/20 text-green', hint: `đủ kẹo, cần ${g.need} để tiến hoá` }
        : { text: `🍬 ${g.need}`, cls: 'bg-accent/20 text-accent', hint: `còn thiếu ${g.need - candy} kẹo` };

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      title={name + (tag ? ` — ${tag.hint}` : '')}
      className={
        'grid w-full gap-1 overflow-hidden rounded-card border bg-card p-2 text-center transition-colors ' +
        (selected ? 'border-primary bg-primary/10' : 'border-line hover:border-primary/50')
      }
    >
      <span className="relative grid aspect-square place-items-center">
        <CreatureImage formId={g.form.id} shiny={mon.shiny} size={72} />
        {mon.shiny && <span className="absolute top-0 left-0 text-[11px]">✨</span>}
        {/* Món đang đeo — nhìn lưới là biết con nào có trang bị, khỏi mở từng bảng. */}
        {mon.item && (
          <span className="absolute bottom-0 right-0 text-[12px]" title={itemByKey(mon.item)?.name}>
            {itemByKey(mon.item)?.emoji}
          </span>
        )}
        {g.isMega && (
          <span className="absolute top-0 right-0 rounded-pill bg-accent px-1 text-[9px] font-black text-white">
            MEGA
          </span>
        )}
      </span>
      <span className="truncate text-[12.5px] font-bold text-ink capitalize">{name}</span>
      <span className="flex items-center justify-between gap-1">
        <span className={'nums rounded-pill px-1.5 py-px text-[10px] font-black ' + (tag?.cls ?? '')}>
          {tag?.text ?? ' '}
        </span>
        {bst > 0 && <span className="nums text-[10px] font-black text-ink-dim">⚡{bst}</span>}
      </span>
    </button>
  );
}

function CarePanel({ mon, candy, onFeed }: { mon: PartyMon; candy: number; onFeed: () => void }) {
  const { pickMega, data, setHeldItem } = useApp();
  const bag = data.items ?? {};
  const worn = itemByKey(mon.item);
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
  const chosenId = hasMega ? (mon.megaChoice ?? megas[0].id) : undefined;
  const superName = hasMega ? (megas.find((m) => m.id === chosenId)?.name ?? megas[0].name) : 'dạng đặc biệt';
  const hot = v.isMega || (v.maxedEvo && hasMega);

  const g = growth(mon, megas ?? undefined);

  const label = v.isMega
    ? `🔮 Đã hoá ${v.form.name}`
    : v.maxedEvo
      ? hasMega
        ? `Nuôi tiếp để mở ${superName} 🔮`
        : '🌟 Đã tiến hoá tối đa'
      : `Bậc ${v.stage + 1}/${mon.line.length} · cho ăn để tiến hoá`;

  // Con đã chạm trần MEGA_AFFECTION thì feedPokemon không làm gì (spend <= 0) -> nút phải TẮT.
  const canFeed = candy > 0 && g.growable;
  const feedLabel = !g.growable
    ? v.isMega
      ? 'Hết đường nuôi'
      : 'Đã nuôi tối đa 🌟'
    : candy <= 0
      ? 'Chưa có kẹo'
      : `Cho ăn 🍬 ${Math.min(candy, FEED_CHUNK)}`;

  return (
    <div className="grid gap-4">
      <Card>
        {/* Sân khấu: quầng sáng + tim bay khi cho ăn */}
        <div className="relative grid h-40 place-items-center">
          <span
            className="absolute size-32 animate-pulse rounded-full blur-xl"
            style={{ background: (hot ? 'var(--color-accent)' : 'var(--color-primary)') + '55' }}
          />
          {v.isMega && <span className="absolute top-1 text-[26px]">✨</span>}
          {hearts.map((h, i) => (
            <span
              key={h}
              className="anim-heart pointer-events-none absolute bottom-16 text-[22px]"
              style={{ ['--dx' as string]: `${(i - 1) * 26}px` }}
            >
              ❤️
            </span>
          ))}
          <span key={jump} className={jump > 0 ? 'anim-jump relative' : 'relative'}>
            <CreatureImage formId={v.form.id} shiny={mon.shiny} size={132} />
          </span>
        </div>

        <p className="mt-1 text-center text-xl font-extrabold text-ink capitalize">
          {mon.shiny ? '✨ ' : ''}
          {v.form.name || `#${String(v.form.id).padStart(4, '0')}`}
        </p>
        <p className="mt-0.5 mb-3 text-center text-[12.5px] font-bold text-ink-dim">{label}</p>

        <ProgressBar
          ratio={v.ratio}
          color={hot ? 'var(--color-accent)' : v.maxedEvo ? 'var(--color-green)' : 'var(--color-primary)'}
        />

        <button
          type="button"
          onClick={feed}
          disabled={!canFeed}
          className={
            'mt-3 w-full rounded-pill py-3 text-[14px] font-extrabold transition-colors ' +
            (canFeed ? 'bg-primary text-white hover:brightness-110' : 'cursor-not-allowed bg-card-alt text-ink-dim')
          }
        >
          {feedLabel}
        </button>

        {g.need != null && (
          <p className="nums mt-2 text-center text-[12px] font-bold text-ink-dim">
            {candy >= g.need
              ? `▲ Đủ kẹo! Cần 🍬 ${g.need} nữa là lên dạng kế tiếp (mỗi lần ${FEED_CHUNK})`
              : `Còn thiếu 🍬 ${g.need - candy} — cần ${g.need}, đang có ${candy}`}
          </p>
        )}
      </Card>

      {/* ===== Trang bị: rơi từ boss, đeo RIÊNG từng con ===== */}
      <Card title={worn ? `Trang bị · đang đeo ${worn.emoji} ${worn.name}` : 'Trang bị'}>
        {worn == null && ITEMS.every((it) => (bag[it.key] ?? 0) <= 0) ? (
          <p className="text-[12.5px] text-ink-dim">
            Túi trống — thắng boss ở Đấu đạo trường để nhặt trang bị. Boss càng khó càng dễ rơi, và mới có cửa ra đồ Sử thi/Huyền thoại.
          </p>
        ) : (
          <div className="grid gap-1.5">
            {/* Viền + tên tô MÀU BẬC HIẾM (xám/lam/tím/vàng) — nhìn màu là biết độ quý. */}
            {worn && (
              <button
                type="button"
                onClick={() => setHeldItem(mon.key, null)}
                className="flex items-center gap-2.5 rounded-ctl border-[1.5px] px-3 py-2 text-left transition-colors hover:brightness-110"
                style={{ borderColor: RARITY[worn.rarity].color, background: RARITY[worn.rarity].color + '14' }}
              >
                <span className="text-[20px]">{worn.emoji}</span>
                <span>
                  <span className="block text-[12.5px] font-extrabold" style={{ color: RARITY[worn.rarity].color }}>
                    {worn.name} · {worn.desc}
                  </span>
                  <span className="block text-[10.5px] font-semibold text-ink-dim">
                    <span className="font-black" style={{ color: RARITY[worn.rarity].color }}>{RARITY[worn.rarity].label}</span> · bấm để THÁO
                  </span>
                </span>
              </button>
            )}
            {ITEMS.filter((it) => (bag[it.key] ?? 0) > 0).map((it) => (
              <button
                key={it.key}
                type="button"
                onClick={() => setHeldItem(mon.key, it.key)}
                className="flex items-center gap-2.5 rounded-ctl border bg-card px-3 py-2 text-left transition-colors hover:brightness-110"
                style={{ borderColor: RARITY[it.rarity].color + '88' }}
              >
                <span className="text-[20px]">{it.emoji}</span>
                <span>
                  <span className="block text-[12.5px] font-extrabold" style={{ color: RARITY[it.rarity].color }}>
                    {it.name} ×{bag[it.key]} · {it.desc}
                  </span>
                  <span className="block text-[10.5px] font-semibold text-ink-dim">
                    <span className="font-black" style={{ color: RARITY[it.rarity].color }}>{RARITY[it.rarity].label}</span> · bấm để đeo{worn ? ' (đổi món)' : ''}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card title="Cây tiến hoá">
        <div className="flex flex-wrap items-center justify-center gap-1">
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
                    : 'bấm để đổi'
                  : selected
                    ? '● sẽ hoá'
                    : 'bấm chọn';
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
          <p className="mt-2 text-center text-[12px] text-ink-dim">
            {multiMega
              ? v.isMega
                ? 'Bấm một dạng ở trên để ĐỔI hình thái 🔮'
                : `Bấm chọn dạng · nuôi đầy thanh để hoá ${superName} 🔮`
              : v.isMega
                ? ''
                : `Cho RIÊNG con này ăn tới khi đầy thanh để mở ${superName} 🔮`}
          </p>
        )}
      </Card>

      {info && (
        <Card
          title={mon.shiny ? 'Chỉ số gốc ✨' : 'Chỉ số gốc'}
          aside={<span className="nums text-[13px] font-black text-accent">⚡ {bstFromStats(shinyStats(info.stats, mon.shiny))}</span>}
        >
          <div className="mb-3 flex flex-wrap gap-2">
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
          <p className="nums mb-3 text-xs font-bold text-ink-dim">
            {info.genus ? `${info.genus} · ` : ''}
            {info.heightM.toFixed(1)}m · {info.weightKg.toFixed(1)}kg
          </p>

          {mon.shiny && (
            <p className="mb-2 text-[11.5px] font-bold text-accent">✨ Shiny mạnh hơn dạng thường: MỌI chỉ số ×{SHINY_STAT_MUL}</p>
          )}
          <div className="grid gap-1.5">
            {shinyStats(info.stats, mon.shiny).map((s) => (
              <div key={s.name} className="flex items-center gap-2">
                <span className="w-12 text-[11.5px] font-bold text-ink-dim">{STAT_VI[s.name] ?? s.name}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-pill bg-track">
                  <span
                    className="block h-full rounded-pill"
                    style={{
                      width: `${Math.min(100, (s.value / 180) * 100)}%`,
                      background: s.value >= 100 ? 'var(--color-accent)' : 'var(--color-primary)',
                    }}
                  />
                </span>
                <span className="nums w-7 text-right text-[11.5px] font-extrabold text-ink">{s.value}</span>
              </div>
            ))}
          </div>

          {info.flavor && (
            <p className="mt-3 border-t border-line pt-3 text-[12.5px] leading-relaxed text-ink-dim italic">
              “{info.flavor}”
            </p>
          )}
        </Card>
      )}

      <Card title="Chiêu thức">
        {moves == null ? (
          <p className="text-[12.5px] text-ink-dim">Đang tải…</p>
        ) : moves.length === 0 ? (
          <p className="text-[12.5px] text-ink-dim">Chưa có dữ liệu chiêu.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {moves.map((mv) => (
              <span
                key={mv.id + mv.name}
                className="inline-flex items-center gap-1.5 rounded-pill border bg-card-alt px-2.5 py-1"
                style={{ borderColor: typeColor(mv.type) + '88' }}
              >
                <span className="size-2 rounded-full" style={{ background: typeColor(mv.type) }} />
                <span className="text-xs font-extrabold text-ink capitalize">{mv.name}</span>
                <span className="nums text-[10.5px] font-bold text-ink-dim">
                  {typeLabel(mv.type)}
                  {mv.power ? ` · ${mv.power}` : ''}
                </span>
              </span>
            ))}
          </div>
        )}
      </Card>
    </div>
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
        <CreatureImage formId={formId} size={52} />
      </span>
      <span className="w-full truncate px-1 text-center text-[11.5px] font-bold text-ink capitalize">{name}</span>
      <span
        className="w-full truncate px-1 text-center text-[9.5px] font-bold"
        style={{ color: reached || selected ? accent : 'var(--color-ink-dim)' }}
      >
        {tag}
      </span>
    </>
  );

  const cls =
    'grid w-[86px] shrink-0 justify-items-center gap-0.5 rounded-ctl bg-card-alt py-2 transition-colors ' +
    (selected ? 'border-2' : 'border');
  const style = { borderColor: reached || selected ? accent : 'var(--color-line)' };

  return onPress ? (
    <button
      type="button"
      onClick={() => {
        feedbackTap();
        onPress();
      }}
      className={cls + ' hover:brightness-110'}
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
