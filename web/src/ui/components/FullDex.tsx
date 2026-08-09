import { useCallback, useEffect, useMemo, useState } from 'react';
import { type EvoChain, type MegaForm, MAX_EVO_CHAIN, fetchEvolutionChain } from '@app/species';
import { fetchMegas } from '@app/megaForms';
import { CreatureImage } from '@web/ui/components/Bits';
import Dialog from '@web/ui/components/Dialog';
import Icon from '@web/ui/Icon';

interface Props {
  onClose: () => void;
  caught: Set<number>; // id các loài đã get (tô sáng trong cây tiến hoá)
}

const CHAIN_IDS = Array.from({ length: MAX_EVO_CHAIN }, (_, i) => i + 1);
const PAGE = 60; // số dòng tiến hoá nạp thêm mỗi lần cuộn tới đáy

// Bản web của ../src/components/FullDexModal.tsx.
// App dùng FlatList ảo hoá; web dùng cuộn vô hạn theo trang: mỗi ô tự tra chain khi được
// render, nên chỉ phần đang xem mới gọi PokéAPI (service worker cache lại cho lần sau).
//
// Lưới ở đây tự đếm số cột theo bề rộng (auto-fill) chứ không cố định 3 cột như bản điện
// thoại: màn 1440px xếp được 12 con một hàng, nên cuộn ít hơn hẳn.
export default function FullDex({ onClose, caught }: Props) {
  const [selected, setSelected] = useState<EvoChain | null>(null);
  const [limit, setLimit] = useState(PAGE);
  // chainId rỗng/404 -> ẩn hẳn ô (không hiện ô trống).
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const markEmpty = useCallback((id: number) => setHidden((h) => (h.has(id) ? h : new Set(h).add(id))), []);
  const ids = useMemo(() => CHAIN_IDS.filter((n) => !hidden.has(n)).slice(0, limit), [hidden, limit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Chỉ đóng cả bảng khi KHÔNG có cây tiến hoá nào đang mở; hộp thoại con tự xử Esc của nó.
      if (e.key === 'Escape' && !selected) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onClose]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 600) {
      setLimit((n) => Math.min(MAX_EVO_CHAIN, n + PAGE));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-bg">
      <div className="app-bg absolute inset-0 opacity-60" />

      <header className="safe-top relative flex items-center justify-between gap-4 border-b border-line px-5 py-4 lg:px-8">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight text-ink lg:text-2xl">Toàn bộ Pokédex</h2>
          <p className="mt-0.5 text-[13px] text-ink-dim">
            Dạng cơ bản của {MAX_EVO_CHAIN} dòng tiến hoá · bấm một con để xem cả cây
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex shrink-0 items-center gap-2 rounded-pill border border-line bg-card px-4 py-2 text-[13px] font-extrabold text-ink-dim transition-colors hover:text-ink"
        >
          Đóng
          <kbd className="rounded border border-line px-1.5 py-px font-sans text-[10px] font-black">Esc</kbd>
        </button>
      </header>

      <div className="scroller relative min-h-0 flex-1" onScroll={onScroll}>
        <div className="mx-auto max-w-[1500px] p-5 lg:p-8">
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2.5">
            {ids.map((chainId) => (
              <li key={chainId}>
                <BaseCell chainId={chainId} caught={caught} onOpen={setSelected} onEmpty={markEmpty} />
              </li>
            ))}
          </ul>
          {limit < MAX_EVO_CHAIN && <p className="py-6 text-center text-[13px] text-ink-dim">Cuộn để tải thêm…</p>}
        </div>
      </div>

      <Dialog
        open={!!selected}
        onClose={() => setSelected(null)}
        size="lg"
        title={selected ? selected.line[0].name : ''}
        subtitle={selected ? `Cây tiến hoá · ${selected.line.length} bậc` : undefined}
      >
        {selected && <ChainBody chain={selected} caught={caught} />}
      </Dialog>
    </div>
  );
}

// Một ô dạng cơ bản — tự tra chain khi mount.
function BaseCell({
  chainId,
  caught,
  onOpen,
  onEmpty,
}: {
  chainId: number;
  caught: Set<number>;
  onOpen: (c: EvoChain) => void;
  onEmpty: (id: number) => void;
}) {
  const [chain, setChain] = useState<EvoChain | null>(null);

  useEffect(() => {
    let alive = true;
    fetchEvolutionChain(chainId).then((c) => {
      if (!alive) return;
      if (!c) {
        onEmpty(chainId);
        return;
      }
      setChain(c);
    });
    return () => {
      alive = false;
    };
  }, [chainId, onEmpty]);

  const base = chain?.line[0];
  const got = !!base && caught.has(base.id);

  return (
    <button
      type="button"
      disabled={!chain}
      onClick={() => chain && onOpen(chain)}
      className={
        'grid w-full justify-items-center gap-0.5 rounded-card border bg-card p-2 transition-colors ' +
        (got ? 'border-primary/70 bg-primary/8 hover:border-primary' : 'border-line hover:border-primary/50')
      }
    >
      {base ? (
        <CreatureImage formId={base.id} size={62} tint={got ? undefined : 'dim'} />
      ) : (
        <span className="grid size-[62px] place-items-center text-ink-dim">
          <span className="anim-spin-slow inline-block size-4 rounded-full border-2 border-current border-t-transparent" />
        </span>
      )}
      <span className="w-full truncate px-1 text-center text-[11.5px] font-bold text-ink capitalize">
        {base?.name ?? ''}
      </span>
      <span className={'w-full truncate px-1 text-center text-[10px] font-bold ' + (got ? 'text-green' : 'text-ink-dim')}>
        {got ? '✓ Đã get' : chain && chain.line.length > 1 ? `${chain.line.length} bậc` : ' '}
      </span>
    </button>
  );
}

// Cây tiến hoá của một dòng: base → ... + Mega (nếu có). Con đã get tô sáng.
function ChainBody({ chain, caught }: { chain: EvoChain; caught: Set<number> }) {
  const [megas, setMegas] = useState<MegaForm[] | null>(null); // null = đang tra

  useEffect(() => {
    let alive = true;
    setMegas(null);
    const finalId = chain.line[chain.line.length - 1].id;
    fetchMegas(finalId).then((ms) => {
      if (alive) setMegas(ms);
    });
    return () => {
      alive = false;
    };
  }, [chain]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {chain.line.map((f, i) => (
          <div key={f.id} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-2xl text-ink-dim">›</span>}
            <ChainNode id={f.id} name={f.name} got={caught.has(f.id)} accent="var(--color-primary)" />
          </div>
        ))}
        {megas && megas.length > 0 && (
          <>
            <span className="text-2xl text-ink-dim">»</span>
            {megas.map((m) => (
              <ChainNode key={m.id} id={m.id} name={m.name} got={caught.has(m.id)} accent="var(--color-accent)" />
            ))}
          </>
        )}
      </div>
      {megas == null && (
        <p className="mt-3 flex items-center justify-center gap-2 text-[12.5px] text-ink-dim">
          <Icon name="sync" size={13} className="anim-spin-slow" />
          Đang tra dạng đặc biệt…
        </p>
      )}
    </>
  );
}

function ChainNode({ id, name, got, accent }: { id: number; name: string; got: boolean; accent: string }) {
  return (
    <div
      className="grid w-28 shrink-0 justify-items-center gap-0.5 rounded-card border bg-card-alt py-3"
      style={{ borderColor: got ? accent : 'var(--color-line)' }}
    >
      <CreatureImage formId={id} size={72} tint={got ? undefined : 'dim'} />
      <span className="w-full truncate px-1 text-center text-[12px] font-bold text-ink capitalize">{name}</span>
      <span className={'text-[10px] font-bold ' + (got ? 'text-green' : 'text-ink-dim')}>
        {got ? '✓ Đã get' : 'chưa get'}
      </span>
    </div>
  );
}
