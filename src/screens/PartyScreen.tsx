import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, Easing, ActivityIndicator } from 'react-native';
import { useApp } from '../AppContext';
import { PartyMon } from '../types';
import CreatureImage from '../components/CreatureImage';
import ProgressBar from '../components/ProgressBar';
import { stageFromAffection, EVO_AFFECTION, MEGA_AFFECTION, streakFire, currentForm } from '../collection';
import { habitStreak } from '../gameLogic';
import { todayStr } from '../date';
import { fetchMegas } from '../megaForms';
import { MegaForm, MoveInfo, fetchMoves, PokeInfo, fetchPokeInfo } from '../species';
import { typeColor, typeLabel } from '../pokemonTypes';
import { bstFromStats, activeBoss, nextBoss, toCombatant, TEAM_POWER_MILESTONES, Combatant, BossEncounter, BossTier } from '../battle';
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

export default function PartyScreen() {
  const { data, feedPokemon, reportBattleWin, claimTeamPower } = useApp();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const party = [...(data.party ?? [])].sort((a, b) => b.affection - a.affection || b.at - a.at);
  const [selKey, setSelKey] = useState<string | null>(null);
  const sel = party.find((m) => m.key === selKey) ?? party[0] ?? null;
  const candy = Math.floor(data.candy ?? 0);
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

  const teamPower = party.reduce((s, m) => {
    const info = infos[currentForm(m).id];
    return s + (info ? bstFromStats(info.stats) : 0);
  }, 0);
  const allLoaded = party.length > 0 && party.every((m) => infos[currentForm(m).id]);

  // Đạt mốc Sức mạnh bầy -> trao kẹo (1 lần/mốc).
  useEffect(() => {
    if (allLoaded && teamPower > 0) claimTeamPower(teamPower);
  }, [teamPower, allLoaded]);

  const nextMilestone = TEAM_POWER_MILESTONES.find((m) => teamPower < m.power);
  const prevMilestone = [...TEAM_POWER_MILESTONES].reverse().find((m) => teamPower >= m.power);
  const mBase = prevMilestone?.power ?? 0;
  const mRatio = nextMilestone ? Math.max(0, Math.min(1, (teamPower - mBase) / (nextMilestone.power - mBase))) : 1;

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

  const [arena, setArena] = useState<{ team: Fighter[]; boss: Combatant; tier: BossTier; enc: BossEncounter; bossBst: number; seed: number } | null>(null);
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
    const boss = toCombatant('boss', encounter.species.id, encounter.species.name, bossInfo.types, bossInfo.stats, t.hpMul, t.atkMul);
    setArena({ team: fighters, boss, tier: t, enc: encounter, bossBst, seed: (encounter.seed + Date.now()) >>> 0 });
  };

  return (
    <>
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
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
            <ProgressBar ratio={mRatio} color={colors.accent} />
            <Text style={styles.powerHint}>
              {nextMilestone ? `Còn ${Math.max(0, nextMilestone.power - teamPower)} → mốc ${nextMilestone.power} thưởng 🍬${nextMilestone.candy}` : 'Đã đạt mốc cao nhất — quá mạnh! 💪'}
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

      {party.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🥚</Text>
          <Text style={styles.emptyTitle}>Bầy còn trống</Text>
          <Text style={styles.emptyText}>Hoàn thành mục tiêu để nở trứng và thu phục Pokémon!</Text>
        </View>
      ) : (
        <>
          {/* Thanh chọn ngang: chạm để chọn con muốn xem & nuôi */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roster}>
            {party.map((m) => {
              const v = view(m);
              const on = sel?.key === m.key;
              return (
                <Pressable key={m.key} onPress={() => { feedbackTap(); setSelKey(m.key); }}
                  style={[styles.rosterCell, on && { borderColor: colors.primary, borderWidth: 2 }]}>
                  <CreatureImage formId={v.form.id} shiny={m.shiny} size={46} />
                </Pressable>
              );
            })}
          </ScrollView>

          {sel && <CarePanel key={sel.key} mon={sel} candy={candy} onFeed={() => feedPokemon(sel.key)} />}
        </>
      )}
    </ScrollView>
    {arena && (
      <BattleArena
        visible={!!arena}
        team={arena.team}
        boss={arena.boss}
        tier={arena.tier}
        seed={arena.seed}
        onWin={() => reportBattleWin(arena.enc.id, arena.bossBst, arena.tier.candyMul)}
        onClose={() => setArena(null)}
      />
    )}
    </>
  );
}

function CarePanel({ mon, candy, onFeed }: { mon: PartyMon; candy: number; onFeed: () => void }) {
  const { colors } = useTheme();
  const { pickMega } = useApp();
  const styles = useThemedStyles(makeStyles);
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
  const canFeed = candy > 0 && !(v.maxedEvo && !hasMega); // hết đường nuôi thì thôi

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
          {candy <= 0 ? 'Chưa có kẹo — giữ chuỗi để tích thêm' : v.maxedEvo && !hasMega ? 'Đã nuôi tối đa 🌟' : `Cho ăn  🍬 ${Math.min(candy, 10)}`}
        </Text>
      </Pressable>

      <Text style={styles.railTitle}>Cây tiến hoá của con này</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
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
      </ScrollView>
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
            <Text style={styles.railTitle}>Chỉ số gốc</Text>
            <Text style={styles.statsPower}>⚡ {bstFromStats(info.stats)}</Text>
          </View>
          <Text style={styles.statsNote}>Chỉ số quyết định sức mạnh khi đấu đạo trường.</Text>
          <View style={styles.statsWrap}>
            {info.stats.map((s) => (
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
    rail: { alignItems: 'center', gap: 4, paddingRight: spacing.md },
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
    roster: { gap: spacing.sm, paddingVertical: 2, paddingRight: spacing.md, marginBottom: spacing.md },
    rosterCell: { width: 60, height: 60, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' },
    // Thông tin Pokémon
    infoRow: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'flex-start', marginTop: spacing.md },
    typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 },
    typeChipText: { fontSize: 12, fontWeight: '800' },
    infoMeta: { color: colors.textDim, fontSize: 12, fontWeight: '700', alignSelf: 'flex-start', marginTop: 6 },
    flavor: { color: colors.text, fontSize: 12.5, fontStyle: 'italic', lineHeight: 18, alignSelf: 'stretch', marginTop: spacing.sm },
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
    statRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    statLabel: { color: colors.textDim, fontSize: 11, fontWeight: '700', width: 46 },
    statBarBg: { flex: 1, height: 8, borderRadius: 4, backgroundColor: colors.track, overflow: 'hidden' },
    statBarFill: { height: 8, borderRadius: 4 },
    statVal: { color: colors.text, fontSize: 11, fontWeight: '800', width: 28, textAlign: 'right' },
  });
