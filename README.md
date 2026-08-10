# 🥚 PokéHabit — nuôi Pokémon bằng mục tiêu

Habit tracker theo cơ chế **game nuôi + đấu boss** (Tamagotchi × habit tracker × Pokédex). Một codebase chạy **Android + iOS** (Expo / React Native) và **web PWA** (Vite, dùng chung toàn bộ logic trong `src/`).

🌐 **Bản web:** https://pokemon-habit.vercel.app — mở trên điện thoại bấm "⬇ Cài app" là chạy như app thật (offline được).

> ⚠️ **CHỈ DÙNG CÁ NHÂN / HỌC TẬP.** App nạp **sprite Pokémon từ PokéAPI khi chạy** (không nhúng vào app). Pokémon là tài sản có bản quyền của Nintendo/The Pokémon Company — **KHÔNG được phát hành lên App Store/Google Play hay dùng thương mại**. Muốn phát hành: thay `spriteSources`/`fetchRandomLine` trong `src/species.ts` bằng bộ ảnh có giấy phép mở hoặc nhân vật tự vẽ.

## Vòng chơi

1. **Hoàn thành mục tiêu mỗi ngày** → nhận **kẹo 🍬** + tích điểm **nở trứng** 🥚.
2. Trứng nở ra **Pokémon ngẫu nhiên trong ~1025 loài** (dòng tiến hoá thật từ PokéAPI). Chuỗi ngày dài → tỉ lệ **Shiny ✨** cao, mốc chuỗi 7/30/100… tặng trứng hiếm (shiny đảm bảo).
3. **Cho ăn kẹo** → thân thiết tăng → **tiến hoá** dọc dòng thật, chạm trần thì mở **Mega/dạng đặc biệt**.
4. **Đấu đạo trường**: boss xuất hiện ngẫu nhiên mỗi giờ, đánh **theo lượt** — boss báo trước ý đồ, 3 pha đổi hệ. Thắng nhận kẹo, trứng, và **trang bị rơi**.
5. Bỏ bê thì thể trạng tụt dần rồi gục — hoàn thành trở lại để hồi sinh.

## Cơ chế sức mạnh

| Cơ chế | Tóm tắt |
|---|---|
| **Chỉ số thật** | BST từ PokéAPI quyết định máu/công/thủ/tốc trong trận (`src/battle.ts`) |
| **Chiêu thức thật** | Mỗi con mang 4 chiêu từ PokéAPI; đòn đánh tự chọn chiêu tốt nhất theo khắc hệ × STAB × lực chiêu (`pickMove`) |
| **Tuyệt chiêu** | Thanh NỘ tích khi ra/trúng đòn; đầy là bung chiêu tủ ×2.4 xuyên phòng thủ, kèm **cut-in kiểu anime** và **hiệu ứng theo hệ**: Thiêu Đốt / Hút Sinh Lực / Chấn Động / Kết Giáp / Xuyên Phá (`src/battleLive.ts`) |
| **Trang bị** | 12 món, 4 bậc hiếm có màu (Thường→Huyền thoại), rơi từ boss theo độ khó, đeo riêng từng con — buff KHÔNG làm boss scale theo (`src/items.ts`) |
| **Shiny** | Mạnh hơn dạng thường: MỌI chỉ số ×1.1 |
| **Sức mạnh bầy** | Tổng BST cả bầy → mốc thưởng vô hạn + danh hiệu (Tân binh → Truyền kỳ ★n) |
| **Boss scale** | Boss mạnh lên theo đội hình mang đi (`lineupScale`) — bầy lớn tới đâu trận vẫn đáng đánh |

## Chạy thử

```bash
npm install

# App native:
npm start          # Expo Go quét QR (đủ âm thanh + rung)
npm run ios        # máy ảo iOS (cần Xcode)
npm run android    # emulator Android

# Web (PWA, dùng chung logic src/):
npm --prefix web install
npm --prefix web run dev    # http://localhost:5173
```

Test: `npx vitest run` (lõi game thuần) · E2E iOS: Maestro (xem `docs/TESTING.md`).

## Đồng bộ đám mây (tuỳ chọn)

Local-first — không cấu hình gì vẫn chơi bình thường. Muốn đồng bộ nhiều thiết bị: tạo project Supabase, điền `EXPO_PUBLIC_SUPABASE_URL` + `EXPO_PUBLIC_SUPABASE_ANON_KEY` vào `.env` (xem `docs/supabase-setup.md`). Lưu ý trong Dashboard:

- **Authentication → URL Configuration**: đặt **Site URL** = domain web thật (mặc định `localhost:3000` làm link trong email sai).
- **Authentication → Emails**: app đăng nhập bằng **mã OTP 6 số**, nên sửa template Magic Link/Confirm signup hiển thị `{{ .Token }}` thay vì `{{ .ConfirmationURL }}`.
- Bật **Anonymous sign-ins** (đồng bộ ẩn danh mặc định) + **Email provider** (đăng nhập chung tiến độ giữa các máy).

## Deploy web

```bash
npx vercel deploy --prod --yes   # cấu hình sẵn trong vercel.json (build từ web/, output web/dist)
```

## Cấu trúc

```
App.tsx                      Vỏ app native: tab + overlay
src/                         LÕI DÙNG CHUNG app + web
  types.ts                   AppData, PartyMon, Habit…
  gameLogic.ts               Chuỗi ngày, thể trạng, decay
  collection.ts              Kẹo, trứng, nở, thân thiết, tiến hoá, shiny
  species.ts                 PokéAPI: dòng tiến hoá, sprite, chỉ số, chiêu thức
  battle.ts                  Khắc hệ, combatant, chiêu (pickMove/STAB), boss/độ khó/mốc bầy
  battleLive.ts              Trận THEO LƯỢT: ý đồ boss, Áp Chế, tuyệt chiêu + hiệu ứng hệ
  items.ts                   Trang bị: bậc hiếm, tỉ lệ rơi, buff
  AppContext.tsx             State + hành động + đồng bộ Supabase (local-first)
  lib/                       supabase, auth (ẩn danh + OTP email), sync last-write-wins
  components/                BattleArena, CreatureImage, ItemSprite…
  screens/                   Home (hôm nay), Party (bầy + đấu boss), Habits, History (Pokédex)
web/                         Bản web PWA (Vite + Tailwind), import thẳng ../src qua alias @app
  src/ui/                    UI vẽ lại bằng DOM; logic không copy dòng nào
docs/                        TESTING.md, CLOUD_SYNC.md, supabase-setup.md
```

## Build ra file cài đặt (.apk / .ipa)

```bash
npm install -g eas-cli
eas build --platform android   # .apk/.aab
eas build --platform ios       # .ipa (cần tài khoản Apple Developer)
```
