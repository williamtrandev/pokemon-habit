# PokéHabit Web (PWA)

Bản web của app native, **dùng chung toàn bộ logic game** trong `../src`. Đây là dự án riêng
(Vite + React DOM + Tailwind v4), phát triển song song với app — không phải bản convert.

```bash
npm --prefix web install     # hoặc: npm run web:install (từ gốc repo)
npm run web:dev              # http://localhost:5173
npm run web:build            # typecheck + build ra web/dist
```

## Dùng chung code như thế nào

Web **không copy** logic. `vite.config.ts` trỏ alias `@app` về `../src`, nên web import trực
tiếp cùng những file mà app dùng:

| Dùng chung nguyên xi | Ghi chú |
| --- | --- |
| `AppContext.tsx` | Toàn bộ state + luật game. Thuần React, không chạm react-native. |
| `gameLogic.ts`, `collection.ts`, `battle.ts` | Chuỗi ngày, điểm nở, kẹo, tiến hoá, mô phỏng trận. |
| `species.ts`, `megaForms.ts`, `pokemonTypes.ts` | Gọi PokéAPI, sprite, hệ, Mega. |
| `storage.ts`, `theme.ts`, `theme-context.tsx`, `date.ts`, `types.ts` | Lưu trữ, bảng màu, ngày. |
| `lib/auth.ts`, `lib/sync.ts`, `lib/cloudState.ts` | Đăng nhập + đồng bộ Supabase. |

Chỉ **lớp nền tảng** bị thay, khai báo trong `vite.config.ts`:

- `react-native` → `src/shims/react-native.ts` (chỉ `Platform`, `useColorScheme`)
- `@react-native-async-storage/async-storage` → `src/shims/async-storage.ts` (localStorage)
- `react-native-url-polyfill/auto` → no-op (trình duyệt có `URL` sẵn)
- `../src/feedback.ts` → `src/shims/feedback.ts` (HTMLAudioElement + Vibration API, dùng
  chung file `.wav` trong `../assets/sfx`)
- `../src/notifications.ts` → `src/shims/notifications.ts` (Notification API)

Hai file cuối bị chặn theo **đường dẫn tuyệt đối** trong hook `resolveId`, nên `import
'./feedback'` từ trong `../src` cũng được thay đúng. Cần thay thêm module native nào thì khai
báo vào bảng `FILE_OVERRIDES` — **đừng sửa file trong `../src`**, app phải giữ nguyên.

UI thì viết lại bằng DOM + Tailwind trong `src/ui/` (app dùng react-native StyleSheet). Bảng
màu vẫn là `../src/theme.ts`: `ui/ThemeVars.tsx` ghi màu đó vào biến CSS lúc chạy, nên đổi màu
ở app là web đổi theo.

## Khác biệt so với app native

| | App | Web |
| --- | --- | --- |
| Chọn giờ nhắc | `DateTimePicker` native | `<input type="time">` |
| Nhắc nhở | Lịch ở tầng OS, đóng app vẫn nhắc | Notification API — **chỉ khi tab còn mở**; lịch ghi vào localStorage nên F5 không mất |
| Rung | expo-haptics | Vibration API (Android Chrome; iOS Safari không có) |
| Bố cục | Full màn điện thoại | Khung dọc 480px giữa màn hình trên desktop |
| Pokédex đầy đủ | FlatList ảo hoá | Cuộn vô hạn theo trang 36 dòng |

## PWA

`vite-plugin-pwa` (Workbox), bật cả ở chế độ dev để kiểm tra được offline.

- Manifest: standalone, portrait, icon 192/512 + maskable (sinh từ `../assets/icon.png` bằng `sharp`).
- Precache: JS/CSS/HTML/icon. `bgm.wav` (~470KB) không precache.
- Runtime cache: sprite `raw.githubusercontent.com` (CacheFirst, 90 ngày) · PokéAPI JSON
  (StaleWhileRevalidate, 30 ngày) · `.wav` (CacheFirst). **Supabase không cache** — dữ liệu
  đồng bộ luôn lấy từ mạng.
- Mở offline được: dữ liệu nằm trong localStorage, sprite/JSON đã cache.

Sinh lại icon sau khi đổi `../assets/icon.png`:

```bash
node -e "const s=require('sharp');(async()=>{for(const n of[192,512])await s('../assets/icon.png').resize(n,n).png().toFile('public/pwa-'+n+'.png');await s('../assets/icon.png').resize(410,410).extend({top:51,bottom:51,left:51,right:51,background:'#0F172A'}).png().toFile('public/pwa-maskable-512.png');await s('../assets/icon.png').resize(180,180).png().toFile('public/apple-touch-icon.png')})()"
```

## Chung tiến độ với điện thoại

Mặc định mỗi thiết bị là một user **ẩn danh** của Supabase → dữ liệu KHÔNG gặp nhau. Muốn chung:

1. Supabase Dashboard → Authentication → Providers → bật **Email** (OTP).
2. Trong app **và** web: tab Pokédex → thẻ "Dùng chung" → đăng nhập cùng một email (mã 6 số).
3. Xong. Cùng uuid → cùng bản ghi `user_state`; `../src/lib/sync.ts` merge last-write-wins
   theo `AppData.updatedAt`.

`.env` ở **gốc repo** (dùng chung với app), Vite đọc qua `loadEnv`:

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

## Deploy (Vercel / Netlify / Cloudflare Pages)

| Thiết lập | Giá trị |
| --- | --- |
| Root Directory | `web` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Env | `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` |

Là SPA nên cần rewrite mọi đường dẫn về `/index.html` (Vercel/Netlify tự nhận với Vite).

## Lưu ý khi sửa code

- Sửa gì trong `../src` là **đụng vào app**. Chạy `npm test` (52 test) + `npx tsc --noEmit` ở
  gốc repo trước khi commit.
- `metro.config.js` ở gốc chặn `web/` khỏi Metro (web có bản react riêng, không chặn thì
  bundle app chậm/lỗi resolve).
- `tsc` của app loại `web/`; kiểm tra web bằng `npm --prefix web run typecheck`.
