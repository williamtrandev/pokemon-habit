import { useEffect, useRef, type ReactNode } from 'react';
import Icon from '@web/ui/Icon';

// ===== Hộp thoại =====
//
// Thay cho Sheet.tsx cũ (luôn trượt lên từ đáy). Trên máy tính, tấm-trượt-từ-đáy là sai
// chỗ: nội dung nhảy vào từ mép xa nhất của màn hình rồi bám đáy, trong khi mắt và con trỏ
// đều ở giữa. Từ `sm` trở lên đây là hộp thoại giữa màn; dưới `sm` (điện thoại) vẫn là tấm
// trượt từ đáy, vì ở đó ngón tay với tới đáy dễ nhất.
//
// Ba thứ Sheet cũ thiếu, và là lý do phải viết lại chứ không chỉ đổi CSS:
//   • Tiêu điểm: mở thì đưa tiêu điểm vào trong, đóng thì TRẢ LẠI đúng nút vừa bấm.
//   • Bẫy Tab: Tab không lọt ra sau lớp phủ (không thì bàn phím đi vào vùng bị scrim che).
//   • aria-labelledby bắt buộc, để trình đọc màn hình đọc được đây là hộp thoại gì.
interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Mô tả ngắn dưới tiêu đề. */
  subtitle?: string;
  children: ReactNode;
  /** Hàng nút ghim ở chân hộp thoại (không cuộn theo nội dung). */
  footer?: ReactNode;
  /** Hộp rộng hơn cho nội dung dạng lưới (vd cây tiến hoá). */
  size?: 'md' | 'lg';
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let seq = 0;

export default function Dialog({ open, onClose, title, subtitle, children, footer, size = 'md' }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const idRef = useRef<string>('');
  if (!idRef.current) idRef.current = `dlg-${++seq}`;
  const titleId = `${idRef.current}-title`;

  useEffect(() => {
    if (!open) return;

    returnTo.current = document.activeElement as HTMLElement | null;
    const el = panel.current;
    // Ưu tiên ô nhập/nút đầu tiên; không có thì lấy chính tấm panel (tabIndex -1).
    const first = el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !el) return;
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => n.offsetParent !== null);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      // Vòng lại trong hộp thoại thay vì đi ra trang phía sau.
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      returnTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end sm:items-center sm:justify-center sm:p-6">
      <button
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        onClick={onClose}
        className="scrim anim-fade absolute inset-0 cursor-default"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={
          'anim-panel relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-sheet border border-line bg-bg-soft shadow-[0_24px_70px_rgba(0,0,0,0.45)] outline-none sm:max-h-[86dvh] sm:rounded-card ' +
          (size === 'lg' ? 'sm:max-w-4xl' : 'sm:max-w-lg')
        }
      >
        <header className="flex items-start gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-lg font-extrabold tracking-tight text-ink">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-ink-dim">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng"
            className="-mt-0.5 grid size-8 shrink-0 place-items-center rounded-ctl text-ink-dim transition-colors hover:bg-card-alt hover:text-ink"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="scroller safe-bottom min-h-0 flex-1 px-5 py-4">{children}</div>

        {footer && <footer className="safe-bottom border-t border-line bg-card/50 px-5 py-4">{footer}</footer>}
      </div>
    </div>
  );
}
