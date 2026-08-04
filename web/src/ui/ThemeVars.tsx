import { useEffect } from 'react';
import { useTheme } from '@app/theme-context';

// Cầu nối bảng màu -> biến CSS của Tailwind.
//
// Bảng màu là ../src/theme.ts (DÙNG CHUNG với app native). Component này ghi các màu đó vào
// style của <html> lúc chạy, nên mọi tiện ích Tailwind (bg-card, text-ink-dim...) đổi theo
// chế độ sáng/tối mà không cần khai báo màu lần hai trong CSS.
export default function ThemeVars() {
  const { colors, scheme } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    const set = (k: string, v: string) => root.style.setProperty(k, v);

    set('--color-bg', colors.bg);
    set('--color-bg-soft', colors.bgSoft);
    set('--color-card', colors.card);
    set('--color-card-alt', colors.cardAlt);
    set('--color-line', colors.border);
    set('--color-ink', colors.text);
    set('--color-ink-dim', colors.textDim);
    set('--color-primary', colors.primary);
    set('--color-primary-soft', colors.primarySoft);
    set('--color-accent', colors.accent);
    set('--color-green', colors.green);
    set('--color-red', colors.red);
    set('--color-track', colors.track);

    set('--grad-0', colors.bgGradient[0]);
    set('--grad-1', colors.bgGradient[1]);
    set('--grad-2', colors.bgGradient[2]);
    set('--glow', colors.glow);
    set('--scrim', colors.scrim);

    // Cho trình duyệt biết nên vẽ scrollbar/ô nhập theo chế độ nào.
    root.style.colorScheme = scheme;

    // Thanh trạng thái khi cài PWA lên màn hình chính.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', colors.bgGradient[0]);
  }, [colors, scheme]);

  return null;
}
