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
