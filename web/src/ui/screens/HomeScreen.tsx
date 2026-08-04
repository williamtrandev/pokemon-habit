import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@app/AppContext';
import { intervalMs, isDoneNow } from '@app/gameLogic';
import { HATCH_DAILY_CAP, HATCH_THRESHOLD } from '@app/collection';
import { todayStr } from '@app/date';
import { feedbackTap } from '@app/feedback';
import GoalCard from '@web/ui/components/GoalCard';
import { ProgressBar, ProgressRing } from '@web/ui/components/Bits';

function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

export default function HomeScreen({ onGoHabits }: { onGoHabits: () => void }) {
  const { data, toggleToday, hatchEgg } = useApp();
  const pendingEggs = data.pendingEggs?.length ?? 0;

  // Đồng hồ tick 1s — CHỈ khi có mục tiêu lặp theo phút — để nút tự mở lại + countdown chạy.
  const hasInterval = useMemo(() => data.habits.some((h) => intervalMs(h) != null), [data.habits]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!hasInterval) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [hasInterval]);

  const done = data.habits.reduce((n, h) => n + (isDoneNow(h, now) ? 1 : 0), 0);
  const total = data.habits.length;
  const allDone = total > 0 && done === total;

  // Đã đạt trần điểm nở HÔM NAY (làm thêm không tăng) -> báo cho khỏi tưởng kẹt.
  const today = todayStr();
  const hatchDoneToday =
    data.hatchDay === today && (data.hatchDayAdded ?? 0) >= HATCH_DAILY_CAP && data.perfectDay === today;

  const dateLabel = useMemo(
    () => new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }),
    []
  );
  const greeting = useMemo(greetingForNow, []);

  return (
    <div className="px-4 pt-6 pb-26">
      <header className="mb-4 flex items-center justify-between">
        <div className="mr-3 min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-ink-dim">{greeting} 👋</p>
          <h1 className="mt-0.5 text-[26px] leading-tight font-extrabold text-ink">Pokémon của tôi</h1>
          <p className="mt-0.5 truncate text-[13px] text-ink-dim first-letter:uppercase">{dateLabel}</p>
        </div>
        {total > 0 && <ProgressRing done={done} total={total} />}
      </header>

      {allDone && (
        <div className="mb-3 rounded-[12px] border border-green bg-green/15 p-3">
          <p className="text-center font-bold text-green">🎉 Tuyệt vời! Cả đàn hôm nay đều được chăm sóc!</p>
        </div>
      )}

      {pendingEggs > 0 && <EggReady count={pendingEggs} onHatch={hatchEgg} />}

      {total > 0 && (
        <section
          className={
            'mb-3 rounded-card border p-3 ' + (hatchDoneToday ? 'border-green/60 bg-green/10' : 'border-line bg-card')
          }
        >
          <div className="mb-1 flex items-center justify-between">
            <p className="text-sm font-extrabold text-ink">🥚 Trứng sắp nở</p>
            <p className={'text-[13px] font-extrabold ' + (hatchDoneToday ? 'text-green' : 'text-accent')}>
              {hatchDoneToday
                ? '✓ Đủ hôm nay'
                : `${Math.min(data.hatchMeter ?? 0, HATCH_THRESHOLD)}/${HATCH_THRESHOLD}`}
            </p>
          </div>
          <ProgressBar
            ratio={Math.min(1, (data.hatchMeter ?? 0) / HATCH_THRESHOLD)}
            color={hatchDoneToday ? 'var(--color-green)' : 'var(--color-accent)'}
          />
          <p className="mt-1 text-[11.5px] text-ink-dim">
            {hatchDoneToday
              ? '✨ Đã chăm đủ hôm nay — mai quay lại để nở tiếp!'
              : 'Chăm chỉ mỗi ngày để nở Pokémon mới vào Pokédex'}
          </p>
        </section>
      )}

      {total === 0 ? (
        <button
          type="button"
          onClick={() => {
            feedbackTap();
            onGoHabits();
          }}
          className="mt-6 grid w-full justify-items-center gap-1 rounded-card border border-dashed border-line bg-card p-6 text-center"
        >
          <span className="text-5xl">🎯</span>
          <span className="mt-2 text-base font-extrabold text-ink">Chưa có mục tiêu nào</span>
          <span className="text-[13px] text-ink-dim">Thêm mục tiêu đầu tiên — hoàn thành để nở Pokémon!</span>
          <span className="mt-4 rounded-pill bg-primary px-6 py-3 font-extrabold text-white">+ Thêm mục tiêu</span>
        </button>
      ) : (
        data.habits.map((h) => <GoalCard key={h.id} habit={h} now={now} onToggle={() => toggleToday(h.id)} />)
      )}
    </div>
  );
}

// Trứng chờ nở: lắc lư liên tục, chạm 3 lần để đập vỏ -> nở.
function EggReady({ count, onHatch }: { count: number; onHatch: () => void }) {
  const [taps, setTaps] = useState(0);
  const [shake, setShake] = useState(0);

  const tap = () => {
    feedbackTap();
    setShake((s) => s + 1); // đổi key -> animation lắc chạy lại
    const n = taps + 1;
    if (n >= 3) {
      setTaps(0);
      onHatch();
    } else {
      setTaps(n);
    }
  };

  return (
    <button
      type="button"
      onClick={tap}
      className="mb-3 flex w-full items-center rounded-card border-[1.5px] border-accent bg-accent/10 p-3 text-left"
    >
      <span key={shake} className="anim-shake inline-block text-[46px] leading-none">
        <span className="anim-wobble inline-block">🥚</span>
      </span>
      <span className="ml-3 min-w-0 flex-1">
        <span className="block text-[15px] font-extrabold text-ink">
          Trứng sẵn sàng nở!{count > 1 ? `  ×${count}` : ''}
        </span>
        <span className="mt-0.5 block text-[12.5px] font-bold text-accent">Chạm để đập vỏ · {taps}/3</span>
      </span>
    </button>
  );
}
