import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

// Nguồn âm thanh (được tổng hợp sẵn trong assets/sfx).
const SOUNDS = {
  complete: require('../assets/sfx/complete.wav'),
  evolve: require('../assets/sfx/evolve.wav'),
  tap: require('../assets/sfx/tap.wav'),
};

type SoundKey = keyof typeof SOUNDS;

let players: Partial<Record<SoundKey, AudioPlayer>> = {};
let audioReady = false;

// Nhạc nền (loop).
let bgmPlayer: AudioPlayer | null = null;
let musicEnabled = false;

async function initAudio() {
  if (audioReady || Platform.OS === 'web') return;
  try {
    await setAudioModeAsync({ playsInSilentMode: true });
    audioReady = true;
  } catch (e) {
    console.warn('initAudio failed', e);
  }
}

function getPlayer(key: SoundKey): AudioPlayer | null {
  if (Platform.OS === 'web') return null;
  try {
    if (!players[key]) players[key] = createAudioPlayer(SOUNDS[key]);
    return players[key] ?? null;
  } catch (e) {
    console.warn('getPlayer failed', e);
    return null;
  }
}

let soundEnabled = true;
let hapticsEnabled = true;

export function configureFeedback(opts: { sound?: boolean; haptics?: boolean; music?: boolean }) {
  if (typeof opts.sound === 'boolean') soundEnabled = opts.sound;
  if (typeof opts.haptics === 'boolean') hapticsEnabled = opts.haptics;
  if (soundEnabled || musicEnabled) initAudio();
  if (typeof opts.music === 'boolean') {
    musicEnabled = opts.music;
    if (musicEnabled) startMusic();
    else stopMusic();
  }
}

function getBgm(): AudioPlayer | null {
  if (Platform.OS === 'web') return null;
  try {
    if (!bgmPlayer) {
      bgmPlayer = createAudioPlayer(require('../assets/sfx/bgm.wav'));
      bgmPlayer.loop = true;
      bgmPlayer.volume = 0.35; // nền nhẹ, không át SFX
    }
    return bgmPlayer;
  } catch (e) {
    console.warn('getBgm failed', e);
    return null;
  }
}

export function startMusic() {
  if (!musicEnabled || Platform.OS === 'web') return;
  initAudio();
  const p = getBgm();
  if (!p) return;
  try {
    p.loop = true;
    p.play();
  } catch (e) {
    console.warn('startMusic failed', e);
  }
}

export function stopMusic() {
  try {
    bgmPlayer?.pause();
  } catch (e) {
    console.warn('stopMusic failed', e);
  }
}

function playSound(key: SoundKey) {
  if (!soundEnabled || Platform.OS === 'web') return;
  initAudio();
  const p = getPlayer(key);
  if (!p) return;
  try {
    p.seekTo(0);
    p.play();
  } catch (e) {
    console.warn('playSound failed', e);
  }
}

function haptic(type: 'success' | 'heavy' | 'warning' | 'light') {
  if (!hapticsEnabled || Platform.OS === 'web') return;
  try {
    if (type === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else if (type === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    else if (type === 'light') Haptics.selectionAsync();
    else Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch (e) {
    console.warn('haptic failed', e);
  }
}

// Phản hồi nhẹ khi nhấn nút.
export function feedbackTap() {
  playSound('tap');
  haptic('light');
}

// Phản hồi khi hoàn thành một mục tiêu.
export function feedbackComplete() {
  playSound('complete');
  haptic('success');
}

// Phản hồi khi sinh vật tiến hoá (mạnh hơn).
export function feedbackEvolve() {
  playSound('evolve');
  haptic('heavy');
  setTimeout(() => haptic('success'), 140);
}
