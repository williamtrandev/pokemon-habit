import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Đọc từ biến môi trường EXPO_PUBLIC_* (điền trong file .env — xem .env.example).
const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// true khi đã cấu hình Supabase — dùng để bật/tắt luồng đăng nhập + đồng bộ.
export const supabaseReady = Boolean(url && anonKey);

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // app native, không parse URL
  },
});
