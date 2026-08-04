import { useEffect, type ReactNode } from 'react';

// Bottom sheet: nền mờ + tấm trượt lên từ đáy, tương ứng Modal + Animated trong app native.
// Esc hoặc chạm nền mờ để đóng; khoá cuộn trang phía sau khi đang mở.
export default function Sheet({
  open,
  onClose,
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  labelledBy?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="absolute inset-0 z-40 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="scrim absolute inset-0 cursor-default"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="anim-sheet safe-bottom relative max-h-[90%] overflow-y-auto rounded-t-sheet bg-bg-soft p-4 pb-6 shadow-[0_-10px_40px_rgba(0,0,0,0.4)]"
      >
        {/* tay nắm trang trí, khớp styles.handle của app */}
        <div className="mx-auto mb-3 h-1 w-9 rounded-pill bg-line" />
        {children}
      </div>
    </div>
  );
}
