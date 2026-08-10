import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, Easing, ActivityIndicator, useWindowDimensions, TextInput, Modal, Platform, StatusBar } from 'react-native';
import { useApp } from '../AppContext';
import { PartyMon } from '../types';
import CreatureImage from '../components/CreatureImage';
import ItemSprite from '../components/ItemSprite';
import ProgressBar from '../components/ProgressBar';
import { stageFromAffection, EVO_AFFECTION, MEGA_AFFECTION, FEED_CHUNK, streakFire, currentForm, EGG_PRICE, RARE_EGG_PRICE } from '../collection';
import { habitStreak } from '../gameLogic';
import { todayStr } from '../date';
import { fetchMegas } from '../megaForms';
import { MegaForm, MoveInfo, fetchMoves, PokeInfo, fetchPokeInfo } from '../species';
import { typeColor, typeLabel } from '../pokemonTypes';
import { bstFromStats, shinyStats, SHINY_STAT_MUL, activeBoss, nextBoss, toCombatant, nextTeamMilestone, teamMilestonesUpTo, teamRank, Combatant, BossEncounter, BossTier, lineupScale, lineupAtkScale } from '../battle';
import { ITEMS, RARITY, itemByKey, applyHeld, itemDropFor } from '../items';
import { LIVE_HP_MUL, LIVE_ATK_MUL } from '../battleLive';
import BattleArena, { Fighter } from '../components/BattleArena';
import { Colors, radius, spacing, TAB_BAR_SPACE } from '../theme';
import { useTheme, useThemedStyles } from '../theme-context';
import { feedbackTap, feedbackComplete } from '../feedback';

// Đếm ngược ms -> "1g 05p" / "12:34" / "45p".
function countdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}g ${String(m).padStart(2, '0')}p`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
// Giờ trong ngày "14:05" cho mốc spawn kế tiếp.
function clockAt(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Dạng hiển thị + tiến trình nuôi của RIÊNG một con.
// Lưới chọn Pokémon: 5 cột, ô tự giãn theo bề rộng máy.
const ROSTER_COLS = 5;
const ROSTER_GAP = spacing.sm;

// Bầy đông (50+ con) thì cuộn tìm một con rất mệt, nên có tìm kiếm + lọc + xếp,
// và chỉ vẽ trước một phần rồi "xem thêm".
const PAGE = 25;

type SortKey = 'power' | 'affection' | 'need' | 'new';
type FilterKey = 'all' | 'ready' | 'growing' | 'max' | 'shiny';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'power', label: 'Lực chiến' },
  { key: 'affection', label: 'Thân thiết' },
  { key: 'need', label: 'Gần tiến hoá' },
  { key: 'new', label: 'Mới nhất' },
];
const FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'ready', label: '▲ Đủ kẹo' },
  { key: 'growing', label: 'Đang nuôi' },
  { key: 'max', label: 'MAX' },
  { key: 'shiny', label: '✨ Shiny' },
];

// Mọi tên mà con này từng/đang mang -> gõ "swamp" là ra Mega Swampert.
function searchText(mon: PartyMon): string {
  return [...mon.line.map((f) => f.name), mon.megaName ?? '']
    .join(' ')
    .toLowerCase();
}

const STAT_VI: Record<string, string> = {
  hp: 'HP', attack: 'Công', defense: 'Thủ', 'special-attack': 'Đ.Công', 'special-defense': 'Đ.Thủ', speed: 'Tốc',
};

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

// Trạng thái NUÔI của một con — dùng cho tag ở lưới chọn và cho nút "Cho ăn".
//
// Phải khớp đúng luật trong AppContext.feedPokemon:
//   spend = min(kẹo, FEED_CHUNK, MEGA_AFFECTION - affection); spend <= 0 -> không làm gì.
// Nghĩa là chạm trần MEGA_AFFECTION là hết đường nuôi, kể cả khi loài không có Mega.
// `megas === undefined` = chưa tra xong PokéAPI, chưa dám kết luận MAX.
function growth(mon: PartyMon, megas: MegaForm[] | undefined) {
  const v = view(mon);
  const hasMega = (megas?.length ?? 0) > 0;
  const atCap = mon.affection >= MEGA_AFFECTION; // trần tuyệt đối, cho ăn thêm vô ích

  const nextAt = atCap ? null : !v.maxedEvo ? EVO_AFFECTION[v.stage + 1] : hasMega ? MEGA_AFFECTION : null;

  return {
    ...v,
    hasMega,
    megasKnown: megas !== undefined,
    // Kẹo cần để lên dạng kế tiếp (null = hết đường nuôi).
    // Không bao giờ bằng 0: bậc suy ra từ affection nên luôn còn thiếu ít nhất 1.
    need: nextAt == null ? null : Math.max(1, Math.ceil(nextAt - mon.affection)),
    growable: nextAt != null,
  };
}

export default function PartyScreen() {
  const { data, feedPokemon, reportBattleWin, claimTeamPower, buyEgg, hatchEgg } = useApp();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const party = [...(data.party ?? [])].sort((a, b) => b.affection - a.affection || b.at - a.at);
  // Chạm một con thì mở BẢNG RIÊNG. Trước đây bảng nuôi nằm DƯỚI cả lưới, bầy 50+ con là
  // phải cuộn rất lâu mới thấy con mình vừa chạm.
  const [selKey, setSelKey] = useState<string | null>(null);
  const sel = selKey ? party.find((m) => m.key === selKey) ?? null : null;
  const [q, setQ] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('power');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [limit, setLimit] = useState(PAGE);
  const candy = Math.floor(data.candy ?? 0);
  const pendingEggs = data.pendingEggs?.length ?? 0;
  const bestStreak = data.habits.reduce((m, h) => Math.max(m, habitStreak(h, todayStr())), 0);

  // Chỉ số gốc của DẠNG hiện tại mỗi con -> Sức mạnh bầy + dữ liệu đấu boss.
  const [infos, setInfos] = useState<Record<number, PokeInfo>>({});
  const curIds = party.map((m) => currentForm(m).id).join(',');
  useEffect(() => {
    let alive = true;
    const ids = party.map((m) => currentForm(m).id);
    Promise.all(ids.map((id) => fetchPokeInfo(id).then((i) => [id, i] as const))).then((pairs) => {
      if (!alive) return;
      setInfos((prev) => {
        const next = { ...prev };
        for (const [id, i] of pairs) if (i) next[id] = i;
        return next;
      });
    });
    return () => { alive = false; };
  }, [curIds]);

  // Dạng đặc biệt (Mega/Ash...) của TỪNG con -> biết con nào còn nuôi được tiếp.
  // fetchMegas có cache riêng nên tra cho cả bầy vẫn rẻ.
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
    return () => { alive = false; };
  }, [finalIds]);

  // Ô lưới GIÃN theo bề rộng máy để hàng lấp đầy đúng hai mép — ô cố định 60pt sẽ để hở
  // một khoảng bên phải, trông như bị lệch.
  const { width: winW } = useWindowDimensions();
  const cellSize = Math.floor((winW - spacing.lg * 2 - ROSTER_GAP * (ROSTER_COLS - 1)) / ROSTER_COLS);

  const megasOf = (m: PartyMon) => megaMap[m.line[m.line.length - 1].id];
  // "Sẵn sàng" = kẹo đang có đủ để đẩy con đó lên dạng kế tiếp.
  const readyCount = party.filter((m) => {
    const g = growth(m, megasOf(m));
    return g.need != null && candy >= g.need;
  }).length;

  // ===== Tìm / lọc / xếp bầy =====
  // Shiny +10% chỉ số (xem shinyStats trong battle.ts) — BST hiển thị/xếp hạng phải khớp trận đấu.
  const bstOf = (m: PartyMon) => {
    const info = infos[currentForm(m).id];
    return info ? bstFromStats(shinyStats(info.stats, m.shiny)) : 0;
  };
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = party.filter((m) => {
      if (needle && !searchText(m).includes(needle)) return false;
      const g = growth(m, megasOf(m));
      switch (filter) {
        case 'ready': return g.need != null && candy >= g.need;
        case 'growing': return g.need != null;
        case 'max': return g.megasKnown && g.need == null;
        case 'shiny': return m.shiny;
        default: return true;
      }
    });
    const cmp: Record<SortKey, (a: PartyMon, b: PartyMon) => number> = {
      power: (a, b) => bstOf(b) - bstOf(a) || b.affection - a.affection,
      affection: (a, b) => b.affection - a.affection,
      // Thiếu ít kẹo nhất lên đầu; con hết đường nuôi (need = null) xuống cuối.
      need: (a, b) => (growth(a, megasOf(a)).need ?? Infinity) - (growth(b, megasOf(b)).need ?? Infinity),
      new: (a, b) => b.at - a.at,
    };
    return [...list].sort(cmp[sortBy]);
  }, [party, q, filter, sortBy, candy, megaMap, infos]);

  // Đổi bộ lọc thì quay lại trang đầu, kẻo đang mở 100 con rồi lọc còn 3 con.
  useEffect(() => setLimit(PAGE), [q, filter, sortBy]);

  const teamPower = party.reduce((s, m) => s + bstOf(m), 0);
  const allLoaded = party.length > 0 && party.every((m) => infos[currentForm(m).id]);

  // Đạt mốc Sức mạnh bầy -> trao kẹo (1 lần/mốc).
  useEffect(() => {
    if (allLoaded && teamPower > 0) claimTeamPower(teamPower);
  }, [teamPower, allLoaded]);

  // Thang mốc VÔ TẬN: luôn có mốc kế tiếp, nên thẻ không còn đứng ở "đã đạt mốc cao nhất".
  const reached = teamMilestonesUpTo(teamPower);
  const nextMilestone = nextTeamMilestone(teamPower);
  const mBase = reached.length ? reached[reached.length - 1].power : 0;
  const mRatio = Math.max(0, Math.min(1, (teamPower - mBase) / Math.max(1, nextMilestone.power - mBase)));
  const rank = teamRank(teamPower);

  // ===== Đấu boss: sự kiện ngẫu nhiên có hẹn giờ =====
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000); // đếm ngược spawn/expire
    return () => clearInterval(id);
  }, []);
  const encounter = activeBoss(now);          // boss đang xuất hiện (null nếu chưa/hết)
  const upcoming = nextBoss(now);             // lượt kế tiếp (để đếm ngược)
  const beaten = encounter != null && (data.bossBeaten ?? []).includes(encounter.id);

  const [bossInfo, setBossInfo] = useState<PokeInfo | null>(null);
  const bossId = encounter?.species.id;
  useEffect(() => {
    if (bossId == null) { setBossInfo(null); return; }
    let alive = true;
    fetchPokeInfo(bossId).then((i) => { if (alive) setBossInfo(i); });
    return () => { alive = false; };
  }, [bossId]);
  const bossReady = allLoaded && !!bossInfo && encounter != null;
  const rewardPreview = bossInfo && encounter ? Math.round(bstFromStats(bossInfo.stats) * 0.3 * encounter.tier.candyMul) : 0;

  const [arena, setArena] = useState<{
    team: Fighter[]; boss: Combatant; makeBoss: (p: number) => Combatant;
    tier: BossTier; enc: BossEncounter; bossBst: number; auraTypes: [string, string]; seed: number;
  } | null>(null);
  const openArena = async () => {
    if (!bossReady || !encounter || !bossInfo || beaten) return;
    feedbackTap();
    // Bộ chiêu THẬT cho cả hai phe (cache trong fetchMoves nên chỉ lượt đầu là chờ mạng).
    // Lỗi mạng -> [] -> con đó đánh chay theo hệ gốc, trận vẫn chạy.
    const formIds = [...new Set(party.map((m) => currentForm(m).id))];
    const [movePairs, bossMoves] = await Promise.all([
      Promise.all(formIds.map((id) => fetchMoves(id).then((mv) => [id, mv] as const))),
      fetchMoves(encounter.species.id),
    ]);
    const movesById = Object.fromEntries(movePairs);
    const fighters: Fighter[] = party
      .map((m) => {
        const f = currentForm(m);
        const info = infos[f.id]!;
        const stats = shinyStats(info.stats, m.shiny); // shiny mạnh hơn dạng thường
        const base = toCombatant(m.key, f.id, f.name || `#${f.id}`, info.types, stats);
        base.moves = movesById[f.id] ?? [];
        return {
          // Trang bị áp SAU toCombatant, KHÔNG vào bst -> boss không scale theo (lợi thế ròng).
          c: applyHeld(base, m.item),
          shiny: m.shiny,
          item: itemByKey(m.item), // để màn chọn/trong trận hiện món đang đeo
          bst: bstFromStats(stats), // để cộng thành Sức mạnh đội hình -> scale boss
        };
      })
      .sort((a, b) => b.c.maxHp + b.c.atk - (a.c.maxHp + a.c.atk));
    const bossBst = bstFromStats(bossInfo.stats);
    const t = encounter.tier;
    // Boss xem trước (chưa scale) để màn chọn hiện tên/hệ/ảnh.
    const boss = toCombatant('boss', encounter.species.id, encounter.species.name, bossInfo.types, bossInfo.stats, t.hpMul, t.atkMul);
    boss.moves = bossMoves;
    // Boss THẬT dựng sau khi biết đội hình: mang đội mạnh thì boss mạnh theo, nên bầy lớn
    // tới đâu lượt boss vẫn đáng đánh (xem lineupScale trong battle.ts).
    // LIVE_* là bội riêng của chế độ đánh-theo-lượt: trận phải dài 9-13 lượt mới đủ chỗ cho
    // đọc dự báo / dồn lực / đỡ đòn (xem battleLive.ts).
    const stats = bossInfo.stats;
    const makeBoss = (lineupPower: number) => {
      const b = toCombatant(
        'boss', encounter.species.id, encounter.species.name, bossInfo.types, stats,
        t.hpMul * lineupScale(lineupPower) * LIVE_HP_MUL,
        t.atkMul * lineupAtkScale(lineupPower) * LIVE_ATK_MUL
      );
      b.moves = bossMoves;
      return b;
    };
    setArena({
      team: fighters, boss, makeBoss, tier: t, enc: encounter, bossBst,
      auraTypes: encounter.auraTypes,
      seed: (encounter.seed + Date.now()) >>> 0,
    });
  };

  return (
    <>
    {/* Có ô tìm kiếm trong này nên cần 'handled': mặc định 'never' thì lượt chạm đầu tiên
        sau khi nhập bị dùng để tắt bàn phím, phải chạm hai lần mới bấm được nút. */}
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Bầy của tôi</Text>
          <Text style={styles.subtitle}>
            {party.length} Pokémon · {streakFire(bestStreak).emoji} chuỗi {bestStreak} ngày
            {streakFire(bestStreak).label ? ` (${streakFire(bestStreak).label})` : ''}
          </Text>
        </View>
        <View style={styles.candyPill}>
          <Text style={styles.candyText}>🍬 {candy}</Text>
        </View>
      </View>

      {party.length > 0 && (
        <>
          {/* Sức mạnh bầy — tổng chỉ số gốc dạng hiện tại */}
          <View style={styles.powerCard}>
            <View style={styles.powerTop}>
              <Text style={styles.powerLabel}>⚡ Sức mạnh bầy</Text>
              <Text style={styles.powerVal}>{allLoaded ? teamPower : '…'}</Text>
            </View>
            <View style={styles.rankRow}>
              <View style={[styles.rankPill, { backgroundColor: rank.color + '26', borderColor: rank.color }]}>
                <Text style={[styles.rankText, { color: rank.color }]}>
                  {rank.label}{rank.star > 0 ? ` ${'★'.repeat(Math.min(rank.star, 5))}${rank.star > 5 ? `+${rank.star - 5}` : ''}` : ''}
                </Text>
              </View>
              <Text style={styles.rankCount}>{reached.length} mốc đã nhận</Text>
            </View>
            <ProgressBar ratio={mRatio} color={colors.accent} />
            <Text style={styles.powerHint}>
              Còn {Math.max(0, nextMilestone.power - teamPower)} → mốc {nextMilestone.power} thưởng 🍬{nextMilestone.candy}
            </Text>
          </View>

          {/* Đấu đạo trường — boss xuất hiện ngẫu nhiên có hẹn giờ */}
          {encounter ? (
            <Pressable
              onPress={openArena}
              disabled={!bossReady || beaten}
              style={[styles.bossCard, { borderColor: encounter.tier.color }, (!bossReady || beaten) && { opacity: 0.6 }]}
            >
              <View style={[styles.bossThumb, { borderColor: encounter.tier.color }]}>
                <CreatureImage formId={encounter.species.id} size={56} />
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <View style={styles.bossTitleRow}>
                  <Text style={styles.bossTitle}>⚔️ {encounter.species.name}</Text>
                  <View style={[styles.tierTag, { backgroundColor: encounter.tier.color }]}>
                    <Text style={styles.tierTagText}>{encounter.tier.label}</Text>
                  </View>
                </View>
                <Text style={styles.bossSub}>
                  {beaten
                    ? '✓ Đã hạ lượt này'
                    : `⏳ Biến mất sau ${countdown(encounter.expireAt - now)}  ·  thắng 🍬~${rewardPreview}`}
                </Text>
              </View>
              <Text style={[styles.bossGo, { color: encounter.tier.color }]}>{beaten ? '✓' : bossReady ? '▶' : '…'}</Text>
            </Pressable>
          ) : (
            <View style={[styles.bossCard, styles.bossCardIdle]}>
              <View style={styles.bossThumbIdle}>
                <Text style={{ fontSize: 26 }}>💤</Text>
              </View>
              <View style={{ flex: 1, marginLeft: spacing.md }}>
                <Text style={styles.bossTitle}>Chưa có boss</Text>
                <Text style={styles.bossSub}>
                  Xuất hiện lúc {clockAt(upcoming.spawnAt)}  ·  còn {countdown(upcoming.spawnAt - now)}
                </Text>
              </View>
            </View>
          )}
        </>
      )}

      {/* Cửa hàng trứng — đổi kẹo lấy trứng để thu thêm Pokémon */}
      <View style={styles.shopCard}>
        <View style={styles.shopHead}>
          <Text style={styles.shopTitle}>🛒 Cửa hàng trứng</Text>
          {pendingEggs > 0 && (
            <Pressable onPress={() => { feedbackTap(); hatchEgg(); }} style={styles.hatchNow}>
              <Text style={styles.hatchNowText}>Nở ngay 🥚 ×{pendingEggs}</Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.shopHint}>Đổi kẹo 🍬 lấy trứng — cách nhanh để thu thêm Pokémon</Text>
        <View style={styles.shopRow}>
          <Pressable disabled={candy < EGG_PRICE} onPress={() => buyEgg(false)}
            style={[styles.shopBtn, candy < EGG_PRICE && styles.shopBtnOff]}>
            <Text style={styles.shopBtnLabel}>🥚 Trứng thường</Text>
            <Text style={styles.shopBtnPrice}>🍬 {EGG_PRICE}</Text>
          </Pressable>
          <Pressable disabled={candy < RARE_EGG_PRICE} onPress={() => buyEgg(true)}
            style={[styles.shopBtn, styles.shopBtnRare, candy < RARE_EGG_PRICE && styles.shopBtnOff]}>
            <Text style={styles.shopBtnLabel}>🥚✨ Trứng hiếm</Text>
            <Text style={[styles.shopBtnPrice, { color: colors.accent }]}>🍬 {RARE_EGG_PRICE}</Text>
          </Pressable>
        </View>
      </View>

      {party.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🥚</Text>
          <Text style={styles.emptyTitle}>Bầy còn trống</Text>
          <Text style={styles.emptyText}>Hoàn thành mục tiêu để nở trứng và thu phục Pokémon!</Text>
        </View>
      ) : (
        <>
          {/* Lưới chọn con muốn xem & nuôi.
              Trước đây là dải cuộn NGANG lồng trong ScrollView dọc — bầy đông thì không
              thấy hết con nào có con nào, và vuốt hay bị cướp cử chỉ giữa hai chiều.
              Giờ tự xuống dòng: không còn cuộn ngang. */}
          <View style={styles.rosterHead}>
            <Text style={styles.rosterTitle}>Chạm một con để nuôi</Text>
            {readyCount > 0 && (
              <View style={styles.readyPill}>
                <Text style={styles.readyPillText}>{readyCount} con đủ kẹo tiến hoá</Text>
              </View>
            )}
          </View>

          {/* Tìm theo tên — gõ "swamp" là ra Mega Swampert, khỏi cuộn cả bầy. */}
          <View style={styles.searchRow}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Tìm theo tên Pokémon…"
              placeholderTextColor={colors.textDim}
              style={styles.searchInput}
              autoCorrect={false}
              // Chữ hệ thống phóng to (accessibility) làm placeholder tràn/giãn — kẹp trần.
              maxFontSizeMultiplier={1.2}
              accessibilityLabel="Tìm Pokémon theo tên"
            />
            {q.length > 0 && (
              <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Xoá tìm kiếm">
                <Text style={styles.searchClear}>✕</Text>
              </Pressable>
            )}
          </View>

          {/* Chip TỰ XUỐNG DÒNG, không cuộn ngang: dải cuộn ngang cắt mất chữ chip cuối
              ("✨ Sh…", "Mớ…") nên người chơi không đọc được có bộ lọc gì. */}
          <View style={styles.chipWrap}>
            {FILTERS.map((f) => (
              <Pressable key={f.key} onPress={() => { feedbackTap(); setFilter(f.key); }}
                style={[styles.chip, filter === f.key && styles.chipOn]}>
                <Text style={[styles.chipText, filter === f.key && styles.chipTextOn]}>{f.label}</Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.chipWrap}>
            <Text style={styles.sortLabel}>Xếp:</Text>
            {SORTS.map((s) => (
              <Pressable key={s.key} onPress={() => { feedbackTap(); setSortBy(s.key); }}
                style={[styles.chip, sortBy === s.key && styles.chipOn]}>
                <Text style={[styles.chipText, sortBy === s.key && styles.chipTextOn]}>{s.label}</Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.countLine}>
            Hiện {Math.min(limit, shown.length)}/{shown.length} con
            {shown.length !== party.length ? ` (lọc từ ${party.length})` : ''}
          </Text>

          {shown.length === 0 ? (
            <Text style={styles.noHit}>Không con nào khớp — thử xoá bộ lọc hoặc từ khoá.</Text>
          ) : (
            <View style={styles.roster}>
              {shown.slice(0, limit).map((m) => (
                <RosterCell
                  key={m.key}
                  mon={m}
                  megas={megasOf(m)}
                  selected={sel?.key === m.key}
                  candy={candy}
                  size={cellSize}
                  onSelect={() => { feedbackTap(); setSelKey(m.key); }}
                />
              ))}
            </View>
          )}

          {shown.length > limit && (
            <Pressable onPress={() => { feedbackTap(); setLimit((n) => n + PAGE); }} style={styles.moreBtn}>
              <Text style={styles.moreBtnText}>Xem thêm {Math.min(PAGE, shown.length - limit)} con ▾</Text>
            </Pressable>
          )}

          <Text style={styles.rosterLegend}>
            Số trên tag = kẹo cần để lên dạng kế tiếp.{'  '}
            <Text style={{ color: colors.green, fontWeight: '800' }}>▲</Text> đủ kẹo, nuôi được ngay ·{' '}
            <Text style={{ color: colors.accent, fontWeight: '800' }}>🍬</Text> chưa đủ ·{' '}
            <Text style={{ fontWeight: '800' }}>MAX</Text> hết đường nuôi
          </Text>
        </>
      )}
    </ScrollView>

    {/* Bảng nuôi của con đang chọn — mở ĐÈ lên, không phải cuộn xuống tìm. */}
    <Modal visible={!!sel} animationType="slide" transparent onRequestClose={() => setSelKey(null)}>
      <View style={styles.sheetRoot}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle} numberOfLines={1}>
            {sel ? view(sel).form.name || `#${view(sel).form.id}` : ''}
          </Text>
          <View style={styles.sheetCandy}><Text style={styles.candyText}>🍬 {candy}</Text></View>
          <Pressable onPress={() => { feedbackTap(); setSelKey(null); }} hitSlop={10} style={styles.sheetClose}>
            <Text style={styles.sheetCloseText}>✕</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.sheetBody} showsVerticalScrollIndicator={false}>
          {sel && <CarePanel key={sel.key} mon={sel} candy={candy} onFeed={() => feedPokemon(sel.key)} />}
        </ScrollView>
      </View>
    </Modal>
    {arena && (
      <BattleArena
        visible={!!arena}
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

function CarePanel({ mon, candy, onFeed }: { mon: PartyMon; candy: number; onFeed: () => void }) {
  const { colors } = useTheme();
  const { pickMega, data, setHeldItem } = useApp();
  const styles = useThemedStyles(makeStyles);
  const bag = data.items ?? {};
  const worn = itemByKey(mon.item);
  const v = view(mon);
  const [megas, setMegas] = useState<MegaForm[] | null>(null);
  const [moves, setMoves] = useState<MoveInfo[] | null>(null);
  const [info, setInfo] = useState<PokeInfo | null>(null);
  const float = useRef(new Animated.Value(0)).current;
  const jump = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const [hearts, setHearts] = useState<number[]>([]);
  const heartSeq = useRef(0);

  useEffect(() => {
    let alive = true;
    setMegas(null);
    fetchMegas(mon.line[mon.line.length - 1].id).then((ms) => { if (alive) setMegas(ms); });
    return () => { alive = false; };
  }, [mon.key]);

  // Chiêu thức + thông tin của DẠNG hiện tại (đổi khi tiến hoá).
  useEffect(() => {
    let alive = true;
    setMoves(null); setInfo(null);
    fetchMoves(v.form.id).then((ms) => { if (alive) setMoves(ms); });
    fetchPokeInfo(v.form.id).then((i) => { if (alive) setInfo(i); });
    return () => { alive = false; };
  }, [v.form.id]);

  useEffect(() => {
    const mk = (val: Animated.Value, d: number) => Animated.loop(Animated.sequence([
      Animated.timing(val, { toValue: 1, duration: d, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(val, { toValue: 0, duration: d, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    const a = mk(float, 1400), b = mk(glow, 1000);
    a.start(); b.start();
    return () => { a.stop(); b.stop(); };
  }, []);

  const feed = () => {
    if (candy <= 0) return;
    feedbackComplete();
    jump.setValue(0);
    Animated.sequence([
      Animated.spring(jump, { toValue: 1, friction: 3, useNativeDriver: true }),
      Animated.spring(jump, { toValue: 0, friction: 4, useNativeDriver: true }),
    ]).start();
    const ids = [heartSeq.current++, heartSeq.current++, heartSeq.current++];
    setHearts((h) => [...h, ...ids]);
    setTimeout(() => setHearts((h) => h.filter((x) => !ids.includes(x))), 1100);
    onFeed();
  };

  const hasMega = megas != null && megas.length > 0;
  const multiMega = hasMega && megas!.length > 1; // nhiều dạng -> cho chọn (Mega/Ash, X/Y)
  const chosenId = hasMega ? (mon.megaChoice ?? megas![0].id) : undefined; // dạng SẼ hoá
  const superName = hasMega ? (megas!.find((m) => m.id === chosenId)?.name ?? megas![0].name) : 'dạng đặc biệt';
  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -10] });
  const jumpY = jump.interpolate({ inputRange: [0, 1], outputRange: [0, -26] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.25] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.4] });
  const hot = v.isMega || (v.maxedEvo && hasMega); // sắp/đang dạng đặc biệt -> glow cam

  const label = v.isMega
    ? `🔮 Đã hoá ${v.form.name}!`
    : v.maxedEvo
      ? (hasMega ? `Nuôi tiếp để mở ${superName} 🔮` : '🌟 Đã tiến hoá tối đa')
      : `Bậc ${v.stage + 1}/${mon.line.length} · cho ăn để tiến hoá`;
  // Chạm trần MEGA_AFFECTION là feedPokemon() không làm gì (spend <= 0), nên nút phải TẮT.
  // Trước đây con ĐÃ hoá Mega vẫn bấm được mà không có tác dụng.
  const atCap = mon.affection >= MEGA_AFFECTION;
  const canFeed = candy > 0 && !atCap && !(v.maxedEvo && !hasMega);
  // Cùng con số với tag ở lưới chọn phía trên.
  const g = growth(mon, megas ?? undefined);

  return (
    <View style={styles.care}>
      <View style={styles.stage}>
        <Animated.View style={[styles.glow, { backgroundColor: (hot ? colors.accent : colors.primary) + '55', transform: [{ scale: glowScale }], opacity: glowOpacity }]} />
        {v.isMega && <Text style={styles.sparkle}>✨</Text>}
        {hearts.map((h, i) => <FloatingHeart key={h} offset={(i - 1) * 26} />)}
        <Animated.View style={{ transform: [{ translateY }, { translateY: jumpY }] }}>
          <CreatureImage formId={v.form.id} shiny={mon.shiny} size={120} />
        </Animated.View>
      </View>

      <Text style={styles.careName}>{mon.shiny ? '✨ ' : ''}{v.form.name || `#${String(v.form.id).padStart(4, '0')}`}</Text>
      <Text style={styles.evoLabel}>{label}</Text>
      <ProgressBar ratio={v.ratio} color={hot ? colors.accent : v.maxedEvo ? colors.green : colors.primary} />

      <Pressable onPress={feed} disabled={!canFeed} style={[styles.feedBtn, !canFeed && styles.feedBtnOff]}>
        <Text style={styles.feedText}>
          {atCap
            ? (v.isMega ? `🔮 Đã hoá ${v.form.name} — hết đường nuôi` : 'Đã nuôi tối đa 🌟')
            : candy <= 0
              ? 'Chưa có kẹo — giữ chuỗi để tích thêm'
              : v.maxedEvo && !hasMega
                ? 'Đã nuôi tối đa 🌟'
                : `Cho ăn  🍬 ${Math.min(candy, FEED_CHUNK)}`}
        </Text>
      </Pressable>

      {g.need != null && (
        <Text style={styles.feedNeed}>
          {candy >= g.need
            ? `▲ Đủ kẹo! Cần 🍬 ${g.need} nữa là lên dạng kế tiếp (mỗi lần cho ăn ${FEED_CHUNK})`
            : `Còn thiếu 🍬 ${g.need - candy} — cần ${g.need}, đang có ${candy}`}
        </Text>
      )}

      {/* ===== Trang bị: rơi từ boss, đeo RIÊNG từng con. Viền/tên tô MÀU BẬC HIẾM. ===== */}
      <Text style={styles.railTitle}>Trang bị {worn ? `· đang đeo ${worn.emoji} ${worn.name}` : ''}</Text>
      {worn == null && ITEMS.every((it) => (bag[it.key] ?? 0) <= 0) ? (
        <Text style={styles.megaHint}>Túi trống — thắng boss ở Đấu đạo trường để nhặt trang bị. Boss càng khó càng dễ rơi, và mới có cửa ra đồ Sử thi/Huyền thoại.</Text>
      ) : (
        <View style={styles.itemWrap}>
          {worn && (
            <Pressable onPress={() => setHeldItem(mon.key, null)}
              style={[styles.itemChip, { borderColor: RARITY[worn.rarity].color, borderWidth: 1.5, backgroundColor: RARITY[worn.rarity].color + '14' }]}>
              <ItemSprite item={worn} size={28} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: RARITY[worn.rarity].color }]}>{worn.name} · {worn.desc}</Text>
                <Text style={styles.itemMeta}>
                  <Text style={{ color: RARITY[worn.rarity].color, fontWeight: '900' }}>{RARITY[worn.rarity].label}</Text> · chạm để THÁO
                </Text>
              </View>
            </Pressable>
          )}
          {ITEMS.filter((it) => (bag[it.key] ?? 0) > 0).map((it) => (
            <Pressable key={it.key} onPress={() => setHeldItem(mon.key, it.key)}
              style={[styles.itemChip, { borderColor: RARITY[it.rarity].color + '88' }]}>
              <ItemSprite item={it} size={28} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.itemName, { color: RARITY[it.rarity].color }]}>{it.name} ×{bag[it.key]} · {it.desc}</Text>
                <Text style={styles.itemMeta}>
                  <Text style={{ color: RARITY[it.rarity].color, fontWeight: '900' }}>{RARITY[it.rarity].label}</Text> · chạm để đeo{worn ? ' (đổi món)' : ''}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.railTitle}>Cây tiến hoá của con này</Text>
      {/* Tự xuống dòng thay vì cuộn ngang: dòng có Mega dài quá màn điện thoại. */}
      <View style={styles.rail}>
        {mon.line.map((f, i) => {
          const reached = i <= v.stage;
          return (
            <React.Fragment key={f.id}>
              {i > 0 && <Text style={styles.railArrow}>›</Text>}
              <RailNode formId={f.id} name={f.name || `#${f.id}`} reached={reached}
                tag={reached ? (i === v.stage && !v.isMega ? '● hiện tại' : '✓') : 'nuôi để mở'} accent={colors.primary} />
            </React.Fragment>
          );
        })}
        {hasMega && (
          <>
            <Text style={styles.railArrow}>»</Text>
            {megas!.map((m) => {
              const selected = v.isMega ? m.id === mon.megaId : m.id === chosenId;
              const tag = v.isMega
                ? (m.id === mon.megaId ? '🔮 đang dùng' : 'chạm để đổi')
                : (selected ? '● sẽ hoá' : 'chạm chọn');
              return (
                <RailNode key={m.id} formId={m.id} name={m.name} reached={v.isMega || selected}
                  tag={tag} accent={colors.accent} selected={selected}
                  onPress={multiMega || v.isMega ? () => pickMega(mon.key, m.id, m.name) : undefined} />
              );
            })}
          </>
        )}
      </View>
      {hasMega && (
        <Text style={styles.megaHint}>
          {multiMega
            ? (v.isMega ? 'Chạm một dạng ở trên để ĐỔI hình thái 🔮' : `Chạm chọn dạng · nuôi đầy thanh để hoá ${superName} 🔮`)
            : v.isMega ? '' : `Cho RIÊNG con này ăn tới khi đầy thanh để mở ${superName} 🔮`}
        </Text>
      )}

      {info && (
        <>
          <View style={styles.infoRow}>
            {info.types.map((t) => (
              <View key={t} style={[styles.typeChip, { backgroundColor: typeColor(t) + '26', borderColor: typeColor(t) + '66' }]}>
                <View style={[styles.moveDot, { backgroundColor: typeColor(t) }]} />
                <Text style={[styles.typeChipText, { color: typeColor(t) }]}>{typeLabel(t)}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.infoMeta}>
            {info.genus ? `${info.genus} · ` : ''}{info.heightM.toFixed(1)}m · {info.weightKg.toFixed(1)}kg
          </Text>
          {info.flavor ? <Text style={styles.flavor}>“{info.flavor}”</Text> : null}

          <View style={styles.statsHead}>
            <Text style={styles.railTitle}>Chỉ số gốc{mon.shiny ? ' ✨' : ''}</Text>
            <Text style={styles.statsPower}>⚡ {bstFromStats(shinyStats(info.stats, mon.shiny))}</Text>
          </View>
          <Text style={styles.statsNote}>
            {mon.shiny
              ? `Shiny mạnh hơn dạng thường: MỌI chỉ số ×${SHINY_STAT_MUL}. Chỉ số quyết định sức mạnh khi đấu đạo trường.`
              : 'Chỉ số quyết định sức mạnh khi đấu đạo trường.'}
          </Text>
          <View style={styles.statsWrap}>
            {shinyStats(info.stats, mon.shiny).map((s) => (
              <View key={s.name} style={styles.statRow}>
                <Text style={styles.statLabel}>{STAT_VI[s.name] ?? s.name}</Text>
                <View style={styles.statBarBg}>
                  <View style={[styles.statBarFill, { width: `${Math.min(100, (s.value / 180) * 100)}%`, backgroundColor: s.value >= 100 ? colors.accent : colors.primary }]} />
                </View>
                <Text style={styles.statVal}>{s.value}</Text>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.railTitle}>Chiêu thức</Text>
      {moves == null ? (
        <ActivityIndicator size="small" color={colors.textDim} style={{ alignSelf: 'flex-start' }} />
      ) : moves.length === 0 ? (
        <Text style={styles.megaHint}>Chưa có dữ liệu chiêu.</Text>
      ) : (
        <View style={styles.moveWrap}>
          {moves.map((mv) => (
            <View key={mv.id + mv.name} style={[styles.moveChip, { borderColor: typeColor(mv.type) + '88' }]}>
              <View style={[styles.moveDot, { backgroundColor: typeColor(mv.type) }]} />
              <Text style={styles.moveName} numberOfLines={1}>{mv.name}</Text>
              <Text style={styles.moveMeta}>{typeLabel(mv.type)}{mv.power ? ` · ${mv.power}` : ''}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

// Một ô trong lưới chọn: sprite + tag cho biết con này CÓ CẦN cho ăn không.
//   ▲N  = đang có đủ kẹo, cho ăn là tiến lên dạng kế tiếp
//   🍬N = còn thiếu, N là số kẹo cần
//   MAX = chạm trần, cho ăn thêm vô ích
// Tag là DẢI NẰM TRONG ô (không phải huy hiệu cưỡi lên viền) nên các hàng thẳng nhau.
function RosterCell({ mon, megas, selected, candy, size, onSelect }: {
  mon: PartyMon; megas: MegaForm[] | undefined; selected: boolean; candy: number; size: number; onSelect: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const g = growth(mon, megas);
  const name = g.form.name || `#${g.form.id}`;
  const ready = g.need != null && candy >= g.need;

  // Chưa tra xong dạng đặc biệt -> chưa gắn tag, tránh báo nhầm MAX.
  const tag = !g.megasKnown
    ? null
    : g.need == null
      ? { text: 'MAX', bg: colors.track, fg: colors.textDim, hint: 'đã tối đa' }
      : ready
        // Dải màu NHẠT chứ không đặc: bầy đông thì 20 dải xanh đặc nhìn rất gắt.
        ? { text: `▲${g.need}`, bg: colors.green + '2E', fg: colors.green, hint: `đủ kẹo, cần ${g.need} để tiến hoá` }
        : { text: `🍬${g.need}`, bg: colors.accent + '2E', fg: colors.accent, hint: `còn thiếu ${g.need - candy} kẹo` };

  const TAG_H = 17;
  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${name}${tag ? ` — ${tag.hint}` : ''}`}
      style={[
        styles.rosterCell,
        { width: size, height: size + TAG_H },
        selected && { borderColor: colors.primary, borderWidth: 2 },
      ]}
    >
      <View style={styles.rosterArt}>
        <CreatureImage formId={g.form.id} shiny={mon.shiny} size={size - 14} />
        {mon.shiny && <Text style={styles.rosterShiny}>✨</Text>}
        {/* Món đang đeo — nhìn lưới là biết con nào có trang bị, khỏi mở từng bảng. */}
        {(() => {
          const it = itemByKey(mon.item);
          return it ? (
            <View style={styles.rosterItem}>
              <ItemSprite item={it} size={16} />
            </View>
          ) : null;
        })()}
      </View>
      <View style={[styles.rosterTag, { height: TAG_H, backgroundColor: tag?.bg ?? 'transparent' }]}>
        {tag && (
          <Text style={[styles.rosterTagText, { color: tag.fg }]} numberOfLines={1}>{tag.text}</Text>
        )}
      </View>
    </Pressable>
  );
}

function RailNode({ formId, name, reached, tag, accent, selected, onPress }: { formId: number; name: string; reached: boolean; tag: string; accent: string; selected?: boolean; onPress?: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const dim = !reached && !selected;
  const inner = (
    <View style={[styles.node, (reached || selected) && { borderColor: accent }, selected && { borderWidth: 2.5 }, dim && styles.nodeLocked]}>
      <View style={dim ? styles.nodeDim : undefined}>
        <CreatureImage formId={formId} size={48} />
      </View>
      <Text style={styles.nodeName} numberOfLines={1}>{name}</Text>
      <Text style={[styles.nodeTag, (reached || selected) && { color: accent }]} numberOfLines={1}>{tag}</Text>
    </View>
  );
  return onPress ? <Pressable onPress={() => { feedbackTap(); onPress(); }}>{inner}</Pressable> : inner;
}

function FloatingHeart({ offset }: { offset: number }) {
  const styles = useThemedStyles(makeStyles);
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(); }, []);
  const translateY = v.interpolate({ inputRange: [0, 1], outputRange: [0, -70] });
  const opacity = v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
  return <Animated.Text style={[styles.floatHeart, { transform: [{ translateX: offset }, { translateY }], opacity }]}>❤️</Animated.Text>;
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: TAB_BAR_SPACE },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.lg },
    title: { color: colors.text, fontSize: 26, fontWeight: '800' },
    subtitle: { color: colors.textDim, fontSize: 13, marginTop: 2 },
    candyPill: { backgroundColor: colors.accent + '22', borderColor: colors.accent, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
    candyText: { color: colors.accent, fontSize: 15, fontWeight: '800' },
    empty: { alignItems: 'center', padding: spacing.xl, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', marginTop: spacing.xl },
    emptyEmoji: { fontSize: 48 },
    emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: spacing.sm },
    emptyText: { color: colors.textDim, fontSize: 13, textAlign: 'center', marginTop: spacing.xs },
    care: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, alignItems: 'center', marginBottom: spacing.lg },
    stage: { height: 150, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
    glow: { position: 'absolute', width: 130, height: 130, borderRadius: 65 },
    sparkle: { position: 'absolute', top: 8, fontSize: 26 },
    floatHeart: { position: 'absolute', bottom: 70, fontSize: 22 },
    careName: { color: colors.text, fontSize: 18, fontWeight: '800', marginTop: spacing.sm },
    evoLabel: { color: colors.textDim, fontSize: 12, fontWeight: '700', marginTop: 2, marginBottom: spacing.sm },
    feedBtn: { marginTop: spacing.md, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, alignSelf: 'stretch', alignItems: 'center' },
    feedBtnOff: { backgroundColor: colors.cardAlt },
    feedText: { color: '#fff', fontWeight: '800', fontSize: 14 },
    railTitle: { color: colors.text, fontSize: 13, fontWeight: '800', alignSelf: 'flex-start', marginTop: spacing.lg, marginBottom: spacing.sm },
    rail: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 4, alignSelf: 'stretch' },
    feedNeed: { color: colors.textDim, fontSize: 11.5, fontWeight: '700', textAlign: 'center', marginTop: spacing.sm },
    railArrow: { color: colors.textDim, fontSize: 22, marginHorizontal: 2 },
    node: { width: 78, alignItems: 'center', backgroundColor: colors.cardAlt, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, paddingVertical: spacing.sm },
    nodeLocked: { opacity: 0.8 },
    nodeDim: { opacity: 0.3 },
    nodeName: { color: colors.text, fontSize: 11, fontWeight: '700', marginTop: 2, maxWidth: 72 },
    nodeTag: { color: colors.textDim, fontSize: 9.5, fontWeight: '700', marginTop: 1, maxWidth: 74 },
    megaHint: { color: colors.textDim, fontSize: 11.5, marginTop: spacing.sm, textAlign: 'center' },
    moveWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignSelf: 'stretch' },
    moveChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.cardAlt },
    moveDot: { width: 8, height: 8, borderRadius: 4 },
    moveName: { color: colors.text, fontSize: 12, fontWeight: '800' },
    moveMeta: { color: colors.textDim, fontSize: 10.5, fontWeight: '700' },
    // Lưới tự xuống dòng (không cuộn ngang). marginBottom chừa chỗ cho tag thò ra dưới ô.
    rosterHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: spacing.sm },
    rosterTitle: { color: colors.text, fontSize: 13, fontWeight: '800' },
    readyPill: { backgroundColor: colors.green + '26', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 },
    readyPillText: { color: colors.green, fontSize: 11, fontWeight: '800' },
    roster: { flexDirection: 'row', flexWrap: 'wrap', gap: ROSTER_GAP },
    // Tìm / lọc / xếp
    searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.cardAlt, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
    searchIcon: { fontSize: 13 },
    // letterSpacing ép về 0 + weight 500: iOS với font đậm/scale lớn hay render placeholder
    // giãn chữ rất xấu ("T ì m  t h e o…").
    searchInput: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '500', letterSpacing: 0, paddingVertical: Platform.OS === 'ios' ? 10 : 6 },
    searchClear: { color: colors.textDim, fontSize: 15, fontWeight: '900', paddingHorizontal: 2 },
    // Gap/padding tính để 5 chip lọc và 4 chip xếp mỗi nhóm VỪA MỘT HÀNG trên máy 390pt —
    // bản cũ (pad 12, gap 8) tràn đúng 1 chip mỗi hàng, thành 4 tầng chip rất rối.
    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: spacing.sm },
    chip: { backgroundColor: colors.cardAlt, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 9, paddingVertical: 5 },
    chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { color: colors.textDim, fontSize: 11.5, fontWeight: '800' },
    chipTextOn: { color: '#fff' },
    sortLabel: { color: colors.textDim, fontSize: 11.5, fontWeight: '800', marginRight: 2 },
    countLine: { color: colors.textDim, fontSize: 11.5, fontWeight: '700', marginBottom: spacing.sm },
    noHit: { color: colors.textDim, fontSize: 13, fontWeight: '600', textAlign: 'center', paddingVertical: spacing.xl },
    moreBtn: { alignSelf: 'center', marginTop: spacing.md, backgroundColor: colors.cardAlt, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
    moreBtnText: { color: colors.text, fontSize: 13, fontWeight: '800' },
    // Bảng nuôi mở đè
    sheetRoot: { flex: 1, backgroundColor: colors.bg, paddingTop: (Platform.OS === 'ios' ? 52 : (StatusBar.currentHeight ?? 24) + 8) },
    sheetHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderColor: colors.border },
    sheetTitle: { flex: 1, color: colors.text, fontSize: 19, fontWeight: '900' },
    sheetCandy: { backgroundColor: colors.accent + '22', borderColor: colors.accent, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
    sheetClose: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
    sheetCloseText: { color: colors.text, fontSize: 16, fontWeight: '900' },
    sheetBody: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: TAB_BAR_SPACE },
    // Danh hiệu bầy
    rankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
    rankPill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
    rankText: { fontSize: 12, fontWeight: '900' },
    rankCount: { color: colors.textDim, fontSize: 11, fontWeight: '700' },
    // overflow hidden để dải tag bám đúng bo góc dưới của ô.
    rosterCell: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt, overflow: 'hidden' },
    rosterArt: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    rosterShiny: { position: 'absolute', top: 1, left: 2, fontSize: 10 },
    rosterItem: { position: 'absolute', bottom: 1, right: 2 },
    rosterTag: { alignItems: 'center', justifyContent: 'center' },
    rosterTagText: { fontSize: 10, fontWeight: '900' },
    rosterLegend: { color: colors.textDim, fontSize: 11, lineHeight: 16, marginTop: spacing.md, marginBottom: spacing.md },
    // Thông tin Pokémon
    infoRow: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'flex-start', marginTop: spacing.md },
    typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
    typeChipText: { fontSize: 12, fontWeight: '800' },
    infoMeta: { color: colors.textDim, fontSize: 12, fontWeight: '700', alignSelf: 'flex-start', marginTop: 6 },
    flavor: { color: colors.text, fontSize: 12.5, fontStyle: 'italic', lineHeight: 18, alignSelf: 'stretch', marginTop: spacing.sm },
    // Trang bị
    itemWrap: { alignSelf: 'stretch', gap: 6 },
    itemChip: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, paddingHorizontal: spacing.md, paddingVertical: 8 },
    itemEmoji: { fontSize: 20 },
    itemName: { color: colors.text, fontSize: 12.5, fontWeight: '800' },
    itemMeta: { color: colors.textDim, fontSize: 10.5, fontWeight: '600' },
    statsHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', alignSelf: 'stretch' },
    statsPower: { color: colors.accent, fontSize: 13, fontWeight: '900', marginTop: spacing.lg },
    statsNote: { color: colors.textDim, fontSize: 11, alignSelf: 'flex-start', marginBottom: spacing.sm },
    statsWrap: { alignSelf: 'stretch', gap: 5 },
    // Sức mạnh bầy
    powerCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
    powerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
    powerLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
    powerVal: { color: colors.accent, fontSize: 18, fontWeight: '900' },
    powerHint: { color: colors.textDim, fontSize: 11.5, marginTop: spacing.xs },
    // Đấu đạo trường
    bossCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '14', borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.primary, padding: spacing.md, marginBottom: spacing.md },
    bossCardIdle: { backgroundColor: colors.cardAlt, borderColor: colors.border, borderStyle: 'dashed' },
    bossThumb: { width: 60, height: 60, borderRadius: radius.md, backgroundColor: colors.cardAlt, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
    bossThumbIdle: { width: 60, height: 60, borderRadius: radius.md, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    bossTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    bossTitle: { color: colors.text, fontSize: 15, fontWeight: '900' },
    bossSub: { color: colors.textDim, fontSize: 12, fontWeight: '600', marginTop: 2 },
    bossGo: { color: colors.primary, fontSize: 20, fontWeight: '900', marginLeft: spacing.sm },
    tierTag: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
    tierTagText: { color: '#fff', fontSize: 10.5, fontWeight: '900' },
    // Cửa hàng trứng
    shopCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
    shopHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    shopTitle: { color: colors.text, fontSize: 14, fontWeight: '800' },
    shopHint: { color: colors.textDim, fontSize: 11.5, marginTop: 2, marginBottom: spacing.sm },
    hatchNow: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 5 },
    hatchNowText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    shopRow: { flexDirection: 'row', gap: spacing.sm },
    shopBtn: { flex: 1, backgroundColor: colors.cardAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.md, alignItems: 'center', gap: 3 },
    shopBtnRare: { borderColor: colors.accent },
    shopBtnOff: { opacity: 0.4 },
    shopBtnLabel: { color: colors.text, fontSize: 12.5, fontWeight: '800' },
    shopBtnPrice: { color: colors.primary, fontSize: 13, fontWeight: '900' },
    statRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    statLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', width: 46 },
    statBarBg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.track, overflow: 'hidden' },
    statBarFill: { height: 8, borderRadius: 4 },
    statVal: { color: colors.text, fontSize: 11, fontWeight: '800', width: 28, textAlign: 'right' },
  });
