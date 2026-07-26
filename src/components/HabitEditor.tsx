import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Habit, ReminderTime } from '../types';
import { Colors, radius, spacing } from '../theme';
import { useTheme, useThemedStyles } from '../theme-context';
import { ensurePermission } from '../notifications';

interface Props {
  visible: boolean;
  initial?: Habit | null;
  onClose: () => void;
  onSave: (input: { title: string; reminder: ReminderTime | null }) => void;
  onDelete?: () => void;
}

export default function HabitEditor({ visible, initial, onClose, onSave, onDelete }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [title, setTitle] = useState('');
  const [remindOn, setRemindOn] = useState(false);
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);
  const [permDenied, setPermDenied] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setTitle(initial?.title ?? '');
    setRemindOn(!!initial?.reminder);
    setHour(initial?.reminder?.hour ?? 8);
    setMinute(initial?.reminder?.minute ?? 0);
    setPermDenied(false);
    setFocused(false);
  }, [visible, initial]);

  // Bật nhắc nhở → xin quyền ngay để người dùng biết trước khi lưu.
  const toggleRemind = async (on: boolean) => {
    setRemindOn(on);
    if (on) {
      const ok = await ensurePermission();
      setPermDenied(!ok && Platform.OS !== 'web');
    } else {
      setPermDenied(false);
    }
  };

  const canSave = title.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    onSave({ title: title.trim(), reminder: remindOn ? { hour, minute } : null });
  };

  const stepMinute = (delta: number) => {
    let total = hour * 60 + minute + delta;
    total = ((total % 1440) + 1440) % 1440;
    setHour(Math.floor(total / 60));
    setMinute(total % 60);
  };
  const stepHour = (delta: number) => setHour((h) => ((h + delta) % 24 + 24) % 24);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.headerRow}>
            <View style={styles.headerIcon}>
              <Ionicons name={initial ? 'create' : 'add'} size={20} color="#fff" />
            </View>
            <Text style={styles.heading}>{initial ? 'Sửa mục tiêu' : 'Mục tiêu mới'}</Text>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>TÊN MỤC TIÊU</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder="VD: Uống 2 lít nước"
              placeholderTextColor={colors.textDim}
              style={[styles.input, focused && styles.inputFocused]}
              maxLength={60}
              returnKeyType="done"
            />

            {!initial && (
              <View style={styles.tip}>
                <Text style={styles.tipEmoji}>🥚</Text>
                <Text style={styles.tipText}>
                  Một quả trứng của Pokémon ngẫu nhiên (chưa trùng) sẽ nở ra. Hoàn thành mỗi ngày để nuôi nó tiến hoá!
                </Text>
              </View>
            )}

            <View style={styles.section}>
              <View style={styles.reminderHeader}>
                <View style={styles.reminderTitleRow}>
                  <Ionicons name="notifications" size={18} color={colors.primarySoft} />
                  <Text style={styles.sectionTitle}>Nhắc nhở hằng ngày</Text>
                </View>
                <Switch
                  value={remindOn}
                  onValueChange={toggleRemind}
                  trackColor={{ true: colors.primary, false: colors.border }}
                  thumbColor="#fff"
                />
              </View>

              {remindOn && (
                <>
                  <View style={styles.timeRow}>
                    <TimeTile label="Giờ" value={hour} onInc={() => stepHour(1)} onDec={() => stepHour(-1)} />
                    <Text style={styles.colon}>:</Text>
                    <TimeTile label="Phút" value={minute} onInc={() => stepMinute(5)} onDec={() => stepMinute(-5)} />
                  </View>
                  {permDenied && (
                    <Text style={styles.permWarn}>
                      ⚠️ Chưa có quyền thông báo. Vào Cài đặt hệ thống để bật, nếu không nhắc nhở sẽ không hiện.
                    </Text>
                  )}
                </>
              )}
            </View>

            {/* Nút chính */}
            <Pressable onPress={save} disabled={!canSave} style={styles.saveWrap}>
              <LinearGradient
                colors={canSave ? ['#8B5CF6', '#7C3AED'] : [colors.border, colors.border]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.saveBtn, !canSave && styles.saveDisabled]}
              >
                <Text style={styles.saveText}>{initial ? 'Lưu thay đổi' : 'Tạo mục tiêu'}</Text>
              </LinearGradient>
            </Pressable>

            <Pressable onPress={onClose} style={styles.cancelBtn}>
              <Text style={styles.cancelText}>Huỷ</Text>
            </Pressable>

            {onDelete && (
              <Pressable onPress={onDelete} style={styles.deleteBtn}>
                <Ionicons name="trash-outline" size={16} color={colors.red} />
                <Text style={styles.deleteText}>Xoá mục tiêu này</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TimeTile({ label, value, onInc, onDec }: { label: string; value: number; onInc: () => void; onDec: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.tileWrap}>
      <Text style={styles.tileLabel}>{label}</Text>
      <View style={styles.tile}>
        <Pressable onPress={onInc} hitSlop={8} style={styles.tileBtn}>
          <Ionicons name="chevron-up" size={22} color={colors.primarySoft} />
        </Pressable>
        <Text style={styles.tileValue}>{String(value).padStart(2, '0')}</Text>
        <Pressable onPress={onDec} hitSlop={8} style={styles.tileBtn}>
          <Ionicons name="chevron-down" size={22} color={colors.primarySoft} />
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.bgSoft,
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      padding: spacing.lg,
      paddingBottom: spacing.xl,
      maxHeight: '90%',
    },
    handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: spacing.lg },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.lg },
    headerIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heading: { color: colors.text, fontSize: 20, fontWeight: '800' },
    label: { color: colors.textDim, fontSize: 12, fontWeight: '800', letterSpacing: 0.6, marginBottom: spacing.sm },
    input: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.border,
      color: colors.text,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      fontSize: 16,
      fontWeight: '600',
    },
    inputFocused: { borderColor: colors.primary },
    tip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.primary + '14',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.primary + '33',
      padding: spacing.md,
      marginTop: spacing.md,
    },
    tipEmoji: { fontSize: 26 },
    tipText: { color: colors.textDim, fontSize: 12.5, flex: 1, lineHeight: 17 },
    section: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.md,
      marginTop: spacing.lg,
    },
    reminderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    reminderTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    sectionTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
    timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.md },
    colon: { color: colors.text, fontSize: 30, fontWeight: '800', marginHorizontal: spacing.md, marginTop: spacing.lg },
    permWarn: { color: colors.accent, fontSize: 12, lineHeight: 17, marginTop: spacing.md, textAlign: 'center', paddingHorizontal: spacing.sm },
    tileWrap: { alignItems: 'center' },
    tileLabel: { color: colors.textDim, fontSize: 12, fontWeight: '700', marginBottom: spacing.xs },
    tile: {
      alignItems: 'center',
      backgroundColor: colors.bgSoft,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.lg,
    },
    tileBtn: { paddingVertical: 2 },
    tileValue: { color: colors.text, fontSize: 30, fontWeight: '900', width: 56, textAlign: 'center' },
    saveWrap: { marginTop: spacing.xl },
    saveBtn: { paddingVertical: spacing.md + 2, borderRadius: radius.md, alignItems: 'center' },
    saveDisabled: { opacity: 1 },
    saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    cancelBtn: { paddingVertical: spacing.md, alignItems: 'center', marginTop: spacing.sm },
    cancelText: { color: colors.textDim, fontWeight: '700', fontSize: 15 },
    deleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.md,
      marginTop: spacing.sm,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    deleteText: { color: colors.red, fontWeight: '700', fontSize: 14 },
  });
