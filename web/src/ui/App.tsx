import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@app/AppContext';
import { feedbackTap } from '@app/feedback';
import ThemeVars from '@web/ui/ThemeVars';
import Icon, { type IconName } from '@web/ui/Icon';
import { CreatureImage, Pokeball } from '@web/ui/components/Bits';
import HomeScreen from '@web/ui/screens/HomeScreen';
import PartyScreen from '@web/ui/screens/PartyScreen';
import HabitsScreen from '@web/ui/screens/HabitsScreen';
import DexScreen from '@web/ui/screens/DexScreen';

type Tab = 'home' | 'party' | 'habits' | 'history';

// Cùng thứ tự và nhãn với TABS trong ../App.tsx của app native.
const TABS: { key: Tab; label: string; icon: IconName; iconOutline: IconName }[] = [
  { key: 'home', label: 'Hôm nay', icon: 'checkmark-done', iconOutline: 'checkmark-done-outline' },
  { key: 'party', label: 'Bầy', icon: 'heart', iconOutline: 'heart-outline' },
  { key: 'habits', label: 'Mục tiêu', icon: 'flag', iconOutline: 'flag-outline' },
  { key: 'history', label: 'Pokédex', icon: 'albums', iconOutline: 'albums-outline' },
];

export default function App() {
  const { ready } = useApp();
  const [tab, setTab] = useState<Tab>('home');

  return (
    <>
      <ThemeVars />
      <div className="relative flex h-full justify-center overflow-hidden">
        {/* Nền bầu trời + quầng sáng, phủ toàn màn hình chứ không chỉ trong khung. */}
        <div className="app-bg absolute inset-0" />
        <div className="app-glow pointer-events-none absolute inset-0" />
        <Stars />

        {/* Khung dọc giữa màn: trên điện thoại là full, trên desktop giữ 480px cho dễ đọc. */}
        <main className="relative flex h-full w-full max-w-[480px] min-h-0 flex-col sm:border-x sm:border-line sm:shadow-[0_0_60px_rgba(0,0,0,0.35)]">
          {!ready ? (
            <Loading />
          ) : (
            <>
              {/* key={tab} để hiệu ứng chuyển màn chạy lại mỗi lần đổi tab. */}
              <div key={tab} className="screen anim-screen safe-top min-h-0 flex-1">
                {tab === 'home' && <HomeScreen onGoHabits={() => setTab('habits')} />}
                {tab === 'party' && <PartyScreen />}
                {tab === 'habits' && <HabitsScreen />}
                {tab === 'history' && <DexScreen />}
              </div>

              <TabBar active={tab} onChange={setTab} />
              <HatchOverlay />
            </>
          )}
        </main>
      </div>
    </>
  );
}

function Loading() {
  return (
    <div className="grid flex-1 place-content-center justify-items-center gap-4">
      <Pokeball size={92} spin />
      <p className="font-bold text-ink-dim">Đang tải Pokédex...</p>
    </div>
  );
}

// Sao trời tĩnh — sinh MỘT LẦN rồi giữ nguyên, không nhảy mỗi lần render.
function Stars() {
  const stars = useMemo(
    () =>
      Array.from({ length: 42 }, (_, i) => ({
        id: i,
        top: Math.random() * 100,
        left: Math.random() * 100,
        size: Math.random() * 1.8 + 0.8,
        opacity: Math.random() * 0.5 + 0.25,
      })),
    []
  );

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {stars.map((s) => (
        <span
          key={s.id}
          className="absolute rounded-full bg-white"
          style={{ top: `${s.top}%`, left: `${s.left}%`, width: s.size, height: s.size, opacity: s.opacity }}
        />
      ))}
    </div>
  );
}

// Thanh điều hướng nổi: tab đang chọn phình thành viên đỏ Poké Ball kèm nhãn.
function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      role="tablist"
      className="safe-bottom pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-4"
    >
      <div className="pointer-events-auto flex items-center gap-1 rounded-pill border border-line bg-bg-soft px-2 py-2 shadow-[0_10px_20px_rgba(0,0,0,0.28)]">
        {TABS.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={on}
              aria-label={t.label}
              onClick={() => {
                if (on) return;
                feedbackTap();
                onChange(t.key);
              }}
              className={
                'flex h-12 min-w-12 items-center justify-center rounded-pill transition-all duration-200 ' +
                (on
                  ? 'bg-linear-to-br from-[#FF5A5A] to-[#E4222B] px-4 text-white shadow-[0_4px_12px_rgba(228,34,43,0.5)]'
                  : 'px-3 text-ink-dim hover:text-ink')
              }
            >
              <Icon name={on ? t.icon : t.iconOutline} size={on ? 20 : 23} />
              {on && <span className="ml-2 truncate text-[13px] font-extrabold">{t.label}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}

// Lớp phủ ăn mừng: nở con mới / tiến hoá / đạt mốc chuỗi. Tự tắt sau 2.2s.
function HatchOverlay() {
  const { hatchEvent, clearHatchEvent } = useApp();
  const [shown, setShown] = useState(hatchEvent);

  useEffect(() => {
    if (!hatchEvent) return;
    setShown(hatchEvent);
    const id = window.setTimeout(() => {
      setShown(null);
      clearHatchEvent();
    }, 2200);
    return () => window.clearTimeout(id);
  }, [hatchEvent, clearHatchEvent]);

  if (!shown) return null;

  const title =
    shown.kind === 'milestone'
      ? `🔥 Chuỗi ${shown.streak} ngày!`
      : shown.kind === 'evolve'
        ? '✨ Tiến hoá!'
        : '🎉 Pokémon mới!';
  const sub =
    shown.kind === 'milestone'
      ? 'Nhận 1 trứng HIẾM — shiny đảm bảo!'
      : shown.shiny
        ? 'Shiny! Cực kỳ may mắn ✨'
        : 'Đã thêm vào Pokédex';

  return (
    <div
      className="scrim absolute inset-0 z-50 grid place-items-center"
      onClick={() => {
        setShown(null);
        clearHatchEvent();
      }}
    >
      <div className="anim-pop grid justify-items-center gap-2 px-6 text-center">
        {shown.id > 0 ? (
          <CreatureImage formId={shown.id} shiny={shown.shiny} size={190} />
        ) : (
          <span className="text-[110px] leading-none">🥚</span>
        )}
        <p className="text-2xl font-extrabold text-white drop-shadow">{title}</p>
        <p className="font-bold text-white/80">{sub}</p>
      </div>
    </div>
  );
}
