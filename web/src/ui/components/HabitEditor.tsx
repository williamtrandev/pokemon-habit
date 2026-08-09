import { useEffect, useState } from 'react';
import { type Habit, type ReminderTime, formatDuration } from '@app/types';
import { ensurePermission, getStatus } from '@app/notifications';
import { feedbackTap } from '@app/feedback';
import Icon from '@web/ui/Icon';
import Dialog from '@web/ui/components/Dialog';
import Switch from '@web/ui/components/Switch';

interface Props {
  open: boolean;
  initial?: Habit | null;
  onClose: () => void;
  onSave: (input: { title: string; reminder: ReminderTime | null }) => void;
  onDelete?: () => void;
}

const INTERVALS: { m: number; label: string }[] = [
  { m: 15, label: '15 phút' },
  { m: 30, label: '30 phút' },
  { m: 60, label: '1 giờ' },
  { m: 120, label: '2 giờ' },
  { m: 180, label: '3 giờ' },
];

const pad2 = (n: number) => String(n).padStart(2, '0');

// Bản web của ../src/components/HabitEditor.tsx.
// Khác app native ở hai chỗ: app dùng DateTimePicker của native (không có bản web) nên ở đây
// là <input type="time"> — tự hiện đồng hồ của hệ điều hành và gõ tay được trên desktop; và
// nút Lưu/Huỷ/Xoá ghim ở chân hộp thoại thay vì nằm cuối phần cuộn.
export default function HabitEditor({ open, initial, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState('');
  const [remindOn, setRemindOn] = useState(false);
  const [mode, setMode] = useState<'daily' | 'interval'>('daily');
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);
  const [everyMinutes, setEveryMinutes] = useState(60);
  const [permDenied, setPermDenied] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? '');
    const r = initial?.reminder;
    setRemindOn(!!r);
    setMode(r?.kind === 'interval' ? 'interval' : 'daily');
    setHour(r?.hour ?? 8);
    setMinute(r?.minute ?? 0);
    setEveryMinutes(r?.everyMinutes ?? 60);
    setPermDenied(false);
    setConfirmDel(false);
  }, [open, initial]);

  const toggleRemind = async (on: boolean) => {
    setRemindOn(on);
    if (!on) {
      setPermDenied(false);
      return;
    }
    // Trên web quyền thông báo do trình duyệt cấp — hỏi ngay lúc bật để người dùng hiểu vì
    // sao popup hiện lên.
    const ok = await ensurePermission();
    setPermDenied(!ok && (await getStatus()) !== 'unsupported');
  };

  const canSave = title.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    feedbackTap();
    let reminder: ReminderTime | null = null;
    if (remindOn) {
      reminder =
        mode === 'interval' ? { kind: 'interval', hour: 0, minute: 0, everyMinutes } : { kind: 'daily', hour, minute };
    }
    onSave({ title: title.trim(), reminder });
  };

  const bumpMinutes = (delta: number) => setEveryMinutes((v) => Math.max(1, Math.min(1439, v + delta)));

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={initial ? 'Sửa mục tiêu' : 'Mục tiêu mới'}
      subtitle={initial ? undefined : 'Một quả trứng Pokémon ngẫu nhiên sẽ nở cùng mục tiêu này'}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="flex-1 rounded-pill bg-primary py-3 font-extrabold text-white transition-colors hover:brightness-110 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-dim"
          >
            {initial ? 'Lưu thay đổi' : 'Tạo mục tiêu'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-pill border border-line bg-card px-5 py-3 font-bold text-ink-dim transition-colors hover:text-ink"
          >
            Huỷ
          </button>
          {onDelete &&
            (confirmDel ? (
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-2 rounded-pill bg-red px-5 py-3 font-extrabold text-white"
              >
                <Icon name="trash-outline" size={15} />
                Xoá thật
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDel(true)}
                aria-label="Xoá mục tiêu này"
                className="grid size-12 place-items-center rounded-pill border border-red/50 text-red transition-colors hover:bg-red/10"
              >
                <Icon name="trash-outline" size={17} />
              </button>
            ))}
        </div>
      }
    >
      <label htmlFor="habit-title" className="mb-1.5 block text-[11.5px] font-extrabold tracking-wide text-ink-dim">
        TÊN MỤC TIÊU
      </label>
      <input
        id="habit-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="VD: Uống 2 lít nước"
        maxLength={60}
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
        }}
        className="w-full rounded-ctl border border-line bg-card px-4 py-3 text-base text-ink outline-none transition-colors placeholder:text-ink-dim focus:border-primary"
      />

      <section className="mt-4 rounded-card border border-line bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-extrabold text-ink">
            <Icon name="notifications" size={17} className="text-primary-soft" />
            Nhắc nhở
          </span>
          <Switch checked={remindOn} onChange={toggleRemind} label="Bật nhắc nhở" />
        </div>

        {remindOn && (
          <>
            <div className="mt-4 flex gap-1 rounded-pill bg-card-alt p-1">
              {(['daily', 'interval'] as const).map((mk) => (
                <button
                  key={mk}
                  type="button"
                  onClick={() => setMode(mk)}
                  aria-pressed={mode === mk}
                  className={
                    'flex-1 rounded-pill py-2 text-[13.5px] font-extrabold transition-colors ' +
                    (mode === mk ? 'bg-primary text-white' : 'text-ink-dim hover:text-ink')
                  }
                >
                  {mk === 'daily' ? 'Hằng ngày' : 'Lặp lại'}
                </button>
              ))}
            </div>

            {mode === 'daily' ? (
              <div className="mt-4 grid justify-items-center gap-2">
                <label htmlFor="habit-time" className="text-[12.5px] font-bold text-ink-dim">
                  Nhắc lúc
                </label>
                <input
                  id="habit-time"
                  type="time"
                  value={`${pad2(hour)}:${pad2(minute)}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number);
                    if (Number.isFinite(h)) setHour(h);
                    if (Number.isFinite(m)) setMinute(m);
                  }}
                  className="nums rounded-ctl border border-line bg-card-alt px-4 py-3 text-center text-3xl font-extrabold text-ink outline-none focus:border-primary"
                />
              </div>
            ) : (
              <>
                <p className="mt-4 text-center text-[12.5px] font-bold text-ink-dim">Nhắc lại mỗi</p>
                <div className="mt-1 flex items-center justify-center gap-4">
                  <StepBtn icon="remove" onClick={() => bumpMinutes(-1)} onLong={() => bumpMinutes(-10)} />
                  <span className="nums min-w-40 text-center text-2xl font-extrabold text-ink">
                    {formatDuration(everyMinutes)}
                  </span>
                  <StepBtn icon="add" onClick={() => bumpMinutes(1)} onLong={() => bumpMinutes(10)} />
                </div>
                <div className="mt-3 flex flex-wrap justify-center gap-2">
                  {INTERVALS.map((it) => (
                    <button
                      key={it.m}
                      type="button"
                      onClick={() => setEveryMinutes(it.m)}
                      aria-pressed={everyMinutes === it.m}
                      className={
                        'rounded-pill border px-3 py-1.5 text-[12.5px] font-extrabold transition-colors ' +
                        (everyMinutes === it.m
                          ? 'border-primary bg-primary text-white'
                          : 'border-line bg-card-alt text-ink-dim hover:text-ink')
                      }
                    >
                      {it.label}
                    </button>
                  ))}
                </div>
              </>
            )}

            {permDenied && (
              <p className="mt-3 text-[12.5px] font-semibold text-accent">
                ⚠️ Trình duyệt chưa cho phép thông báo. Bật lại ở biểu tượng ổ khoá trên thanh địa chỉ, nếu không nhắc
                nhở sẽ không hiện.
              </p>
            )}

            <p className="mt-3 text-[12px] leading-relaxed text-ink-dim">
              Trên web, nhắc nhở chỉ chạy khi tab còn mở. Cài app lên điện thoại để được nhắc cả khi đóng máy.
            </p>
          </>
        )}
      </section>

      {confirmDel && (
        <p className="mt-4 rounded-ctl border border-red/50 bg-red/10 px-4 py-3 text-[13px] font-semibold text-ink">
          Xoá mục tiêu này? Chuỗi ngày của nó sẽ mất. Bấm <span className="font-extrabold text-red">Xoá thật</span> ở
          dưới để xác nhận.
        </p>
      )}
    </Dialog>
  );
}

// Nút +/-: nhấn = 1 phút, giữ = 10 phút mỗi nhịp (khớp onLongPress của app).
function StepBtn({ icon, onClick, onLong }: { icon: 'add' | 'remove'; onClick: () => void; onLong: () => void }) {
  const [timer, setTimer] = useState<number | null>(null);

  const start = () => setTimer(window.setInterval(onLong, 220));
  const stop = () => {
    if (timer != null) window.clearInterval(timer);
    setTimer(null);
  };

  useEffect(
    () => () => {
      if (timer != null) window.clearInterval(timer);
    },
    [timer]
  );

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      aria-label={icon === 'add' ? 'Tăng' : 'Giảm'}
      className="grid size-11 place-items-center rounded-full border border-line bg-card-alt text-primary-soft transition-colors hover:border-primary"
    >
      <Icon name={icon} size={22} />
    </button>
  );
}
