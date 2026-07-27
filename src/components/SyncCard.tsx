import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../AppContext';
import { Colors, radius, spacing } from '../theme';
import { useTheme, useThemedStyles } from '../theme-context';

const STATUS: Record<string, { label: string; icon: keyof typeof Ionicons.glyphMap; tone: 'ok' | 'busy' | 'err' }> = {
  idle: { label: 'Đã đồng bộ đám mây', icon: 'cloud-done', tone: 'ok' },
  syncing: { label: 'Đang đồng bộ…', icon: 'cloud-upload', tone: 'busy' },
  error: { label: 'Lỗi đồng bộ — sẽ thử lại', icon: 'cloud-offline', tone: 'err' },
  off: { label: '', icon: 'cloud-offline', tone: 'busy' },
};

// Trạng thái đồng bộ đám mây (ẩn danh, tự động — không có đăng nhập).
// Ẩn khi chưa cấu hình Supabase (authReady=false).
export default function SyncCard() {
  const { authReady, syncStatus } = useApp();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (!authReady) return null;
  const s = STATUS[syncStatus] ?? STATUS.idle;
  const color = s.tone === 'err' ? colors.red : s.tone === 'busy' ? colors.primarySoft : colors.green;

  return (
    <View style={styles.card}>
      <Ionicons name={s.icon} size={18} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Đồng bộ đám mây</Text>
        <Text style={[styles.status, { color }]}>{s.label}</Text>
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginTop: spacing.lg,
    },
    title: { color: colors.text, fontSize: 15, fontWeight: '700' },
    status: { fontSize: 12.5, marginTop: 2, fontWeight: '600' },
  });
