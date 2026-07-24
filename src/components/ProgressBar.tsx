import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme-context';

interface Props {
  ratio: number; // 0..1
  color?: string;
  height?: number;
  track?: string;
}

// Thanh tiến độ có gradient nhẹ (sáng → màu gốc) tạo chiều sâu, bo tròn hai đầu.
export default function ProgressBar({ ratio, color, height = 10, track }: Props) {
  const { colors } = useTheme();
  const fillColor = color ?? colors.primary;
  const trackColor = track ?? colors.track;
  const pct = Math.max(0, Math.min(1, ratio)) * 100;
  return (
    <View style={[styles.track, { height, backgroundColor: trackColor, borderRadius: height }]}>
      {pct > 0 && (
        <LinearGradient
          colors={[fillColor + 'FF', fillColor + 'CC']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.fill, { width: `${pct}%`, borderRadius: height }]}
        >
          {/* vệt sáng mảnh trên đỉnh để bar trông "bóng" hơn */}
          <View style={[styles.sheen, { borderTopLeftRadius: height, borderTopRightRadius: height }]} />
        </LinearGradient>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden' },
  fill: { height: '100%' },
  sheen: { height: '45%', backgroundColor: 'rgba(255,255,255,0.22)' },
});
