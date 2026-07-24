// Bảng màu cho 2 chế độ: tối (bầu trời đêm) và sáng (bầu trời ngày).
// Sinh vật Pokémon có đủ mọi màu, nên nền giữ trung tính + gradient bầu trời
// và một quầng sáng (glow) sau creature để con nào cũng nổi bật.

export interface Colors {
  bg: string; // nền phẳng dự phòng
  bgSoft: string; // thanh tab, sheet
  card: string;
  cardAlt: string;
  border: string;
  text: string;
  textDim: string;
  primary: string;
  primarySoft: string; // chữ nhấn (đủ tương phản trên bề mặt card)
  accent: string;
  green: string;
  red: string;
  track: string;
  bgGradient: [string, string, string]; // dải gradient bầu trời (trên → dưới)
  glow: string; // quầng sáng radial sau creature (rgba, tâm)
  scrim: string; // nền mờ của modal
}

export const darkColors: Colors = {
  bg: '#0F172A',
  bgSoft: '#1E293B',
  card: '#1E293B',
  cardAlt: '#273449',
  border: '#334155',
  text: '#F1F5F9',
  textDim: '#94A3B8',
  primary: '#8B5CF6',
  primarySoft: '#A78BFA',
  accent: '#F59E0B',
  green: '#22C55E',
  red: '#EF4444',
  track: '#334155',
  bgGradient: ['#0F172A', '#141733', '#1E1B4B'], // navy → chạng vạng tím
  glow: 'rgba(139, 92, 246, 0.45)',
  scrim: 'rgba(2, 6, 23, 0.72)',
};

export const lightColors: Colors = {
  bg: '#EAF2FF',
  bgSoft: '#FFFFFF',
  card: '#FFFFFF',
  cardAlt: '#F1F5F9',
  border: '#E2E8F0',
  text: '#0F172A',
  textDim: '#64748B',
  primary: '#7C3AED', // đậm hơn 1 bậc để chữ trắng đọc được trên nền sáng
  primarySoft: '#6D28D9', // chữ nhấn tím trên card trắng
  accent: '#D97706',
  green: '#16A34A',
  red: '#DC2626',
  track: '#DBE4F0',
  bgGradient: ['#EAF2FF', '#F4F8FF', '#FFF4E6'], // trời xanh → chân trời ấm
  glow: 'rgba(255, 255, 255, 0.9)',
  scrim: 'rgba(15, 23, 42, 0.45)',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 20,
  xl: 28,
  pill: 999,
};

// Khoảng trống chừa dưới đáy cho thanh điều hướng nổi (floating tab bar).
export const TAB_BAR_SPACE = 104;
