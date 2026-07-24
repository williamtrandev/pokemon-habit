// Tra dạng Mega của một loài từ PokéAPI (pokemon-species.varieties).
// Mega KHÔNG nằm trong evolution-chain; nó là "variety" tên có '-mega'.
// Cache RAM + AsyncStorage. CHỈ DÙNG CÁ NHÂN.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MegaForm } from './species';

const CACHE_KEY = 'pokemon-habit:mega:v2';
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

// 'charizard-mega-x' -> 'Mega Charizard X'; 'venusaur-mega' -> 'Mega Venusaur'.
function megaLabel(rawName: string): string {
  const parts = rawName.split('-');
  const base = cap(parts[0]);
  const suffix = parts
    .slice(1)
    .filter((p) => p !== 'mega')
    .map((p) => p.toUpperCase())
    .join(' ');
  return `Mega ${base}${suffix ? ' ' + suffix : ''}`;
}

// Trả TOÀN BỘ dạng Mega của một loài (dạng cuối): có thể 0, 1 (Venusaur) hoặc 2 (Charizard X/Y).
// [] nếu loài không có Mega. Lỗi mạng cũng trả [] nhưng KHÔNG cache để lần sau thử lại.
export async function fetchMegas(finalId: number): Promise<MegaForm[]> {
  await loadDisk();
  if (mem.has(finalId)) return mem.get(finalId)!;
  try {
    const sp = await (await fetch(`https://pokeapi.co/api/v2/pokemon-species/${finalId}`)).json();
    const raw: { name: string; url: string }[] = (sp.varieties ?? [])
      .map((v: any) => v.pokemon)
      .filter((p: any) => typeof p.name === 'string' && p.name.includes('-mega'));
    const forms: MegaForm[] = raw.map((p) => {
      const m = p.url.match(/\/(\d+)\/?$/);
      return { id: m ? parseInt(m[1], 10) : finalId, name: megaLabel(p.name) };
    });
    mem.set(finalId, forms);
    persist();
    return forms;
  } catch {
    return []; // không cache lỗi mạng
  }
}
