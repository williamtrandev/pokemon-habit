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

  useEffect(() => {
    if (!visible) return;
    setTitle(initial?.title ?? '');
    setRemindOn(!!initial?.reminder);
    setHour(initial?.reminder?.hour ?? 8);
    setMinute(initial?.reminder?.minute ?? 0);
    setPermDenied(false);
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
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.heading}>{initial ? 'Sửa mục tiêu' : 'Mục tiêu mới'}</Text>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Tên mục tiêu</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="VD: Uống 2 lít nước"
              placeholderTextColor={colors.textDim}
              style={styles.input}
              maxLength={60}
            />

            {!initial && (
              <View style={styles.tip}>
                <Text style={styles.tipEmoji}>🥚</Text>
                <Text style={styles.tipText}>
                  Một quả trứng của loài ngẫu nhiên (chưa trùng) sẽ nở ra. Hoàn thành mỗi ngày để nuôi nó tiến hoá!
                </Text>
              </View>
            )}

            <View style={styles.reminderHeader}>
              <Text style={styles.label}>Nhắc nhở hằng ngày</Text>
              <Switch value={remindOn} onValueChange={toggleRemind} trackColor={{ true: colors.primary, false: colors.border }} thumbColor="#fff" />
            </View>

            {remindOn && (
              <>
                <View style={styles.timeRow}>
                  <TimeStepper label="Giờ" value={hour} onDec={() => stepHour(-1)} onInc={() => stepHour(1)} />
                  <Text style={styles.colon}>:</Text>
                  <TimeStepper label="Phút" value={minute} onDec={() => stepMinute(-5)} onInc={() => stepMinute(5)} />
                </View>
                {permDenied && (
                  <Text style={styles.permWarn}>
                    ⚠️ Chưa có quyền thông báo. Vào Cài đặt hệ thống để bật, nếu không nhắc nhở sẽ không hiện.
                  </Text>
                )}
              </>
            )}
          </ScrollView>

          <View style={styles.actions}>
            {onDelete && (
              <Pressable onPress={onDelete} style={[styles.btn, styles.btnDanger]}>
                <Text style={styles.btnDangerText}>Xoá</Text>
              </Pressable>
            )}
            <Pressable onPress={onClose} style={[styles.btn, styles.btnGhost]}>
              <Text style={styles.btnGhostText}>Huỷ</Text>
            </Pressable>
            <Pressable onPress={save} disabled={!canSave} style={[styles.btn, styles.btnPrimary, !canSave && styles.btnDisabled]}>
              <Text style={styles.btnPrimaryText}>Lưu</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function TimeStepper({ label, value, onDec, onInc }: { label: string; value: number; onDec: () => void; onInc: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.stepperWrap}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepper}>
        <Pressable onPress={onDec} style={styles.stepBtn}><Text style={styles.stepBtnText}>−</Text></Pressable>
        <Text style={styles.stepValue}>{String(value).padStart(2, '0')}</Text>
        <Pressable onPress={onInc} style={styles.stepBtn}><Text style={styles.stepBtnText}>+</Text></Pressable>
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bgSoft, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.xl, maxHeight: '88%' },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
  heading: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: spacing.md },
  label: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: spacing.md, marginBottom: spacing.sm },
  input: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, color: colors.text, paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: 16 },
  tip: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginTop: spacing.md },
  tipEmoji: { fontSize: 24 },
  tipText: { color: colors.textDim, fontSize: 12.5, flex: 1, lineHeight: 17 },
  reminderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  colon: { color: colors.text, fontSize: 28, fontWeight: '800', marginHorizontal: spacing.md, marginTop: spacing.lg },
  permWarn: { color: colors.accent, fontSize: 12, lineHeight: 17, marginTop: spacing.md, textAlign: 'center', paddingHorizontal: spacing.sm },
  stepperWrap: { alignItems: 'center' },
  stepperLabel: { color: colors.textDim, fontSize: 12, marginBottom: spacing.xs },
  stepper: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  stepBtn: { width: 44, height: 48, alignItems: 'center', justifyContent: 'center' },
  stepBtnText: { color: colors.primarySoft, fontSize: 24, fontWeight: '800' },
  stepValue: { color: colors.text, fontSize: 22, fontWeight: '800', width: 44, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  btn: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.md, alignItems: 'center' },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  btnGhost: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  btnDanger: { backgroundColor: colors.red + '22', borderWidth: 1, borderColor: colors.red },
  btnDangerText: { color: colors.red, fontWeight: '800', fontSize: 15 },
  btnDisabled: { opacity: 0.4 },
});
