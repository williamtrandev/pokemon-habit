import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform, Linking, AppState } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, radius, spacing } from '../theme';
import { useTheme, useThemedStyles } from '../theme-context';
import { getStatus, ensurePermission, sendTestNotification, NotifStatus } from '../notifications';

interface Props {
  reminderCount: number; // số mục tiêu có đặt nhắc nhở
}

// Thẻ quản lý quyền thông báo: trạng thái, bật quyền, gửi thử.
export default function NotificationCard({ reminderCount }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [status, setStatus] = useState<NotifStatus>('undetermined');
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const refresh = () => getStatus().then(setStatus);

  useEffect(() => {
    refresh();
    // Người dùng có thể đổi quyền ở Cài đặt hệ thống rồi quay lại → cập nhật.
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refresh();
    });
    return () => sub.remove();
  }, []);

  const onEnable = async () => {
    if (status === 'denied') {
      Linking.openSettings();
      return;
    }
    const ok = await ensurePermission();
    setStatus(ok ? 'granted' : 'denied');
  };

  const onTest = async () => {
    const ok = await sendTestNotification();
    setTestMsg(ok ? 'Đã gửi! Thông báo hiện sau 3 giây.' : 'Cần bật quyền thông báo trước.');
    setTimeout(() => setTestMsg(null), 3500);
  };

  const meta: Record<NotifStatus, { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
    granted: { label: 'Đã bật', color: colors.green, icon: 'notifications' },
    denied: { label: 'Đang tắt', color: colors.red, icon: 'notifications-off' },
    undetermined: { label: 'Chưa bật', color: colors.accent, icon: 'notifications-outline' },
    unsupported: { label: 'Không hỗ trợ trên web', color: colors.textDim, icon: 'globe-outline' },
  };
  const m = meta[status];
  const web = Platform.OS === 'web';

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headLeft}>
          <View style={[styles.iconWrap, { backgroundColor: m.color + '22', borderColor: m.color + '55' }]}>
            <Ionicons name={m.icon} size={18} color={m.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Thông báo</Text>
            <Text style={styles.sub}>
              {reminderCount > 0 ? `${reminderCount} mục tiêu có nhắc nhở` : 'Chưa mục tiêu nào đặt nhắc'}
            </Text>
          </View>
        </View>
        <View style={[styles.pill, { backgroundColor: m.color + '22', borderColor: m.color }]}>
          <Text style={[styles.pillText, { color: m.color }]}>{m.label}</Text>
        </View>
      </View>

      {!web && (
        <View style={styles.actions}>
          {status !== 'granted' && (
            <Pressable onPress={onEnable} style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && styles.pressed]}>
              <Ionicons name="notifications" size={15} color="#fff" />
              <Text style={styles.btnPrimaryText}>{status === 'denied' ? 'Mở Cài đặt' : 'Bật thông báo'}</Text>
            </Pressable>
          )}
          {status === 'granted' && (
            <Pressable onPress={onTest} style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.pressed]}>
              <Ionicons name="paper-plane-outline" size={15} color={colors.primarySoft} />
              <Text style={styles.btnGhostText}>Gửi thử</Text>
            </Pressable>
          )}
        </View>
      )}

      {testMsg && <Text style={styles.testMsg}>{testMsg}</Text>}
      {web && <Text style={styles.hint}>Cài đặt nhắc nhở khả dụng trên bản app điện thoại (iOS/Android).</Text>}
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, marginBottom: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  iconWrap: { width: 38, height: 38, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  sub: { color: colors.textDim, fontSize: 12, marginTop: 1 },
  pill: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 11.5, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.md, flex: 1 },
  pressed: { opacity: 0.8 },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnGhost: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  btnGhostText: { color: colors.primarySoft, fontWeight: '800', fontSize: 14 },
  testMsg: { color: colors.green, fontSize: 12.5, fontWeight: '700', marginTop: spacing.md, textAlign: 'center' },
  hint: { color: colors.textDim, fontSize: 12, marginTop: spacing.md, lineHeight: 17 },
});
