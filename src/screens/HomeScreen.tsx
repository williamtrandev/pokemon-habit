import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Animated, Easing } from 'react-native';
import { useApp } from '../AppContext';
import GoalCard from '../components/GoalCard';
import ProgressRing from '../components/ProgressRing';
import { Colors, radius, spacing, TAB_BAR_SPACE } from '../theme';
import { useThemedStyles } from '../theme-context';
import { intervalMs, isDoneNow } from '../gameLogic';
import { HATCH_THRESHOLD, HATCH_DAILY_CAP } from '../collection';
import { todayStr } from '../date';
import { useTheme } from '../theme-context';
import ProgressBar from '../components/ProgressBar';
import { feedbackTap } from '../feedback';

function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export default function HomeScreen({ onGoHabits }: { onGoHabits: () => void }) {
  const { data, toggleToday, hatchEgg } = useApp();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const pendingEggs = data.pendingEggs?.length ?? 0;

  // Đồng hồ tick 1s — CHỈ khi có habit interval — để nút tự mở lại + countdown chạy.
  const hasInterval = useMemo(() => data.habits.some((h) => intervalMs(h) != null), [data.habits]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hasInterval) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasInterval]);

  const done = data.habits.reduce((n, h) => n + (isDoneNow(h, now) ? 1 : 0), 0);
  const total = data.habits.length;
  const allDone = total > 0 && done === total;

  // Đã đạt trần điểm nở HÔM NAY (làm thêm không tăng) -> báo cho khỏi tưởng kẹt.
  const today = todayStr();
  const hatchDoneToday =
    data.hatchDay === today && (data.hatchDayAdded ?? 0) >= HATCH_DAILY_CAP && data.perfectDay === today;

  const dateLabel = useMemo(
    () => new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }),
    []
  );
  const greeting = useMemo(greetingForNow, []);

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.greeting}>{greeting} 👋</Text>
          <Text style={styles.headerTitle}>Pokémon của tôi</Text>
          <Text style={styles.date} numberOfLines={1}>{dateLabel}</Text>
        </View>
        {total > 0 && <ProgressRing done={done} total={total} />}
      </View>

      {allDone && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>🎉 Tuyệt vời! Cả đàn hôm nay đều được chăm sóc!</Text>
        </View>
      )}

      {pendingEggs > 0 && <EggReady count={pendingEggs} onHatch={hatchEgg} />}

      {total > 0 && (
        <View style={[styles.hatchCard, hatchDoneToday && styles.hatchCardDone]}>
          <View style={styles.hatchHead}>
            <Text style={styles.hatchLabel}>🥚 Trứng sắp nở</Text>
            <Text style={[styles.hatchVal, hatchDoneToday && { color: colors.green }]}>
              {hatchDoneToday ? '✓ Đủ hôm nay' : `${Math.min(data.hatchMeter ?? 0, HATCH_THRESHOLD)}/${HATCH_THRESHOLD}`}
            </Text>
          </View>
          <ProgressBar
            ratio={Math.min(1, (data.hatchMeter ?? 0) / HATCH_THRESHOLD)}
            color={hatchDoneToday ? colors.green : colors.accent}
          />
          <Text style={styles.hatchHint}>
            {hatchDoneToday
              ? '✨ Đã chăm đủ hôm nay — mai quay lại để nở tiếp!'
              : 'Chăm chỉ mỗi ngày để nở Pokémon mới vào Pokédex'}
          </Text>
        </View>
      )}

      {total === 0 ? (
        <Pressable onPress={() => { feedbackTap(); onGoHabits(); }} style={styles.empty}>
          <Text style={styles.emptyEmoji}>🎯</Text>
          <Text style={styles.emptyTitle}>Chưa có mục tiêu nào</Text>
          <Text style={styles.emptyText}>Thêm mục tiêu đầu tiên — hoàn thành để nở Pokémon!</Text>
          <View style={styles.emptyBtn}>
            <Text style={styles.emptyBtnText}>+ Thêm mục tiêu</Text>
          </View>
        </Pressable>
      ) : (
        data.habits.map((h) => (
          <GoalCard key={h.id} habit={h} now={now} onToggle={() => toggleToday(h.id)} />
        ))
      )}
    </ScrollView>
  );
}

// Trứng chờ nở: lắc lư liên tục, chạm 3 lần để đập vỏ -> nở.
function EggReady({ count, onHatch }: { count: number; onHatch: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const [taps, setTaps] = useState(0);
  const wob = useRef(new Animated.Value(0)).current;
  const shake = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(wob, { toValue: 1, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(wob, { toValue: -1, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(wob, { toValue: 0, duration: 380, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.delay(700),
    ]));
    loop.start();
    return () => loop.stop();
  }, []);
  const tap = () => {
    feedbackTap();
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 55, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 55, useNativeDriver: true }),
    ]).start();
    const n = taps + 1;
    if (n >= 3) { setTaps(0); onHatch(); } else setTaps(n);
  };
  const rotate = wob.interpolate({ inputRange: [-1, 1], outputRange: ['-9deg', '9deg'] });
  const tx = shake.interpolate({ inputRange: [-1, 1], outputRange: [-7, 7] });
  return (
    <Pressable onPress={tap} style={styles.eggCard}>
      <Animated.Text style={[styles.eggBig, { transform: [{ translateX: tx }, { rotate }] }]}>🥚</Animated.Text>
      <View style={styles.eggMid}>
        <Text style={styles.eggTitle}>Trứng sẵn sàng nở!{count > 1 ? `  ×${count}` : ''}</Text>
        <Text style={styles.eggHint}>Chạm để đập vỏ  ·  {taps}/3</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  content: { paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: TAB_BAR_SPACE },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  headerText: { flex: 1, marginRight: spacing.md },
  greeting: { color: colors.textDim, fontSize: 13, fontWeight: '600' },
  headerTitle: { color: colors.text, fontSize: 26, fontWeight: '800', marginTop: 2 },
  date: { color: colors.textDim, fontSize: 13, marginTop: 2, textTransform: 'capitalize' },
  banner: { backgroundColor: colors.green + '22', borderColor: colors.green, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  bannerText: { color: colors.green, fontWeight: '700', textAlign: 'center' },
  hatchCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  hatchCardDone: { borderColor: colors.green + '99', backgroundColor: colors.green + '10' },
  eggCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.accent + '18', borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.accent, padding: spacing.md, marginBottom: spacing.md },
  eggBig: { fontSize: 46 },
  eggMid: { flex: 1, marginLeft: spacing.md },
  eggTitle: { color: colors.text, fontSize: 15, fontWeight: '800' },
  eggHint: { color: colors.accent, fontSize: 12.5, fontWeight: '700', marginTop: 3 },
  hatchHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs },
  hatchLabel: { color: colors.text, fontSize: 14, fontWeight: '800' },
  hatchVal: { color: colors.accent, fontSize: 13, fontWeight: '800' },
  hatchHint: { color: colors.textDim, fontSize: 11.5, marginTop: spacing.xs },
  empty: { alignItems: 'center', padding: spacing.xl, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', marginTop: spacing.xl },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: spacing.sm },
  emptyText: { color: colors.textDim, fontSize: 13, textAlign: 'center', marginTop: spacing.xs },
  emptyBtn: { marginTop: spacing.lg, backgroundColor: colors.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill },
  emptyBtnText: { color: '#fff', fontWeight: '800' },
});
