import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, Alert } from 'react-native';
import { useApp } from '../AppContext';
import { Colors, radius, spacing, TAB_BAR_SPACE } from '../theme';
import { ThemeMode, useTheme, useThemedStyles } from '../theme-context';
import { lastNDays, weekdayLabel } from '../date';
import { countDoneOnDate } from '../gameLogic';
import { resolveForm, displayFormId, lineName, finalId, TOTAL_POKEMON } from '../species';
import CreatureImage from '../components/CreatureImage';
import NotificationCard from '../components/NotificationCard';
import TypeBadges from '../components/TypeBadges';

const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'Hệ thống' },
  { key: 'light', label: 'Sáng' },
  { key: 'dark', label: 'Tối' },
];

export default function HistoryScreen() {
  const { data, setSound, setHaptics, resetAll } = useApp();
  const { colors, mode, setMode } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const days = useMemo(() => lastNDays(14), []);
  const total = data.habits.length;

  // Bộ sưu tập = các Pokémon bạn đang nuôi (mỗi mục tiêu một con).
  const collected = useMemo(
    () =>
      data.habits.map((h) => {
        const c = h.creature;
        const form = resolveForm(c);
        return {
          title: h.title,
          name: form.stage === 0 ? 'Trứng' : form.name,
          formId: displayFormId(c),
          shiny: form.stage >= 3 && c.branch === 'legendary',
          color: c.color,
        };
      }),
    [data.habits]
  );
  const distinct = new Set(data.habits.map((h) => finalId(h.creature))).size;

  const confirmReset = () => {
    Alert.alert('Làm lại từ đầu?', 'Toàn bộ mục tiêu và sinh vật sẽ bị xoá. Không thể hoàn tác.', [
      { text: 'Huỷ', style: 'cancel' },
      { text: 'Xoá hết', style: 'destructive', onPress: () => resetAll() },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Bộ sưu tập</Text>

      {/* Đàn Pokémon của bạn */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Đàn của bạn</Text>
          <Text style={styles.cardCount}>{distinct}/{TOTAL_POKEMON}</Text>
        </View>
        {collected.length === 0 ? (
          <Text style={styles.dexHint}>Chưa có Pokémon nào. Thêm mục tiêu để nhận trứng ngẫu nhiên!</Text>
        ) : (
          <View style={styles.dex}>
            {collected.map((cr, i) => (
              <View key={i} style={[styles.dexCell, { borderColor: cr.color }]}>
                <CreatureImage formId={cr.formId} shiny={cr.shiny} size={54} />
                <Text style={styles.dexName} numberOfLines={1}>{cr.name}</Text>
                <Text style={styles.dexSub} numberOfLines={1}>{cr.title}</Text>
                {cr.formId != null && (
                  <View style={styles.dexTypes}>
                    <TypeBadges formId={cr.formId} size="sm" />
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
        <Text style={styles.dexHint}>Mỗi mục tiêu nở ra một Pokémon ngẫu nhiên trong hơn {TOTAL_POKEMON} loài.</Text>
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
        <Pressable style={styles.resetBtn} onPress={confirmReset}>
          <Text style={styles.resetBtnText}>Làm lại từ đầu</Text>
        </Pressable>
      </View>

      <Text style={styles.footer}>Chăm chỉ mỗi ngày để cả đàn tiến hoá 🐉</Text>
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
  dexCell: { width: '31%', alignItems: 'center', backgroundColor: colors.cardAlt, borderRadius: radius.md, borderWidth: 1, paddingVertical: spacing.sm },
  dexEgg: { fontSize: 28 },
  dexName: { color: colors.text, fontSize: 11, fontWeight: '700', marginTop: 2, maxWidth: '90%' },
  dexSub: { color: colors.textDim, fontSize: 9, marginTop: 1, maxWidth: '90%' },
  dexTypes: { flexDirection: 'row', justifyContent: 'center', marginTop: 4 },
  dexForms: { flexDirection: 'row', gap: 6, marginTop: 4 },
  dexForm: { fontSize: 18 },
  locked: { opacity: 0.3 },
  lockedText: { color: colors.textDim },
  dexHint: { color: colors.textDim, fontSize: 11.5, marginTop: spacing.md, lineHeight: 16 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
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
