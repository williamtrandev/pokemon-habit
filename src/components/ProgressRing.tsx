import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTheme } from '../theme-context';

interface Props {
  done: number;
  total: number;
  size?: number;
  stroke?: number;
}

// Vòng tròn tiến độ "xong/tổng" của ngày, dùng ở header màn Nuôi.
export default function ProgressRing({ done, total, size = 60, stroke = 5 }: Props) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const ratio = total > 0 ? done / total : 0;
  const complete = total > 0 && done >= total;
  const color = complete ? colors.green : colors.primary;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - ratio)}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={{ color: colors.text, fontSize: 15, fontWeight: '800' }}>
        {done}/{total}
      </Text>
    </View>
  );
}
