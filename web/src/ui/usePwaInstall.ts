import { useCallback, useEffect, useState } from 'react';

// ===== Nút "Cài app" cho PWA =====
// Chrome/Edge bắn `beforeinstallprompt` khi đủ điều kiện cài (manifest + SW + HTTPS).
// Giữ event lại để bấm nút mới prompt — trình duyệt cấm gọi prompt() không có cử chỉ người
// dùng. Safari iOS KHÔNG có event này (cài qua Share -> Add to Home Screen) nên nút tự ẩn.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Đã chạy trong app cài rồi (standalone) thì khỏi mời cài nữa.
function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari cũ
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export default function usePwaInstall(): { canInstall: boolean; install: () => Promise<void> } {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone()) return;
    const onPrompt = (e: Event) => {
      e.preventDefault(); // chặn banner mặc định, để nút của mình chủ động
      setEvt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => setEvt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    if (!evt) return;
    await evt.prompt();
    const choice = await evt.userChoice;
    if (choice.outcome === 'accepted') setEvt(null);
  }, [evt]);

  return { canInstall: evt != null, install };
}
