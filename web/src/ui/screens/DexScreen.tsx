import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@app/AppContext';
import { type ThemeMode, useTheme } from '@app/theme-context';
import { lastNDays, weekdayLabel } from '@app/date';
import { countDoneOnDate } from '@app/gameLogic';
import { TOTAL_POKEMON } from '@app/species';
import { type NotifStatus, getStatus, sendTestNotification } from '@app/notifications';
import Icon, { type IconName } from '@web/ui/Icon';
import { CreatureImage } from '@web/ui/components/Bits';
import FullDex from '@web/ui/components/FullDex';
import Switch from '@web/ui/components/Switch';
import AccountCard from '@web/ui/components/AccountCard';

const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'Hệ thống' },
  { key: 'light', label: 'Sáng' },
  { key: 'dark', label: 'Tối' },
];

// Bản web của ../src/screens/HistoryScreen.tsx (Pokédex + lịch 14 ngày + cài đặt + đồng bộ).
export default function DexScreen() {
  const { data, setSound, setHaptics, setMusic, resetAll } = useApp();
  const { mode, setMode } = useTheme();
  const days = useMemo(() => lastNDays(14), []);
  const total = data.habits.length;

  // Bộ sưu tập = các loài ĐÃ THU (nở từ kiên trì). Mỗi ô = 1 Pokémon đã get.
  const caught = useMemo(() => {
    const entries = Object.entries(data.collection ?? {}).map(([id, v]) => ({
      id: Number(id),
      shiny: !!v.shiny,
      at: v.at,
    }));
    entries.sort((a, b) => b.at - a.at); // mới get lên trước
    return entries;
  }, [data.collection]);
  const caughtIds = useMemo(() => new Set(caught.map((e) => e.id)), [caught]);

  const [showFullDex, setShowFullDex] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <div className="px-4 pt-6 pb-26">
        <h1 className="mb-4 text-2xl font-extrabold text-ink">Pokédex</h1>

        {/* Pokédex của bạn */}
        <section className="mb-4 rounded-card border border-line bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-ink">Pokédex của bạn</h2>
            <span className="text-[15px] font-extrabold text-primary-soft">
              {caught.length}/{TOTAL_POKEMON}
            </span>
          </div>
          {caught.length === 0 ? (
            <p className="mt-3 text-[11.5px] leading-relaxed text-ink-dim">
              Chưa thu được Pokémon nào. Hoàn thành mục tiêu để nở trứng!
            </p>
          ) : (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {caught.slice(0, 12).map((e) => (
                <div
                  key={e.id}
                  className="grid justify-items-center rounded-[12px] border border-primary bg-card-alt py-2 shadow-[0_2px_8px_rgba(139,92,246,0.4)]"
                >
                  <CreatureImage formId={e.id} shiny={e.shiny} size={54} />
                  <span className="w-full truncate px-1 text-center text-[9px] text-ink-dim">
                    {e.shiny ? '✨ Shiny' : `#${String(e.id).padStart(4, '0')}`}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-[11.5px] leading-relaxed text-ink-dim">
            Nở từ sự kiên trì — chăm chỉ mỗi ngày để thu thêm.
          </p>
          <button
            type="button"
            onClick={() => setShowFullDex(true)}
            className="mt-3 w-full rounded-[12px] border border-primary bg-primary/10 py-3 text-sm font-extrabold text-primary-soft"
          >
            Xem toàn bộ {TOTAL_POKEMON} loài →
          </button>
        </section>

        {/* Lịch 14 ngày */}
        <section className="mb-4 rounded-card border border-line bg-card p-4">
          <h2 className="text-base font-extrabold text-ink">14 ngày gần đây</h2>
          <p className="mt-0.5 mb-3 text-xs text-ink-dim">Đậm hơn = hoàn thành nhiều hơn</p>
          <div className="grid grid-cols-7 gap-y-2">
            {days.map((day) => {
              const dn = countDoneOnDate(data.habits, day);
              const ratio = total > 0 ? dn / total : 0;
              const bg = dn === 0 ? 'var(--color-track)' : `rgba(139, 92, 246, ${0.35 + ratio * 0.65})`;
              return (
                <div key={day} className="grid justify-items-center gap-0.5">
                  <span
                    className="grid size-9 place-items-center rounded-[8px] text-xs font-bold text-ink"
                    style={{ background: bg }}
                  >
                    {day.slice(8)}
                  </span>
                  <span className="text-[10px] text-ink-dim">{weekdayLabel(day)}</span>
                </div>
              );
            })}
          </div>
        </section>

        <NotificationCard reminderCount={data.habits.filter((h) => h.reminder).length} />
        <AccountCard />
        <SyncCard />
        <InstallCard />

        {/* Cài đặt */}
        <section className="mb-4 rounded-card border border-line bg-card p-4">
          <h2 className="text-base font-extrabold text-ink">Cài đặt</h2>

          {/* Máy hẹp (360px) không đủ chỗ cho nhãn + 3 nút trên một dòng -> xuống dòng. */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="shrink-0 text-[15px] font-semibold text-ink">🎨 Giao diện</span>
            <div className="flex rounded-[12px] border border-line bg-card-alt p-0.5">
              {THEME_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setMode(opt.key)}
                  className={
                    'rounded-[8px] px-3 py-1.5 text-xs font-bold whitespace-nowrap transition-colors ' +
                    (mode === opt.key ? 'bg-primary text-white' : 'text-ink-dim hover:text-ink')
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <SettingRow label="🔊 Âm thanh" checked={data.soundOn} onChange={setSound} />
          <SettingRow label="📳 Rung (haptics)" checked={data.hapticsOn} onChange={setHaptics} />
          <SettingRow label="🎵 Nhạc nền" checked={data.musicOn} onChange={setMusic} />

          {confirmReset ? (
            <div className="mt-4 rounded-[12px] border border-red bg-red/10 p-3">
              <p className="text-sm font-extrabold text-ink">Làm lại từ đầu?</p>
              <p className="mt-1 text-xs text-ink-dim">
                Toàn bộ mục tiêu và Pokémon sẽ bị xoá. Không thể hoàn tác. Nếu đang bật đồng bộ đám mây, bản trên máy
                khác cũng bị ghi đè theo.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    void resetAll();
                    setConfirmReset(false);
                  }}
                  className="flex-1 rounded-pill bg-red py-2.5 text-sm font-extrabold text-white"
                >
                  Xoá hết
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="flex-1 rounded-pill border border-line bg-card py-2.5 text-sm font-extrabold text-ink"
                >
                  Huỷ
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="mt-4 w-full rounded-[12px] border border-red py-3 font-extrabold text-red"
            >
              Làm lại từ đầu
            </button>
          )}
        </section>

        <p className="text-center text-xs text-ink-dim">Chăm chỉ mỗi ngày để thu thập cả Pokédex 🐉</p>
      </div>

      {showFullDex && <FullDex caught={caughtIds} onClose={() => setShowFullDex(false)} />}
    </>
  );
}

function SettingRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="mt-3 flex items-center justify-between">
      <span className="text-[15px] font-semibold text-ink">{label}</span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}

// Quyền thông báo của trình duyệt + gửi thử (thay NotificationCard.tsx của app).
function NotificationCard({ reminderCount }: { reminderCount: number }) {
  const [status, setStatus] = useState<NotifStatus | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    void getStatus().then(setStatus);
  }, []);

  if (status === 'unsupported') {
    return (
      <section className="mb-4 rounded-card border border-line bg-card p-4">
        <h2 className="text-base font-extrabold text-ink">🔔 Nhắc nhở</h2>
        <p className="mt-1 text-[12.5px] text-ink-dim">
          Trình duyệt này không hỗ trợ thông báo. Dùng app trên điện thoại để được nhắc.
        </p>
      </section>
    );
  }

  const tone = status === 'granted' ? 'text-green' : status === 'denied' ? 'text-red' : 'text-accent';
  const label =
    status === 'granted'
      ? `Đã bật · ${reminderCount} mục tiêu có nhắc`
      : status === 'denied'
        ? 'Bị chặn — bật lại ở biểu tượng ổ khoá trên thanh địa chỉ'
        : 'Chưa cấp quyền';

  return (
    <section className="mb-4 rounded-card border border-line bg-card p-4">
      <h2 className="text-base font-extrabold text-ink">🔔 Nhắc nhở</h2>
      <p className={'mt-1 text-[12.5px] font-semibold ' + tone}>{label}</p>
      <p className="mt-1 text-[11.5px] text-ink-dim">
        Nhắc nhở trên web chỉ chạy khi tab còn mở. Cài PokéHabit lên máy (xem thẻ dưới) để mở nhanh và luôn sẵn sàng.
      </p>
      <button
        type="button"
        onClick={async () => {
          const ok = await sendTestNotification();
          setSent(ok);
          setStatus(await getStatus());
        }}
        className="mt-3 w-full rounded-[12px] border border-primary bg-primary/10 py-2.5 text-sm font-extrabold text-primary-soft"
      >
        {sent ? 'Đã gửi — chờ 3 giây…' : 'Gửi thông báo thử'}
      </button>
    </section>
  );
}

// Trạng thái đồng bộ đám mây (khớp SyncCard.tsx của app).
const SYNC_STATUS: Record<string, { label: string; icon: IconName; tone: 'ok' | 'busy' | 'err' }> = {
  idle: { label: 'Đã đồng bộ đám mây', icon: 'cloud-done-outline', tone: 'ok' },
  syncing: { label: 'Đang đồng bộ…', icon: 'sync', tone: 'busy' },
  error: { label: 'Lỗi đồng bộ — sẽ thử lại', icon: 'cloud-offline-outline', tone: 'err' },
  off: { label: '', icon: 'cloud-offline-outline', tone: 'busy' },
};

function SyncCard() {
  const { authReady, syncStatus } = useApp();
  if (!authReady) return null;

  const s = SYNC_STATUS[syncStatus] ?? SYNC_STATUS.idle;
  const cls = s.tone === 'err' ? 'text-red' : s.tone === 'busy' ? 'text-primary-soft' : 'text-green';

  return (
    <section className="mb-4 flex items-center gap-3 rounded-card border border-line bg-card p-4">
      <Icon name={s.icon} size={18} className={cls} />
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-bold text-ink">Đồng bộ đám mây</p>
        <p className={'mt-0.5 text-[12.5px] font-semibold ' + cls}>{s.label}</p>
      </div>
    </section>
  );
}

// Hướng dẫn cài PWA — cài lên máy thì mở nhanh như app, có icon riêng, chạy được offline.
function InstallCard() {
  const standalone =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(display-mode: standalone)').matches ||
      // iOS Safari không theo chuẩn display-mode khi cài lên màn hình chính.
      (window.navigator as { standalone?: boolean }).standalone === true);

  if (standalone) {
    return (
      <section className="mb-4 rounded-card border border-green/60 bg-green/10 p-4">
        <p className="text-[15px] font-bold text-ink">✓ Đang chạy như app đã cài</p>
        <p className="mt-1 text-[12.5px] text-ink-dim">Mở offline được; dữ liệu vẫn đồng bộ khi có mạng.</p>
      </section>
    );
  }

  return (
    <section className="mb-4 rounded-card border border-line bg-card p-4">
      <h2 className="text-base font-extrabold text-ink">📲 Cài lên máy</h2>
      <p className="mt-1 text-[12.5px] text-ink-dim">
        Cài PokéHabit thành app: có icon riêng, mở toàn màn hình, dùng được cả khi mất mạng.
      </p>
      <ul className="mt-2 grid gap-1 text-[11.5px] text-ink-dim">
        <li>· Chrome/Edge trên máy tính: bấm biểu tượng cài đặt ở thanh địa chỉ</li>
        <li>· Safari trên iPhone: Chia sẻ → Thêm vào MH chính</li>
        <li>· Chrome trên Android: menu ⋮ → Cài ứng dụng</li>
      </ul>
    </section>
  );
}
