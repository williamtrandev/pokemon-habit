import { AppData } from '../types';
import { pullState, pushState } from './cloudState';

// Chiến lược: local-first. UI luôn đọc/ghi AsyncStorage tức thì; cloud là bản sao
// đẩy NỀN (write-behind, debounce) để không chặn tương tác. Merge dùng
// last-write-wins theo AppData.updatedAt (mỗi user một khối JSON).

let timer: ReturnType<typeof setTimeout> | null = null;
let pending: { userId: string; data: AppData } | null = null;

// Hẹn đẩy lên cloud sau `delayMs` (gộp nhiều thay đổi liên tiếp thành một lần push).
export function queuePush(userId: string, data: AppData, delayMs = 2000): void {
  pending = { userId, data };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    const p = pending;
    timer = null;
    pending = null;
    if (p) void pushState(p.userId, p.data);
  }, delayMs);
}

// Đẩy ngay khối đang chờ (gọi khi app nền/đăng xuất để không mất thay đổi cuối).
export async function flushPush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const p = pending;
  pending = null;
  if (p) await pushState(p.userId, p.data);
}

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
