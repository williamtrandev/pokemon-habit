import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useApp } from '../AppContext';
import CreatureCard from '../components/CreatureCard';
import CreatureDetail from '../components/CreatureDetail';
import ProgressRing from '../components/ProgressRing';
import { Habit } from '../types';
import { Colors, radius, spacing, TAB_BAR_SPACE } from '../theme';
import { useThemedStyles } from '../theme-context';
import { todayStr } from '../date';
import { countDoneToday } from '../gameLogic';
import { feedbackTap } from '../feedback';

function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export default function HomeScreen({ onGoHabits }: { onGoHabits: () => void }) {
  const { data, toggleToday } = useApp();
  const styles = useThemedStyles(makeStyles);
  const [detailId, setDetailId] = useState<string | null>(null);
  const today = todayStr();
  const done = countDoneToday(data.habits, today);
  const total = data.habits.length;
  const allDone = total > 0 && done === total;

  const dateLabel = useMemo(
    () => new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }),
    []
  );
  const greeting = useMemo(greetingForNow, []);

  const detailHabit: Habit | null = data.habits.find((h) => h.id === detailId) ?? null;

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

      {total === 0 ? (
        <Pressable onPress={() => { feedbackTap(); onGoHabits(); }} style={styles.empty}>
          <Text style={styles.emptyEmoji}>🥚</Text>
          <Text style={styles.emptyTitle}>Chưa có Pokémon nào</Text>
          <Text style={styles.emptyText}>Thêm mục tiêu đầu tiên để nhận một quả trứng!</Text>
          <View style={styles.emptyBtn}>
            <Text style={styles.emptyBtnText}>+ Thêm mục tiêu</Text>
          </View>
        </Pressable>
      ) : (
        data.habits.map((h) => (
          <CreatureCard key={h.id} habit={h} onToggle={() => toggleToday(h.id)} onOpen={() => setDetailId(h.id)} />
        ))
      )}

      <CreatureDetail habit={detailHabit} visible={!!detailHabit} onClose={() => setDetailId(null)} />
    </ScrollView>
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
  empty: { alignItems: 'center', padding: spacing.xl, backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', marginTop: spacing.xl },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: spacing.sm },
  emptyText: { color: colors.textDim, fontSize: 13, textAlign: 'center', marginTop: spacing.xs },
  emptyBtn: { marginTop: spacing.lg, backgroundColor: colors.primary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.pill },
  emptyBtnText: { color: '#fff', fontWeight: '800' },
});
