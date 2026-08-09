import { useEffect, useState } from 'react';
import { useApp } from '@app/AppContext';
import { habitStreak } from '@app/gameLogic';
import { todayStr } from '@app/date';
import { streakFire } from '@app/collection';
import { feedbackTap } from '@app/feedback';
import ThemeVars from '@web/ui/ThemeVars';
import Icon, { type IconName } from '@web/ui/Icon';
import usePwaInstall from '@web/ui/usePwaInstall';
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

// ===== Vỏ app =====
//
// KHÔNG phải bản phóng to của app điện thoại. Bản trước dựng một cột 480px giữa màn hình:
// trên máy tính 1440px thì 2/3 màn là nền trống, và thanh tab nổi ở đáy — đúng cử chỉ ngón
// tay, sai hoàn toàn với con trỏ chuột (đáy màn hình là chỗ xa tay nhất).
//
// Ở đây: cột điều hướng bên trái từ `lg` trở lên (chỗ mắt quét đầu tiên, và là nơi để HUD
// kẹo/chuỗi thường trú thay vì lặp lại ở header từng màn), thanh tab đáy chỉ còn cho điện
// thoại. Vùng nội dung tự giãn và mỗi màn tự quyết bố cục nhiều cột của nó.
export default function App() {
  const { ready } = useApp();
  const [tab, setTab] = useState<Tab>('home');

  return (
    <>
      <ThemeVars />
      <div className="relative flex h-full overflow-hidden">
        <div className="app-bg absolute inset-0" />
        <div className="app-stars pointer-events-none absolute inset-0" style={{ opacity: 'var(--stars, 1)' }} />

        {!ready ? (
          <Loading />
        ) : (
          <>
            <SideNav active={tab} onChange={setTab} />
            <MobileHeader />

            {/* key={tab} để hiệu ứng chuyển màn chạy lại mỗi lần đổi tab.
                Mobile chừa chỗ cho header cố định (48px + tai thỏ); desktop chỉ cần tai thỏ. */}
            <main
              key={tab}
              className="scroller anim-screen relative min-h-0 flex-1 pt-[calc(48px+env(safe-area-inset-top))] pb-24 lg:pt-[env(safe-area-inset-top)] lg:pb-0"
              aria-label={TABS.find((t) => t.key === tab)?.label}
            >
              {tab === 'home' && <HomeScreen onGoHabits={() => setTab('habits')} />}
              {tab === 'party' && <PartyScreen />}
              {tab === 'habits' && <HabitsScreen />}
              {tab === 'history' && <DexScreen />}
            </main>

            <TabBar active={tab} onChange={setTab} />
            <HatchOverlay />
          </>
        )}
      </div>
    </>
  );
}

function Loading() {
  return (
    <div className="relative grid flex-1 place-content-center justify-items-center gap-4">
      <Pokeball size={80} spin />
      <p className="font-semibold text-ink-dim">Đang tải Pokédex…</p>
    </div>
  );
}

// ===== Cột điều hướng (desktop) =====
function SideNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const { data, syncStatus, authReady } = useApp();
  const candy = Math.floor(data.candy ?? 0);
  const bestStreak = data.habits.reduce((m, h) => Math.max(m, habitStreak(h, todayStr())), 0);
  const fire = streakFire(bestStreak);
  const { canInstall, install } = usePwaInstall();

  return (
    <nav
      aria-label="Điều hướng chính"
      className="relative hidden w-(--nav-w) shrink-0 flex-col border-r border-line bg-bg-soft/70 px-3 py-5 backdrop-blur-sm lg:flex"
    >
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <Pokeball size={28} />
        <span className="text-[15px] font-extrabold tracking-tight text-ink">PokéHabit</span>
      </div>

      <ul className="grid gap-1">
        {TABS.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key}>
              <button
                type="button"
                aria-current={on ? 'page' : undefined}
                onClick={() => {
                  if (on) return;
                  feedbackTap();
                  onChange(t.key);
                }}
                className={
                  'flex w-full items-center gap-3 rounded-ctl px-3 py-2.5 text-left text-[14.5px] font-bold transition-colors ' +
                  (on
                    ? 'bg-primary/15 text-primary-soft'
                    : 'text-ink-dim hover:bg-card-alt/70 hover:text-ink')
                }
              >
                <Icon name={on ? t.icon : t.iconOutline} size={19} />
                {t.label}
                {/* Vạch chỉ mục bên trái: cho biết trang hiện tại mà không chỉ dựa vào màu. */}
                {on && <span className="ml-auto h-4 w-[3px] rounded-pill bg-primary-soft" />}
              </button>
            </li>
          );
        })}
      </ul>

      {/* HUD thường trú: kẹo + chuỗi. Nhờ nó mà header từng màn không phải lặp lại nữa. */}
      <div className="mt-auto grid gap-2">
        {canInstall && (
          <button
            type="button"
            onClick={() => {
              feedbackTap();
              void install();
            }}
            className="rounded-ctl border border-primary/60 bg-primary/15 px-3 py-2.5 text-[13px] font-extrabold text-primary-soft transition-colors hover:bg-primary/25"
          >
            ⬇ Cài PokéHabit như app
          </button>
        )}
        <div className="flex items-center justify-between rounded-ctl border border-line bg-card px-3 py-2.5">
          <span className="text-[12.5px] font-bold text-ink-dim">Kẹo</span>
          <span className="nums text-[15px] font-extrabold text-accent">🍬 {candy}</span>
        </div>
        <div className="flex items-center justify-between rounded-ctl border border-line bg-card px-3 py-2.5">
          <span className="text-[12.5px] font-bold text-ink-dim">Chuỗi</span>
          <span className="nums text-[15px] font-extrabold text-ink">
            {fire.emoji} {bestStreak} ngày
          </span>
        </div>
        {authReady && <SyncDot status={syncStatus} />}
      </div>
    </nav>
  );
}

// ===== Header mobile (cố định trên cùng, < lg) =====
// Điện thoại KHÔNG có cột trái nên trước đây kẹo/chuỗi vô hình — vào Cửa hàng trứng mà
// không biết mình có bao nhiêu kẹo. Header gọn: logo + HUD, kèm nút "Cài app" khi trình
// duyệt cho phép cài PWA (xem usePwaInstall).
function MobileHeader() {
  const { data } = useApp();
  const candy = Math.floor(data.candy ?? 0);
  const bestStreak = data.habits.reduce((m, h) => Math.max(m, habitStreak(h, todayStr())), 0);
  const fire = streakFire(bestStreak);
  const { canInstall, install } = usePwaInstall();

  return (
    <header
      className="fixed inset-x-0 top-0 z-30 border-b border-line bg-bg-soft/95 backdrop-blur-md lg:hidden"
      style={{ paddingTop: 'env(safe-area-inset-top)' }}
    >
      <div className="mx-auto flex h-12 max-w-3xl items-center gap-2 px-4">
        <Pokeball size={22} />
        <span className="text-[14px] font-extrabold tracking-tight text-ink">PokéHabit</span>
        {canInstall && (
          <button
            type="button"
            onClick={() => {
              feedbackTap();
              void install();
            }}
            className="ml-1 rounded-pill border border-primary/60 bg-primary/15 px-2.5 py-1 text-[11px] font-extrabold text-primary-soft"
          >
            ⬇ Cài app
          </button>
        )}
        <span className="nums ml-auto rounded-pill bg-card px-2.5 py-1 text-[12.5px] font-extrabold text-accent">
          🍬 {candy}
        </span>
        <span className="nums rounded-pill bg-card px-2.5 py-1 text-[12.5px] font-extrabold text-ink">
          {fire.emoji} {bestStreak}
        </span>
      </div>
    </header>
  );
}

// Trạng thái đồng bộ — một dòng nhỏ ở chân cột, không cần thẻ riêng.
function SyncDot({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: IconName }> = {
    idle: { label: 'Đã đồng bộ', cls: 'text-green', icon: 'cloud-done-outline' },
    syncing: { label: 'Đang đồng bộ…', cls: 'text-primary-soft', icon: 'sync' },
    error: { label: 'Lỗi đồng bộ', cls: 'text-red', icon: 'cloud-offline-outline' },
    off: { label: 'Chỉ lưu trên máy', cls: 'text-ink-dim', icon: 'cloud-offline-outline' },
  };
  const s = map[status] ?? map.idle;
  return (
    <p className={'flex items-center gap-2 px-3 pt-1 text-[12px] font-semibold ' + s.cls}>
      <Icon name={s.icon} size={14} />
      {s.label}
    </p>
  );
}

// ===== Thanh tab đáy (chỉ điện thoại) =====
function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      aria-label="Điều hướng chính"
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 flex justify-center border-t border-line bg-bg-soft/95 px-2 pt-1.5 pb-1.5 backdrop-blur-md lg:hidden"
    >
      <ul className="flex w-full max-w-md justify-around">
        {TABS.map((t) => {
          const on = t.key === active;
          return (
            <li key={t.key} className="flex-1">
              <button
                type="button"
                aria-current={on ? 'page' : undefined}
                onClick={() => {
                  if (on) return;
                  feedbackTap();
                  onChange(t.key);
                }}
                className={
                  'grid w-full justify-items-center gap-0.5 rounded-ctl py-1.5 transition-colors ' +
                  (on ? 'text-primary-soft' : 'text-ink-dim')
                }
              >
                <Icon name={on ? t.icon : t.iconOutline} size={22} />
                <span className="text-[11px] font-bold">{t.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
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
    shown.kind === 'duplicate'
      ? 'Chưa tìm được loài mới'
      : shown.kind === 'milestone'
        ? `🔥 Chuỗi ${shown.streak} ngày!`
        : shown.kind === 'evolve'
          ? '✨ Tiến hoá!'
          : '🎉 Pokémon mới!';
  const sub =
    shown.kind === 'duplicate'
      ? 'Bầy đã có hết những loài bốc trúng — trứng vẫn còn, thử lại nhé!'
      : shown.kind === 'milestone'
        ? 'Nhận 1 trứng HIẾM — shiny đảm bảo!'
        : shown.shiny
          ? 'Shiny! Cực kỳ may mắn ✨'
          : 'Đã thêm vào Pokédex';

  return (
    <div
      className="scrim anim-fade fixed inset-0 z-50 grid place-items-center"
      onClick={() => {
        setShown(null);
        clearHatchEvent();
      }}
    >
      <div className="anim-pop grid justify-items-center gap-2 px-6 text-center">
        {shown.id > 0 ? (
          <CreatureImage formId={shown.id} shiny={shown.shiny} size={200} />
        ) : (
          <span className="text-[110px] leading-none">{shown.kind === 'duplicate' ? '🔍' : '🥚'}</span>
        )}
        <p className="text-3xl font-extrabold tracking-tight text-white drop-shadow">{title}</p>
        <p className="font-semibold text-white/80">{sub}</p>
      </div>
    </div>
  );
}
