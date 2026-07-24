import { AppData } from '../types';
import { supabase } from './supabase';

// Mô hình đồng bộ: mỗi user giữ MỘT bản ghi JSON (bảng public.user_state).
// Đơn giản, khớp với cách app đang lưu cả AppData thành một khối trong AsyncStorage.

const TABLE = 'user_state';

// Kéo dữ liệu từ cloud về (null nếu user chưa có bản ghi nào).
export async function pullState(userId: string): Promise<AppData | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('data')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.warn('pullState failed', error.message);
    return null;
  }
  return (data?.data as AppData) ?? null;
}

// Đẩy dữ liệu lên cloud (tạo mới hoặc ghi đè theo user_id).
export async function pushState(userId: string, appData: AppData): Promise<void> {
  const { error } = await supabase
    .from(TABLE)
    .upsert({ user_id: userId, data: appData, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) console.warn('pushState failed', error.message);
}
