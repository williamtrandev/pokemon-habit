import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../AppContext';
import { ensureSession, sendEmailOtp, sessionEmail, signOut, verifyEmailOtp } from '../lib/auth';
import { feedbackTap } from '../feedback';
import { Colors, radius, spacing } from '../theme';
import { useTheme, useThemedStyles } from '../theme-context';

// Đăng nhập email OTP để DÙNG CHUNG tiến độ giữa điện thoại và bản web.
//
// Mặc định mỗi thiết bị là một user ẩn danh riêng nên dữ liệu không gặp nhau. Đăng nhập cùng
// một email ở cả hai nơi thì cùng uuid -> cùng bản ghi user_state -> lib/sync.ts merge theo
// last-write-wins. Bản web có thẻ y hệt trong web/src/ui/components/AccountCard.tsx.
export default function AccountCard() {
  const { authReady, session } = useApp();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const email = sessionEmail(session);

  const [step, setStep] = useState<'idle' | 'email' | 'code'>('idle');
  const [input, setInput] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  if (!authReady) return null;

  // Đã đăng nhập email -> tiến độ dùng chung.
  if (email) {
    return (
      <View style={[styles.card, styles.cardOn]}>
        <View style={styles.row}>
          <Ionicons name="cloud-done" size={18} color={colors.green} />
          <View style={styles.rowMid}>
            <Text style={styles.title}>Đang dùng chung tiến độ</Text>
            <Text style={[styles.status, { color: colors.green }]} numberOfLines={1}>{email}</Text>
            <Text style={styles.hint}>
              Đăng nhập cùng email này trên máy tính (bản web) để hai bên thấy cùng một bầy Pokémon.
            </Text>
          </View>
        </View>
        <Pressable
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            await signOut();
            // Không còn phiên thì đồng bộ tắt hẳn — tạo lại phiên ẩn danh cho máy này.
            await ensureSession();
            setBusy(false);
            setStep('idle');
            setMsg(null);
          }}
          style={[styles.btnGhost, busy && styles.dim]}
        >
          <Ionicons name="log-out-outline" size={16} color={colors.textDim} />
          <Text style={styles.btnGhostText}>Thoát tài khoản</Text>
        </Pressable>
      </View>
    );
  }

  const submitEmail = async () => {
    feedbackTap();
    setBusy(true);
    setMsg(null);
    const res = await sendEmailOtp(input);
    setBusy(false);
    if (!res.ok) {
      setMsg({ text: res.error, bad: true });
      return;
    }
    setStep('code');
    setMsg({ text: `Đã gửi mã 6 số tới ${input.trim().toLowerCase()}`, bad: false });
  };

  const submitCode = async () => {
    feedbackTap();
    setBusy(true);
    setMsg(null);
    const res = await verifyEmailOtp(input, code);
    setBusy(false);
    if (!res.ok) {
      setMsg({ text: res.error, bad: true });
      return;
    }
    // Phiên đổi -> AppContext tự chạy reconcile(), không cần làm gì thêm ở đây.
    setStep('idle');
    setCode('');
    setMsg(null);
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>☁️ Dùng chung với máy tính</Text>
      <Text style={styles.hint}>
        Máy này đang lưu riêng. Đăng nhập email ở CẢ app và web để nuôi cùng một bầy — làm trên điện thoại, mở máy tính
        thấy ngay.
      </Text>

      {step === 'idle' && (
        <Pressable
          onPress={() => {
            feedbackTap();
            setStep('email');
          }}
          style={styles.btnOutline}
        >
          <Ionicons name="mail-outline" size={16} color={colors.primarySoft} />
          <Text style={styles.btnOutlineText}>Đăng nhập bằng email</Text>
        </Pressable>
      )}

      {step === 'email' && (
        <>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="ban@email.com"
            placeholderTextColor={colors.textDim}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="emailAddress"
            style={styles.input}
          />
          <View style={styles.btnRow}>
            <Pressable
              disabled={busy || !input.trim()}
              onPress={submitEmail}
              style={[styles.btnPrimary, (busy || !input.trim()) && styles.dim]}
            >
              {busy ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.btnPrimaryText}>Gửi mã</Text>}
            </Pressable>
            <Pressable
              onPress={() => {
                setStep('idle');
                setMsg(null);
              }}
              style={styles.btnCancel}
            >
              <Text style={styles.btnGhostText}>Huỷ</Text>
            </Pressable>
          </View>
        </>
      )}

      {step === 'code' && (
        <>
          <TextInput
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
            placeholder="000000"
            placeholderTextColor={colors.textDim}
            keyboardType="number-pad"
            maxLength={6}
            textContentType="oneTimeCode"
            style={[styles.input, styles.inputCode]}
          />
          <View style={styles.btnRow}>
            <Pressable
              disabled={busy || code.length < 6}
              onPress={submitCode}
              style={[styles.btnPrimary, (busy || code.length < 6) && styles.dim]}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.btnPrimaryText}>Xác nhận</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                setStep('email');
                setCode('');
                setMsg(null);
              }}
              style={styles.btnCancel}
            >
              <Text style={styles.btnGhostText}>Đổi email</Text>
            </Pressable>
          </View>
        </>
      )}

      {msg && <Text style={[styles.msg, { color: msg.bad ? colors.red : colors.green }]}>{msg.text}</Text>}
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
    cardOn: { borderColor: colors.green + '99', backgroundColor: colors.green + '10' },
    row: { flexDirection: 'row', gap: spacing.md },
    rowMid: { flex: 1 },
    title: { color: colors.text, fontSize: 15, fontWeight: '700' },
    status: { fontSize: 12.5, marginTop: 2, fontWeight: '700' },
    hint: { color: colors.textDim, fontSize: 11.5, marginTop: spacing.xs, lineHeight: 16 },
    input: {
      backgroundColor: colors.cardAlt,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.text,
      fontSize: 16,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      marginTop: spacing.md,
    },
    inputCode: { textAlign: 'center', fontSize: 24, fontWeight: '800', letterSpacing: 8 },
    btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
    btnPrimary: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: radius.pill,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    btnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    btnCancel: {
      backgroundColor: colors.cardAlt,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    btnOutline: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
      backgroundColor: colors.primary + '1A',
      borderWidth: 1,
      borderColor: colors.primary,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
    },
    btnOutlineText: { color: colors.primarySoft, fontSize: 14, fontWeight: '800' },
    btnGhost: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
    },
    btnGhostText: { color: colors.textDim, fontSize: 14, fontWeight: '800' },
    dim: { opacity: 0.5 },
    msg: { fontSize: 12, fontWeight: '600', marginTop: spacing.sm },
  });
