import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Animated, Easing, Dimensions, Platform, StatusBar } from 'react-native';

// Chèn an toàn TỰ TÍNH (không dùng SafeAreaView — trong Modal nó KHÔNG chèn đáy đáng tin
// trên máy thật -> nút bị tràn xuống dưới home-indicator, mất chữ).
const SAFE_TOP = Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight ?? 24) + 8;
const SAFE_BOTTOM = Platform.OS === 'ios' ? 40 : 20;
import CreatureImage from './CreatureImage';
import { Combatant, BattleEvent, effLabel, simulateBattle } from '../battle';
import { typeColor, typeLabel } from '../pokemonTypes';
import { Colors, radius, spacing } from '../theme';
import { useTheme, useThemedStyles } from '../theme-context';
import { feedbackTap, feedbackComplete, feedbackEvolve } from '../feedback';

export interface Fighter { c: Combatant; shiny: boolean }

interface Props {
  visible: boolean;
  onClose: () => void;
  team: Fighter[];
  boss: Combatant;
  tier: { label: string; color: string };
  seed: number;
  onWin: () => { candy: number; egg: boolean; already: boolean };
}

const STEP = 900;   // ms mỗi sự kiện
const HIT = 220;    // ms từ lúc lao tới lúc trúng đòn

const hpColor = (r: number) => (r > 0.5 ? '#22C55E' : r > 0.2 ? '#EAB308' : '#EF4444');

export default function BattleArena({ visible, onClose, team, boss, tier, seed, onWin }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const teamMap = useMemo(() => {
    const m = new Map<string, Fighter>();
    for (const f of team) m.set(f.c.key, f);
    return m;
  }, [team]);

  const result = useMemo(() => simulateBattle(team.map((f) => f.c), boss, seed), [team, boss, seed]);

  const [phase, setPhase] = useState<'intro' | 'playing' | 'win' | 'lose'>('intro');
  const [curKey, setCurKey] = useState<string>(team[0]?.c.key ?? '');
  const [faints, setFaints] = useState(0);
  const [log, setLog] = useState('');
  const [banner, setBanner] = useState<{ text: string; good: boolean } | null>(null);
  const [dmg, setDmg] = useState<{ id: number; val: number; side: 'boss' | 'player'; mult: number; crit: boolean } | null>(null);
  const [reward, setReward] = useState<{ candy: number; egg: boolean; already: boolean } | null>(null);

  const bossHp = useRef(new Animated.Value(1)).current;
  const playerHp = useRef(new Animated.Value(1)).current;
  const [bossHpR, setBossHpR] = useState(1);
  const [playerHpR, setPlayerHpR] = useState(1);
  const [bossHpN, setBossHpN] = useState(boss.maxHp);
  const [playerHpN, setPlayerHpN] = useState(team[0]?.c.maxHp ?? 0);
  const bossLunge = useRef(new Animated.Value(0)).current;
  const playerLunge = useRef(new Animated.Value(0)).current;
  const bossShake = useRef(new Animated.Value(0)).current;
  const playerShake = useRef(new Animated.Value(0)).current;
  const playerFade = useRef(new Animated.Value(1)).current;

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const dmgSeq = useRef(0);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  // Reset khi mở lại.
  useEffect(() => {
    if (!visible) return;
    clearTimers();
    setPhase('intro');
    setCurKey(team[0]?.c.key ?? '');
    setFaints(0); setLog(''); setBanner(null); setDmg(null); setReward(null);
    bossHp.setValue(1); playerHp.setValue(1); setBossHpR(1); setPlayerHpR(1);
    setBossHpN(boss.maxHp); setPlayerHpN(team[0]?.c.maxHp ?? 0);
    playerFade.setValue(1);
    return clearTimers;
  }, [visible]);

  const shake = (v: Animated.Value) => {
    v.setValue(0);
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 45, useNativeDriver: true }),
      Animated.timing(v, { toValue: -1, duration: 45, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 45, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  };
  const lunge = (v: Animated.Value) => {
    v.setValue(0);
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: HIT, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: STEP - HIT - 60, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]).start();
  };
  const animHp = (v: Animated.Value, to: number, set: (n: number) => void) => {
    Animated.timing(v, { toValue: to, duration: 360, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    set(to);
  };

  const start = () => {
    feedbackTap();
    setPhase('playing');
    setLog(`Trận đấu bắt đầu! ${team[0]?.c.name} tiến lên!`);
    play(0);
  };

  const play = (i: number) => {
    const events = result.events;
    if (i >= events.length) return finish();
    const e = events[i];
    const attackerName = e.attacker === 'player' ? teamMap.get(e.attackerKey)?.c.name ?? 'Pokémon' : boss.name;
    lunge(e.attacker === 'player' ? playerLunge : bossLunge);

    timers.current.push(setTimeout(() => applyHit(e, attackerName), HIT));
    timers.current.push(setTimeout(() => play(i + 1), STEP));
  };

  const applyHit = (e: BattleEvent, attackerName: string) => {
    feedbackTap();
    const eff = effLabel(e.mult);
    const bannerText = e.crit ? (eff ? `Chí mạng! ${eff}` : 'Chí mạng! 💥') : eff;
    setBanner(bannerText ? { text: bannerText, good: e.crit || e.mult >= 2 } : null);
    const id = dmgSeq.current++;
    const critTag = e.crit ? ' Chí mạng! 💥' : '';

    if (e.attacker === 'player') {
      animHp(bossHp, boss.maxHp ? e.bossHp / boss.maxHp : 0, setBossHpR);
      setBossHpN(e.bossHp);
      shake(bossShake);
      setDmg({ id, val: e.dmg, side: 'boss', mult: e.mult, crit: e.crit });
      setLog(`${attackerName} ra đòn! Gây ${e.dmg} sát thương.${critTag}`);
    } else {
      const max = teamMap.get(e.defenderKey)?.c.maxHp ?? 1;
      animHp(playerHp, max ? e.playerHp / max : 0, setPlayerHpR);
      setPlayerHpN(e.playerHp);
      shake(playerShake);
      setDmg({ id, val: e.dmg, side: 'player', mult: e.mult, crit: e.crit });
      setLog(`${boss.name} phản công! ${teamMap.get(e.defenderKey)?.c.name ?? ''} mất ${e.dmg} HP.${critTag}`);
      if (e.faintedKey) {
        Animated.timing(playerFade, { toValue: 0, duration: 300, useNativeDriver: true }).start();
        setLog(`${teamMap.get(e.faintedKey)?.c.name ?? 'Pokémon'} gục ngã!`);
        setFaints((n) => n + 1);
        if (e.incomingKey) {
          const inc = e.incomingKey;
          const incMax = teamMap.get(inc)?.c.maxHp ?? 0;
          timers.current.push(setTimeout(() => {
            setCurKey(inc);
            playerHp.setValue(1); setPlayerHpR(1); setPlayerHpN(incMax);
            playerFade.setValue(0);
            Animated.timing(playerFade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
            setLog(`Tiến lên, ${teamMap.get(inc)?.c.name ?? 'Pokémon'}!`);
          }, 380));
        }
      }
    }
    timers.current.push(setTimeout(() => setDmg(null), STEP - HIT - 80));
  };

  const finish = () => {
    if (result.win) {
      feedbackEvolve();
      const r = onWin();
      setReward(r);
      setPhase('win');
    } else {
      feedbackComplete();
      setPhase('lose');
    }
  };

  const skip = () => {
    clearTimers();
    // Áp trạng thái cuối tức thì.
    const last = result.events[result.events.length - 1];
    if (last) {
      bossHp.setValue(boss.maxHp ? last.bossHp / boss.maxHp : 0); setBossHpR(boss.maxHp ? last.bossHp / boss.maxHp : 0);
      setBossHpN(last.bossHp);
    }
    setBanner(null); setDmg(null);
    finish();
  };

  const curFighter = teamMap.get(curKey) ?? team[0];
  const W = Dimensions.get('window').width;

  const bossTx = bossLunge.interpolate({ inputRange: [0, 1], outputRange: [0, -W * 0.28] });
  const bossTy = bossLunge.interpolate({ inputRange: [0, 1], outputRange: [0, 60] });
  const playerTx = playerLunge.interpolate({ inputRange: [0, 1], outputRange: [0, W * 0.28] });
  const playerTy = playerLunge.interpolate({ inputRange: [0, 1], outputRange: [0, -60] });
  const bossShakeX = bossShake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] });
  const playerShakeX = playerShake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        {/* ===== Sân đấu ===== */}
        <View style={styles.arena}>
          {/* Boss (trên) */}
          <View style={styles.bossRow}>
            <HpCard name={boss.name} types={boss.types} hpR={bossHpR} anim={bossHp} cur={bossHpN} max={boss.maxHp} align="left" />
            <Animated.View style={[styles.bossMon, { transform: [{ translateX: Animated.add(bossTx, bossShakeX) }, { translateY: bossTy }] }]}>
              <View style={styles.platform} />
              <CreatureImage formId={boss.id} size={128} />
              {dmg?.side === 'boss' && <DmgNumber key={dmg.id} val={dmg.val} mult={dmg.mult} crit={dmg.crit} />}
            </Animated.View>
          </View>

          {/* Player (dưới) */}
          <View style={styles.playerRow}>
            <Animated.View style={[styles.playerMon, { opacity: playerFade, transform: [{ translateX: Animated.add(playerTx, playerShakeX) }, { translateY: playerTy }] }]}>
              <View style={styles.platform} />
              <CreatureImage formId={curFighter?.c.id ?? 1} shiny={curFighter?.shiny} size={132} />
              {dmg?.side === 'player' && <DmgNumber key={dmg.id} val={dmg.val} mult={dmg.mult} crit={dmg.crit} />}
            </Animated.View>
            <HpCard name={curFighter?.c.name ?? ''} types={curFighter?.c.types ?? []} hpR={playerHpR} anim={playerHp} cur={playerHpN} max={curFighter?.c.maxHp ?? 0} align="right" />
          </View>

          {banner && (
            <View style={[styles.banner, { backgroundColor: banner.good ? '#F97316' : '#475569' }]}>
              <Text style={styles.bannerText}>{banner.text}</Text>
            </View>
          )}

          {/* Bi đội (còn sống) */}
          <View style={styles.pips}>
            {team.map((f, i) => (
              <View key={f.c.key} style={[styles.pip, i < team.length - faints ? styles.pipLive : styles.pipDead]} />
            ))}
            <Text style={styles.pipText}>Bầy còn {Math.max(0, team.length - faints)}/{team.length}</Text>
          </View>
        </View>

        {/* ===== Bảng thoại / điều khiển ===== */}
        <View style={styles.dock}>
          {phase === 'intro' && (
            <>
              <View style={styles.introHead}>
                <Text style={styles.dockTitle}>⚔️ {boss.name} xuất hiện!</Text>
                <View style={[styles.tierTag, { backgroundColor: tier.color }]}><Text style={styles.tierTagText}>Độ khó: {tier.label}</Text></View>
              </View>
              <Text style={styles.dockLine}>Boss sẽ biến mất sau ít phút — cả bầy tiếp sức lần lượt. Thắng để nhận kẹo!</Text>
              <View style={styles.btnRow}>
                <Pressable onPress={start} style={[styles.btn, styles.btnPrimary]}><Text style={styles.btnPrimaryText}>Bắt đầu!</Text></Pressable>
                <Pressable onPress={onClose} style={styles.btn}><Text style={styles.btnText}>Để sau</Text></Pressable>
              </View>
            </>
          )}
          {phase === 'playing' && (
            <>
              <Text style={styles.dockLine}>{log}</Text>
              <Pressable onPress={skip} style={[styles.btn, styles.btnSkip]}><Text style={styles.btnText}>Bỏ qua ⏩</Text></Pressable>
            </>
          )}
          {(phase === 'win' || phase === 'lose') && (
            <ResultPanel win={phase === 'win'} reward={reward} onClose={onClose} styles={styles} />
          )}
        </View>

        {phase === 'win' && <Confetti />}
      </View>
    </Modal>
  );
}

function HpCard({ name, types, hpR, anim, cur, max, align }: { name: string; types: string[]; hpR: number; anim: Animated.Value; cur: number; max: number; align: 'left' | 'right' }) {
  const styles = useThemedStyles(makeStyles);
  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={[styles.hpCard, align === 'right' && { alignSelf: 'flex-end' }]}>
      <View style={styles.hpTop}>
        <Text style={styles.hpName} numberOfLines={1}>{name}</Text>
        <View style={styles.hpTypes}>
          {types.map((t) => <View key={t} style={[styles.hpType, { backgroundColor: typeColor(t) }]}><Text style={styles.hpTypeText}>{typeLabel(t)}</Text></View>)}
        </View>
      </View>
      <View style={styles.hpBarRow}>
        <View style={styles.hpBarBg}>
          <Animated.View style={[styles.hpBarFill, { width, backgroundColor: hpColor(hpR) }]} />
        </View>
        <Text style={[styles.hpNum, { color: hpColor(hpR) }]}>{Math.max(0, Math.round(cur))}/{max}</Text>
      </View>
    </View>
  );
}

function DmgNumber({ val, mult, crit }: { val: number; mult: number; crit: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(v, { toValue: 1, duration: 620, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(); }, []);
  const ty = v.interpolate({ inputRange: [0, 1], outputRange: [0, -46] });
  const op = v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
  const color = crit ? '#F87171' : mult === 0 ? '#94A3B8' : mult >= 2 ? '#FDE047' : mult < 1 ? '#93C5FD' : '#fff';
  const size = crit ? 40 : mult >= 2 ? 34 : 26;
  return <Animated.Text style={{ position: 'absolute', top: 6, fontSize: size, fontWeight: '900', color, transform: [{ translateY: ty }], opacity: op }}>-{val}{crit ? '!' : ''}</Animated.Text>;
}

function ResultPanel({ win, reward, onClose, styles }: { win: boolean; reward: { candy: number; egg: boolean; already: boolean } | null; onClose: () => void; styles: any }) {
  return (
    <>
      <Text style={styles.dockTitle}>{win ? '🏆 Chiến thắng!' : '💫 Thất bại...'}</Text>
      {win ? (
        <Text style={styles.dockLine}>
          {reward && reward.candy > 0 ? `Phần thưởng: 🍬 +${reward.candy} kẹo!` : 'Lượt boss này đã hạ rồi — không thêm kẹo, nhưng luyện tập tốt!'}
          {reward?.egg ? '  ·  🥚 +Trứng thưởng!' : ''}
        </Text>
      ) : (
        <Text style={styles.dockLine}>Cả bầy đã kiệt sức. Nuôi lớn thêm rồi quay lại phục thù!</Text>
      )}
      <Pressable onPress={onClose} style={[styles.btn, styles.btnWide]}><Text style={styles.btnPrimaryText}>Xong</Text></Pressable>
    </>
  );
}

function Confetti() {
  const items = ['🎉', '✨', '🎊', '⭐', '🍬', '🎉', '✨', '⭐'];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {items.map((e, i) => <ConfettiBit key={i} emoji={e} i={i} />)}
    </View>
  );
}
function ConfettiBit({ emoji, i }: { emoji: string; i: number }) {
  const v = useRef(new Animated.Value(0)).current;
  const W = Dimensions.get('window').width;
  const H = Dimensions.get('window').height;
  useEffect(() => {
    Animated.loop(Animated.timing(v, { toValue: 1, duration: 1800 + (i % 4) * 300, easing: Easing.linear, useNativeDriver: true })).start();
  }, []);
  const ty = v.interpolate({ inputRange: [0, 1], outputRange: [-40, H] });
  const rot = v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(i % 2 ? 1 : -1) * 360}deg`] });
  const left = ((i * 47) % 100) / 100 * W;
  return <Animated.Text style={{ position: 'absolute', left, fontSize: 24, transform: [{ translateY: ty }, { rotate: rot }] }}>{emoji}</Animated.Text>;
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: '#0B1220F7' },
    arena: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: SAFE_TOP, paddingBottom: spacing.sm, justifyContent: 'space-between' },
    bossRow: { marginTop: spacing.sm, alignItems: 'flex-end' },
    bossMon: { alignItems: 'center', marginTop: spacing.md, marginRight: spacing.lg },
    playerRow: { alignItems: 'flex-start', marginTop: 'auto' },
    playerMon: { alignItems: 'center', marginBottom: spacing.sm, marginLeft: spacing.lg },
    platform: { position: 'absolute', bottom: 6, width: 120, height: 26, borderRadius: 13, backgroundColor: '#00000055' },
    hpCard: { width: '66%', backgroundColor: '#1E293BEE', borderRadius: radius.md, borderWidth: 1, borderColor: '#334155', padding: spacing.sm },
    hpTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
    hpName: { color: '#fff', fontSize: 15, fontWeight: '900', flexShrink: 1 },
    hpTypes: { flexDirection: 'row', gap: 4, marginLeft: 6 },
    hpType: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
    hpTypeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
    hpBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    hpBarBg: { flex: 1, height: 10, borderRadius: 5, backgroundColor: '#0F172A', overflow: 'hidden' },
    hpBarFill: { height: 10, borderRadius: 5 },
    hpNum: { fontSize: 12, fontWeight: '900', minWidth: 62, textAlign: 'right' },
    banner: { position: 'absolute', alignSelf: 'center', top: '46%', paddingHorizontal: spacing.lg, paddingVertical: 6, borderRadius: radius.pill },
    bannerText: { color: '#fff', fontWeight: '900', fontSize: 16 },
    pips: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginBottom: spacing.sm },
    pip: { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 },
    pipLive: { backgroundColor: '#22C55E', borderColor: '#4ADE80' },
    pipDead: { backgroundColor: 'transparent', borderColor: '#64748B' },
    pipText: { color: '#94A3B8', fontSize: 12, fontWeight: '700', marginLeft: 6 },
    dock: { backgroundColor: '#111827', borderTopWidth: 1, borderColor: '#1F2937', padding: spacing.lg, paddingBottom: SAFE_BOTTOM },
    introHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.xs },
    tierTag: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
    tierTagText: { color: '#fff', fontSize: 12, fontWeight: '900' },
    dockTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: spacing.xs },
    dockLine: { color: '#CBD5E1', fontSize: 14, fontWeight: '600', lineHeight: 20, minHeight: 40 },
    btnRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
    btn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill, backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center', minHeight: 52 },
    btnPrimary: { backgroundColor: '#F97316', flex: 1 },
    btnWide: { backgroundColor: '#F97316', alignSelf: 'stretch', marginTop: spacing.md },
    btnPrimaryText: { color: '#fff', fontWeight: '900', fontSize: 15 },
    btnSkip: { alignSelf: 'flex-end', marginTop: spacing.sm },
    btnText: { color: '#E5E7EB', fontWeight: '800', fontSize: 14 },
  });
