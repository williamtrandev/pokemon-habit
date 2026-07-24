# Thiết lập backend Supabase + đăng nhập Google

Đồng bộ dữ liệu (habits + sinh vật) lên cloud, đăng nhập bằng Google. Mô hình **local-first**:
AsyncStorage vẫn là cache offline, Supabase là lớp đồng bộ/backup.

## Việc bạn cần làm (một lần)

### 1. Tạo project Supabase
1. Vào https://supabase.com → tạo project mới.
2. **Project Settings → API**, lấy:
   - **Project URL** → `EXPO_PUBLIC_SUPABASE_URL`
   - **anon public key** → `EXPO_PUBLIC_SUPABASE_ANON_KEY`
3. Copy `.env.example` thành `.env`, điền 2 giá trị trên.

### 2. Tạo bảng + RLS
- Mở **SQL Editor** trong Supabase, chạy nội dung [`supabase/schema.sql`](../supabase/schema.sql).

### 3. Google OAuth (Google Cloud Console)
1. Tạo project ở https://console.cloud.google.com → **APIs & Services → Credentials**.
2. Cấu hình **OAuth consent screen** (External, thêm email test của bạn).
3. Tạo **OAuth client ID**:
   - **Web application** → lấy **Web Client ID** (→ `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, và dùng cho cả Android).
   - **Android** → cần package name + SHA-1 (lấy từ dev build EAS).
   - **iOS** (nếu chạy iOS) → cần bundle id.
4. Trong Supabase: **Authentication → Providers → Google** → bật, dán **Web Client ID** + **Client Secret**.

### 4. Development build (bắt buộc với Google Sign-In)
Google Sign-In là **native module**, KHÔNG chạy trên Expo Go. Cần dev build:
```
npx expo install @react-native-google-signin/google-signin
# thêm plugin vào app.json, rồi:
eas build --profile development --platform android   # hoặc ios
```
(Nếu muốn khỏi dev build, cân nhắc chuyển sang **magic link email** — chạy ngay trên Expo Go.)

## Việc tôi (Claude) làm tiếp sau khi bạn xong 1–3
- Thêm plugin + cấu hình `@react-native-google-signin/google-signin`.
- `src/auth-context.tsx`: quản lý session, `signInWithGoogle()` (`signInWithIdToken`), `signOut()`.
- Màn đăng nhập (gate) trước khi vào app.
- Ráp đồng bộ vào `AppContext`: khi đăng nhập → `pullState`; khi dữ liệu đổi → `pushState` (debounce). Đã có sẵn [`src/lib/cloudState.ts`](../src/lib/cloudState.ts).

## Đã dựng sẵn trong repo
- `src/lib/supabase.ts` — client (AsyncStorage, auto-refresh), cờ `supabaseReady`.
- `src/lib/cloudState.ts` — `pullState` / `pushState` (JSON blob mỗi user).
- `supabase/schema.sql` — bảng `user_state` + RLS.
- `.env.example` — mẫu biến môi trường.
