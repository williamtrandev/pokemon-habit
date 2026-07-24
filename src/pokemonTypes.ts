// Hệ (type) của Pokémon lấy từ PokéAPI (/pokemon/{id}).
// Có cache RAM + AsyncStorage để không gọi lại mạng. CHỈ DÙNG CÁ NHÂN.

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Màu đại diện mỗi hệ, chỉnh cho hợp bảng màu app (không quá chói).
export const TYPE_COLOR: Record<string, string> = {
  normal: '#9CA3AF',
  fire: '#F97316',
  water: '#3B82F6',
  grass: '#22C55E',
  electric: '#EAB308',
  ice: '#22D3EE',
  fighting: '#EF4444',
  poison: '#A855F7',
  ground: '#D97706',
  flying: '#60A5FA',
  psychic: '#EC4899',
  bug: '#84CC16',
  rock: '#B08D57',
  ghost: '#8B5CF6',
  dragon: '#6366F1',
  dark: '#475569',
  steel: '#64748B',
  fairy: '#F472B6',
};

// Nhãn tiếng Việt cho từng hệ.
export const TYPE_LABEL_VI: Record<string, string> = {
  normal: 'Thường',
  fire: 'Lửa',
  water: 'Nước',
  grass: 'Cỏ',
  electric: 'Điện',
  ice: 'Băng',
  fighting: 'Giác đấu',
  poison: 'Độc',
  ground: 'Đất',
  flying: 'Bay',
  psychic: 'Siêu năng',
  bug: 'Bọ',
  rock: 'Đá',
  ghost: 'Ma',
  dragon: 'Rồng',
  dark: 'Bóng tối',
  steel: 'Thép',
  fairy: 'Tiên',
};

export function typeColor(name: string): string {
  return TYPE_COLOR[name] ?? '#9CA3AF';
}
export function typeLabel(name: string): string {
  return TYPE_LABEL_VI[name] ?? name;
}

const CACHE_KEY = 'pokemon-habit:types:v1';
const mem = new Map<number, string[]>();
let diskLoaded = false;

async function loadDisk(): Promise<void> {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, string[]>;
      for (const k of Object.keys(obj)) mem.set(Number(k), obj[k]);
    }
  } catch {
    // im lặng
  }
}

async function persist(): Promise<void> {
  try {
    const obj: Record<string, string[]> = {};
    mem.forEach((v, k) => (obj[k] = v));
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(obj));
  } catch {
    // im lặng
  }
}

// Lấy danh sách hệ của một Pokédex id (1..2 hệ). Trả [] nếu lỗi mạng.
export async function fetchTypes(id: number): Promise<string[]> {
  await loadDisk();
  if (mem.has(id)) return mem.get(id)!;
  try {
    const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${id}`);
    if (!res.ok) return [];
    const json = await res.json();
    const types: string[] = (json.types ?? [])
      .sort((a: any, b: any) => a.slot - b.slot)
      .map((t: any) => t.type.name as string);
    mem.set(id, types);
    persist();
    return types;
  } catch {
    return [];
  }
}

// Hook: trả hệ cho formId (null = trứng → []). Tự huỷ nếu đổi id trước khi xong.
export function useTypes(formId: number | null): string[] {
  const [types, setTypes] = useState<string[]>(formId != null ? mem.get(formId) ?? [] : []);
  useEffect(() => {
    let alive = true;
    if (formId == null) {
      setTypes([]);
      return;
    }
    const cached = mem.get(formId);
    if (cached) {
      setTypes(cached);
      return;
    }
    fetchTypes(formId).then((t) => {
      if (alive) setTypes(t);
    });
    return () => {
      alive = false;
    };
  }, [formId]);
  return types;
}
