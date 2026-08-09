// Lấy NGẪU NHIÊN dòng tiến hoá từ TOÀN BỘ Pokémon qua PokéAPI (endpoint evolution-chain).
// Ảnh dùng sprite ĐỘNG (GIF) của Pokémon Showdown, dự phòng bằng artwork tĩnh.
// CHỈ DÙNG CÁ NHÂN — Pokémon thuộc bản quyền Nintendo/The Pokémon Company.

import { Creature } from './types';

export type Branch = 'legendary' | 'common';

export interface CreatureForm {
  id: number; // Pokédex id
  name: string;
}

// Dạng Mega (nếu loài có): sprite id riêng + tên hiển thị. PokéAPI để Mega trong
// pokemon-species.varieties (không nằm trong evolution-chain).
export interface MegaForm {
  id: number;
  name: string;
}

export const STAGE_XP = [0, 40, 120, 300];
export const MEGA_XP = 600; // mốc XP để Mega tiến hoá (phần thưởng mục tiêu dài hạn)
export const MEGA_STAGE = 4; // bậc hiển thị của Mega (sau dạng cuối = 3)
export const BRANCH_STREAK = 10;
export const MAX_EVO_CHAIN = 549; // số chuỗi tiến hoá hiện có trên PokéAPI
export const TOTAL_POKEMON = 1025;

const OFFICIAL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';
const HOME = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/home';
const SHOW = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/showdown';

const PALETTE = ['#F97316', '#22C55E', '#3B82F6', '#A855F7', '#EF4444', '#06B6D4', '#EAB308', '#EC4899', '#10B981', '#8B5CF6', '#F59E0B', '#14B8A6'];
export function colorForId(id: number): string {
  return PALETTE[id % PALETTE.length];
}

function idFromUrl(url: string): number {
  const m = url.match(/\/(\d+)\/?$/);
  return m ? parseInt(m[1], 10) : 1;
}

function cap(name: string): string {
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const FALLBACK_LINE: CreatureForm[] = [
  { id: 4, name: 'Charmander' },
  { id: 5, name: 'Charmeleon' },
  { id: 6, name: 'Charizard' },
];

// Khoá nhận dạng một dòng: "cơ bản>bậc cuối". Trùng định nghĩa với lineKey trong
// collection.ts — để ở đây một bản nữa cho species.ts không phải phụ thuộc ngược lại.
function lineKeyOfForms(line: CreatureForm[]): string {
  if (!line.length) return '-1>-1';
  return `${line[0].id}>${line[line.length - 1].id}`;
}

// Lấy dòng tiến hoá theo chainId (dạng cơ bản + các bậc sau, đi theo nhánh đầu).
// Có CACHE để lazy-load trong Pokédex: mỗi chain chỉ fetch 1 lần.
export interface EvoChain {
  chainId: number;
  line: CreatureForm[]; // [cơ bản, ...tiến hoá]
}
const chainCache = new Map<number, EvoChain | null>();
const chainInflight = new Map<number, Promise<EvoChain | null>>();

// Chỉ dùng cho test: cache sống suốt vòng đời module nên hai bài test liền nhau sẽ dính
// dữ liệu của nhau.
export function resetChainCache(): void {
  chainCache.clear();
  chainInflight.clear();
}
// Giới hạn số fetch song song: cuộn Pokédex làm ~18 ô gọi cùng lúc -> PokéAPI 429.
let chainActive = 0;
const chainWaiters: (() => void)[] = [];
const CHAIN_MAX_CONCURRENT = 4;
function chainAcquire(): Promise<void> {
  return new Promise((resolve) => {
    if (chainActive < CHAIN_MAX_CONCURRENT) { chainActive++; resolve(); }
    else chainWaiters.push(() => { chainActive++; resolve(); });
  });
}
function chainRelease() {
  chainActive = Math.max(0, chainActive - 1);
  chainWaiters.shift()?.();
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function fetchEvolutionChain(chainId: number): Promise<EvoChain | null> {
  if (chainCache.has(chainId)) return chainCache.get(chainId)!;
  const inflight = chainInflight.get(chainId);
  if (inflight) return inflight; // gộp request trùng (ô re-mount khi cuộn)

  const task = (async (): Promise<EvoChain | null> => {
    await chainAcquire();
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const res = await fetch(`https://pokeapi.co/api/v2/evolution-chain/${chainId}`);
          if (res.status === 404) { chainCache.set(chainId, null); return null; } // thật sự không có
          if (!res.ok) { await sleep(500 * (attempt + 1)); continue; } // 429/5xx -> retry, KHÔNG cache
          const json = await res.json();
          const line: CreatureForm[] = [];
          let node: any = json.chain;
          while (node && line.length < 3) {
            line.push({ id: idFromUrl(node.species.url), name: cap(node.species.name) });
            const nexts = node.evolves_to;
            node = nexts && nexts.length ? nexts[0] : null; // nhánh đầu (đủ để xem cây)
          }
          const chain = line.length ? { chainId, line } : null;
          chainCache.set(chainId, chain);
          return chain;
        } catch {
          await sleep(500 * (attempt + 1)); // lỗi mạng -> thử lại
        }
      }
      return null; // hết retry -> KHÔNG cache, lần sau cuộn tới sẽ thử lại
    } finally {
      chainRelease();
      chainInflight.delete(chainId);
    }
  })();
  chainInflight.set(chainId, task);
  return task;
}

// ===== Thông tin chi tiết Pokémon (stats/mô tả/kích thước) từ PokéAPI =====
export interface PokeInfo {
  genus: string;    // "Ninja Pokémon"
  flavor: string;   // mô tả Pokédex (1 câu)
  heightM: number;  // mét
  weightKg: number; // kg
  types: string[];  // ['water', ...]
  stats: { name: string; value: number }[]; // hp/attack/...
}
const infoCache = new Map<number, PokeInfo>();

export async function fetchPokeInfo(id: number): Promise<PokeInfo | null> {
  if (infoCache.has(id)) return infoCache.get(id)!;
  try {
    const pres = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
    if (!pres.ok) return null;
    const p = await pres.json();
    // Species chỉ có id LOÀI GỐC (vd Greninja 658), KHÔNG có id dạng đặc biệt (Ash 10116).
    // Lấy theo p.species.url -> đúng cho MỌI dạng (gốc/Mega/biến thể). Types & stats vẫn từ /pokemon/{id}.
    const speciesUrl: string = p.species?.url ?? `https://pokeapi.co/api/v2/pokemon-species/${id}`;
    const sres = await fetch(speciesUrl);
    const s: any = sres.ok ? await sres.json() : {};
    const genus: string = (s.genera ?? []).find((g: any) => g.language?.name === 'en')?.genus ?? '';
    const fe = (s.flavor_text_entries ?? []).find((e: any) => e.language?.name === 'en');
    const flavor = String(fe?.flavor_text ?? '').replace(/\s+/g, ' ').trim();
    const info: PokeInfo = {
      genus,
      flavor,
      heightM: (p.height ?? 0) / 10,
      weightKg: (p.weight ?? 0) / 10,
      types: (p.types ?? []).map((t: any) => t.type.name),
      stats: (p.stats ?? []).map((st: any) => ({ name: st.stat.name, value: st.base_stat })),
    };
    infoCache.set(id, info);
    return info;
  } catch {
    return null;
  }
}

// ===== Chiêu thức (moves) từ PokéAPI =====
export interface MoveInfo { id: number; name: string; type: string; power: number | null; damageClass: string }
const moveCache = new Map<number, MoveInfo[]>();

// 4 chiêu học theo cấp (level-up) sớm nhất của 1 Pokémon, kèm hệ + power. Cache theo id.
export async function fetchMoves(pokemonId: number): Promise<MoveInfo[]> {
  if (moveCache.has(pokemonId)) return moveCache.get(pokemonId)!;
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokemonId}`);
    if (!res.ok) return [];
    const j = await res.json();
    const byName = new Map<string, number>(); // tên chiêu -> cấp thấp nhất học được
    for (const m of j.moves ?? []) {
      const lvs: number[] = (m.version_group_details ?? [])
        .filter((d: any) => d.move_learn_method?.name === 'level-up')
        .map((d: any) => d.level_learned_at);
      if (!lvs.length) continue;
      const min = Math.min(...lvs);
      const name = m.move.name;
      byName.set(name, Math.min(byName.get(name) ?? Infinity, min));
    }
    // Dạng đặc biệt (Mega/Ash...) thường KHÔNG có chiêu level-up riêng -> mượn của loài GỐC.
    if (byName.size === 0) {
      const sid = idFromUrl(j.species?.url ?? '');
      if (sid && sid !== pokemonId) {
        const alt = await fetchMoves(sid);
        moveCache.set(pokemonId, alt);
        return alt;
      }
    }
    // Lấy RỘNG 8 ứng viên sớm nhất rồi mới lọc: bộ 4 chiêu này giờ DÙNG THẬT trong đấu boss
    // (xem pickMove trong battle.ts), mà 4 chiêu cấp thấp nhất thường dính 2 chiêu trạng thái
    // (Growl, Leer...) không đánh được ai.
    const top = [...byName.entries()].sort((a, b) => a[1] - b[1]).slice(0, 8).map(([n]) => n);
    const fetched = await Promise.all(
      top.map(async (n): Promise<MoveInfo> => {
        try {
          const mj = await (await fetch(`https://pokeapi.co/api/v2/move/${n}`)).json();
          return { id: mj.id ?? 0, name: cap(mj.name ?? n), type: mj.type?.name ?? 'normal', power: mj.power ?? null, damageClass: mj.damage_class?.name ?? 'status' };
        } catch {
          return { id: 0, name: cap(n), type: 'normal', power: null, damageClass: 'status' };
        }
      })
    );
    // Giữ 4: chiêu CÓ LỰC trước (power giảm dần), thiếu thì bù chiêu trạng thái theo cấp học.
    const damaging = fetched.filter((m) => m.power != null).sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
    const status = fetched.filter((m) => m.power == null);
    const infos = [...damaging, ...status].slice(0, 4);
    moveCache.set(pokemonId, infos);
    return infos;
  } catch {
    return [];
  }
}

// Từ 1 species id -> dòng tiến hoá chứa nó (qua pokemon-species.evolution_chain).
export async function fetchChainForSpecies(speciesId: number): Promise<EvoChain | null> {
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${speciesId}`);
    if (!res.ok) return null;
    const j = await res.json();
    const url: string | undefined = j.evolution_chain?.url;
    const m = url?.match(/\/(\d+)\/?$/);
    if (!m) return null;
    return fetchEvolutionChain(Number(m[1]));
  } catch {
    return null;
  }
}

// Bao nhiêu chuỗi hỏng LIÊN TIẾP thì coi như mạng chết và dừng sớm.
// Không đặt trần cứng cho số lượt: khi Pokédex gần đầy, "còn đúng một họ chưa có" là trường
// hợp PHẢI tìm ra được, mà trần cứng lại làm nó báo nhầm là hết loài mới. Mỗi chuỗi chỉ tải
// một lần rồi nằm cache vĩnh viễn, nên duyệt sâu cũng không tốn thêm mạng cho lần sau.
const PICK_MAX_MISSES = 8;

export interface RandomLine {
  line: CreatureForm[];
  color: string;
  /** true = buộc phải trả về một dòng ĐÃ CÓ vì không tìm được dòng mới nào. */
  duplicate: boolean;
}

// Lấy một dòng tiến hoá ngẫu nhiên CHƯA CÓ trong bầy.
//
// `avoidLineKeys` là khoá "cơ bản>bậc cuối" (xem lineKey trong collection.ts): bầy giữ nguyên
// cả dòng nên hai con cùng dòng là trùng dù đang ở bậc khác nhau, nhưng hai NHÁNH khác nhau
// của cùng một họ (Charcadet → Armarouge / Ceruledge) là hai con khác hẳn.
//
// Bản trước bốc `Math.random()` mỗi lượt trong 6 lượt và CHỈ né trùng ở 4 lượt đầu — hai lượt
// cuối trả về loài trùng vô điều kiện, nên bầy đông là gặp trùng thường xuyên. Ngoài ra nó
// bốc có lặp (rất dễ thử lại đúng chuỗi vừa loại) và tự gọi fetch thẳng, bỏ qua cache +
// hàng đợi 429 của fetchEvolutionChain.
//
// Giờ: xáo trộn CẢ danh sách chuỗi rồi duyệt KHÔNG LẶP cho tới khi gặp dòng mới. Chỉ chấp
// nhận dòng trùng khi đã duyệt hết mà thật sự không còn dòng nào mới.
export async function fetchRandomLine(avoidLineKeys: string[] = []): Promise<RandomLine> {
  const avoid = new Set(avoidLineKeys);
  // Xáo Fisher-Yates toàn mảng: bầy trống thì lượt đầu đã trúng, bầy gần đầy thì vẫn moi
  // được họ cuối cùng còn thiếu.
  const pool = Array.from({ length: MAX_EVO_CHAIN }, (_, i) => i + 1);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  // Dự phòng theo thứ tự ưu tiên giảm dần, chỉ dùng khi không có dòng nào hoàn toàn mới.
  let ownedMultiStage: CreatureForm[] | null = null; // đã có, nhưng nhiều bậc
  let freshSingleStage: CreatureForm[] | null = null; // mới, nhưng chỉ một bậc
  let misses = 0; // số chuỗi hỏng LIÊN TIẾP -> phanh khi mất mạng

  for (const chainId of pool) {
    // Dùng chung fetchEvolutionChain với Pokédex: được cache, retry 429 và giới hạn song song.
    // Đổi lại, họ có NHÁNH (Eevee, Wurmple...) luôn đi nhánh đầu thay vì bốc ngẫu nhiên —
    // đúng bằng cây mà Pokédex vẽ, nên nở ra con nào là khớp với con đã xem trước đó.
    const chain = await fetchEvolutionChain(chainId);
    if (!chain || !chain.line.length) {
      // Mất mạng thì mỗi chuỗi ngốn mấy giây backoff; duyệt hết 549 chuỗi là treo hẳn app.
      if (++misses >= PICK_MAX_MISSES) break;
      continue;
    }
    misses = 0;

    const line = chain.line;
    const fresh = !avoid.has(lineKeyOfForms(line));
    // Ưu tiên loài CÓ tiến hoá (≥2 bậc) để con vật còn đổi hình được; loài đơn-bậc (vd
    // Dedenne) thì nuôi mãi cũng không tiến hoá.
    const multi = line.length >= 2;

    if (fresh && multi) return { line, color: colorForId(line[line.length - 1].id), duplicate: false };
    if (fresh && !freshSingleStage) freshSingleStage = line;
    else if (multi && !ownedMultiStage) ownedMultiStage = line;
  }

  // Loài mới một-bậc vẫn hơn hẳn loài trùng: yêu cầu "không trùng" mạnh hơn "có tiến hoá".
  if (freshSingleStage) {
    return { line: freshSingleStage, color: colorForId(freshSingleStage[freshSingleStage.length - 1].id), duplicate: false };
  }
  const fallback = ownedMultiStage ?? FALLBACK_LINE;
  return { line: fallback, color: colorForId(fallback[fallback.length - 1].id), duplicate: true };
}

// ----- Suy ra dạng theo bậc XP -----
export function stageForXp(xp: number): number {
  let stage = 0;
  for (let i = 0; i < STAGE_XP.length; i++) if (xp >= STAGE_XP[i]) stage = i;
  return stage;
}

// Pokédex id ở một bậc (null = trứng). Bậc >0 ánh xạ vào line (kẹp theo độ dài).
export function formIdAt(line: CreatureForm[], stage: number): number | null {
  if (stage <= 0 || line.length === 0) return null;
  const idx = Math.min(line.length - 1, stage - 1);
  return line[idx].id;
}

export function formNameAt(line: CreatureForm[], stage: number, branch: Branch | null): string {
  if (stage <= 0) return 'Trứng';
  const idx = Math.min(line.length - 1, stage - 1);
  const base = line[idx]?.name ?? 'Pokémon';
  const isFinal = stage >= 3;
  if (isFinal && branch === 'legendary') return `${base} ✨`;
  return base;
}

export interface ResolvedForm {
  stage: number;
  name: string;
  branch: Branch | null;
  isFinal: boolean;
  isMega: boolean;
}

// Loài này có dạng Mega không (đã tra và có ≥1).
export function hasMega(creature: Creature): boolean {
  return !!creature.megas && creature.megas.length > 0;
}

// Đã đủ điều kiện Mega chưa: đạt mốc XP và loài này CÓ dạng Mega.
export function megaReady(creature: Creature): boolean {
  return creature.xp >= MEGA_XP && hasMega(creature);
}

// Dạng Mega đang chọn (kẹp chỉ số trong khoảng hợp lệ). null nếu không có.
export function activeMega(creature: Creature): MegaForm | null {
  if (!hasMega(creature)) return null;
  const list = creature.megas!;
  const idx = Math.max(0, Math.min(list.length - 1, creature.megaPick ?? 0));
  return list[idx];
}

export function resolveForm(creature: Creature): ResolvedForm {
  if (megaReady(creature)) {
    return {
      stage: MEGA_STAGE,
      name: activeMega(creature)!.name,
      branch: creature.branch ?? 'common',
      isFinal: true,
      isMega: true,
    };
  }
  const stage = stageForXp(creature.xp);
  return {
    stage,
    name: formNameAt(creature.line, stage, creature.branch),
    branch: stage >= 3 ? creature.branch ?? 'common' : null,
    isFinal: stage >= 3,
    isMega: false,
  };
}

// Pokédex id để hiển thị: ưu tiên Mega nếu đã mở, ngược lại theo bậc thường.
export function displayFormId(creature: Creature): number | null {
  if (megaReady(creature)) return activeMega(creature)!.id;
  return formIdAt(creature.line, stageForXp(creature.xp));
}

// Tên dòng (dạng cuối) — dùng ở Bộ sưu tập.
export function lineName(creature: Creature): string {
  return creature.line[creature.line.length - 1]?.name ?? 'Pokémon';
}

export function finalId(creature: Creature): number {
  return creature.line[creature.line.length - 1]?.id ?? 0;
}

export function evoProgress(xp: number): { ratio: number; remaining: number; nextStage: number | null } {
  const stage = stageForXp(xp);
  if (stage >= STAGE_XP.length - 1) return { ratio: 1, remaining: 0, nextStage: null };
  const cur = STAGE_XP[stage];
  const next = STAGE_XP[stage + 1];
  return { ratio: Math.max(0, Math.min(1, (xp - cur) / (next - cur))), remaining: next - xp, nextStage: stage + 1 };
}

// Danh sách URL ảnh cho một Pokédex id: ưu tiên ARTWORK NÉT CAO (full-HD), dự phòng ảnh khác.
// Chuyển động do CreatureView tạo (nhún/thở) để ảnh vừa nét vừa "sống".
export function spriteSources(id: number, shiny: boolean): string[] {
  const s = shiny ? '/shiny' : '';
  return [`${OFFICIAL}${s}/${id}.png`, `${HOME}${s}/${id}.png`, `${OFFICIAL}/${id}.png`, `${SHOW}/${id}.gif`];
}
