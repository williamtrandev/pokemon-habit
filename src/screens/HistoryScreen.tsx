import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Alert } from 'react-native';
import { useApp } from '../AppContext';
import { Colors, radius, spacing, TAB_BAR_SPACE } from '../theme';
import { ThemeMode, useTheme, useThemedStyles } from '../theme-context';
import { lastNDays, weekdayLabel } from '../date';
import { countDoneOnDate } from '../gameLogic';
import { TOTAL_POKEMON } from '../species';
import CreatureImage from '../components/CreatureImage';
import NotificationCard from '../components/NotificationCard';
import SyncCard from '../components/SyncCard';
import AccountCard from '../components/AccountCard';
import FullDexModal from '../components/FullDexModal';

const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'Hệ thống' },
  { key: 'light', label: 'Sáng' },
  { key: 'dark', label: 'Tối' },
];

export default function HistoryScreen() {
  const { data, setSound, setHaptics, setMusic, resetAll } = useApp();
  const { colors, mode, setMode } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const days = useMemo(() => lastNDays(14), []);
  const total = data.habits.length;

  // Bộ sưu tập = các loài ĐÃ THU (nở từ kiên trì). Mỗi ô = 1 Pokémon đã get.
  const caught = useMemo(() => {
    const entries = Object.entries(data.collection ?? {}).map(([id, v]) => ({ id: Number(id), shiny: !!v.shiny, at: v.at }));
    entries.sort((a, b) => b.at - a.at); // mới get lên trước
    return entries;
  }, [data.collection]);
  const caughtIds = useMemo(() => new Set(caught.map((e) => e.id)), [caught]);
  const [showFullDex, setShowFullDex] = useState(false);

  const confirmReset = () => {
    Alert.alert('Làm lại từ đầu?', 'Toàn bộ mục tiêu và Pokémon sẽ bị xoá. Không thể hoàn tác.', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xoá hết', style: 'destructive', onPress: () => resetAll() },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Pokédex</Text>

      {/* Đàn Pokémon của bạn */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Pokédex của bạn</Text>
          <Text style={styles.cardCount}>{caught.length}/{TOTAL_POKEMON}</Text>
        </View>
        {caught.length === 0 ? (
          <Text style={styles.dexHint}>Chưa thu được Pokémon nào. Hoàn thành mục tiêu để nở trứng!</Text>
        ) : (
          <View style={styles.dex}>
            {caught.slice(0, 12).map((e) => (
              <View key={e.id} style={[styles.dexCell, styles.dexCellOpen]}>
                <CreatureImage formId={e.id} shiny={e.shiny} size={54} />
                <Text style={styles.dexSub} numberOfLines={1}>{e.shiny ? '✨ Shiny' : `#${String(e.id).padStart(4, '0')}`}</Text>
              </View>
            ))}
          </View>
        )}
        <Text style={styles.dexHint}>Nở từ sự kiên trì — chăm chỉ mỗi ngày để thu thêm.</Text>
        <Pressable style={styles.fullDexBtn} onPress={() => setShowFullDex(true)}>
          <Text style={styles.fullDexBtnText}>Xem toàn bộ {TOTAL_POKEMON} loài →</Text>
        </Pressable>
      </View>

      {/* Lịch 14 ngày */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>14 ngày gần đây</Text>
        <Text style={styles.cardHint}>Đậm hơn = hoàn thành nhiều hơn</Text>
        <View style={styles.grid}>
          {days.map((day) => {
            const dn = countDoneOnDate(data.habits, day);
            const ratio = total > 0 ? dn / total : 0;
            const bg = dn === 0 ? colors.track : `rgba(139, 92, 246, ${0.35 + ratio * 0.65})`;
            return (
              <View key={day} style={styles.dayCol}>
                <View style={[styles.dayCell, { backgroundColor: bg }]}>
                  <Text style={styles.dayNum}>{day.slice(8)}</Text>
                </View>
                <Text style={styles.dayWd}>{weekdayLabel(day)}</Text>
              </View>
            );
          })}
        </View>
      </View>

      {/* Thông báo */}
      <NotificationCard reminderCount={data.habits.filter((h) => h.reminder).length} />

      <AccountCard />

      <SyncCard />

      {/* Cài đặt */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Cài đặt</Text>
        <View style={styles.themeRow}>
          <Text style={styles.settingLabel}>🎨 Giao diện</Text>
          <View style={styles.segment}>
            {THEME_OPTIONS.map((opt) => {
              const active = mode === opt.key;
              return (
                <Pressable
                  key={opt.key}
                  onPress={() => setMode(opt.key)}
                  style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                >
                  <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>🔊 Âm thanh</Text>
          <Switch value={data.soundOn} onValueChange={setSound} trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#fff" />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>📳 Rung (haptics)</Text>
          <Switch value={data.hapticsOn} onValueChange={setHaptics} trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#fff" />
        </View>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>🎵 Nhạc nền</Text>
          <Switch value={data.musicOn} onValueChange={setMusic} trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#fff" />
        </View>
        <Pressable style={styles.resetBtn} onPress={confirmReset}>
          <Text style={styles.resetBtnText}>Làm lại từ đầu</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>Chăm chỉ mỗi ngày để thu thập cả Pokédex 🐉</Text>

      <FullDexModal
        visible={showFullDex}
        onClose={() => setShowFullDex(false)}
        caught={caughtIds}
      />
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  content: { padding: spacing.lg, paddingTop: spacing.xl, paddingBottom: TAB_BAR_SPACE },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', marginBottom: spacing.lg },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.lg },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '800' },
  cardCount: { color: colors.primarySoft, fontSize: 15, fontWeight: '800' },
  cardHint: { color: colors.textDim, fontSize: 12, marginTop: 2, marginBottom: spacing.md },
  dex: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  dexCell: { width: '31%', alignItems: 'center', backgroundColor: colors.cardAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm },
  // Mở khoá = sáng (viền + glow tím); chưa mở = mờ (preview tối).
  dexCellOpen: { borderColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 4 },
  dexCellLocked: { opacity: 0.55 },
  dexImgLocked: { opacity: 0.25 },
  dexSubOpen: { color: colors.green, fontWeight: '800' },
  eggEmoji: { fontSize: 44, height: 54, textAlignVertical: 'center' },
  dexEgg: { fontSize: 28 },
  dexName: { color: colors.text, fontSize: 11, fontWeight: '700', marginTop: 2, maxWidth: '90%' },
  dexSub: { color: colors.textDim, fontSize: 9, marginTop: 1, maxWidth: '90%' },
  dexTypes: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
  dexForms: { flexDirection: 'row', gap: 6, marginTop: 4 },
  dexForm: { fontSize: 18 },
  locked: { opacity: 0.3 },
  lockedText: { color: colors.textDim },
  dexHint: { color: colors.textDim, fontSize: 11.5, marginTop: spacing.md, lineHeight: 16 },
  fullDexBtn: { marginTop: spacing.md, backgroundColor: colors.primary + '1A', borderWidth: 1, borderColor: colors.primary, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  fullDexBtnText: { color: colors.primarySoft, fontWeight: '800', fontSize: 14 },
  // 7 cột/hàng (đúng 1 tuần) -> 14 ngày = 2 hàng đều. KHÔNG dùng `gap`: cộng vào
  // width 100/7% sẽ vượt 100% và wrap còn 6 cột/hàng (lệch). Giãn cột bằng căn giữa,
  // giãn hàng bằng marginBottom.
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
  dayCol: { alignItems: 'center', width: `${100 / 7}%`, marginBottom: spacing.sm },
  dayCell: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  dayNum: { color: colors.text, fontSize: 12, fontWeight: '700' },
  dayWd: { color: colors.textDim, fontSize: 10, marginTop: 2 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  themeRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.sm },
  settingLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  segment: { flexDirection: 'row', backgroundColor: colors.cardAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 2 },
  segmentBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.sm },
  segmentBtnActive: { backgroundColor: colors.primary },
  segmentText: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  segmentTextActive: { color: '#fff' },
  resetBtn: { marginTop: spacing.lg, borderWidth: 1, borderColor: colors.red, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
  resetBtnText: { color: colors.red, fontWeight: '800' },
  footer: { color: colors.textDim, fontSize: 12, textAlign: 'center', marginTop: spacing.sm },
});
