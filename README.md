# 🥚 Rồng Thói Quen (Habit Pet)

App nhắc nhở & xây dựng thói quen theo cơ chế **nuôi sinh vật tiến hoá** (Tamagotchi + habit tracker + Pokédex). Chạy được cả **Android** và **iOS** từ một codebase (Expo / React Native).

> ⚠️ **CHỈ DÙNG CÁ NHÂN / HỌC TẬP.** Bản này nạp **sprite Pokémon từ PokéAPI khi chạy** (không nhúng vào app). Pokémon là tài sản có bản quyền của Nintendo/The Pokémon Company — **KHÔNG được phát hành lên App Store/Google Play hay dùng thương mại**. Muốn phát hành: thay `spriteSources`/`fetchRandomLine` trong `src/species.ts` bằng bộ ảnh có giấy phép mở hoặc nhân vật tự vẽ.

## Ý tưởng cốt lõi

- Mỗi **mục tiêu** bạn đặt ra sẽ nở ra **một quả trứng của loài khác nhau** (không trùng nhau).
- **Hoàn thành mỗi ngày** → sinh vật tăng **thể trạng** (❤️) và **XP** (✨) → **tiến hoá**.
- **Bỏ bê** → sinh vật **yếu dần rồi gục ngã** (mờ đi, rũ xuống, đổi biểu cảm 😄→🙂→😕→😣→💀). Hoàn thành trở lại sẽ **hồi sinh** nó.
- Mỗi loài có **cây tiến hoá rẽ nhánh** kiểu Pokémon: dạng cuối phụ thuộc độ **bền bỉ** (chuỗi ngày).
- Có **âm thanh + rung** khi hoàn thành và khi tiến hoá.

### Vòng đời & thể trạng

| Thể trạng | Trạng thái | Biểu hiện |
|---|---|---|
| 80–100 | 😄 Khỏe mạnh | tươi tắn, hào quang màu loài |
| 50–79 | 🙂 Hơi mệt | mờ nhẹ, badge 💤 |
| 20–49 | 😕 Suy yếu | xám, rũ xuống, badge 🤒 |
| 1–19 | 😣 Nguy kịch | mờ hẳn, nghiêng, badge 🥀 |
| 0 | 💀 Đã gục | ngất — hoàn thành để hồi sinh (XP giữ nguyên) |

### Hình thái & tiến hoá

- Mỗi mục tiêu nở ra **một Pokémon NGẪU NHIÊN trong toàn bộ ~1025 loài** — lấy dòng tiến hoá thật qua endpoint `evolution-chain` của PokéAPI (`fetchRandomLine`).
- Ảnh dùng **artwork chính thức ĐỘ PHÂN GIẢI CAO** (nét căng), app tự thêm chuyển động **bồng bềnh + thở + đung đưa** (CreatureView) — xem `spriteSources`. (PokéAPI không có nguồn vừa nét cao vừa động; nếu thích ảnh tự nhúc nhích thì đổi `spriteSources` ưu tiên `showdown/{id}.gif`.)
- Mỗi con: **Trứng 🥚 → non → thiếu niên → dạng cuối** (ánh xạ theo độ dài dòng tiến hoá; con không tiến hoá thì lớn tại chỗ).
- Mốc XP: `[0, 40, 120, 300]` (chỉnh trong `src/species.ts`).
- Nhánh cuối: giữ **kỷ lục chuỗi ngày ≥ 10** → **bản Shiny ✨**; nếu không → bản thường.
- Thể trạng ảnh hưởng hiển thị: khoẻ (rõ nét + hào quang) → yếu (mờ, xám, nghiêng, badge 🤒) → **gục** (mờ hẳn, badge 💀).

### Luật cân bằng (chỉnh trong `src/gameLogic.ts`)

- Mỗi lần hoàn thành: **+12 XP** (+ thưởng theo chuỗi ngày, tối đa +8), **+12 thể trạng**.
- Mỗi ngày bỏ lỡ: **−18 thể trạng** (mỗi sinh vật độc lập).
- Hồi sinh sau khi gục: về **40 thể trạng**.

## Chạy thử

```bash
cd habit-pet
npm install

# Trên điện thoại thật (dễ nhất, có đủ âm thanh + rung):
npm start          # cài "Expo Go" trên điện thoại rồi quét mã QR

# Hoặc chạy trên máy ảo:
npm run ios        # cần macOS + Xcode
npm run android    # cần Android Studio / emulator
npm run web        # xem nhanh trên trình duyệt (âm thanh/rung bị bỏ qua)
```

## Cấu trúc

```
App.tsx                      Điều hướng tab + overlay tiến hoá / hồi sinh
assets/sfx/                  Âm thanh (complete.wav, evolve.wav — tổng hợp sẵn)
src/
  types.ts                   Kiểu dữ liệu (Creature gắn trong Habit) + trạng thái thể trạng
  species.ts                 fetchRandomLine (ngẫu nhiên toàn bộ Pokémon) + URL sprite động + mốc XP + shiny
  date.ts                    Tiện ích ngày tháng
  storage.ts                 Lưu/nạp AsyncStorage (KEY v2)
  gameLogic.ts               XP, thể trạng, gục/hồi sinh, chuỗi ngày, rẽ nhánh
  notifications.ts           Nhắc nhở cục bộ
  feedback.ts                Âm thanh (expo-audio) + rung (expo-haptics)
  AppContext.tsx             State toàn cục + hành động (gán loài chưa trùng khi tạo)
  theme.ts                   Màu sắc, khoảng cách
  components/
    CreatureImage.tsx        Sprite động Pokémon (expo-image, GIF + dự phòng); bậc 0 = trứng emoji
    CreatureView.tsx         Bọc CreatureImage + animation (nhún/thở, hạt) + trạng thái thể trạng
    CreatureCard, CreatureDetail, HabitEditor, ProgressBar
  screens/                   HomeScreen (đàn sinh vật), HabitsScreen (mục tiêu), HistoryScreen (bộ sưu tập)
```

## Build ra file cài đặt (.apk / .ipa)

```bash
npm install -g eas-cli
eas build --platform android   # ra .apk/.aab
eas build --platform ios       # ra .ipa (cần tài khoản Apple Developer)
```

## Ý tưởng mở rộng

- Thêm nhiều loài / dạng tiến hoá hơn (chỉ cần bổ sung vào `src/species.ts`).
- Thay emoji bằng nhân vật vẽ tay / SVG để phần biến hoá đặc sắc hơn.
- Cửa hàng phụ kiện trang trí cho sinh vật bằng XP.
- Đồng bộ đám mây, đăng nhập.
