import { useCallback, useEffect, useMemo, useState } from 'react';
import { type EvoChain, type MegaForm, MAX_EVO_CHAIN, fetchEvolutionChain } from '@app/species';
import { fetchMegas } from '@app/megaForms';
import { CreatureImage } from '@web/ui/components/Bits';
import Icon from '@web/ui/Icon';

interface Props {
  onClose: () => void;
  caught: Set<number>; // id các loài đã get (tô sáng trong cây tiến hoá)
}

const CHAIN_IDS = Array.from({ length: MAX_EVO_CHAIN }, (_, i) => i + 1);
const PAGE = 36; // số dòng tiến hoá nạp thêm mỗi lần cuộn tới đáy

// Bản web của ../src/components/FullDexModal.tsx.
// App dùng FlatList ảo hoá; web dùng cuộn vô hạn theo trang: mỗi ô tự tra chain khi được
// render, nên chỉ phần đang xem mới gọi PokéAPI (service worker cache lại cho lần sau).
export default function FullDex({ onClose, caught }: Props) {
  const [selected, setSelected] = useState<EvoChain | null>(null);
  const [limit, setLimit] = useState(PAGE);
  // chainId rỗng/404 -> ẩn hẳn ô (không hiện ô trống).
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const markEmpty = useCallback((id: number) => setHidden((h) => (h.has(id) ? h : new Set(h).add(id))), []);
  const ids = useMemo(() => CHAIN_IDS.filter((n) => !hidden.has(n)).slice(0, limit), [hidden, limit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (selected) setSelected(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, onClose]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) {
      setLimit((n) => Math.min(MAX_EVO_CHAIN, n + PAGE));
    }
  };

  return (
    <div className="absolute inset-0 z-50 flex flex-col bg-bg">
      <div className="safe-top flex items-center justify-between border-b border-line px-4 pt-4 pb-3">
        <div>
          <h2 className="text-xl font-extrabold text-ink">Toàn bộ Pokédex</h2>
          <p className="mt-0.5 text-xs text-ink-dim">Dạng cơ bản · chạm để xem cây tiến hoá</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng"
          className="grid size-9 place-items-center rounded-full bg-card text-ink-dim hover:text-ink"
        >
          <Icon name="close" size={18} />
        </button>
      </div>

      <div className="screen min-h-0 flex-1 p-4" onScroll={onScroll}>
        <div className="grid grid-cols-3 gap-2">
          {ids.map((chainId) => (
            <BaseCell key={chainId} chainId={chainId} caught={caught} onOpen={setSelected} onEmpty={markEmpty} />
          ))}
        </div>
        {limit < MAX_EVO_CHAIN && <p className="py-4 text-center text-xs text-ink-dim">Cuộn để tải thêm…</p>}
      </div>

      {selected && <ChainSheet chain={selected} caught={caught} onClose={() => setSelected(null)} />}
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
        'grid justify-items-center gap-0.5 rounded-[12px] border bg-card-alt py-2 ' +
        (got ? 'border-primary shadow-[0_2px_8px_rgba(139,92,246,0.4)]' : 'border-line')
      }
    >
      {base ? (
        <CreatureImage formId={base.id} size={58} tint={got ? undefined : 'dim'} />
      ) : (
        <span className="grid size-[58px] place-items-center text-ink-dim">
          <span className="anim-spin-slow inline-block size-4 rounded-full border-2 border-current border-t-transparent" />
        </span>
      )}
      <span className="w-full truncate px-1 text-center text-[11px] font-bold text-ink capitalize">
        {base?.name ?? ''}
      </span>
      <span
        className={'w-full truncate px-1 text-center text-[9px] font-bold ' + (got ? 'text-green' : 'text-ink-dim')}
      >
        {got ? '✓ Đã get' : chain && chain.line.length > 1 ? `${chain.line.length} bậc` : ' '}
      </span>
    </button>
  );
}

// Sheet cây tiến hoá của 1 dòng: base → ... + Mega (nếu có). Con đã get tô sáng.
function ChainSheet({ chain, caught, onClose }: { chain: EvoChain; caught: Set<number>; onClose: () => void }) {
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
    <div className="absolute inset-0 z-10 flex flex-col justify-end">
      <button type="button" aria-label="Đóng" onClick={onClose} className="scrim absolute inset-0 cursor-default" />
      <div className="anim-sheet safe-bottom relative max-h-[85%] overflow-y-auto rounded-t-sheet bg-bg-soft p-4">
        <div className="mx-auto mb-3 h-1 w-9 rounded-pill bg-line" />
        <h3 className="text-lg font-extrabold text-ink capitalize">{chain.line[0].name}</h3>
        <p className="mt-0.5 mb-3 text-xs text-ink-dim">
          Cây tiến hoá · {chain.line.length} bậc{megas && megas.length > 0 ? ` + ${megas.length} dạng đặc biệt` : ''}
        </p>

        <div className="no-scrollbar flex items-center gap-1 overflow-x-auto pb-2">
          {chain.line.map((f, i) => {
            const got = caught.has(f.id);
            return (
              <div key={f.id} className="flex shrink-0 items-center gap-1">
                {i > 0 && <span className="text-[22px] text-ink-dim">›</span>}
                <ChainNode id={f.id} name={f.name} got={got} accent="var(--color-primary)" />
              </div>
            );
          })}
          {megas && megas.length > 0 && (
            <>
              <span className="text-[22px] text-ink-dim">»</span>
              {megas.map((m) => (
                <ChainNode key={m.id} id={m.id} name={m.name} got={caught.has(m.id)} accent="var(--color-accent)" />
              ))}
            </>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-3 w-full rounded-pill border border-line bg-card py-3 font-extrabold text-ink"
        >
          Đóng
        </button>
      </div>
    </div>
  );
}

function ChainNode({ id, name, got, accent }: { id: number; name: string; got: boolean; accent: string }) {
  return (
    <div
      className="grid w-24 shrink-0 justify-items-center gap-0.5 rounded-[12px] border-[1.5px] bg-card-alt py-2"
      style={{ borderColor: got ? accent : 'var(--color-line)' }}
    >
      <CreatureImage formId={id} size={62} tint={got ? undefined : 'dim'} />
      <span className="w-full truncate px-1 text-center text-[11px] font-bold text-ink capitalize">{name}</span>
      <span
        className={'text-[9.5px] font-bold ' + (got ? 'text-green' : 'text-ink-dim')}
      >
        {got ? '✓ Đã get' : 'chưa get'}
      </span>
    </div>
  );
}
