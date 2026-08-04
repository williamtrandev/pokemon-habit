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
        'mb-3 flex items-center rounded-card border p-4 shadow-[0_4px_10px_rgba(0,0,0,0.12)] transition-colors ' +
        (done ? 'border-green/60 bg-green/10' : 'border-line bg-card')
      }
    >
      <div className="mr-3 min-w-0 flex-1">
        <p className="line-clamp-2 text-[17px] font-extrabold text-ink">{habit.title}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {streak > 0 && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-accent/15 px-2 py-0.5 text-xs font-extrabold text-accent">
              <Icon name="flame" size={12} />
              {streak}
            </span>
          )}
          {habit.reminder && (
            <span className="inline-flex items-center gap-1 rounded-pill bg-primary/10 px-2 py-0.5 text-[11px] font-extrabold text-primary-soft">
              <Icon name="alarm-outline" size={11} />
              {reminderLabel(habit.reminder)}
            </span>
          )}
        </div>
      </div>

      <div className="grid w-14 justify-items-center">
        <button
          type="button"
          onClick={done ? undefined : onToggle}
          disabled={done}
          aria-label={done ? `Đã hoàn thành ${habit.title}` : `Hoàn thành ${habit.title}`}
          className={
            'grid size-13 place-items-center rounded-full border-[2.5px] transition-transform active:scale-90 ' +
            (done
              ? 'border-green bg-green text-white shadow-[0_3px_8px_rgba(34,197,94,0.3)]'
              : 'border-primary bg-card text-primary-soft shadow-[0_3px_8px_rgba(139,92,246,0.3)] hover:bg-primary/10')
          }
        >
          <Icon name="checkmark-sharp" size={26} />
        </button>
        {resetAt != null && (
          <span className="mt-1 text-center text-[10px] font-bold text-ink-dim">mở sau {fmtRemain(resetAt - now)}</span>
        )}
      </div>
    </div>
  );
}
