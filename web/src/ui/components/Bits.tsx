// Các mảnh UI nhỏ dùng lại nhiều nơi: vòng tiến độ, thanh tiến độ, Poké Ball, ảnh Pokémon.
// Vẽ lại từ ../src/components/* của app native (ProgressRing, ProgressBar, Pokeball,
// CreatureImage) bằng SVG/DOM + Tailwind, giữ nguyên tỉ lệ và màu.
import { useEffect, useState } from 'react';
import { spriteSources } from '@app/species';

// ===== Vòng tròn "xong/tổng" ở header màn Hôm nay =====
export function ProgressRing({ done, total, size = 60, stroke = 5 }: { done: number; total: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const ratio = total > 0 ? done / total : 0;
  const complete = total > 0 && done >= total;

  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - ratio)}
          className={complete ? 'stroke-green' : 'stroke-primary'}
          style={{ transition: 'stroke-dashoffset 320ms ease' }}
        />
      </svg>
      {/* Cỡ chữ theo cỡ vòng: vòng 60px ở dải chip và vòng 132px ở cột theo dõi dùng chung
          component này, chữ cố định 15px sẽ lọt thỏm trong vòng to. */}
      <span className="nums font-extrabold text-ink" style={{ fontSize: Math.round(size * 0.26) }}>
        {done}/{total}
      </span>
    </div>
  );
}

// ===== Thanh tiến độ có vệt sáng trên đỉnh =====
export function ProgressBar({ ratio, color, height = 10 }: { ratio: number; color?: string; height?: number }) {
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  const fill = color ?? 'var(--color-primary)';
  return (
    <div className="w-full overflow-hidden bg-track" style={{ height, borderRadius: height }}>
      {pct > 0 && (
        <div
          className="relative h-full"
          style={{
            width: `${pct}%`,
            borderRadius: height,
            background: `linear-gradient(180deg, ${fill} 0%, color-mix(in srgb, ${fill} 80%, transparent) 100%)`,
            transition: 'width 320ms ease',
          }}
        >
          <div
            className="h-[45%] bg-white/20"
            style={{ borderTopLeftRadius: height, borderTopRightRadius: height }}
          />
        </div>
      )}
    </div>
  );
}

// ===== Poké Ball (loader) =====
export function Pokeball({ size = 64, spin = false }: { size?: number; spin?: boolean }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} className={spin ? 'anim-spin-slow' : undefined}>
      <defs>
        <linearGradient id="pbTop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FF5A5A" />
          <stop offset="1" stopColor="#E4222B" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="#F8FAFC" stroke="#0F172A" strokeWidth="5" />
      <path d="M4,50 a46,46 0 0 1 92,0 Z" fill="url(#pbTop)" />
      <line x1="4" y1="50" x2="96" y2="50" stroke="#0F172A" strokeWidth="7" />
      <circle cx="50" cy="50" r="16" fill="#0F172A" />
      <circle cx="50" cy="50" r="10" fill="#F8FAFC" stroke="#0F172A" strokeWidth="3" />
      <circle cx="50" cy="50" r="4" fill="#E2E8F0" />
    </svg>
  );
}

// ===== Ảnh Pokémon =====
// spriteSources() dùng CHUNG với app: trả về danh sách URL theo thứ tự ưu tiên. Ảnh lỗi ->
// tụt xuống nguồn kế tiếp; hết nguồn -> dấu hỏi. formId null = trứng.
export function CreatureImage({
  formId,
  shiny = false,
  size,
  tint,
  className,
}: {
  formId: number | null;
  shiny?: boolean;
  size: number;
  tint?: string;
  className?: string;
}) {
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [formId, shiny]);

  if (formId == null) {
    return (
      <div className="grid place-items-center" style={{ width: size, height: size, fontSize: size * 0.66 }}>
        🥚
      </div>
    );
  }

  const sources = spriteSources(formId, shiny);
  if (idx >= sources.length) {
    return (
      <div className="grid place-items-center" style={{ width: size, height: size, fontSize: size * 0.5 }}>
        ❔
      </div>
    );
  }

  return (
    <img
      src={sources[idx]}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      onError={() => setIdx((i) => i + 1)}
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: 'contain',
        imageRendering: 'auto',
        // tint = hiện dạng BÓNG ĐƠN SẮC (Pokémon chưa mở trong Pokédex).
        // brightness(0) đưa mọi pixel về đen, invert kéo lên mức xám -> bóng đặc, thấy rõ
        // trên cả nền tối và nền sáng (khác opacity, vốn làm bóng tan vào nền tối).
        ...(tint ? { filter: 'brightness(0) invert(0.42)' } : null),
      }}
    />
  );
}
