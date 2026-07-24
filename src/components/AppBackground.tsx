import React, { useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Defs, Ellipse, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../theme-context';

// Nền bầu trời: tối = trời đêm đầy sao + quầng trăng; sáng = trời ngày có nắng + mây mềm.
// Lớp trang trí tĩnh, nằm sau nội dung, pointer-events none để không chặn thao tác.
export default function AppBackground({ children }: { children: React.ReactNode }) {
  const { colors, scheme } = useTheme();
  const { width, height } = useWindowDimensions();
  const dark = scheme === 'dark';

  // Sinh vị trí sao một lần (không nhảy khi re-render). Tỉ lệ theo màn hình.
  const stars = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        cx: Math.random() * width,
        cy: Math.random() * height * 0.72,
        r: Math.random() < 0.18 ? 1.8 : Math.random() * 1.1 + 0.5,
        o: Math.random() * 0.5 + 0.35,
      })),
    [width, height]
  );

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={colors.bgGradient}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          {/* Quầng trăng / mặt trời góc trên phải */}
          <RadialGradient id="orb" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={dark ? '#E9D5FF' : '#FFE8B0'} stopOpacity={dark ? 0.55 : 0.85} />
            <Stop offset="0.5" stopColor={dark ? '#C4B5FD' : '#FFD37A'} stopOpacity={dark ? 0.18 : 0.28} />
            <Stop offset="1" stopColor={dark ? '#C4B5FD' : '#FFD37A'} stopOpacity={0} />
          </RadialGradient>
          {/* Vầng sáng chân trời phía dưới */}
          <RadialGradient id="haze" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={dark ? '#6366F1' : '#FFC98A'} stopOpacity={dark ? 0.22 : 0.4} />
            <Stop offset="1" stopColor={dark ? '#6366F1' : '#FFC98A'} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="cloud" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.9} />
            <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
          </RadialGradient>
        </Defs>

        {/* Quầng sáng chân trời (cả 2 chế độ) */}
        <Ellipse cx={width * 0.5} cy={height * 1.02} rx={width * 0.9} ry={height * 0.4} fill="url(#haze)" />

        {/* Mặt trăng (đêm) hoặc mặt trời (ngày) */}
        <Circle cx={width * 0.82} cy={height * 0.12} r={width * 0.42} fill="url(#orb)" />

        {dark ? (
          <>
            {/* Nebula tím rất mờ góc trái */}
            <Circle cx={width * 0.12} cy={height * 0.3} r={width * 0.5} fill="url(#haze)" />
            {stars.map((s, i) => (
              <Circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="#FFFFFF" opacity={s.o} />
            ))}
          </>
        ) : (
          <>
            {/* Mây mềm */}
            <Ellipse cx={width * 0.22} cy={height * 0.16} rx={110} ry={40} fill="url(#cloud)" opacity={0.7} />
            <Ellipse cx={width * 0.34} cy={height * 0.22} rx={90} ry={32} fill="url(#cloud)" opacity={0.55} />
            <Ellipse cx={width * 0.78} cy={height * 0.34} rx={100} ry={34} fill="url(#cloud)" opacity={0.5} />
          </>
        )}
      </Svg>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
