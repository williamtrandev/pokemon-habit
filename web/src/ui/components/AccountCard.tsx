import { useState } from 'react';
import { useApp } from '@app/AppContext';
import { ensureSession, sendEmailOtp, sessionEmail, signOut, verifyEmailOtp } from '@app/lib/auth';
import { feedbackTap } from '@app/feedback';
import Icon from '@web/ui/Icon';

// Đăng nhập email OTP để DÙNG CHUNG tiến độ giữa máy tính và điện thoại.
//
// Mặc định mỗi thiết bị là một user ẩn danh riêng -> dữ liệu không gặp nhau. Đăng nhập cùng
// một email ở cả hai nơi thì cùng uuid, cùng bản ghi user_state, và src/lib/sync.ts merge
// theo last-write-wins.
export default function AccountCard() {
  const { authReady, session } = useApp();
  const email = sessionEmail(session);

  const [step, setStep] = useState<'idle' | 'email' | 'code'>('idle');
  const [input, setInput] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);

  if (!authReady) {
    return (
      <section className="mb-4 rounded-card border border-line bg-card p-4">
        <h2 className="text-base font-extrabold text-ink">☁️ Dùng chung với điện thoại</h2>
        <p className="mt-1 text-[12.5px] text-ink-dim">
          Chưa cấu hình Supabase. Điền <code className="font-mono">EXPO_PUBLIC_SUPABASE_URL</code> và{' '}
          <code className="font-mono">EXPO_PUBLIC_SUPABASE_ANON_KEY</code> vào file <code className="font-mono">.env</code>{' '}
          ở gốc repo rồi chạy lại.
        </p>
      </section>
    );
  }

  // Đã đăng nhập email -> tiến độ dùng chung.
  if (email) {
    return (
      <section className="mb-4 rounded-card border border-green/60 bg-green/10 p-4">
        <div className="flex items-start gap-3">
          <Icon name="cloud-done-outline" size={18} className="mt-0.5 text-green" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-ink">Đang dùng chung tiến độ</p>
            <p className="mt-0.5 truncate text-[12.5px] font-semibold text-green">{email}</p>
            <p className="mt-1 text-[11.5px] text-ink-dim">
              Đăng nhập cùng email này trên điện thoại để hai bên thấy cùng một bầy Pokémon.
            </p>
          </div>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await signOut();
            // Không có phiên nào thì đồng bộ tắt hẳn — tạo lại phiên ẩn danh cho máy này.
            await ensureSession();
            setBusy(false);
            setStep('idle');
            setMsg(null);
          }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-[12px] border border-line bg-card py-2.5 text-sm font-extrabold text-ink-dim disabled:opacity-50"
        >
          <Icon name="log-out-outline" size={16} />
          Thoát tài khoản
        </button>
      </section>
    );
  }

  const submitEmail = async () => {
    feedbackTap();
    setBusy(true);
    setMsg(null);
    const res = await sendEmailOtp(input);
    setBusy(false);
    if (!res.ok) {
      setMsg({ text: res.error, bad: true });
      return;
    }
    setStep('code');
    setMsg({ text: `Đã gửi mã 6 số tới ${input.trim().toLowerCase()}`, bad: false });
  };

  const submitCode = async () => {
    feedbackTap();
    setBusy(true);
    setMsg(null);
    const res = await verifyEmailOtp(input, code);
    setBusy(false);
    if (!res.ok) {
      setMsg({ text: res.error, bad: true });
      return;
    }
    // Phiên đổi -> AppContext tự chạy reconcile(), không cần làm gì thêm ở đây.
    setStep('idle');
    setCode('');
    setMsg(null);
  };

  return (
    <section className="mb-4 rounded-card border border-line bg-card p-4">
      <h2 className="text-base font-extrabold text-ink">☁️ Dùng chung với điện thoại</h2>
      <p className="mt-1 text-[12.5px] text-ink-dim">
        Máy này đang lưu riêng. Đăng nhập email ở CẢ web và app để nuôi cùng một bầy — làm trên máy tính, mở điện thoại
        thấy ngay.
      </p>

      {step === 'idle' && (
        <button
          type="button"
          onClick={() => {
            feedbackTap();
            setStep('email');
          }}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-[12px] border border-primary bg-primary/10 py-2.5 text-sm font-extrabold text-primary-soft"
        >
          <Icon name="mail-outline" size={16} />
          Đăng nhập bằng email
        </button>
      )}

      {step === 'email' && (
        <div className="mt-3 grid gap-2">
          <input
            type="email"
            inputMode="email"
            autoComplete="email"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitEmail();
            }}
            placeholder="ban@email.com"
            className="w-full rounded-[12px] border border-line bg-card-alt px-4 py-3 text-base text-ink outline-none placeholder:text-ink-dim focus:border-primary"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || !input.trim()}
              onClick={submitEmail}
              className="flex-1 rounded-pill bg-primary py-2.5 text-sm font-extrabold text-white disabled:opacity-50"
            >
              {busy ? 'Đang gửi…' : 'Gửi mã'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('idle');
                setMsg(null);
              }}
              className="rounded-pill border border-line bg-card-alt px-4 py-2.5 text-sm font-extrabold text-ink-dim"
            >
              Huỷ
            </button>
          </div>
        </div>
      )}

      {step === 'code' && (
        <div className="mt-3 grid gap-2">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void submitCode();
            }}
            placeholder="000000"
            className="w-full rounded-[12px] border border-line bg-card-alt px-4 py-3 text-center text-2xl font-extrabold tracking-[0.3em] text-ink tabular-nums outline-none placeholder:text-ink-dim focus:border-primary"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy || code.length < 6}
              onClick={submitCode}
              className="flex-1 rounded-pill bg-primary py-2.5 text-sm font-extrabold text-white disabled:opacity-50"
            >
              {busy ? 'Đang kiểm tra…' : 'Xác nhận'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('email');
                setCode('');
                setMsg(null);
              }}
              className="rounded-pill border border-line bg-card-alt px-4 py-2.5 text-sm font-extrabold text-ink-dim"
            >
              Đổi email
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className={'mt-2 text-[12px] font-semibold ' + (msg.bad ? 'text-red' : 'text-green')}>{msg.text}</p>
      )}
    </section>
  );
}
