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

// Lấy một dòng tiến hoá ngẫu nhiên (1..3 dạng). Có retry + dự phòng khi offline.
export async function fetchRandomLine(avoidIds: number[] = []): Promise<{ line: CreatureForm[]; color: string }> {
  for (let tries = 0; tries < 6; tries++) {
    const chainId = 1 + Math.floor(Math.random() * MAX_EVO_CHAIN);
    try {
      const res = await fetch(`https://pokeapi.co/api/v2/evolution-chain/${chainId}`);
      if (!res.ok) continue;
      const json = await res.json();
      const line: CreatureForm[] = [];
      let node: any = json.chain;
      while (node && line.length < 3) {
        line.push({ id: idFromUrl(node.species.url), name: cap(node.species.name) });
        const nexts = node.evolves_to;
        node = nexts && nexts.length ? nexts[Math.floor(Math.random() * nexts.length)] : null;
      }
      if (line.length >= 1) {
        const finalId = line[line.length - 1].id;
        if (avoidIds.includes(finalId) && tries < 4) continue; // tránh trùng nếu còn lượt
        return { line, color: colorForId(finalId) };
      }
    } catch {
      // mạng lỗi -> thử tiếp
    }
  }
  return { line: FALLBACK_LINE, color: colorForId(6) };
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
