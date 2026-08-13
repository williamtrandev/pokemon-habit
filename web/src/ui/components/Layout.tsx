import type { ReactNode } from 'react';

// ===== Bộ khung dùng chung cho mọi màn =====
// Mỗi màn tự bày nội dung của nó, nhưng lề trang, bề rộng đọc được và nhịp dọc phải GIỐNG
// NHAU — không thì đổi tab là chữ nhảy chỗ. Ba component này giữ đúng ba thứ đó.

/** Vùng nội dung một trang: lề đáp ứng + bề rộng tối đa. */
export function Page({ children, wide }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={'mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8 ' + (wide ? 'max-w-[1500px]' : 'max-w-5xl')}>
      {children}
    </div>
  );
}

/** Tiêu đề trang + phần phụ bên phải (nút công cụ, số liệu). */
export function PageHead({
  title,
  sub,
  children,
}: {
  title: string;
  sub?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[26px] leading-tight font-extrabold tracking-tight text-ink lg:text-[30px]">{title}</h1>
        {sub && <p className="mt-1 text-sm text-ink-dim">{sub}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </header>
  );
}

/** Thẻ nội dung. `title` có thì tự dựng luôn hàng tiêu đề + chỗ cho phần phụ bên phải. */
export function Card({
  title,
  aside,
  children,
  className = '',
  tone = 'plain',
}: {
  title?: string;
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: 'plain' | 'good' | 'warn' | 'bad';
}) {
  const border =
    tone === 'good'
      ? 'border-green/50 bg-green/8'
      : tone === 'warn'
        ? 'border-accent/50 bg-accent/8'
        : tone === 'bad'
          ? 'border-red/50 bg-red/8'
          : 'border-line bg-card';

  return (
    <section className={'rounded-card border p-3.5 sm:p-4 lg:p-5 ' + border + ' ' + className}>
      {title && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-extrabold tracking-tight text-ink">{title}</h2>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}
