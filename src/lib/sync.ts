import { AppData } from '../types';
import { pullState, pushState } from './cloudState';

// Chiến lược: local-first. UI luôn đọc/ghi AsyncStorage tức thì; cloud là bản sao
// đẩy NGẦM ngay mỗi thay đổi (fire-and-forget ở AppContext, không chặn tương tác).
// Merge dùng last-write-wins theo AppData.updatedAt (mỗi user một khối JSON).

export interface ReconcileResult {
  data: AppData; // dữ liệu nên dùng sau khi merge
  source: 'cloud' | 'local';
}

// Merge lúc đăng nhập / khởi động: bên nào updatedAt mới hơn thì thắng.
// Cloud rỗng -> đẩy local lên. Local rỗng/cũ hơn -> lấy cloud về.
export async function reconcile(userId: string, local: AppData): Promise<ReconcileResult> {
  const cloud = await pullState(userId);
  const cloudAt = cloud?.updatedAt ?? -1;
  const localAt = local.updatedAt ?? 0;

  if (cloud && cloudAt > localAt) {
    return { data: cloud, source: 'cloud' };
  }
  // Local mới hơn (hoặc cloud chưa có) -> seed/ghi đè cloud bằng local.
  await pushState(userId, local);
  return { data: local, source: 'local' };
}
