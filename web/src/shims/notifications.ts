// Bản web của ../src/notifications.ts (được thay qua FILE_OVERRIDES trong vite.config.ts).
//
// App native: expo-notifications đặt lịch ở tầng hệ điều hành, app đóng vẫn nhắc.
// Web: Notification API + hẹn giờ trong trang -> CHỈ nhắc khi tab còn mở.
// Vì hẹn giờ chết theo mỗi lần tải lại trang, danh sách lịch được ghi vào localStorage rồi
// tự dựng lại khi module nạp, nên F5 không làm mất nhắc nhở.
import { ReminderTime } from '@app/types';

export const REMINDER_CHANNEL = 'reminders';
export type NotifStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

const REGISTRY_KEY = 'pokemon-habit:web-reminders:v1';

interface Entry {
  id: string;
  title: string;
  body: string;
  time: ReminderTime;
}

const timers = new Map<string, { timeout?: number; interval?: number }>();

function supported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

function readRegistry(): Entry[] {
  try {
    const raw = window.localStorage.getItem(REGISTRY_KEY);
    return raw ? (JSON.parse(raw) as Entry[]) : [];
  } catch {
    return [];
  }
}

function writeRegistry(entries: Entry[]): void {
  try {
    window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(entries));
  } catch {
    // im lặng — nhắc nhở là phụ trợ, không được làm vỡ app
  }
}

function show(title: string, body: string): void {
  if (!supported() || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, icon: '/favicon.png', tag: 'pokehabit-reminder' });
  } catch (e) {
    console.warn('show notification failed', e);
  }
}

// Số ms tới lần HH:MM kế tiếp (hôm nay nếu chưa qua, không thì mai).
function msUntilDaily(hour: number, minute: number): number {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function arm(entry: Entry): void {
  disarm(entry.id);
  const { time, title, body } = entry;

  if (time.kind === 'interval' && time.everyMinutes) {
    const period = Math.max(60, Math.round(time.everyMinutes * 60)) * 1000;
    const interval = window.setInterval(() => show(title, body), period);
    timers.set(entry.id, { interval });
    return;
  }

  // Hằng ngày: chờ tới HH:MM lần đầu, sau đó lặp mỗi 24h.
  const timeout = window.setTimeout(() => {
    show(title, body);
    const interval = window.setInterval(() => show(title, body), 24 * 60 * 60 * 1000);
    timers.set(entry.id, { interval });
  }, msUntilDaily(time.hour, time.minute));
  timers.set(entry.id, { timeout });
}

function disarm(id: string): void {
  const t = timers.get(id);
  if (!t) return;
  if (t.timeout != null) window.clearTimeout(t.timeout);
  if (t.interval != null) window.clearInterval(t.interval);
  timers.delete(id);
}

// Dựng lại toàn bộ lịch sau khi tải trang.
if (supported()) {
  for (const e of readRegistry()) arm(e);
}

// Android cần channel; web không có khái niệm này.
export async function setupChannel(): Promise<void> {
  return;
}

export async function getStatus(): Promise<NotifStatus> {
  if (!supported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  return 'undetermined';
}

export async function ensurePermission(): Promise<boolean> {
  if (!supported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try {
    const res = await Notification.requestPermission();
    return res === 'granted';
  } catch (e) {
    console.warn('ensurePermission failed', e);
    return false;
  }
}

export async function scheduleReminder(title: string, body: string, time: ReminderTime): Promise<string | null> {
  if (!supported()) return null;
  const ok = await ensurePermission();
  if (!ok) return null;

  const id = `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: Entry = { id, title, body, time };
  writeRegistry([...readRegistry().filter((e) => e.id !== id), entry]);
  arm(entry);
  return id;
}

export async function cancelReminder(id: string | null): Promise<void> {
  if (!id) return;
  disarm(id);
  writeRegistry(readRegistry().filter((e) => e.id !== id));
}

export async function sendTestNotification(): Promise<boolean> {
  const ok = await ensurePermission();
  if (!ok) return false;
  window.setTimeout(() => show('🐣 Thông báo hoạt động!', 'Bạn sẽ nhận nhắc nhở như thế này mỗi ngày.'), 3000);
  return true;
}
