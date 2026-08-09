import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, Pressable, ScrollView, Animated, Easing, Dimensions, Platform, StatusBar } from 'react-native';

// Chèn an toàn TỰ TÍNH (không dùng SafeAreaView — trong Modal nó KHÔNG chèn đáy đáng tin
// trên máy thật -> nút bị tràn xuống dưới home-indicator, mất chữ).
const SAFE_TOP = Platform.OS === 'ios' ? 56 : (StatusBar.currentHeight ?? 24) + 8;
const SAFE_BOTTOM = Platform.OS === 'ios' ? 40 : 20;
import CreatureImage from './CreatureImage';
import { Combatant, BossPhase, BossTier, typeMultiplier, countersOf, phasesOf, ENRAGE_ATK_MUL } from '../battle';
import {
  LiveState, LiveAction, LiveEvent, BossIntent, INTENT_VI,
  startLive, stepLive, canAct, autoAction, bossAtPhase,
  MAX_LINEUP, STAGGER_MAX, CHARGE_MUL, BLOCK_TAKEN, BERRY_HEAL, BERRY_COUNT, matchupOf,
  SPECIAL_ENERGY, SPECIAL_MUL,
} from '../battleLive';
import { HeldItem, RARITY } from '../items';
import { typeColor, typeLabel } from '../pokemonTypes';
import { Colors, radius, spacing } from '../theme';
import { useTheme, useThemedStyles } from '../theme-context';
import { feedbackTap, feedbackComplete, feedbackEvolve } from '../feedback';

// bst = tổng chỉ số gốc của con này; cộng lại thành SỨC MẠNH ĐỘI HÌNH để scale boss.
// Combatant không giữ stat thô nên phải mang kèm. item = món đang đeo (chỉ để HIỂN THỊ —
// buff đã nằm sẵn trong `c` qua applyHeld).
export interface Fighter { c: Combatant; shiny: boolean; bst: number; item?: HeldItem | null }

interface Props {
  visible: boolean;
  onClose: () => void;
  team: Fighter[];
  /** Boss để XEM TRƯỚC (tên/hệ/ảnh). Máu-công thật dựng lúc xuất chiến qua makeBoss. */
  boss: Combatant;
  tier: Pick<BossTier, 'label' | 'color'>;
  seed: number;
  /** Hệ của pha 2 và pha 3 — mỗi pha đổi hệ nên phải phủ nhiều hệ. */
  auraTypes: [string, string];
  /** Dựng boss theo SỨC MẠNH ĐỘI HÌNH đã chọn (xem lineupScale trong battle.ts). */
  makeBoss: (lineupPower: number) => Combatant;
  onWin: () => { candy: number; egg: boolean; item: HeldItem | null; already: boolean };
}

const STEP = 620;    // ms mỗi mẩu sự kiện trong một lượt
const HIT = 200;     // ms từ lúc lao tới lúc trúng đòn
const AUTO_GAP = 260; // nghỉ giữa hai lượt khi bật Tự đánh
const SELECT_PREVIEW = 12; // số con mở sẵn ở màn chọn (đã xếp con đáng mang lên đầu)

const hpColor = (r: number) => (r > 0.5 ? '#22C55E' : r > 0.2 ? '#EAB308' : '#EF4444');
const multColor = (m: number) => (m === 0 ? '#94A3B8' : m >= 2 ? '#22C55E' : m < 1 ? '#EF4444' : '#CBD5E1');
// Chiều NHẬN thì ngược lại: ×2 là xấu (đỏ), ×0.5 hoặc ×0 là tốt (xanh).
const takenColor = (m: number) => (m === 0 ? '#22C55E' : m >= 2 ? '#EF4444' : m < 1 ? '#22C55E' : '#94A3B8');

// ===== Màn chọn: xếp hạng đội dự bị =====
// Bảng khắc hệ chạy CẢ HAI CHIỀU, nên xếp theo cả hai:
//   • cover  = số pha con này GÂY ×2 trở lên
//   • risk   = số pha con này NHẬN ×2 trở lên (chọn theo mỗi chiều gây là bị boss xé)
//   • immune = số pha đòn con này VÔ HIỆU (lực chiến cao cũng vô nghĩa ở pha đó)
// Điểm = cover − risk để một con "đánh mạnh nhưng ăn đòn nặng" không leo lên đầu bảng.
function rankRoster(roster: Fighter[], phases: BossPhase[]) {
  return roster
    .map((f) => ({ f, ...matchupOf(f.c.types, phases) }))
    .sort((a, b) => b.score - a.score || b.cover - a.cover || a.immune - b.immune || b.f.bst - a.f.bst);
}

// Nhãn tóm tắt con này phủ được PHA NÀO.
function coverageTag(mults: number[]): { text: string; color: string } {
  const strong = mults.map((m, i) => (m >= 2 ? i + 1 : 0)).filter(Boolean);
  const immune = mults.map((m, i) => (m === 0 ? i + 1 : 0)).filter(Boolean);
  if (strong.length === mults.length) return { text: 'khắc CẢ 3 pha', color: '#22C55E' };
  if (strong.length) {
    const warn = immune.length ? ` · vô hiệu pha ${immune.join('·')}` : '';
    return { text: `khắc pha ${strong.join('·')}${warn}`, color: '#22C55E' };
  }
  if (immune.length) return { text: `vô hiệu pha ${immune.join('·')}`, color: '#EF4444' };
  return { text: 'không khắc pha nào', color: '#94A3B8' };
}

export default function BattleArena({ visible, onClose, team, boss, tier, seed, auraTypes, makeBoss, onWin }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const teamMap = useMemo(() => {
    const m = new Map<string, Fighter>();
    for (const f of team) m.set(f.c.key, f);
    return m;
  }, [team]);

  const [screen, setScreen] = useState<'select' | 'fight' | 'win' | 'lose'>('select');
  const [picked, setPicked] = useState<string[]>([]);
  const lineup = useMemo(() => picked.map((k) => teamMap.get(k)!).filter(Boolean), [picked, teamMap]);

  const previewPhases = useMemo(() => phasesOf(boss.types, auraTypes), [boss.types, auraTypes]);

  // ===== Trạng thái trận (lõi thuần trong battleLive.ts) =====
  const [st, setSt] = useState<LiveState | null>(null);
  // Bản HIỂN THỊ: thanh máu phải tụt theo TỪNG mẩu sự kiện, còn `st` chỉ giữ số cuối lượt.
  const [view, setView] = useState({ bossHp: 0, hp: [] as number[], active: 0 });
  const [busy, setBusy] = useState(false);
  const [auto, setAuto] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [log, setLog] = useState('');
  const [banner, setBanner] = useState<{ text: string; tone: 'good' | 'bad' | 'info' } | null>(null);
  const [dmg, setDmg] = useState<{ id: number; val: number; side: 'boss' | 'player'; mult: number; crit: boolean } | null>(null);
  const [reward, setReward] = useState<{ candy: number; egg: boolean; item: HeldItem | null; already: boolean } | null>(null);

  const autoRef = useRef(auto);
  autoRef.current = auto;
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const dmgSeq = useRef(0);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  const bossLunge = useRef(new Animated.Value(0)).current;
  const playerLunge = useRef(new Animated.Value(0)).current;
  const bossShake = useRef(new Animated.Value(0)).current;
  const playerShake = useRef(new Animated.Value(0)).current;
  const playerFade = useRef(new Animated.Value(1)).current;
  const guardPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    clearTimers();
    setScreen('select'); setPicked([]); setSt(null); setBusy(false); setAuto(false);
    setSwapOpen(false); setLog(''); setBanner(null); setDmg(null); setReward(null);
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
  const pulse = () => {
    guardPulse.setValue(0);
    Animated.timing(guardPulse, { toValue: 1, duration: 480, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };

  // ===== Chọn đội =====
  const togglePick = (key: string) => {
    feedbackTap();
    setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : p.length < MAX_LINEUP ? [...p, key] : p));
  };

  const start = () => {
    if (!lineup.length) return;
    feedbackTap();
    const power = lineup.reduce((s, f) => s + f.bst, 0);
    const fightBoss = makeBoss(power);
    const s0 = startLive(lineup.map((f) => f.c), fightBoss, seed, auraTypes);
    setSt(s0);
    setView({ bossHp: s0.bossHp, hp: s0.hp, active: s0.active });
    setScreen('fight');
    setLog(`${lineup[0].c.name} tiến lên! Đọc dự báo của boss rồi ra lệnh.`);
  };

  // ===== Phát một lượt =====
  const idxOfKey = (s: LiveState, key?: string) => (key ? s.team.findIndex((c) => c.key === key) : -1);

  const applyEvent = (e: LiveEvent, s: LiveState) => {
    setLog(e.text);
    const id = dmgSeq.current++;
    switch (e.kind) {
      case 'player-hit':
        feedbackTap();
        lunge(playerLunge); shake(bossShake);
        setDmg({ id, val: e.dmg ?? 0, side: 'boss', mult: e.mult ?? 1, crit: !!e.crit });
        setView((v) => ({ ...v, bossHp: Math.max(0, v.bossHp - (e.dmg ?? 0)) }));
        setBanner(e.crit ? { text: 'Chí mạng! 💥', tone: 'good' } : (e.mult ?? 1) >= 2 ? { text: 'Hiệu quả tuyệt vời!', tone: 'good' } : (e.mult ?? 1) === 0 ? { text: 'Vô hiệu!', tone: 'bad' } : null);
        break;
      case 'special':
        feedbackEvolve();
        lunge(playerLunge); shake(bossShake);
        setDmg({ id, val: e.dmg ?? 0, side: 'boss', mult: e.mult ?? 1, crit: !!e.crit });
        setView((v) => ({ ...v, bossHp: Math.max(0, v.bossHp - (e.dmg ?? 0)) }));
        setBanner({ text: 'TUYỆT CHIÊU! 🌟', tone: 'good' });
        break;
      case 'boss-hit': {
        feedbackTap();
        lunge(bossLunge); shake(playerShake);
        setDmg({ id, val: e.dmg ?? 0, side: 'player', mult: e.mult ?? 1, crit: !!e.crit });
        const i = idxOfKey(s, e.key);
        setView((v) => ({ ...v, hp: v.hp.map((h, j) => (j === i ? Math.max(0, h - (e.dmg ?? 0)) : h)) }));
        break;
      }
      case 'block':
        pulse();
        setBanner({ text: e.text.includes('ĐỠ TRÚNG') ? 'ĐỠ TRÚNG! ⚔️' : 'Thế đỡ 🛡️', tone: 'good' });
        break;
      case 'charge':
        feedbackComplete();
        setBanner({ text: `Dồn lực ×${CHARGE_MUL} ⚡`, tone: 'good' });
        break;
      case 'berry': {
        feedbackComplete();
        const i = idxOfKey(s, e.key);
        setView((v) => ({ ...v, hp: v.hp.map((h, j) => (j === i ? h + (e.heal ?? 0) : h)) }));
        setBanner({ text: `Hồi ${e.heal} HP 🍓`, tone: 'good' });
        break;
      }
      case 'swap': {
        const i = idxOfKey(s, e.key);
        if (i >= 0) {
          setView((v) => ({ ...v, active: i }));
          playerFade.setValue(0);
          Animated.timing(playerFade, { toValue: 1, duration: 280, useNativeDriver: true }).start();
        }
        break;
      }
      case 'faint':
        Animated.timing(playerFade, { toValue: 0, duration: 280, useNativeDriver: true }).start();
        setBanner({ text: 'Gục ngã 💫', tone: 'bad' });
        break;
      case 'break':
        feedbackEvolve();
        setBanner({ text: 'ÁP CHẾ — BOSS CHOÁNG! 💫', tone: 'good' });
        break;
      case 'phase':
        feedbackEvolve();
        setBanner({ text: e.text, tone: 'bad' });
        break;
      case 'shatter':
        setBanner({ text: 'Dồn lực bị PHÁ VỠ 💔', tone: 'bad' });
        break;
      case 'drain':
      case 'regen':
        setView((v) => ({ ...v, bossHp: v.bossHp + (e.heal ?? 0) }));
        setBanner({ text: e.text, tone: 'bad' });
        break;
      case 'guard':
        setBanner({ text: 'Boss phòng thủ 🛡️', tone: 'info' });
        break;
    }
    timers.current.push(setTimeout(() => setDmg(null), STEP - HIT - 60));
  };

  const act = (action: LiveAction) => {
    if (!st || busy || st.over || !canAct(st, action)) return;
    setSwapOpen(false);
    feedbackTap();
    const next = stepLive(st, action);
    setSt(next);
    setBusy(true);
    next.log.forEach((e, i) => {
      timers.current.push(setTimeout(() => applyEvent(e, next), i * STEP));
    });
    timers.current.push(setTimeout(() => {
      // Đồng bộ lại theo state THẬT để thanh máu không lệch dần sau nhiều lượt.
      setView({ bossHp: next.bossHp, hp: next.hp, active: next.active });
      setBanner(null);
      setBusy(false);
      if (next.over) finish(next);
      else if (autoRef.current) timers.current.push(setTimeout(() => actRef.current(autoAction(next)), AUTO_GAP));
    }, Math.max(1, next.log.length) * STEP));
  };
  // Tự đánh gọi lại chính nó qua ref -> không cần đưa `act` vào deps.
  const actRef = useRef(act);
  actRef.current = act;

  const finish = (s: LiveState) => {
    if (s.over === 'win') {
      feedbackEvolve();
      setReward(onWin());
      setScreen('win');
    } else {
      feedbackComplete();
      setScreen('lose');
    }
  };

  const toggleAuto = () => {
    feedbackTap();
    const on = !auto;
    setAuto(on);
    autoRef.current = on;
    if (on && st && !st.over && !busy) timers.current.push(setTimeout(() => actRef.current(autoAction(st)), AUTO_GAP));
  };

  const W = Dimensions.get('window').width;
  const bossTx = bossLunge.interpolate({ inputRange: [0, 1], outputRange: [0, -W * 0.2] });
  const bossTy = bossLunge.interpolate({ inputRange: [0, 1], outputRange: [0, 50] });
  const playerTx = playerLunge.interpolate({ inputRange: [0, 1], outputRange: [0, W * 0.2] });
  const playerTy = playerLunge.interpolate({ inputRange: [0, 1], outputRange: [0, -50] });
  const bossShakeX = bossShake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] });
  const playerShakeX = playerShake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] });
  const guardScale = guardPulse.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1.5] });
  const guardOpacity = guardPulse.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 0.55, 0] });

  const bossNow = st ? bossAtPhase(st.boss, st.phases, st.phase) : boss;
  const me = st ? st.team[view.active] : null;
  const myMult = st && me ? typeMultiplier(me.types, bossNow.types) : 1;
  const myTaken = st && me ? typeMultiplier(bossNow.types, me.types) : 1;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        {screen === 'select' ? (
          <SelectScreen
            boss={boss} tier={tier} roster={team} picked={picked} phases={previewPhases}
            onToggle={togglePick} onStart={start} onClose={onClose} styles={styles} colors={colors}
          />
        ) : (
          <>
            {/* ===== Sân đấu ===== */}
            <View style={styles.arena}>
              {/* Bỏ trận giữa đường. Không có nút này thì mở arena là bị KHOÁ trong đó tới
                  khi thắng/thua — bản trước còn nút "Bỏ qua", bản này thì không. */}
              <Pressable onPress={() => { feedbackTap(); onClose(); }} style={styles.quit} hitSlop={8}>
                <Text style={styles.quitText}>✕ Bỏ trận</Text>
              </Pressable>

              {/* Boss */}
              <View style={styles.bossBlock}>
                <FighterCard
                  name={bossNow.name} types={bossNow.types}
                  cur={view.bossHp} max={st?.boss.maxHp ?? 1}
                  right={<PhaseChip phase={(st?.phase ?? 0) + 1} enraged={!!st?.phases[st.phase]?.enraged} color={tier.color} />}
                  styles={styles}
                />
                <StaggerBar value={st?.stagger ?? 0} styles={styles} />
                <Animated.View style={[styles.bossMon, { transform: [{ translateX: Animated.add(bossTx, bossShakeX) }, { translateY: bossTy }] }]}>
                  <View style={styles.platform} />
                  <CreatureImage formId={bossNow.id} size={112} />
                  {dmg?.side === 'boss' && <DmgNumber key={dmg.id} val={dmg.val} mult={dmg.mult} crit={dmg.crit} />}
                </Animated.View>
              </View>

              {banner && (
                <View style={[styles.banner, banner.tone === 'good' ? styles.bannerGood : banner.tone === 'bad' ? styles.bannerBad : styles.bannerInfo]}>
                  <Text style={styles.bannerText} numberOfLines={2}>{banner.text}</Text>
                </View>
              )}

              {/* Người chơi */}
              <View style={styles.playerBlock}>
                <Animated.View style={[styles.playerMon, { opacity: playerFade, transform: [{ translateX: Animated.add(playerTx, playerShakeX) }, { translateY: playerTy }] }]}>
                  <Animated.View style={[styles.guardRing, { transform: [{ scale: guardScale }], opacity: guardOpacity }]} />
                  <View style={styles.platform} />
                  <CreatureImage formId={me?.id ?? 1} shiny={teamMap.get(me?.key ?? '')?.shiny} size={118} />
                  {dmg?.side === 'player' && <DmgNumber key={dmg.id} val={dmg.val} mult={dmg.mult} crit={dmg.crit} />}
                </Animated.View>
                <FighterCard
                  name={me?.name ?? ''} types={me?.types ?? []}
                  cur={view.hp[view.active] ?? 0} max={me?.maxHp ?? 1}
                  right={
                    <View style={styles.myTags}>
                      <View style={[styles.multPill, { borderColor: multColor(myMult) }]}>
                        <Text style={[styles.multPillText, { color: multColor(myMult) }]}>⚔×{myMult}</Text>
                      </View>
                      {/* Chiều NHẬN: boss cũng khắc hệ, nên phải thấy để biết lúc nào cần đỡ/đổi. */}
                      <View style={[styles.multPill, { borderColor: takenColor(myTaken) }]}>
                        <Text style={[styles.multPillText, { color: takenColor(myTaken) }]}>🛡×{myTaken}</Text>
                      </View>
                      {teamMap.get(me?.key ?? '')?.item && (
                        <Text style={styles.heldEmoji}>{teamMap.get(me?.key ?? '')!.item!.emoji}</Text>
                      )}
                      {st?.charge && <View style={styles.chargePill}><Text style={styles.chargePillText}>⚡</Text></View>}
                    </View>
                  }
                  styles={styles}
                />
              </View>
            </View>

            {/* ===== Bảng điều khiển ===== */}
            <View style={styles.dock}>
              {screen === 'fight' && st ? (
                <>
                  <IntentRow intent={st.intent} styles={styles} />
                  <Text style={styles.dockLine} numberOfLines={2}>{log}</Text>
                  <BenchRow
                    st={st} view={view} teamMap={teamMap} bossTypes={bossNow.types} open={swapOpen}
                    onPick={(i) => act({ kind: 'swap', index: i })} styles={styles}
                  />
                  {/* Tuyệt chiêu: nút RIÊNG full bề rộng — nộ đầy mới sáng, kèm thanh nộ. */}
                  <SpecialBtn energy={st.energy[st.active] ?? 0} disabled={busy || !canAct(st, { kind: 'special' })}
                    onPress={() => act({ kind: 'special' })} styles={styles} />
                  <View style={styles.cmdGrid}>
                    <CmdBtn label="Đánh" sub={st.charge ? `bung ×${CHARGE_MUL}` : `×${myMult} hệ`} icon="⚔️"
                      tone="attack" disabled={busy} onPress={() => act({ kind: 'attack' })} styles={styles} />
                    <CmdBtn label="Đỡ đòn" sub={`chặn ${Math.round((1 - BLOCK_TAKEN) * 100)}%`} icon="🛡️"
                      tone="block" disabled={busy} onPress={() => act({ kind: 'block' })} styles={styles} />
                    <CmdBtn label="Dồn lực" sub={`đòn sau ×${CHARGE_MUL}`} icon="⚡"
                      tone="charge" disabled={busy || !canAct(st, { kind: 'charge' })} onPress={() => act({ kind: 'charge' })} styles={styles} />
                    <CmdBtn label={`Berry ${st.berries}/${BERRY_COUNT}`} sub={`hồi ${Math.round(BERRY_HEAL * 100)}%`} icon="🍓"
                      tone="berry" disabled={busy || !canAct(st, { kind: 'berry' })} onPress={() => act({ kind: 'berry' })} styles={styles} />
                  </View>
                  <View style={styles.dockFoot}>
                    <Pressable onPress={() => { feedbackTap(); setSwapOpen((o) => !o); }} disabled={busy}
                      style={[styles.footBtn, swapOpen && styles.footBtnOn, busy && styles.btnOff]}>
                      <Text style={styles.footBtnText}>🔄 Đổi con</Text>
                    </Pressable>
                    <Pressable onPress={toggleAuto} style={[styles.footBtn, auto && styles.footBtnOn]}>
                      <Text style={styles.footBtnText}>{auto ? '⏸ Tắt tự đánh' : '▶ Tự đánh'}</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <ResultPanel win={screen === 'win'} reward={reward} onClose={onClose} styles={styles} />
              )}
            </View>

            {screen === 'win' && <Confetti />}
          </>
        )}
      </View>
    </Modal>
  );
}

// ===== Dự báo đòn boss — trái tim của cơ chế =====
function IntentRow({ intent, styles }: { intent: BossIntent; styles: any }) {
  const v = INTENT_VI[intent];
  return (
    <View style={[styles.intent, { borderColor: v.color, backgroundColor: v.color + '1F' }]}>
      <Text style={[styles.intentLabel, { color: v.color }]}>Lượt tới: {v.label}</Text>
      <Text style={styles.intentHint} numberOfLines={2}>{v.hint}</Text>
    </View>
  );
}

function StaggerBar({ value, styles }: { value: number; styles: any }) {
  return (
    <View style={styles.stagRow}>
      <Text style={styles.stagLabel}>ÁP CHẾ</Text>
      {Array.from({ length: STAGGER_MAX }, (_, i) => (
        <View key={i} style={[styles.stagPip, i < value && styles.stagPipOn]} />
      ))}
      <Text style={styles.stagHint}>đầy ⇒ boss choáng</Text>
    </View>
  );
}

function FighterCard({ name, types, cur, max, right, styles }: {
  name: string; types: string[]; cur: number; max: number; right?: React.ReactNode; styles: any;
}) {
  const r = max ? Math.max(0, cur) / max : 0;
  return (
    <View style={styles.fCard}>
      <View style={styles.fTop}>
        <Text style={styles.fName} numberOfLines={1}>{name}</Text>
        {right}
      </View>
      <View style={styles.fMid}>
        {types.map((t) => (
          <View key={t} style={[styles.fType, { backgroundColor: typeColor(t) }]}>
            <Text style={styles.fTypeText}>{typeLabel(t)}</Text>
          </View>
        ))}
      </View>
      <View style={styles.hpRow}>
        <View style={styles.hpBg}>
          <View style={[styles.hpFill, { width: `${Math.round(r * 100)}%`, backgroundColor: hpColor(r) }]} />
        </View>
        <Text style={[styles.hpNum, { color: hpColor(r) }]}>{Math.max(0, Math.round(cur))}/{max}</Text>
      </View>
    </View>
  );
}

function PhaseChip({ phase, enraged, color }: { phase: number; enraged: boolean; color: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.phaseChip, { backgroundColor: enraged ? '#EF4444' : color }]}>
      <Text style={styles.phaseChipText}>PHA {phase}/3{enraged ? ' · NỔI GIẬN' : ''}</Text>
    </View>
  );
}

// Băng ghế dự bị: mở ra mới đổi được, và ghi rõ hệ số ở PHA HIỆN TẠI để đổi có cơ sở.
function BenchRow({ st, view, teamMap, bossTypes, open, onPick, styles }: {
  st: LiveState; view: { hp: number[]; active: number }; teamMap: Map<string, Fighter>;
  bossTypes: string[]; open: boolean; onPick: (i: number) => void; styles: any;
}) {
  if (!open) return null;
  const others = st.team.map((c, i) => ({ c, i })).filter(({ i }) => i !== view.active);
  if (!others.length) return <Text style={styles.benchEmpty}>Chỉ mang một con — không có ai để đổi.</Text>;
  return (
    <View style={styles.bench}>
      {others.map(({ c, i }) => {
        const alive = (view.hp[i] ?? 0) > 0;
        const m = typeMultiplier(c.types, bossTypes);
        const r = c.maxHp ? Math.max(0, view.hp[i] ?? 0) / c.maxHp : 0;
        return (
          <Pressable key={c.key} disabled={!alive} onPress={() => onPick(i)}
            style={[styles.benchCell, !alive && styles.btnOff]}>
            <CreatureImage formId={c.id} shiny={teamMap.get(c.key)?.shiny} size={40} />
            <Text style={styles.benchName} numberOfLines={1}>
              {teamMap.get(c.key)?.item ? `${teamMap.get(c.key)!.item!.emoji} ` : ''}{c.name}
            </Text>
            <Text style={[styles.benchMult, { color: multColor(m) }]}>×{m}</Text>
            <View style={styles.benchHpBg}>
              <View style={[styles.benchHpFill, { width: `${Math.round(r * 100)}%`, backgroundColor: hpColor(r) }]} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

// Nút Tuyệt chiêu + thanh NỘ. Nộ tích khi ra đòn / trúng đòn (xem battleLive.ts) — hiển thị
// ngay trên nút để người chơi thấy mình đang "sắp có gì đó" kể cả lúc bị ép phòng thủ.
function SpecialBtn({ energy, disabled, onPress, styles }: {
  energy: number; disabled: boolean; onPress: () => void; styles: any;
}) {
  const ready = energy >= SPECIAL_ENERGY;
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={[styles.special, ready ? styles.specialReady : styles.specialDim, disabled && ready && styles.btnOff]}>
      <Text style={styles.cmdIcon}>🌟</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.cmdLabel} numberOfLines={1}>Tuyệt chiêu {ready ? '— SẴN SÀNG!' : ''}</Text>
        <Text style={styles.cmdSub} numberOfLines={1}>×{SPECIAL_MUL} · xuyên phòng thủ · +Áp Chế</Text>
      </View>
      <View style={styles.energyRow}>
        {Array.from({ length: SPECIAL_ENERGY }, (_, i) => (
          <View key={i} style={[styles.energyPip, i < energy && styles.energyPipOn]} />
        ))}
      </View>
    </Pressable>
  );
}

function CmdBtn({ label, sub, icon, tone, disabled, onPress, styles }: {
  label: string; sub: string; icon: string; tone: 'attack' | 'block' | 'charge' | 'berry';
  disabled: boolean; onPress: () => void; styles: any;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled}
      style={[styles.cmd, styles[`cmd_${tone}` as keyof typeof styles] as any, disabled && styles.btnOff]}>
      <Text style={styles.cmdIcon}>{icon}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.cmdLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.cmdSub} numberOfLines={1}>{sub}</Text>
      </View>
    </Pressable>
  );
}

// ===== Màn CHỌN xuất chiến =====
// Bố cục HÀNG NGANG full bề rộng thay vì lưới 3 cột: tên dài như "Mega Swampert" không
// còn bị cắt, và ba hệ số pha đọc được liền một dòng.
function SelectScreen({ boss, tier, roster, picked, phases, onToggle, onStart, onClose, styles, colors }: {
  boss: Combatant; tier: Pick<BossTier, 'label' | 'color'>; roster: Fighter[]; phases: BossPhase[];
  picked: string[]; onToggle: (k: string) => void; onStart: () => void; onClose: () => void;
  styles: any; colors: Colors;
}) {
  const ranked = useMemo(() => rankRoster(roster, phases), [roster, phases]);
  const pickedSet = useMemo(() => new Set(picked), [picked]);
  // Bầy 70+ con thì cuộn hết danh sách là vô nghĩa: thứ tự đã xếp con ĐÁNG MANG lên đầu,
  // nên chỉ mở sẵn nhóm đầu, ai muốn xem hết thì bấm.
  const [all, setAll] = useState(false);
  const visible = all ? ranked : ranked.slice(0, SELECT_PREVIEW);
  // Con ĐÃ CHỌN phải luôn thấy được, kể cả khi nó nằm ngoài nhóm đầu.
  const rows = all
    ? visible
    : [...visible, ...ranked.filter((r) => pickedSet.has(r.f.c.key) && !visible.includes(r))];

  // Đội đang chọn phủ được pha nào — cho thấy LỖ HỔNG trước khi bấm xuất chiến.
  const cover = useMemo(
    () => phases.map((ph) => picked.some((k) => {
      const f = roster.find((x) => x.c.key === k);
      return !!f && typeMultiplier(f.c.types, ph.types) >= 2;
    })),
    [picked, phases, roster]
  );

  return (
    <>
      <ScrollView contentContainerStyle={styles.selContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.selTitle}>Chuẩn bị xuất chiến</Text>

        <View style={styles.selBoss}>
          <CreatureImage formId={boss.id} size={68} />
          <View style={{ flex: 1, marginLeft: spacing.md }}>
            <View style={styles.selBossHead}>
              <Text style={styles.selBossName} numberOfLines={1}>{boss.name}</Text>
              <View style={[styles.tierTag, { backgroundColor: tier.color }]}><Text style={styles.tierTagText}>{tier.label}</Text></View>
            </View>
            <Text style={styles.selHintDim}>3 pha · mỗi pha ĐỔI HỆ · pha cuối nổi giận</Text>
          </View>
        </View>

        {/* Cách đánh — cơ chế mới nên phải nói thẳng, không để người chơi tự mò. */}
        <View style={styles.howto}>
          <Text style={styles.howtoTitle}>Đánh theo lượt — boss BÁO TRƯỚC đòn</Text>
          <Text style={styles.howtoLine}>🛡️ Báo <Text style={styles.howtoKey}>ĐÒN NẶNG</Text> → Đỡ đòn: chặn {Math.round((1 - BLOCK_TAKEN) * 100)}% và PHẢN lại Áp Chế</Text>
          <Text style={styles.howtoLine}>⚡ Báo <Text style={styles.howtoKey}>Phòng thủ</Text> → Dồn lực: đòn sau ×{CHARGE_MUL}</Text>
          <Text style={styles.howtoLine}>💫 Đánh khắc hệ đủ {STAGGER_MAX} Áp Chế → boss CHOÁNG, mất một lượt</Text>
          <Text style={styles.howtoLine}>🌟 Ra đòn / trúng đòn tích NỘ — đầy thanh bung <Text style={styles.howtoKey}>TUYỆT CHIÊU</Text> ×{SPECIAL_MUL} xuyên phòng thủ</Text>
        </View>

        {phases.map((ph, i) => {
          const cs = countersOf(ph.types);
          const ok = cover[i];
          return (
            <View key={i} style={[styles.phaseRow, picked.length > 0 && { borderColor: ok ? '#22C55E' : '#EF4444' }]}>
              <View style={[styles.phaseNum, { backgroundColor: tier.color }]}>
                <Text style={styles.phaseNumText}>{i + 1}</Text>
              </View>
              <View style={styles.phaseBody}>
                <View style={styles.chipRowLeft}>
                  {ph.types.map((t) => (
                    <View key={t} style={[styles.tChip, { backgroundColor: typeColor(t) }]}>
                      <Text style={styles.tChipText}>{typeLabel(t)}</Text>
                    </View>
                  ))}
                  {ph.enraged && (
                    <View style={styles.enrageTag}><Text style={styles.enrageTagText}>NỔI GIẬN ×{ENRAGE_ATK_MUL}</Text></View>
                  )}
                  {picked.length > 0 && (
                    <Text style={[styles.coverMark, { color: ok ? '#22C55E' : '#EF4444' }]}>{ok ? '✓ đã phủ' : '✗ chưa phủ'}</Text>
                  )}
                </View>
                <Text style={styles.phaseHint} numberOfLines={2}>
                  {cs.length ? `Khắc bằng ${cs.map(typeLabel).join(', ')}` : 'Không hệ nào khắc — cần Công/Đ.Công cao'}
                </Text>
              </View>
            </View>
          );
        })}

        <View style={styles.listHead}>
          <Text style={styles.listTitle}>
            {all ? `Cả bầy (${roster.length})` : `Đáng mang nhất (${Math.min(SELECT_PREVIEW, roster.length)}/${roster.length})`}
          </Text>
          <Text style={styles.listSort}>xếp: phủ nhiều pha → lực chiến</Text>
        </View>

        {rows.map(({ f, mults, taken }) => {
          const order = picked.indexOf(f.c.key);
          const on = pickedSet.has(f.c.key);
          const tag = coverageTag(mults);
          return (
            <Pressable key={f.c.key} onPress={() => onToggle(f.c.key)}
              style={[styles.pickRow, on && { borderColor: tier.color, borderWidth: 2 }]}>
              <View style={styles.pickArt}>
                <CreatureImage formId={f.c.id} shiny={f.shiny} size={52} />
                {on && <View style={[styles.pickOrder, { backgroundColor: tier.color }]}><Text style={styles.pickOrderText}>{order + 1}</Text></View>}
              </View>
              <View style={styles.pickBody}>
                <View style={styles.pickTop}>
                  <Text style={styles.pickName} numberOfLines={1}>
                    {f.shiny ? '✨ ' : ''}{f.c.name}{f.item ? ` ${f.item.emoji}` : ''}
                  </Text>
                  <Text style={styles.pickBst}>⚡{f.bst}</Text>
                </View>
                {f.item && (
                  <Text style={[styles.pickItem, { color: RARITY[f.item.rarity].color }]} numberOfLines={1}>
                    {f.item.emoji} {f.item.name} · {f.item.desc}
                  </Text>
                )}
                <View style={styles.chipRowLeft}>
                  {f.c.types.map((t) => (
                    <View key={t} style={[styles.tChipSm, { backgroundColor: typeColor(t) }]}>
                      <Text style={styles.tChipTextSm}>{typeLabel(t)}</Text>
                    </View>
                  ))}
                  {/* Mỗi ô: pha i · ⚔ đòn ta GÂY · 🛡 đòn boss GÂY LẠI. Thiếu dòng 🛡 thì
                      người chơi chọn toàn con đánh mạnh rồi bị boss xé trong hai lượt. */}
                  {mults.map((m, i) => (
                    <View key={i} style={styles.multBox}>
                      <Text style={styles.multBoxPhase}>pha {i + 1}</Text>
                      <Text style={[styles.multBoxVal, { color: multColor(m) }]}>⚔×{m}</Text>
                      <Text style={[styles.multBoxVal, { color: takenColor(taken[i]) }]}>🛡×{taken[i]}</Text>
                    </View>
                  ))}
                </View>
                <Text style={[styles.pickTag, { color: tag.color }]} numberOfLines={1}>
                  {tag.text}
                  {(() => {
                    const hot = taken.map((t, i) => (t >= 2 ? i + 1 : 0)).filter(Boolean);
                    return hot.length ? `  ·  ⚠ ăn nặng pha ${hot.join('·')}` : '';
                  })()}
                </Text>
              </View>
            </Pressable>
          );
        })}

        {ranked.length > SELECT_PREVIEW && (
          <Pressable onPress={() => { feedbackTap(); setAll((v) => !v); }} style={styles.moreBtn}>
            <Text style={styles.moreBtnText}>
              {all ? 'Thu gọn ▴' : `Xem cả bầy (${ranked.length - SELECT_PREVIEW} con nữa) ▾`}
            </Text>
          </Pressable>
        )}
      </ScrollView>

      <View style={styles.dock}>
        <Text style={styles.dockLine} numberOfLines={2}>
          {picked.length === 0
            ? `Chọn tối đa ${MAX_LINEUP} con — con đầu ra sân trước, còn lại đổi vào giữa trận.`
            : cover.every(Boolean)
              ? '✓ Đội phủ đủ 3 pha — thế này là đẹp nhất.'
              : `Còn hở pha ${cover.map((c, i) => (c ? 0 : i + 1)).filter(Boolean).join(', ')} — pha đó sẽ đánh rất chậm.`}
        </Text>
        <View style={styles.btnRow}>
          <Pressable onPress={onStart} disabled={!picked.length} style={[styles.btn, styles.btnPrimary, !picked.length && styles.btnOff]}>
            <Text style={styles.btnPrimaryText}>Xuất chiến ({picked.length}/{MAX_LINEUP})</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.btn}><Text style={styles.btnText}>Để sau</Text></Pressable>
        </View>
      </View>
    </>
  );
}

function DmgNumber({ val, mult, crit }: { val: number; mult: number; crit: boolean }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => { Animated.timing(v, { toValue: 1, duration: 620, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(); }, []);
  const ty = v.interpolate({ inputRange: [0, 1], outputRange: [0, -46] });
  const op = v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
  const color = crit ? '#F87171' : mult === 0 ? '#94A3B8' : mult >= 2 ? '#FDE047' : mult < 1 ? '#93C5FD' : '#fff';
  const size = crit ? 38 : mult >= 2 ? 32 : 25;
  return <Animated.Text style={{ position: 'absolute', top: 6, fontSize: size, fontWeight: '900', color, transform: [{ translateY: ty }], opacity: op }}>-{val}{crit ? '!' : ''}</Animated.Text>;
}

function ResultPanel({ win, reward, onClose, styles }: { win: boolean; reward: { candy: number; egg: boolean; item: HeldItem | null; already: boolean } | null; onClose: () => void; styles: any }) {
  return (
    <>
      <Text style={styles.dockTitle}>{win ? '🏆 Chiến thắng!' : '💫 Thất bại...'}</Text>
      {win ? (
        <Text style={styles.dockLine}>
          {reward && reward.candy > 0 ? `Phần thưởng: 🍬 +${reward.candy} kẹo!` : 'Lượt boss này đã hạ rồi — không thêm kẹo, nhưng luyện tập tốt!'}
          {reward?.egg ? '  ·  🥚 +Trứng thưởng!' : ''}
          {reward?.item ? `  ·  ${reward.item.emoji} Rơi [${RARITY[reward.item.rarity].label}] ${reward.item.name} (${reward.item.desc}) — vào Bầy đeo cho một con!` : ''}
        </Text>
      ) : (
        <Text style={styles.dockLine}>Cả đội đã kiệt sức. Đổi đội hình phủ đủ 3 pha rồi quay lại phục thù!</Text>
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
    // Đặc hẳn, không cho màn Bầy lộ mờ phía sau — nhìn rối.
    root: { flex: 1, backgroundColor: '#070C16' },
    arena: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: SAFE_TOP, justifyContent: 'space-between' },
    // top phải >= SAFE_TOP, không thì chồng lên thanh trạng thái (đè mất đồng hồ).
    // Thẻ boss chỉ rộng 72% và dạt phải nên mép trái vẫn trống cho nút này.
    quit: { position: 'absolute', top: SAFE_TOP + 2, left: spacing.lg, zIndex: 5, backgroundColor: '#1E293BCC', borderRadius: radius.pill, borderWidth: 1, borderColor: '#334155', paddingHorizontal: 10, paddingVertical: 5 },
    quitText: { color: '#94A3B8', fontSize: 11.5, fontWeight: '800' },
    bossBlock: { alignItems: 'flex-end' },
    playerBlock: { alignItems: 'flex-start', marginTop: 'auto' },
    bossMon: { alignItems: 'center', marginTop: spacing.sm, marginRight: spacing.lg },
    playerMon: { alignItems: 'center', marginBottom: spacing.xs, marginLeft: spacing.lg },
    platform: { position: 'absolute', bottom: 4, width: 110, height: 24, borderRadius: 12, backgroundColor: '#00000055' },
    guardRing: { position: 'absolute', width: 110, height: 110, borderRadius: 55, borderWidth: 4, borderColor: '#60A5FA' },

    // Thẻ chiến binh
    fCard: { width: '72%', backgroundColor: '#131C2EF2', borderRadius: radius.md, borderWidth: 1, borderColor: '#2A3550', paddingHorizontal: spacing.sm, paddingVertical: 7, gap: 5 },
    fTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
    fName: { color: '#fff', fontSize: 15, fontWeight: '900', flexShrink: 1 },
    fMid: { flexDirection: 'row', gap: 4 },
    fType: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
    fTypeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
    hpRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    hpBg: { flex: 1, height: 9, borderRadius: 5, backgroundColor: '#0A1120', overflow: 'hidden' },
    hpFill: { height: 9, borderRadius: 5 },
    hpNum: { fontSize: 11.5, fontWeight: '900', minWidth: 66, textAlign: 'right' },
    myTags: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    multPill: { borderWidth: 1.5, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 },
    multPillText: { fontSize: 11, fontWeight: '900' },
    heldEmoji: { fontSize: 12 },
    chargePill: { backgroundColor: '#F59E0B', borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
    chargePillText: { color: '#fff', fontSize: 9.5, fontWeight: '900' },
    phaseChip: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
    phaseChipText: { color: '#fff', fontSize: 9.5, fontWeight: '900' },

    // Thanh Áp Chế
    stagRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6, alignSelf: 'flex-end' },
    stagLabel: { color: '#7DD3FC', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
    stagPip: { width: 16, height: 7, borderRadius: 4, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#334155' },
    stagPipOn: { backgroundColor: '#38BDF8', borderColor: '#7DD3FC' },
    stagHint: { color: '#64748B', fontSize: 9, fontWeight: '700', marginLeft: 2 },

    banner: { position: 'absolute', alignSelf: 'center', top: '44%', maxWidth: '86%', paddingHorizontal: spacing.lg, paddingVertical: 7, borderRadius: radius.pill },
    bannerGood: { backgroundColor: '#F97316' },
    bannerBad: { backgroundColor: '#7F1D1D' },
    bannerInfo: { backgroundColor: '#334155' },
    bannerText: { color: '#fff', fontWeight: '900', fontSize: 15, textAlign: 'center' },

    // Bảng điều khiển
    dock: { backgroundColor: '#0E1626', borderTopWidth: 1, borderColor: '#1F2A3F', padding: spacing.lg, paddingBottom: SAFE_BOTTOM, gap: spacing.sm },
    dockTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
    dockLine: { color: '#CBD5E1', fontSize: 13, fontWeight: '600', lineHeight: 19, minHeight: 38 },
    intent: { borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 7 },
    intentLabel: { fontSize: 13.5, fontWeight: '900' },
    intentHint: { color: '#94A3B8', fontSize: 11, fontWeight: '600', marginTop: 1 },

    cmdGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    cmd: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, borderWidth: 1.5, paddingHorizontal: spacing.md, paddingVertical: 11, backgroundColor: '#16202F' },
    cmd_attack: { borderColor: '#F97316', backgroundColor: '#F9731622' },
    cmd_block: { borderColor: '#60A5FA', backgroundColor: '#60A5FA1F' },
    cmd_charge: { borderColor: '#FBBF24', backgroundColor: '#FBBF241F' },
    cmd_berry: { borderColor: '#34D399', backgroundColor: '#34D3991F' },
    cmdIcon: { fontSize: 19 },
    // Tuyệt chiêu: full bề rộng, tím — chưa đầy nộ thì mờ NHẸ (0.38 của btnOff làm thanh nộ
    // không đọc được, mà thanh nộ chính là thứ cần thấy lúc chưa đầy).
    special: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, borderWidth: 1.5, borderColor: '#A855F7', backgroundColor: '#A855F722', paddingHorizontal: spacing.md, paddingVertical: 11 },
    specialReady: { borderColor: '#E879F9', backgroundColor: '#A855F744' },
    specialDim: { opacity: 0.72 },
    energyRow: { flexDirection: 'row', gap: 3, alignItems: 'center' },
    energyPip: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#475569' },
    energyPipOn: { backgroundColor: '#E879F9', borderColor: '#F0ABFC' },
    cmdLabel: { color: '#fff', fontSize: 13.5, fontWeight: '900' },
    cmdSub: { color: '#94A3B8', fontSize: 10, fontWeight: '700' },
    dockFoot: { flexDirection: 'row', gap: spacing.sm },
    footBtn: { flex: 1, alignItems: 'center', borderRadius: radius.pill, borderWidth: 1, borderColor: '#334155', paddingVertical: 9, backgroundColor: '#16202F' },
    footBtnOn: { borderColor: '#7DD3FC', backgroundColor: '#0EA5E933' },
    footBtnText: { color: '#E2E8F0', fontSize: 12.5, fontWeight: '800' },
    btnOff: { opacity: 0.38 },

    // Băng ghế
    bench: { flexDirection: 'row', gap: spacing.sm },
    benchCell: { flex: 1, alignItems: 'center', gap: 2, backgroundColor: '#16202F', borderRadius: radius.md, borderWidth: 1, borderColor: '#334155', paddingVertical: spacing.sm, paddingHorizontal: 4 },
    benchName: { color: '#E2E8F0', fontSize: 10.5, fontWeight: '800', maxWidth: '94%' },
    benchMult: { fontSize: 11, fontWeight: '900' },
    benchHpBg: { width: '86%', height: 5, borderRadius: 3, backgroundColor: '#0A1120', overflow: 'hidden' },
    benchHpFill: { height: 5, borderRadius: 3 },
    benchEmpty: { color: '#94A3B8', fontSize: 11.5, fontWeight: '600' },

    btnRow: { flexDirection: 'row', gap: spacing.md },
    btn: { paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill, backgroundColor: '#1F2937', alignItems: 'center', justifyContent: 'center', minHeight: 52 },
    btnPrimary: { backgroundColor: '#F97316', flex: 1 },
    btnWide: { backgroundColor: '#F97316', alignSelf: 'stretch' },
    btnPrimaryText: { color: '#fff', fontWeight: '900', fontSize: 15 },
    btnText: { color: '#E5E7EB', fontWeight: '800', fontSize: 14 },

    // ===== Màn chọn =====
    selContent: { paddingHorizontal: spacing.lg, paddingTop: SAFE_TOP, paddingBottom: spacing.lg, gap: spacing.sm },
    selTitle: { color: '#fff', fontSize: 22, fontWeight: '900' },
    selBoss: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#131C2E', borderRadius: radius.lg, borderWidth: 1, borderColor: '#2A3550', padding: spacing.md },
    selBossHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    selBossName: { color: '#fff', fontSize: 17, fontWeight: '900', flexShrink: 1 },
    selHintDim: { color: '#94A3B8', fontSize: 11.5, marginTop: 2 },
    tierTag: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
    tierTagText: { color: '#fff', fontSize: 11.5, fontWeight: '900' },

    howto: { backgroundColor: '#0EA5E914', borderRadius: radius.md, borderWidth: 1, borderColor: '#0EA5E955', padding: spacing.md, gap: 3 },
    howtoTitle: { color: '#7DD3FC', fontSize: 12.5, fontWeight: '900', marginBottom: 2 },
    howtoLine: { color: '#CBD5E1', fontSize: 11.5, lineHeight: 17 },
    howtoKey: { color: '#fff', fontWeight: '900' },

    phaseRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#131C2E', borderRadius: radius.md, borderWidth: 1, borderColor: '#2A3550', padding: spacing.sm },
    phaseNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    phaseNumText: { color: '#fff', fontSize: 12, fontWeight: '900' },
    phaseBody: { flex: 1, marginLeft: spacing.md, gap: 3 },
    phaseHint: { color: '#94A3B8', fontSize: 10.5, fontWeight: '600' },
    enrageTag: { backgroundColor: '#EF444430', borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
    enrageTagText: { color: '#F87171', fontSize: 9.5, fontWeight: '900' },
    coverMark: { fontSize: 10, fontWeight: '900', marginLeft: 2 },
    chipRowLeft: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 },
    tChip: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 1 },
    tChipText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    tChipSm: { borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
    tChipTextSm: { color: '#fff', fontSize: 8.5, fontWeight: '800' },

    listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: spacing.sm },
    listTitle: { color: '#fff', fontSize: 14, fontWeight: '900' },
    listSort: { color: '#64748B', fontSize: 10, fontStyle: 'italic' },

    // Một HÀNG = một con. Full bề rộng nên tên dài không bị cắt.
    pickRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#131C2E', borderRadius: radius.md, borderWidth: 1, borderColor: '#2A3550', padding: spacing.sm, gap: spacing.sm },
    pickArt: { width: 54, height: 54, alignItems: 'center', justifyContent: 'center' },
    pickOrder: { position: 'absolute', top: -2, left: -2, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    pickOrderText: { color: '#fff', fontSize: 11.5, fontWeight: '900' },
    pickBody: { flex: 1, gap: 3 },
    pickTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
    pickName: { color: '#fff', fontSize: 13.5, fontWeight: '900', flexShrink: 1 },
    pickBst: { color: '#FBBF24', fontSize: 12, fontWeight: '900' },
    pickItem: { color: '#C084FC', fontSize: 10, fontWeight: '800' },
    multBox: { alignItems: 'center', backgroundColor: '#0F1728', borderRadius: radius.sm, paddingHorizontal: 5, paddingVertical: 1 },
    multBoxPhase: { color: '#64748B', fontSize: 7.5, fontWeight: '900' },
    multBoxVal: { fontSize: 10.5, fontWeight: '900' },
    pickTag: { fontSize: 10.5, fontWeight: '900' },
    moreBtn: { alignSelf: 'center', marginTop: spacing.sm, backgroundColor: '#16202F', borderRadius: radius.pill, borderWidth: 1, borderColor: '#334155', paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
    moreBtnText: { color: '#E2E8F0', fontSize: 12.5, fontWeight: '800' },
  });
