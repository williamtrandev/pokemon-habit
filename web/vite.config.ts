import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const appSrc = path.join(repoRoot, 'src');
const shims = path.join(here, 'src', 'shims');

// ===== Dùng chung code với app native =====
// Web KHÔNG copy logic. Nó import trực tiếp ../src/* (AppContext, gameLogic, collection,
// battle, species, storage, theme...). Chỉ lớp nền tảng bị thay: react-native, AsyncStorage,
// và 2 module chạm thẳng vào native (feedback = âm thanh/rung, notifications = lịch nhắc).
//
// Thêm module cần thay ở ĐÂY, đừng sửa file trong ../src — app native phải giữ nguyên.
const FILE_OVERRIDES: Record<string, string> = {
  [path.join(appSrc, 'feedback.ts')]: path.join(shims, 'feedback.ts'),
  [path.join(appSrc, 'notifications.ts')]: path.join(shims, 'notifications.ts'),
};

// Chặn ở resolveId theo ĐƯỜNG DẪN TUYỆT ĐỐI đã resolve, nên import tương đối
// ('./feedback' từ trong ../src) cũng bị thay đúng.
function overrideNativeModules(): Plugin {
  return {
    name: 'pokehabit-override-native-modules',
    enforce: 'pre',
    async resolveId(source, importer, options) {
      if (source.startsWith('\0')) return null;
      const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
      if (!resolved) return null;
      const hit = FILE_OVERRIDES[resolved.id.split('?')[0]];
      return hit ?? null;
    },
  };
}

export default defineConfig(({ mode }) => {
  // .env nằm ở gốc repo (dùng chung với app). Chỉ đọc biến EXPO_PUBLIC_*.
  const env = loadEnv(mode, repoRoot, 'EXPO_PUBLIC_');

  return {
    plugins: [
      overrideNativeModules(),
      react(),
      tailwind(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'PokéHabit — nuôi Pokémon bằng mục tiêu',
          short_name: 'PokéHabit',
          description: 'Hoàn thành mục tiêu mỗi ngày để nở, nuôi lớn và tiến hoá Pokémon.',
          lang: 'vi',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#0F172A',
          background_color: '#0F172A',
          categories: ['productivity', 'lifestyle', 'games'],
          icons: [
            { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
            // maskable: có viền đệm nên Android bo góc/khoét tròn không cắt mất hình.
            { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
          // bgm.wav ~470KB: không nhồi vào precache, để runtimeCaching lo (xem dưới).
          globIgnores: ['**/bgm-*.wav'],
          navigateFallback: '/index.html',
          runtimeCaching: [
            {
              // Sprite Pokémon (ảnh tĩnh, không đổi) -> cache trước, hết mạng vẫn hiện.
              urlPattern: /^https:\/\/raw\.githubusercontent\.com\/PokeAPI\/sprites\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'pokemon-sprites',
                expiration: { maxEntries: 800, maxAgeSeconds: 60 * 60 * 24 * 90 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // PokéAPI JSON (dòng tiến hoá, chiêu, hệ) -> dùng bản cache ngay, ngầm làm mới.
              urlPattern: /^https:\/\/pokeapi\.co\/api\/v2\/.*/i,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'pokeapi',
                expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Âm thanh trong app.
              urlPattern: /\.wav$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'pokehabit-audio',
                expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 180 },
                cacheableResponse: { statuses: [0, 200] },
                rangeRequests: true,
              },
            },
          ],
          // Supabase KHÔNG cache: dữ liệu đồng bộ phải luôn lấy từ mạng.
          navigateFallbackDenylist: [/^\/api/],
        },
        devOptions: {
          // Bật service worker cả khi dev để kiểm tra được luồng offline/cập nhật.
          enabled: true,
          type: 'module',
        },
      }),
    ],
    resolve: {
      alias: {
        // Lớp nền tảng: đổi sang bản web.
        'react-native-url-polyfill/auto': path.join(shims, 'url-polyfill.ts'),
        '@react-native-async-storage/async-storage': path.join(shims, 'async-storage.ts'),
        'react-native': path.join(shims, 'react-native.ts'),
        // Code dùng chung với app native.
        '@app': appSrc,
        '@web': path.join(here, 'src'),
      },
      // ../src import 'react' -> phải trỏ về ĐÚNG MỘT bản react của web, không thì hook vỡ.
      dedupe: ['react', 'react-dom'],
    },
    // ../src đọc process.env.EXPO_PUBLIC_* (quy ước Expo). Bơm sẵn lúc build.
    // Ưu tiên .env ở gốc repo (máy dev); không có thì lấy từ biến môi trường CI
    // (Vercel/Actions đặt env var chứ không có file .env).
    define: {
      'process.env.EXPO_PUBLIC_SUPABASE_URL': JSON.stringify(
        env.EXPO_PUBLIC_SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL ?? ''
      ),
      'process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(
        env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? ''
      ),
      'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    },
    server: {
      port: 5173,
      // Cho phép đọc file ngoài thư mục web/ (chính là ../src).
      fs: { allow: [repoRoot] },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
  };
});
