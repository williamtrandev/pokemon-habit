import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Habit, reminderLabel } from '../types';
import { habitStreak, isDoneNow, nextResetAt } from '../gameLogic';
import { todayStr } from '../date';
import { Colors, radius, spacing } from '../theme';
import { useTheme, useThemedStyles } from '../theme-context';

function fmtRemain(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} phút` : `${s}s`;
}

interface Props {
  habit: Habit;
  now: number; // đồng hồ tick từ HomeScreen: nút interval tự mở lại + countdown
  onToggle: () => void;
}

// Thẻ MỤC TIÊU thuần (không pet): tên + streak + nhắc + nút hoàn thành một chiều.
export default function GoalCard({ habit, now, onToggle }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const done = isDoneNow(habit, now);
  const resetAt = nextResetAt(habit, now);
  const streak = habitStreak(habit, todayStr());

  return (
    <View style={[styles.card, done && styles.cardDone]}>
      <View style={styles.mid}>
        <Text style={styles.title} numberOfLines={2}>{habit.title}</Text>
        <View style={styles.metaRow}>
          {streak > 0 && (
            <View style={styles.streakPill}>
              <Ionicons name="flame" size={12} color={colors.accent} />
              <Text style={styles.streakText}>{streak}</Text>
            </View>
          )}
          {habit.reminder && (
            <View style={styles.remindPill}>
              <Ionicons name="alarm-outline" size={11} color={colors.primarySoft} />
              <Text style={styles.remindText}>{reminderLabel(habit.reminder)}</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.checkCol}>
        <Pressable
          onPress={done ? undefined : onToggle}
          disabled={done}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityState={{ disabled: done, checked: done }}
          accessibilityLabel={done ? `Đã hoàn thành ${habit.title}` : `Hoàn thành ${habit.title}`}
          style={({ pressed }) => [styles.check, done && styles.checkDone, pressed && styles.checkPressed]}
        >
          <Ionicons name="checkmark-sharp" size={26} color={done ? '#fff' : colors.primarySoft} />
        </Pressable>
        {resetAt != null && <Text style={styles.countdown}>mở sau {fmtRemain(resetAt - now)}</Text>}
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: spacing.lg,
      marginBottom: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOpacity: 0.12,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    cardDone: { borderColor: colors.green + '99', backgroundColor: colors.green + '12' },
    mid: { flex: 1, marginRight: spacing.md },
    title: { color: colors.text, fontSize: 17, fontWeight: '800' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 8 },
    streakPill: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: colors.accent + '22', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
    streakText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
    remindPill: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.primary + '1A', borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
    remindText: { color: colors.primarySoft, fontSize: 11, fontWeight: '800' },
    checkCol: { alignItems: 'center', width: 56 },
    check: {
      width: 52,
      height: 52,
      borderRadius: 26,
      borderWidth: 2.5,
      borderColor: colors.primary,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: colors.primary,
      shadowOpacity: 0.3,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    },
    checkDone: { backgroundColor: colors.green, borderColor: colors.green, shadowColor: colors.green },
    checkPressed: { transform: [{ scale: 0.9 }], opacity: 0.85 },
    countdown: { color: colors.textDim, fontSize: 10, fontWeight: '700', marginTop: 4, textAlign: 'center' },
  });
