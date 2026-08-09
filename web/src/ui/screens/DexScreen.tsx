import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@app/AppContext';
import { type ThemeMode, useTheme } from '@app/theme-context';
import { lastNDays, weekdayLabel } from '@app/date';
import { countDoneOnDate } from '@app/gameLogic';
import { TOTAL_POKEMON } from '@app/species';
import { type NotifStatus, getStatus, sendTestNotification } from '@app/notifications';
import Icon from '@web/ui/Icon';
import { CreatureImage } from '@web/ui/components/Bits';
import FullDex from '@web/ui/components/FullDex';
import Switch from '@web/ui/components/Switch';
import AccountCard from '@web/ui/components/AccountCard';
import { Card, Page, PageHead } from '@web/ui/components/Layout';

const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
  { key: 'system', label: 'Hệ thống' },
  { key: 'light', label: 'Sáng' },
  { key: 'dark', label: 'Tối' },
];

// Bản web của ../src/screens/HistoryScreen.tsx (Pokédex + lịch + cài đặt + đồng bộ).
// Bản cũ xếp bảy thẻ thành một cột dài. Trên máy tính thành ra cuộn cả ngàn pixel qua một
// dải thẻ hẹp giữa hai vùng trống, nên ở đây chia hai cột: bộ sưu tập + lịch bên trái (thứ
// người dùng vào đây để XEM), tài khoản và cài đặt bên phải (thứ chỉnh một lần rồi thôi).
export default function DexScreen() {
  const { data, setSound, setHaptics, setMusic, resetAll } = useApp();
  const { mode, setMode } = useTheme();
  const days = useMemo(() => lastNDays(28), []);
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
  const pct = Math.round((caught.length / TOTAL_POKEMON) * 100);

  return (
    <>
      <Page wide>
        <PageHead title="Pokédex" sub={`${caught.length}/${TOTAL_POKEMON} loài đã thu · ${pct}%`}>
          <button
            type="button"
            onClick={() => setShowFullDex(true)}
            className="rounded-pill border border-primary bg-primary/10 px-5 py-2.5 text-[13.5px] font-extrabold text-primary-soft transition-colors hover:bg-primary/20"
          >
            Xem toàn bộ {TOTAL_POKEMON} loài
          </button>
        </PageHead>

        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
          {/* ===== Cột trái: thứ để XEM ===== */}
          <div className="grid gap-4">
            <Card
              title="Đã thu được"
              aside={
                <span className="nums text-[13px] font-extrabold text-primary-soft">
                  {caught.length}/{TOTAL_POKEMON}
                </span>
              }
            >
              {caught.length === 0 ? (
                <p className="py-6 text-center text-[13px] text-ink-dim">
                  Chưa thu được Pokémon nào. Hoàn thành mục tiêu để nở trứng.
                </p>
              ) : (
                <ul className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
                  {caught.map((e) => (
                    <li
                      key={e.id}
                      className="grid justify-items-center gap-0.5 rounded-ctl border border-line bg-card-alt py-2 transition-colors hover:border-primary/60"
                    >
                      <CreatureImage formId={e.id} shiny={e.shiny} size={56} />
                      <span className="nums w-full truncate px-1 text-center text-[10px] text-ink-dim">
                        {e.shiny ? '✨ Shiny' : `#${String(e.id).padStart(4, '0')}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            {/* 28 ngày thay vì 14: màn rộng chứa được gấp đôi mà không cần cuộn thêm, và
                bốn tuần cho thấy được nhịp tuần (cuối tuần hay bỏ) — 14 ngày thì không. */}
            <Card title="4 tuần gần đây" aside={<span className="text-[12px] text-ink-dim">Đậm hơn = làm nhiều hơn</span>}>
              <div className="grid grid-cols-7 gap-1.5">
                {days.map((day) => {
                  const dn = countDoneOnDate(data.habits, day);
                  const ratio = total > 0 ? dn / total : 0;
                  const bg = dn === 0 ? 'var(--color-track)' : `color-mix(in srgb, var(--color-primary) ${25 + ratio * 75}%, transparent)`;
                  return (
                    <div key={day} className="grid justify-items-center gap-0.5">
                      <span
                        className="nums grid aspect-square w-full place-items-center rounded-ctl text-[12.5px] font-bold text-ink"
                        style={{ background: bg }}
                        title={`${day}: ${dn}/${total} mục tiêu`}
                      >
                        {day.slice(8)}
                      </span>
                      <span className="text-[10px] text-ink-dim">{weekdayLabel(day)}</span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          {/* ===== Cột phải: thứ chỉnh một lần ===== */}
          <div className="grid gap-4">
            <AccountCard />
            <NotificationCard reminderCount={data.habits.filter((h) => h.reminder).length} />
            <InstallCard />

            <Card title="Cài đặt">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-[14.5px] font-semibold text-ink">Giao diện</span>
                <div className="flex rounded-pill border border-line bg-card-alt p-0.5">
                  {THEME_OPTIONS.map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setMode(opt.key)}
                      aria-pressed={mode === opt.key}
                      className={
                        'rounded-pill px-3 py-1.5 text-[12.5px] font-bold whitespace-nowrap transition-colors ' +
                        (mode === opt.key ? 'bg-primary text-white' : 'text-ink-dim hover:text-ink')
                      }
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-1 divide-y divide-line">
                <SettingRow label="Âm thanh" checked={data.soundOn} onChange={setSound} />
                <SettingRow label="Rung (haptics)" checked={data.hapticsOn} onChange={setHaptics} />
                <SettingRow label="Nhạc nền" checked={data.musicOn} onChange={setMusic} />
              </div>

              {confirmReset ? (
                <div className="mt-4 rounded-ctl border border-red/60 bg-red/10 p-3">
                  <p className="text-[14px] font-extrabold text-ink">Làm lại từ đầu?</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-ink-dim">
                    Toàn bộ mục tiêu và Pokémon sẽ bị xoá. Không thể hoàn tác. Nếu đang bật đồng bộ đám mây, bản trên
                    máy khác cũng bị ghi đè theo.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void resetAll();
                        setConfirmReset(false);
                      }}
                      className="flex-1 rounded-pill bg-red py-2.5 text-[13px] font-extrabold text-white"
                    >
                      Xoá hết
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="flex-1 rounded-pill border border-line bg-card py-2.5 text-[13px] font-extrabold text-ink"
                    >
                      Huỷ
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="mt-4 w-full rounded-pill border border-red/60 py-2.5 text-[13px] font-extrabold text-red transition-colors hover:bg-red/10"
                >
                  Làm lại từ đầu
                </button>
              )}
            </Card>
          </div>
        </div>
      </Page>

      {showFullDex && <FullDex caught={caughtIds} onClose={() => setShowFullDex(false)} />}
    </>
  );
}

function SettingRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-3">
      <span className="text-[14.5px] font-semibold text-ink">{label}</span>
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
      <Card title="Nhắc nhở">
        <p className="text-[12.5px] text-ink-dim">
          Trình duyệt này không hỗ trợ thông báo. Dùng app trên điện thoại để được nhắc.
        </p>
      </Card>
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
    <Card title="Nhắc nhở">
      <p className={'text-[13px] font-semibold ' + tone}>{label}</p>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-dim">
        Nhắc nhở trên web chỉ chạy khi tab còn mở. Cài PokéHabit lên máy để mở nhanh và luôn sẵn sàng.
      </p>
      <button
        type="button"
        onClick={async () => {
          const ok = await sendTestNotification();
          setSent(ok);
          setStatus(await getStatus());
        }}
        className="mt-3 w-full rounded-pill border border-primary bg-primary/10 py-2.5 text-[13px] font-extrabold text-primary-soft transition-colors hover:bg-primary/20"
      >
        {sent ? 'Đã gửi — chờ 3 giây…' : 'Gửi thông báo thử'}
      </button>
    </Card>
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
      <Card tone="good">
        <p className="flex items-center gap-2 text-[14.5px] font-bold text-ink">
          <Icon name="checkmark-done" size={17} className="text-green" />
          Đang chạy như app đã cài
        </p>
        <p className="mt-1 text-[12.5px] text-ink-dim">Mở offline được; dữ liệu vẫn đồng bộ khi có mạng.</p>
      </Card>
    );
  }

  return (
    <Card title="Cài lên máy">
      <p className="text-[12.5px] leading-relaxed text-ink-dim">
        Cài PokéHabit thành app: có icon riêng, mở toàn màn hình, dùng được cả khi mất mạng.
      </p>
      <ul className="mt-2 grid gap-1 text-[12px] text-ink-dim">
        <li>Chrome/Edge trên máy tính: bấm biểu tượng cài đặt ở thanh địa chỉ</li>
        <li>Safari trên iPhone: Chia sẻ → Thêm vào MH chính</li>
        <li>Chrome trên Android: menu ⋮ → Cài ứng dụng</li>
      </ul>
    </Card>
  );
}

// Thẻ "Đồng bộ đám mây" cũ đã bỏ: trạng thái đó giờ nằm thường trú ở chân cột điều hướng
// (xem SyncDot trong App.tsx). Nó là thông tin để NGÓ, không phải một mục cài đặt.
