import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Habit, healthState, reminderLabel } from '../types';
import { resolveForm, evoProgress, displayFormId } from '../species';
import { habitStreak, isDoneOn } from '../gameLogic';
import { todayStr } from '../date';
import { Colors, radius, spacing } from '../theme';
import { useTheme, useThemedStyles } from '../theme-context';
import CreatureView from './CreatureView';
import ProgressBar from './ProgressBar';
import TypeBadges from './TypeBadges';

interface Props {
  habit: Habit;
  onToggle: () => void;
  onOpen: () => void;
}

export default function CreatureCard({ habit, onToggle, onOpen }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const today = todayStr();
  const done = isDoneOn(habit, today);
  const c = habit.creature;
  const form = resolveForm(c);
  const hs = healthState(c.vitality, c.fainted);
  const evo = evoProgress(c.xp);
  const streak = habitStreak(habit, today);
  // Trứng chưa nở dùng khung trung tính để không lộ màu loài; đã nở thì lấy màu Pokémon.
  const tileColor = form.stage === 0 ? colors.primary : c.color;

  return (
    <Pressable
      onPress={onOpen}
      accessible={false} // let the completion toggle be its own a11y node, not merged into the card
      style={({ pressed }) => [styles.card, done && styles.cardDone, pressed && styles.pressed]}
    >
      <View style={[styles.tile, { backgroundColor: tileColor + '1F', borderColor: tileColor + '3D' }]}>
        <CreatureView creature={c} size={60} glowColor={form.stage === 0 ? undefined : c.color} minGlowSize={56} />
      </View>

      <View style={styles.mid}>
        <Text style={styles.title} numberOfLines={1}>{habit.title}</Text>
        <View style={styles.formRow}>
          <Text style={styles.form} numberOfLines={1}>
            {form.stage === 0 ? 'Trứng bí ẩn' : form.isMega ? form.name.replace(/^Mega\s+/, '') : form.name}
          </Text>
          {form.isMega && (
            <View style={styles.megaPill}>
              <Text style={styles.megaText}>MEGA</Text>
            </View>
          )}
          {streak > 0 && (
            <View style={styles.streakPill}>
              <Ionicons name="flame" size={11} color={colors.accent} />
              <Text style={styles.streakText}>{streak}</Text>
            </View>
          )}
        </View>
        {(form.stage > 0 || habit.reminder) && (
          <View style={styles.metaRow}>
            {form.stage > 0 ? <TypeBadges formId={displayFormId(c)} size="sm" /> : <View />}
            {habit.reminder && (
              <View style={styles.remindPill}>
                <Ionicons name="alarm-outline" size={11} color={colors.primarySoft} />
                <Text style={styles.remindText}>{reminderLabel(habit.reminder)}</Text>
              </View>
            )}
          </View>
        )}

        <View style={styles.barRow}>
          <Ionicons name="heart" size={13} color={hs.color} style={styles.barIcon} />
          <ProgressBar ratio={c.vitality / 100} color={hs.color} height={7} />
        </View>
        <View style={styles.barRow}>
          <Ionicons name="sparkles" size={13} color={colors.primary} style={styles.barIcon} />
          <ProgressBar ratio={evo.ratio} color={colors.primary} height={7} />
        </View>
      </View>

      <Pressable
        onPress={onToggle}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`${done ? 'Bỏ hoàn thành' : 'Hoàn thành'} ${habit.title}`}
        style={({ pressed }) => [styles.check, done && styles.checkDone, pressed && styles.checkPressed]}
      >
        <Ionicons name="checkmark-sharp" size={24} color={done ? '#fff' : colors.primarySoft} />
      </Pressable>
    </Pressable>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: spacing.md,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOpacity: 0.14,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    cardDone: { borderColor: colors.green + '99', backgroundColor: colors.green + '12' },
    pressed: { opacity: 0.75 },
    tile: {
      width: 72,
      height: 72,
      borderRadius: radius.md,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    mid: { flex: 1, marginLeft: spacing.md, marginRight: spacing.md },
    title: { color: colors.text, fontSize: 16, fontWeight: '800' },
    formRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 2, marginBottom: 5 },
    metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginBottom: 6 },
    form: { color: colors.textDim, fontSize: 12, flexShrink: 1 },
    streakPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: colors.accent + '22',
      borderRadius: radius.pill,
      paddingHorizontal: 6,
      paddingVertical: 1,
    },
    streakText: { color: colors.accent, fontSize: 11, fontWeight: '800' },
    remindPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
      backgroundColor: colors.primary + '1A',
      borderRadius: radius.pill,
      paddingHorizontal: 7,
      paddingVertical: 1,
    },
    remindText: { color: colors.primarySoft, fontSize: 10.5, fontWeight: '800' },
    megaPill: { backgroundColor: colors.accent, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 1 },
    megaText: { color: '#fff', fontSize: 9.5, fontWeight: '900', letterSpacing: 0.5 },
    // Chừa lề phải cho các thanh ngắn lại -> nút hoàn thành có làn riêng, không bị che.
    barRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginRight: spacing.sm },
    barIcon: { width: 16, textAlign: 'center' },
    check: {
      width: 48,
      height: 48,
      borderRadius: 24,
      borderWidth: 2.5,
      borderColor: colors.primary,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOpacity: 0.35,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 5,
    },
    checkDone: { backgroundColor: colors.green, borderColor: colors.green, shadowColor: colors.green },
    checkPressed: { transform: [{ scale: 0.88 }], opacity: 0.85 },
  });
