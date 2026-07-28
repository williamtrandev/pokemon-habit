// Tra dạng Mega của một loài từ PokéAPI (pokemon-species.varieties).
// Mega KHÔNG nằm trong evolution-chain; nó là "variety" tên có '-mega'.
// Cache RAM + AsyncStorage. CHỈ DÙNG CÁ NHÂN.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MegaForm } from './species';

const CACHE_KEY = 'pokemon-habit:mega:v4';
// [] = đã tra, không có Mega. Không có key = chưa tra.
const mem = new Map<number, MegaForm[]>();
let diskLoaded = false;

async function loadDisk(): Promise<void> {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, MegaForm[]>;
      for (const k of Object.keys(obj)) mem.set(Number(k), obj[k]);
    }
  } catch {
    // im lặng
  }
}

async function persist(): Promise<void> {
  try {
    const obj: Record<string, MegaForm[]> = {};
    mem.forEach((v, k) => (obj[k] = v));
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(obj));
  } catch {
    // im lặng
  }
}

function cap(name: string): string {
  return name
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Nhãn ĐÚNG theo loại dạng đặc biệt:
//  'charizard-mega-x' -> 'Mega Charizard X'; 'venusaur-mega' -> 'Mega Venusaur';
//  'kyogre-primal' -> 'Primal Kyogre'; 'greninja-ash' -> 'Ash-Greninja'.
function specialLabel(rawName: string): string {
  const parts = rawName.split('-');
  const base = cap(parts[0]);
  const rest = parts.slice(1);
  if (rest.includes('mega')) {
    const suffix = rest.filter((p) => p !== 'mega').map((p) => p.toUpperCase()).join(' ');
    return `Mega ${base}${suffix ? ' ' + suffix : ''}`;
  }
  if (rest.includes('primal')) return `Primal ${base}`;
  if (rest.includes('ash')) return `Ash-${base}`;
  return `${base} ${rest.map(cap).join(' ')}`.trim();
}

// Trả TẤT CẢ dạng đặc biệt tối thượng của một loài (dạng cuối): Mega / Primal / Ash.
// Có thể 0, 1 (Venusaur/Kyogre), hoặc 2+ (Charizard Mega X/Y; Greninja Ash + Mega).
// Sắp Primal/Ash (chính thống) TRƯỚC, Mega sau -> phần tử [0] là mặc định hợp lý.
// [] nếu loài không có. Người chơi chọn dạng nào để hoá (xem PartyScreen).
export async function fetchMegas(finalId: number): Promise<MegaForm[]> {
  await loadDisk();
  if (mem.has(finalId)) return mem.get(finalId)!;
  try {
    const sp = await (await fetch(`https://pokeapi.co/api/v2/pokemon-species/${finalId}`)).json();
    const all: { name: string; url: string }[] = (sp.varieties ?? []).map((v: any) => v.pokemon);
    const recog = all.filter((p) => typeof p.name === 'string' && (p.name.includes('-mega') || p.name.includes('-primal') || p.name.includes('-ash')));
    const rank = (n: string) => (n.includes('-primal') ? 0 : n.includes('-ash') ? 1 : 2);
    recog.sort((a, b) => rank(a.name) - rank(b.name));
    const forms: MegaForm[] = recog.map((p) => {
      const m = p.url.match(/\/(\d+)\/?$/);
      return { id: m ? parseInt(m[1], 10) : finalId, name: specialLabel(p.name) };
    });
    mem.set(finalId, forms);
    persist();
    return forms;
  } catch {
    return []; // không cache lỗi mạng
  }
}
