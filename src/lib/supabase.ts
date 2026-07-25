import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// Đọc từ biến môi trường EXPO_PUBLIC_* (điền trong file .env — xem .env.example).
const envUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const envKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// true khi đã cấu hình Supabase — dùng để bật/tắt luồng đăng nhập + đồng bộ.
export const supabaseReady = Boolean(envUrl && envKey);

// createClient NÉM lỗi nếu url rỗng ("supabaseUrl is required"). Chưa cấu hình thì
// dùng placeholder hợp lệ để module load được; mọi lời gọi thật đã bị gate qua
// supabaseReady nên client này không bao giờ chạm mạng.
const url = envUrl || 'https://placeholder.supabase.co';
const anonKey = envKey || 'placeholder-anon-key';

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false, // app native, không parse URL
  },
});
