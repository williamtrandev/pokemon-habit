// Bản web của ../src/feedback.ts (được thay qua FILE_OVERRIDES trong vite.config.ts).
//
// App native: expo-audio + expo-haptics. Web: HTMLAudioElement (dùng CHUNG file .wav trong
// ../assets/sfx) + Vibration API khi trình duyệt có (Android Chrome; iOS Safari không có).
// Giữ ĐÚNG chữ ký export của bản native để ../src/AppContext.tsx import không cần biết khác biệt.
import completeUrl from '../../../assets/sfx/complete.wav?url';
import evolveUrl from '../../../assets/sfx/evolve.wav?url';
import tapUrl from '../../../assets/sfx/tap.wav?url';
import bgmUrl from '../../../assets/sfx/bgm.wav?url';

const SOUNDS = { complete: completeUrl, evolve: evolveUrl, tap: tapUrl };
type SoundKey = keyof typeof SOUNDS;

let soundEnabled = true;
let hapticsEnabled = true;
let musicEnabled = false;

const players: Partial<Record<SoundKey, HTMLAudioElement>> = {};
let bgm: HTMLAudioElement | null = null;

function getPlayer(key: SoundKey): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  try {
    if (!players[key]) {
      const a = new Audio(SOUNDS[key]);
      a.preload = 'auto';
      players[key] = a;
    }
    return players[key] ?? null;
  } catch (e) {
    console.warn('getPlayer failed', e);
    return null;
  }
}

function getBgm(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  try {
    if (!bgm) {
      bgm = new Audio(bgmUrl);
      bgm.loop = true;
      bgm.volume = 0.35; // nền nhẹ, không át SFX
    }
    return bgm;
  } catch (e) {
    console.warn('getBgm failed', e);
    return null;
  }
}

export function configureFeedback(opts: { sound?: boolean; haptics?: boolean; music?: boolean }) {
  if (typeof opts.sound === 'boolean') soundEnabled = opts.sound;
  if (typeof opts.haptics === 'boolean') hapticsEnabled = opts.haptics;
  if (typeof opts.music === 'boolean') {
    musicEnabled = opts.music;
    if (musicEnabled) startMusic();
    else stopMusic();
  }
}

export function startMusic() {
  if (!musicEnabled) return;
  const p = getBgm();
  if (!p) return;
  // Trình duyệt chặn autoplay tới khi người dùng tương tác -> play() có thể reject. Bỏ qua,
  // lần bấm nút kế tiếp sẽ khởi động được.
  p.play().catch(() => {});
}

export function stopMusic() {
  try {
    bgm?.pause();
  } catch (e) {
    console.warn('stopMusic failed', e);
  }
}

function playSound(key: SoundKey) {
  if (!soundEnabled) return;
  const p = getPlayer(key);
  if (!p) return;
  try {
    p.currentTime = 0;
    p.play().catch(() => {}); // chưa có tương tác người dùng -> im lặng bỏ qua
  } catch (e) {
    console.warn('playSound failed', e);
  }
}

// Vibration API: chỉ một số trình duyệt hỗ trợ. Không có thì bỏ qua, không báo lỗi.
function haptic(type: 'success' | 'heavy' | 'warning' | 'light') {
  if (!hapticsEnabled) return;
  const nav = typeof navigator === 'undefined' ? null : navigator;
  if (!nav || typeof nav.vibrate !== 'function') return;
  const pattern = type === 'heavy' ? [24] : type === 'success' ? [12, 40, 12] : type === 'warning' ? [30, 60, 30] : [8];
  try {
    nav.vibrate(pattern);
  } catch {
    // im lặng — rung là phụ trợ
  }
}

export function feedbackTap() {
  playSound('tap');
  haptic('light');
}

export function feedbackComplete() {
  playSound('complete');
  haptic('success');
}

export function feedbackEvolve() {
  playSound('evolve');
  haptic('heavy');
  setTimeout(() => haptic('success'), 140);
}
