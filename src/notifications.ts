import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { ReminderTime } from './types';

// Hiển thị thông báo ngay cả khi app đang mở.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export const REMINDER_CHANNEL = 'reminders';
export type NotifStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

let permissionAsked = false;
let channelReady = false;

// Android bắt buộc có "channel" thì thông báo mới hiện đúng độ ưu tiên + âm thanh.
export async function setupChannel(): Promise<void> {
  if (Platform.OS !== 'android' || channelReady) return;
  try {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL, {
      name: 'Nhắc nhở mục tiêu',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#8B5CF6',
    });
    channelReady = true;
  } catch (e) {
    console.warn('setupChannel failed', e);
  }
}

// Trạng thái quyền hiện tại (không hỏi lại).
export async function getStatus(): Promise<NotifStatus> {
  if (Platform.OS === 'web') return 'unsupported';
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.granted) return 'granted';
    if (!p.canAskAgain) return 'denied';
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}

export async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    await setupChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain && permissionAsked) return false;
    permissionAsked = true;
    const req = await Notifications.requestPermissionsAsync();
    return req.granted;
  } catch (e) {
    console.warn('ensurePermission failed', e);
    return false;
  }
}

// Đặt lịch nhắc lặp lại hằng ngày. Trả về id để có thể huỷ, hoặc null.
export async function scheduleReminder(
  title: string,
  body: string,
  time: ReminderTime
): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  try {
    const ok = await ensurePermission();
    if (!ok) return null;
    const id = await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour: time.hour,
        minute: time.minute,
        channelId: REMINDER_CHANNEL,
      },
    });
    return id;
  } catch (e) {
    console.warn('scheduleReminder failed', e);
    return null;
  }
}

export async function cancelReminder(id: string | null): Promise<void> {
  if (!id || Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch (e) {
    console.warn('cancelReminder failed', e);
  }
}

// Gửi thông báo thử sau vài giây để người dùng kiểm tra quyền/âm thanh.
export async function sendTestNotification(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    const ok = await ensurePermission();
    if (!ok) return false;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🐣 Thông báo hoạt động!',
        body: 'Bạn sẽ nhận nhắc nhở như thế này mỗi ngày.',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 3,
        channelId: REMINDER_CHANNEL,
      },
    });
    return true;
  } catch (e) {
    console.warn('sendTestNotification failed', e);
    return false;
  }
}
