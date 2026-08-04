// Shim AsyncStorage -> localStorage.
//
// ../src/storage.ts, megaForms.ts, pokemonTypes.ts, theme-context.tsx và Supabase auth đều
// dùng AsyncStorage. localStorage đồng bộ nhưng API ở đây vẫn Promise để khớp chữ ký.
// Dữ liệu web nằm trong localStorage của trình duyệt; tiến độ chung với điện thoại đi qua
// Supabase (xem ../src/lib/sync.ts), không qua storage này.

function mem(): Storage | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage;
  } catch {
    return null; // trình duyệt chặn cookie/storage
  }
}

// Dự phòng khi localStorage bị chặn: giữ trong RAM để app vẫn chạy được phiên này.
const fallback = new Map<string, string>();

async function getItem(key: string): Promise<string | null> {
  const s = mem();
  if (!s) return fallback.get(key) ?? null;
  return s.getItem(key);
}

async function setItem(key: string, value: string): Promise<void> {
  const s = mem();
  if (!s) {
    fallback.set(key, value);
    return;
  }
  s.setItem(key, value);
}

async function removeItem(key: string): Promise<void> {
  const s = mem();
  if (!s) {
    fallback.delete(key);
    return;
  }
  s.removeItem(key);
}

async function clear(): Promise<void> {
  const s = mem();
  if (!s) {
    fallback.clear();
    return;
  }
  s.clear();
}

async function getAllKeys(): Promise<string[]> {
  const s = mem();
  if (!s) return [...fallback.keys()];
  return Object.keys(s);
}

async function multiGet(keys: string[]): Promise<[string, string | null][]> {
  return Promise.all(keys.map(async (k) => [k, await getItem(k)] as [string, string | null]));
}

async function multiSet(pairs: [string, string][]): Promise<void> {
  await Promise.all(pairs.map(([k, v]) => setItem(k, v)));
}

async function multiRemove(keys: string[]): Promise<void> {
  await Promise.all(keys.map((k) => removeItem(k)));
}

const AsyncStorage = { getItem, setItem, removeItem, clear, getAllKeys, multiGet, multiSet, multiRemove };

export default AsyncStorage;
