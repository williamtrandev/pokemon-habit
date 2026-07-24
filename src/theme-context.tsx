import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, darkColors, lightColors } from './theme';

export type ThemeMode = 'system' | 'light' | 'dark';

const KEY = 'pokemon-habit:theme:v1';

interface ThemeContextValue {
  colors: Colors;
  scheme: 'light' | 'dark'; // đã suy ra (áp dụng thật)
  mode: ThemeMode; // lựa chọn của người dùng
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme(); // 'light' | 'dark' | null
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(KEY);
        if (saved === 'light' || saved === 'dark' || saved === 'system') setModeState(saved);
      } catch {
        // im lặng — dùng mặc định 'system'
      }
    })();
  }, []);

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m);
    AsyncStorage.setItem(KEY, m).catch(() => {});
  }, []);

  // 'system' + null (chưa xác định) → tối, giữ đúng trải nghiệm gốc của app.
  const scheme: 'light' | 'dark' = mode === 'system' ? (system === 'light' ? 'light' : 'dark') : mode;
  const colors = scheme === 'light' ? lightColors : darkColors;

  const value = useMemo(() => ({ colors, scheme, mode, setMode }), [colors, scheme, mode, setMode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme phải nằm trong <ThemeProvider>');
  return ctx;
}

// Tạo StyleSheet theo palette hiện tại, ghi nhớ theo tham chiếu màu.
// `factory` PHẢI định nghĩa ngoài component để giữ tham chiếu ổn định.
export function useThemedStyles<T>(factory: (c: Colors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
