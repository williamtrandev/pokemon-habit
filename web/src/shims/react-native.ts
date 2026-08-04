// Shim `react-native` cho web.
//
// Các file dùng chung trong ../src (notifications, feedback, theme-context) chỉ chạm vào
// vài API rất nhỏ của react-native. UI web KHÔNG dùng react-native — nó vẽ bằng DOM.
// Vì vậy shim này cố tình mỏng: chỉ những gì code dùng chung thật sự cần.
import { useEffect, useState } from 'react';

export const Platform = {
  // Kiểu để RỘNG (không phải 'web' as const) vì tsc vẫn đọc bản gốc ../src/notifications.ts
  // và ../src/feedback.ts — trong đó có so sánh Platform.OS với 'android'/'ios'. Bundler thay
  // hai file đó bằng shim, nhưng nếu khai báo hẹp thì tsc báo "không bao giờ trùng".
  // Giá trị lúc chạy vẫn luôn là 'web'.
  OS: 'web' as 'web' | 'ios' | 'android',
  select<T>(spec: { web?: T; native?: T; default?: T; ios?: T; android?: T }): T | undefined {
    return spec.web ?? spec.default;
  },
};

// Theo dõi prefers-color-scheme của trình duyệt — tương đương useColorScheme của RN.
export function useColorScheme(): 'light' | 'dark' | null {
  const [scheme, setScheme] = useState<'light' | 'dark' | null>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return null;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = (e: MediaQueryListEvent) => setScheme(e.matches ? 'light' : 'dark');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return scheme;
}

// Dự phòng: nếu sau này code dùng chung chạm API RN khác, nó sẽ nổ ở đây với tên rõ ràng
// thay vì lỗi "undefined is not a function" khó truy.
export const StatusBar = { currentHeight: 0 };
export const Dimensions = {
  get: () => ({
    width: typeof window === 'undefined' ? 390 : window.innerWidth,
    height: typeof window === 'undefined' ? 844 : window.innerHeight,
  }),
};
