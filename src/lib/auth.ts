import { GoogleSignin } from '@react-native-google-signin/google-signin';
import type { Session } from '@supabase/supabase-js';
import { supabase, supabaseReady } from './supabase';

// Đăng nhập Google -> đổi idToken lấy phiên Supabase (bảng auth.users).
// Cần: EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID + iosUrlScheme trong app.json + bật
// provider Google trong Supabase Dashboard.

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({ webClientId });
  configured = true;
}

// true khi đã đủ cấu hình để bật luồng đăng nhập.
export const authReady = supabaseReady && Boolean(webClientId);

export async function signInWithGoogle(): Promise<Session | null> {
  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  const result: any = await GoogleSignin.signIn();
  // API đổi giữa các bản: idToken có thể ở result.idToken hoặc result.data.idToken.
  const idToken: string | undefined = result?.data?.idToken ?? result?.idToken;
  if (!idToken) throw new Error('Không lấy được idToken từ Google');

  const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw error;
  return data.session;
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
  try {
    await GoogleSignin.signOut();
  } catch {
    // đã đăng xuất phía Google hoặc chưa từng đăng nhập -> bỏ qua
  }
}

export async function getSession(): Promise<Session | null> {
  if (!supabaseReady) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Lắng nghe thay đổi phiên (đăng nhập/đăng xuất/refresh token).
export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session));
  return () => data.subscription.unsubscribe();
}
