import { useEffect, useState } from 'react';
import { type Habit, type ReminderTime, formatDuration } from '@app/types';
import { ensurePermission, getStatus } from '@app/notifications';
import { feedbackTap } from '@app/feedback';
import Icon from '@web/ui/Icon';
import Sheet from '@web/ui/components/Sheet';
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
// Khác duy nhất: app dùng DateTimePicker của native (không có bản web) -> ở đây là
// <input type="time">, vốn tự hiện đồng hồ theo hệ điều hành và gõ tay được trên desktop.
export default function HabitEditor({ open, initial, onClose, onSave, onDelete }: Props) {
  const [title, setTitle] = useState('');
  const [remindOn, setRemindOn] = useState(false);
  const [mode, setMode] = useState<'daily' | 'interval'>('daily');
  const [hour, setHour] = useState(8);
  const [minute, setMinute] = useState(0);
  const [everyMinutes, setEveryMinutes] = useState(60);
  const [permDenied, setPermDenied] = useState(false);

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
  }, [open, initial]);

  const toggleRemind = async (on: boolean) => {
    setRemindOn(on);
    if (!on) {
      setPermDenied(false);
      return;
    }
    // Trên web quyền thông báo do trình duyệt cấp — hỏi ngay lúc bật để người dùng
    // hiểu vì sao popup hiện lên.
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
        mode === 'interval'
          ? { kind: 'interval', hour: 0, minute: 0, everyMinutes }
          : { kind: 'daily', hour, minute };
    }
    onSave({ title: title.trim(), reminder });
  };

  const bumpMinutes = (delta: number) => setEveryMinutes((v) => Math.max(1, Math.min(1439, v + delta)));

  return (
    <Sheet open={open} onClose={onClose} labelledBy="habit-editor-heading">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-9 place-items-center rounded-full bg-primary text-white">
          <Icon name={initial ? 'flag' : 'add'} size={20} />
        </span>
        <h2 id="habit-editor-heading" className="text-xl font-extrabold text-ink">
          {initial ? 'Sửa mục tiêu' : 'Mục tiêu mới'}
        </h2>
      </div>

      <label htmlFor="habit-title" className="mb-1.5 block text-[11px] font-extrabold tracking-wider text-ink-dim">
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
        className="w-full rounded-[12px] border border-line bg-card px-4 py-3.5 text-base text-ink outline-none placeholder:text-ink-dim focus:border-primary"
      />

      {!initial && (
        <div className="mt-3 flex items-start gap-3 rounded-[12px] border border-primary/40 bg-primary/10 p-3">
          <span className="text-xl leading-none">🥚</span>
          <p className="text-[13px] text-ink">
            Một quả trứng của Pokémon ngẫu nhiên (chưa trùng) sẽ nở ra. Hoàn thành mỗi ngày để nuôi nó tiến hoá!
          </p>
        </div>
      )}

      <section className="mt-3 rounded-card border border-line bg-card p-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 font-extrabold text-ink">
            <Icon name="notifications" size={18} className="text-primary-soft" />
            Nhắc nhở
          </span>
          <Switch checked={remindOn} onChange={toggleRemind} label="Bật nhắc nhở" />
        </div>

        {remindOn && (
          <>
            <div className="mt-3 flex gap-1 rounded-pill bg-card-alt p-1">
              {(['daily', 'interval'] as const).map((mk) => (
                <button
                  key={mk}
                  type="button"
                  onClick={() => setMode(mk)}
                  className={
                    'flex-1 rounded-pill py-2 text-sm font-extrabold transition-colors ' +
                    (mode === mk ? 'bg-primary text-white' : 'text-ink-dim hover:text-ink')
                  }
                >
                  {mk === 'daily' ? 'Hằng ngày' : 'Lặp lại'}
                </button>
              ))}
            </div>

            {mode === 'daily' ? (
              <div className="mt-4 grid justify-items-center gap-2">
                <label htmlFor="habit-time" className="text-[12px] font-bold text-ink-dim">
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
                  className="rounded-[12px] border border-line bg-card-alt px-4 py-3 text-center text-3xl font-extrabold tabular-nums text-ink outline-none focus:border-primary"
                />
              </div>
            ) : (
              <>
                <p className="mt-4 text-center text-[12px] font-bold text-ink-dim">Nhắc lại mỗi</p>
                <div className="mt-1 flex items-center justify-center gap-4">
                  <StepBtn icon="remove" onClick={() => bumpMinutes(-1)} onLong={() => bumpMinutes(-10)} />
                  <span className="min-w-40 text-center text-2xl font-extrabold text-ink">
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
              <p className="mt-3 text-[12px] font-semibold text-accent">
                ⚠️ Trình duyệt chưa cho phép thông báo. Bật lại ở biểu tượng ổ khoá trên thanh địa chỉ, nếu không nhắc
                nhở sẽ không hiện.
              </p>
            )}

            <p className="mt-3 text-[11.5px] text-ink-dim">
              Trên web, nhắc nhở chỉ chạy khi tab còn mở. Cài app lên điện thoại để được nhắc cả khi đóng máy.
            </p>
          </>
        )}
      </section>

      <button
        type="button"
        onClick={save}
        disabled={!canSave}
        className={
          'mt-4 w-full rounded-pill py-4 font-extrabold text-white transition-transform active:scale-[0.98] ' +
          (canSave ? 'bg-linear-to-br from-[#8B5CF6] to-[#7C3AED]' : 'cursor-not-allowed bg-line text-ink-dim')
        }
      >
        {initial ? 'Lưu thay đổi' : 'Tạo mục tiêu'}
      </button>

      <button type="button" onClick={onClose} className="mt-3 w-full py-3 font-bold text-ink-dim hover:text-ink">
        Huỷ
      </button>

      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="mx-auto mt-1 flex items-center gap-2 py-2 text-sm font-bold text-red"
        >
          <Icon name="trash-outline" size={16} />
          Xoá mục tiêu này
        </button>
      )}
    </Sheet>
  );
}

// Nút +/-: nhấn = 1 phút, giữ = 10 phút mỗi nhịp (khớp onLongPress của app).
function StepBtn({ icon, onClick, onLong }: { icon: 'add' | 'remove'; onClick: () => void; onLong: () => void }) {
  const [timer, setTimer] = useState<number | null>(null);

  const start = () => {
    const id = window.setInterval(onLong, 220);
    setTimer(id);
  };
  const stop = () => {
    if (timer != null) window.clearInterval(timer);
    setTimer(null);
  };

  useEffect(() => () => {
    if (timer != null) window.clearInterval(timer);
  }, [timer]);

  return (
    <button
      type="button"
      onClick={onClick}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      className="grid size-11 place-items-center rounded-full border border-line bg-card-alt text-primary-soft active:scale-95"
    >
      <Icon name={icon} size={24} />
    </button>
  );
}
