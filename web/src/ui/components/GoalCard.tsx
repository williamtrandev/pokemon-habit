import { type Habit, reminderLabel } from '@app/types';
import { habitStreak, isDoneNow, nextResetAt } from '@app/gameLogic';
import { todayStr } from '@app/date';
import Icon from '@web/ui/Icon';

function fmtRemain(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} phút` : `${s}s`;
}

interface Props {
  habit: Habit;
  now: number; // đồng hồ tick từ HomeScreen: nút interval tự mở lại + countdown
  onToggle: () => void;
}

// Thẻ MỤC TIÊU: tên + chuỗi ngày + nhắc nhở + nút hoàn thành MỘT CHIỀU (xong rồi là khoá).
export default function GoalCard({ habit, now, onToggle }: Props) {
  const done = isDoneNow(habit, now);
  const resetAt = nextResetAt(habit, now);
  const streak = habitStreak(habit, todayStr());

  return (
    <div
      className={
        'group flex items-center gap-4 rounded-card border p-4 transition-colors ' +
        (done ? 'border-green/45 bg-green/8' : 'border-line bg-card hover:border-primary/45')
      }
    >
      <div className="min-w-0 flex-1">
        <p
          className={
            'text-[17px] leading-snug font-bold ' + (done ? 'text-ink-dim line-through decoration-green/60' : 'text-ink')
          }
        >
          {habit.title}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {streak > 0 && (
            <span className="nums inline-flex items-center gap-1 rounded-pill bg-accent/15 px-2 py-0.5 text-xs font-extrabold text-accent">
              <Icon name="flame" size={12} />
              {streak} ngày
            </span>
          )}
          {habit.reminder && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-primary/12 px-2 py-0.5 text-[11.5px] font-extrabold text-primary-soft">
              <Icon name="alarm-outline" size={11} />
              {reminderLabel(habit.reminder)}
            </span>
          )}
          {resetAt != null && (
            <span className="nums text-[11.5px] font-bold text-ink-dim">mở lại sau {fmtRemain(resetAt - now)}</span>
          )}
        </div>
      </div>

      {/* Trên máy tính không có "chạm", nên nút xong là một nút CÓ CHỮ chứ không phải vòng
          tròn trơn — đọc là biết bấm để làm gì, và rộng ra thì chuột dễ trúng.
          Xong rồi thì đổi thành nhãn tĩnh: hành động này một chiều, không bấm lại được. */}
      {done ? (
        <span className="flex shrink-0 items-center gap-2 rounded-pill border border-green/50 bg-green/15 px-4 py-2.5 text-[13.5px] font-extrabold text-green">
          <Icon name="checkmark-sharp" size={16} />
          Đã xong
        </span>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-label={`Hoàn thành ${habit.title}`}
          className="flex shrink-0 items-center gap-2 rounded-pill border border-primary bg-primary/10 px-4 py-2.5 text-[13.5px] font-extrabold text-primary-soft transition-colors hover:bg-primary hover:text-white"
        >
          <Icon name="checkmark-sharp" size={16} />
          <span className="hidden sm:inline">Hoàn thành</span>
        </button>
      )}
    </div>
  );
}
