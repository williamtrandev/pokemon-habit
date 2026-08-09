// Icon dạng SVG nội tuyến, vẽ lại đúng bộ Ionicons mà app native dùng.
//
// Không kéo cả gói icon về cho web: chỉ chép đường path của những icon thật sự xuất hiện,
// nên bundle nhẹ và không phụ thuộc font icon (font icon hay nháy khi tải).
// Tên trùng tên Ionicons trong app để dò đối chiếu nhanh.

export type IconName =
  | 'checkmark-done'
  | 'checkmark-done-outline'
  | 'heart'
  | 'heart-outline'
  | 'flag'
  | 'flag-outline'
  | 'albums'
  | 'albums-outline'
  | 'flame'
  | 'alarm-outline'
  | 'checkmark-sharp'
  | 'notifications'
  | 'add'
  | 'remove'
  | 'close'
  | 'trash-outline'
  | 'cloud-done-outline'
  | 'cloud-offline-outline'
  | 'sync'
  | 'chevron-forward'
  | 'sparkles'
  | 'flash'
  | 'shield'
  | 'log-out-outline'
  | 'mail-outline'
  | 'search-outline';

// path (fill) — lấy theo hình dạng Ionicons tương ứng, chuẩn hoá về viewBox 512.
const PATHS: Record<IconName, { d: string; stroke?: boolean }> = {
  'checkmark-done': {
    d: 'M368 154 154 368l-86-86-30 30 116 116 244-244zM480 154 266 368l-30-30 214-214z',
  },
  'checkmark-done-outline': {
    d: 'M360 148 152 356l-72-72M480 148 272 356l-24-24',
    stroke: true,
  },
  heart: {
    d: 'M256 448l-30-27C119 324 48 260 48 181c0-63 49-112 112-112 38 0 74 18 96 47 22-29 58-47 96-47 63 0 112 49 112 112 0 79-71 143-178 240z',
  },
  'heart-outline': {
    d: 'M352 80c-40 0-74 21-96 53-22-32-56-53-96-53-57 0-104 46-104 104 0 71 66 132 168 226l32 30 32-30c102-94 168-155 168-226 0-58-47-104-104-104z',
    stroke: true,
  },
  flag: { d: 'M80 48v416h40V288h300L360 176l60-112H80z' },
  'flag-outline': { d: 'M96 64v384M96 80h300l-52 96 52 96H96', stroke: true },
  albums: {
    d: 'M448 176H64c-18 0-32 14-32 32v192c0 18 14 32 32 32h384c18 0 32-14 32-32V208c0-18-14-32-32-32zM96 128h320v-32H96zM128 80h256V48H128z',
  },
  'albums-outline': {
    d: 'M64 192h384v224H64zM104 144h304M144 96h224',
    stroke: true,
  },
  flame: {
    d: 'M295 21c11 62-15 111-49 155-31 40-70 76-70 132 0 45 30 82 70 96-70-9-134-64-134-146 0-64 34-108 66-150C213 61 260 34 295 21z m-11 470c67-6 124-58 124-131 0-56-32-92-58-124-4 60-33 88-63 116-24 22-44 45-44 76 0 27 17 51 41 63z',
  },
  'alarm-outline': {
    d: 'M256 448a176 176 0 100-352 176 176 0 000 352zM256 176v96l64 40M112 80l48-40M400 80l-48-40',
    stroke: true,
  },
  'checkmark-sharp': { d: 'M416 128L192 352 96 256l-30 30 126 126 254-254z' },
  notifications: {
    d: 'M256 480a64 64 0 0060-42H196a64 64 0 0060 42zM416 336c-18-24-32-52-32-112 0-66-46-118-112-126V64a16 16 0 00-32 0v34c-66 8-112 60-112 126 0 60-14 88-32 112-8 11 0 26 14 26h292c14 0 22-15 14-26z',
  },
  add: { d: 'M240 64v176H64v32h176v176h32V272h176v-32H272V64z' },
  remove: { d: 'M64 240h384v32H64z' },
  close: { d: 'M278 256l135-135-23-23-135 135L121 98l-23 23 135 135-135 135 23 23 135-135 135 135 23-23z' },
  'trash-outline': {
    d: 'M112 112h288M176 112V64h160v48M144 112l16 336h192l16-336M208 176v224M304 176v224',
    stroke: true,
  },
  'cloud-done-outline': {
    d: 'M400 224a112 112 0 00-216-38A88 88 0 00104 400h296a88 88 0 000-176M200 300l40 40 80-80',
    stroke: true,
  },
  'cloud-offline-outline': {
    d: 'M400 224a112 112 0 00-216-38A88 88 0 00104 400h296M96 96l320 320',
    stroke: true,
  },
  sync: {
    d: 'M441 96v112H329l45-45a136 136 0 00-215 55l-40-14A176 176 0 01403 135l38-39zM71 416V304h112l-45 45a136 136 0 00215-55l40 14A176 176 0 01109 377l-38 39z',
  },
  'chevron-forward': { d: 'M180 96l-30 30 130 130-130 130 30 30 160-160z' },
  sparkles: {
    d: 'M208 96l24 64 64 24-64 24-24 64-24-64-64-24 64-24zM368 224l16 40 40 16-40 16-16 40-16-40-40-16 40-16zM112 320l14 34 34 14-34 14-14 34-14-34-34-14 34-14z',
  },
  flash: { d: 'M288 32L112 288h96l-32 192 176-256h-96z' },
  shield: { d: 'M256 32L80 96v128c0 112 74 200 176 256 102-56 176-144 176-256V96z' },
  'log-out-outline': {
    d: 'M336 144V96a32 32 0 00-32-32H96a32 32 0 00-32 32v320a32 32 0 0032 32h208a32 32 0 0032-32v-48M352 176l80 80-80 80M176 256h256',
    stroke: true,
  },
  'mail-outline': {
    d: 'M64 112h384v288H64zM64 128l192 144 192-144',
    stroke: true,
  },
  'search-outline': {
    d: 'M221 338a117 117 0 100-234 117 117 0 000 234zM305 305l103 103',
    stroke: true,
  },
};

interface Props {
  name: IconName;
  size?: number;
  className?: string;
  /** Mặc định icon lấy màu chữ hiện tại (currentColor). */
  color?: string;
}

export default function Icon({ name, size = 20, className, color }: Props) {
  const spec = PATHS[name];
  const stroke = spec.stroke;
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      className={className}
      style={{ flexShrink: 0 }}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={spec.d}
        fill={stroke ? 'none' : (color ?? 'currentColor')}
        stroke={stroke ? (color ?? 'currentColor') : undefined}
        strokeWidth={stroke ? 32 : undefined}
        strokeLinecap={stroke ? 'round' : undefined}
        strokeLinejoin={stroke ? 'round' : undefined}
      />
    </svg>
  );
}
