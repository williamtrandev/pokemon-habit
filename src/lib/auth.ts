import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseReady } from './supabase';

// Đồng bộ ẩn danh: không cần đăng nhập. Supabase tạo một user ẩn danh (uuid),
// phiên lưu trong AsyncStorage; RLS trên user_state vẫn hoạt động theo uuid đó.
// Cần bật "Anonymous sign-ins" trong Supabase Dashboard → Authentication.

export const authReady = supabaseReady;

// Đảm bảo có phiên: khôi phục phiên cũ, nếu chưa có thì đăng nhập ẩn danh.
export async function ensureSession(): Promise<Session | null> {
  if (!supabaseReady) return null;
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session) return data.session;
    const { data: signed, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.warn('anonymous sign-in failed', error.message);
      return null;
    }
    return signed.session;
  } catch (e) {
    console.warn('ensureSession failed', e);
    return null;
  }
}

// Lắng nghe thay đổi phiên (refresh token, v.v.).
export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}

// ===== Đăng nhập bằng email (mã OTP 6 số) =====
// Phiên ẩn danh gắn riêng từng THIẾT BỊ, nên điện thoại và máy tính là hai user khác nhau.
// Muốn CHUNG một tiến độ thì cả hai phải đăng nhập cùng email: uuid giống nhau -> cùng một
// bản ghi user_state -> reconcile() lo phần merge last-write-wins.
//
// Dùng OTP (không phải magic link) vì mã 6 số nhập được ở cả app native và web, không cần
// cấu hình deep link / redirect URL. Cần bật Email provider trong Supabase Dashboard.

export type OtpResult = { ok: true } | { ok: false; error: string };

// Bước 1: gửi mã 6 số tới email.
export async function sendEmailOtp(email: string): Promise<OtpResult> {
  if (!supabaseReady) return { ok: false, error: 'Chưa cấu hình Supabase' };
  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) return { ok: false, error: 'Email không hợp lệ' };
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: clean,
      options: { shouldCreateUser: true },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Gửi mã thất bại' };
  }
}

// Bước 2: nhập mã -> đổi sang phiên của email đó.
// Dữ liệu đang có trên máy KHÔNG mất: AppContext thấy session đổi sẽ chạy reconcile(), bên
// nào updatedAt mới hơn thì thắng, cloud rỗng thì local được đẩy lên.
export async function verifyEmailOtp(email: string, token: string): Promise<OtpResult> {
  if (!supabaseReady) return { ok: false, error: 'Chưa cấu hình Supabase' };
  try {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: token.trim(),
      type: 'email',
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Xác thực thất bại' };
  }
}

// Thoát tài khoản email. ensureSession() sẽ tạo lại phiên ẩn danh cho thiết bị này,
// nên đồng bộ vẫn chạy — chỉ là không còn dùng chung với máy khác nữa.
export async function signOut(): Promise<void> {
  if (!supabaseReady) return;
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn('signOut failed', e);
  }
}

// Phiên hiện tại có phải tài khoản email (dùng chung nhiều thiết bị) hay chỉ ẩn danh?
export function sessionEmail(session: Session | null): string | null {
  if (!session) return null;
  // user ẩn danh của Supabase: is_anonymous = true, không có email.
  return session.user.email ?? null;
}
