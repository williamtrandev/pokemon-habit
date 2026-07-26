import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Habit, ReminderTime, formatDuration } from '../types';
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

const SCREEN_H = Dimensions.get('window').height;

export default function HabitEditor({ visible, initial, onClose, onSave, onDelete }: Props) {
  const { colors, scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [title, setTitle] = useState('');
  const [remindOn, setRemindOn] = useState(false);
  const [mode, setMode] = useState<'daily' | 'interval'>('daily');
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);
  const [everyMinutes, setEveryMinutes] = useState(60);
  const [permDenied, setPermDenied] = useState(false);
  const [focused, setFocused] = useState(false);

  // Trình bày dạng bottom sheet tự animate: nền mờ dần + tấm trượt lên bằng spring.
  const [rendered, setRendered] = useState(visible);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, damping: 20, stiffness: 180, mass: 0.7 }).start();
    } else if (rendered) {
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished) setRendered(false);
      });
    }
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    setTitle(initial?.title ?? '');
    const r = initial?.reminder;
    setRemindOn(!!r);
    setMode(r?.kind === 'interval' ? 'interval' : 'daily');
    setHour(r?.hour ?? 8);
    setMinute(r?.minute ?? 0);
    setEveryMinutes(r?.everyMinutes ?? 60);
    setPermDenied(false);
    setFocused(false);
  }, [visible, initial]);

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
    let reminder: ReminderTime | null = null;
    if (remindOn) {
      reminder =
        mode === 'interval'
          ? { kind: 'interval', hour: 0, minute: 0, everyMinutes }
          : { kind: 'daily', hour, minute };
    }
    onSave({ title: title.trim(), reminder });
  };

  const bumpMinutes = (delta: number) => setEveryMinutes((v) => Math.max(1, Math.min(1439, v + delta)));

  const INTERVALS: { m: number; label: string }[] = [
    { m: 15, label: '15 phút' },
    { m: 30, label: '30 phút' },
    { m: 60, label: '1 giờ' },
    { m: 120, label: '2 giờ' },
    { m: 180, label: '3 giờ' },
  ];

  // Giờ:phút <-> Date cho native picker (chọn tới từng phút).
  const timeValue = useMemo(() => {
    const d = new Date();
    d.setHours(hour, minute, 0, 0);
    return d;
  }, [hour, minute]);

  const onTimeChange = (_e: DateTimePickerEvent, date?: Date) => {
    if (date) {
      setHour(date.getHours());
      setMinute(date.getMinutes());
    }
  };

  const backdropOpacity = anim;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [SCREEN_H * 0.5, 0] });

  return (
    <Modal visible={rendered} animationType="none" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>

        <Animated.View style={[styles.sheet, { transform: [{ translateY }] }]}>
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
                  <Text style={styles.sectionTitle}>Nhắc nhở</Text>
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
                  <View style={styles.segment}>
                    {(['daily', 'interval'] as const).map((mk) => {
                      const on = mode === mk;
                      return (
                        <Pressable key={mk} onPress={() => setMode(mk)} style={[styles.segBtn, on && styles.segBtnOn]}>
                          <Text style={[styles.segText, on && styles.segTextOn]}>
                            {mk === 'daily' ? 'Hằng ngày' : 'Lặp lại'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {mode === 'daily' ? (
                    <View style={styles.pickerWrap}>
                      <DateTimePicker
                        value={timeValue}
                        mode="time"
                        display="spinner"
                        minuteInterval={1}
                        onChange={onTimeChange}
                        textColor={colors.text}
                        themeVariant={scheme === 'dark' ? 'dark' : 'light'}
                        style={styles.picker}
                      />
                    </View>
                  ) : (
                    <>
                      <Text style={styles.intervalHint}>Nhắc lại mỗi</Text>
                      <View style={styles.stepper}>
                        <Pressable onPress={() => bumpMinutes(-1)} onLongPress={() => bumpMinutes(-10)} hitSlop={8} style={styles.stepBtn}>
                          <Ionicons name="remove" size={24} color={colors.primarySoft} />
                        </Pressable>
                        <Text style={styles.stepValue}>{formatDuration(everyMinutes)}</Text>
                        <Pressable onPress={() => bumpMinutes(1)} onLongPress={() => bumpMinutes(10)} hitSlop={8} style={styles.stepBtn}>
                          <Ionicons name="add" size={24} color={colors.primarySoft} />
                        </Pressable>
                      </View>
                      <View style={styles.chips}>
                        {INTERVALS.map((it) => {
                          const on = everyMinutes === it.m;
                          return (
                            <Pressable
                              key={it.m}
                              onPress={() => setEveryMinutes(it.m)}
                              style={[styles.chip, on && styles.chipOn]}
                            >
                              <Text style={[styles.chipText, on && styles.chipTextOn]}>{it.label}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}

                  {permDenied && (
                    <Text style={styles.permWarn}>
                      ⚠️ Chưa có quyền thông báo. Vào Cài đặt hệ thống để bật, nếu không nhắc nhở sẽ không hiện.
                    </Text>
                  )}
                </>
              )}
            </View>

            <Pressable onPress={save} disabled={!canSave} style={styles.saveWrap}>
              <LinearGradient
                colors={canSave ? ['#8B5CF6', '#7C3AED'] : [colors.border, colors.border]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.saveBtn}
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
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    fill: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
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
    headerIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
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
    segment: {
      flexDirection: 'row',
      backgroundColor: colors.bgSoft,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 3,
      marginTop: spacing.md,
    },
    segBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.md - 3, alignItems: 'center' },
    segBtnOn: { backgroundColor: colors.primary },
    segText: { color: colors.textDim, fontWeight: '700', fontSize: 13.5 },
    segTextOn: { color: '#fff' },
    intervalHint: { color: colors.textDim, fontSize: 13, marginTop: spacing.md, marginBottom: spacing.sm },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.bgSoft,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.sm,
      marginBottom: spacing.md,
    },
    stepBtn: {
      width: 44,
      height: 44,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary + '1F',
    },
    stepValue: { color: colors.text, fontSize: 18, fontWeight: '800' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.bgSoft,
    },
    chipOn: { backgroundColor: colors.primary + '22', borderColor: colors.primary },
    chipText: { color: colors.textDim, fontWeight: '700', fontSize: 13 },
    chipTextOn: { color: colors.primarySoft },
    pickerWrap: { alignItems: 'center', marginTop: spacing.xs },
    picker: { alignSelf: 'center', height: 160, width: 220 },
    permWarn: { color: colors.accent, fontSize: 12, lineHeight: 17, marginTop: spacing.sm, textAlign: 'center', paddingHorizontal: spacing.sm },
    saveWrap: { marginTop: spacing.xl },
    saveBtn: { paddingVertical: spacing.md + 2, borderRadius: radius.md, alignItems: 'center' },
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
