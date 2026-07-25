import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../AppContext';
import { Colors, radius, spacing } from '../theme';
import { useTheme, useThemedStyles } from '../theme-context';

const STATUS_LABEL: Record<string, string> = {
  idle: 'Đã đồng bộ',
  syncing: 'Đang đồng bộ…',
  error: 'Lỗi đồng bộ',
  off: '',
};

// Thẻ Tài khoản & đồng bộ đám mây. Ẩn khi chưa cấu hình key (authReady=false),
// để bản build cá nhân chỉ-local không thấy gì thừa.
export default function SyncCard() {
  const { authReady, session, syncStatus, signIn, signOut } = useApp();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [busy, setBusy] = useState(false);

  if (!authReady) return null;

  const email = session?.user?.email ?? session?.user?.user_metadata?.email ?? 'Đã đăng nhập';

  const onSignIn = async () => {
    setBusy(true);
    try {
      await signIn();
    } catch (e: any) {
      Alert.alert('Đăng nhập thất bại', e?.message ?? 'Thử lại sau nhé.');
    } finally {
      setBusy(false);
    }
  };

  const onSignOut = () => {
    Alert.alert('Đăng xuất', 'Dữ liệu vẫn còn trên máy. Đăng nhập lại để đồng bộ tiếp.', [
      { text: 'Huỷ', style: 'cancel' },
      {
        text: 'Đăng xuất',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await signOut();
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Tài khoản & đồng bộ</Text>

      {!session ? (
        <>
          <Text style={styles.hint}>Đăng nhập để sao lưu đám mây và đồng bộ nhiều máy.</Text>
          <Pressable style={styles.googleBtn} onPress={onSignIn} disabled={busy}>
            {busy ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <>
                <Ionicons name="logo-google" size={18} color={colors.text} />
                <Text style={styles.googleText}>Đăng nhập với Google</Text>
              </>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={styles.email} numberOfLines={1}>{email}</Text>
              <View style={styles.statusRow}>
                <Ionicons
                  name={syncStatus === 'error' ? 'cloud-offline' : 'cloud-done'}
                  size={13}
                  color={syncStatus === 'error' ? colors.red : colors.green}
                />
                <Text style={styles.status}>{STATUS_LABEL[syncStatus] ?? ''}</Text>
              </View>
            </View>
            {busy && <ActivityIndicator color={colors.textDim} />}
          </View>
          <Pressable style={styles.signOutBtn} onPress={onSignOut} disabled={busy}>
            <Text style={styles.signOutText}>Đăng xuất</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      marginTop: spacing.lg,
    },
    cardTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginBottom: spacing.sm },
    hint: { color: colors.textDim, fontSize: 13, marginBottom: spacing.md, lineHeight: 18 },
    googleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: colors.bgSoft,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
    },
    googleText: { color: colors.text, fontWeight: '800', fontSize: 15 },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    email: { color: colors.text, fontSize: 15, fontWeight: '700' },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
    status: { color: colors.textDim, fontSize: 12 },
    signOutBtn: {
      marginTop: spacing.md,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    signOutText: { color: colors.textDim, fontWeight: '700', fontSize: 14 },
  });
