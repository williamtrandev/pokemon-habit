import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@app/AppContext';
import { intervalMs, isDoneNow } from '@app/gameLogic';
import { HATCH_DAILY_CAP, HATCH_THRESHOLD } from '@app/collection';
import { todayStr } from '@app/date';
import { feedbackTap } from '@app/feedback';
import GoalCard from '@web/ui/components/GoalCard';
import { ProgressBar, ProgressRing } from '@web/ui/components/Bits';
import { Card, Page, PageHead } from '@web/ui/components/Layout';

function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
}

// ===== Màn Hôm nay =====
// Bố cục hai cột từ `xl`: danh sách việc bên trái (thứ người dùng đến đây để BẤM), cột phụ
// bên phải giữ mấy con số theo dõi (tiến độ, thanh trứng). Bản cũ xếp dọc hết nên trên máy
// tính phải cuộn qua ba thẻ số liệu mới tới việc đầu tiên.
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

  // Chưa xong lên trước: việc cần làm nằm trên đầu, việc đã xong tụt xuống dưới.
  const ordered = useMemo(() => {
    const rows = data.habits.map((h) => ({ h, done: isDoneNow(h, now) }));
    return [...rows].sort((a, b) => Number(a.done) - Number(b.done));
  }, [data.habits, now]);

  if (total === 0) {
    return (
      <Page>
        <PageHead title="Hôm nay" sub={<span className="first-letter:uppercase">{dateLabel}</span>} />
        <div className="grid justify-items-center gap-2 rounded-card border border-dashed border-line bg-card px-6 py-16 text-center">
          <span className="text-5xl">🎯</span>
          <p className="mt-2 text-lg font-extrabold text-ink">Chưa có mục tiêu nào</p>
          <p className="max-w-sm text-sm text-ink-dim">
            Thêm mục tiêu đầu tiên. Hoàn thành mỗi ngày để nở trứng và nuôi Pokémon lớn lên.
          </p>
          <button
            type="button"
            onClick={() => {
              feedbackTap();
              onGoHabits();
            }}
            className="mt-4 rounded-pill bg-primary px-6 py-3 font-extrabold text-white transition-colors hover:brightness-110"
          >
            Thêm mục tiêu
          </button>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <PageHead
        title={greeting}
        sub={
          <>
            <span className="first-letter:uppercase">{dateLabel}</span>
            {' · '}
            <span className="nums font-semibold text-ink">
              {done}/{total}
            </span>{' '}
            mục tiêu xong
          </>
        }
      />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* ===== Cột việc cần làm ===== */}
        <div className="grid gap-3">
          {allDone && (
            <p className="rounded-card border border-green/50 bg-green/10 px-4 py-3 text-center font-bold text-green">
              🎉 Xong hết hôm nay — cả đàn đều được chăm sóc!
            </p>
          )}

          {pendingEggs > 0 && <EggReady count={pendingEggs} onHatch={hatchEgg} />}

          {ordered.map(({ h }) => (
            <GoalCard key={h.id} habit={h} now={now} onToggle={() => toggleToday(h.id)} />
          ))}
        </div>

        {/* ===== Cột theo dõi ===== */}
        {/* sticky: cuộn danh sách dài mà mấy con số vẫn nằm trong tầm mắt. */}
        <aside className="grid gap-3 xl:sticky xl:top-8">
          <Card className="grid justify-items-center gap-3">
            <ProgressRing done={done} total={total} size={132} stroke={9} />
            <p className="text-center text-[13px] font-semibold text-ink-dim">
              {allDone ? 'Hoàn hảo — hẹn mai!' : `Còn ${total - done} mục tiêu nữa là xong ngày`}
            </p>
          </Card>

          <Card
            title="🥚 Trứng sắp nở"
            tone={hatchDoneToday ? 'good' : 'plain'}
            aside={
              <span className={'nums text-[13px] font-extrabold ' + (hatchDoneToday ? 'text-green' : 'text-accent')}>
                {hatchDoneToday
                  ? '✓ Đủ hôm nay'
                  : `${Math.min(data.hatchMeter ?? 0, HATCH_THRESHOLD)}/${HATCH_THRESHOLD}`}
              </span>
            }
          >
            <ProgressBar
              ratio={Math.min(1, (data.hatchMeter ?? 0) / HATCH_THRESHOLD)}
              color={hatchDoneToday ? 'var(--color-green)' : 'var(--color-accent)'}
            />
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-dim">
              {hatchDoneToday
                ? 'Đã chăm đủ hôm nay — mai quay lại để nở tiếp.'
                : 'Chăm chỉ mỗi ngày để nở Pokémon mới vào Pokédex.'}
            </p>
          </Card>
        </aside>
      </div>
    </Page>
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
      className="flex w-full items-center gap-4 rounded-card border-[1.5px] border-accent bg-accent/10 p-4 text-left transition-colors hover:bg-accent/15"
    >
      <span key={shake} className="anim-shake inline-block text-[46px] leading-none">
        <span className="anim-wobble inline-block">🥚</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-extrabold text-ink">
          Trứng sẵn sàng nở{count > 1 ? ` ×${count}` : ''}
        </span>
        <span className="mt-0.5 block text-[13px] font-bold text-accent">Bấm để đập vỏ · {taps}/3</span>
      </span>
      {/* Ba vạch tiến trình đập vỏ: thấy được còn mấy nhịp, không chỉ dựa vào con số. */}
      <span className="flex shrink-0 gap-1" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span key={i} className={'h-1.5 w-5 rounded-pill ' + (i < taps ? 'bg-accent' : 'bg-accent/25')} />
        ))}
      </span>
    </button>
  );
}
