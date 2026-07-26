import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Path, Line, Defs, LinearGradient as SvgGradient, Stop } from 'react-native-svg';

interface Props {
  size?: number;
  spin?: boolean; // xoay + nhún như đang "loading"
}

// Quả Poké Ball vẽ bằng SVG (nét cao, mọi kích cỡ). Dùng cho loader và nhấn nhá
// giao diện cho đúng chất Pokémon.
export default function Pokeball({ size = 64, spin = false }: Props) {
  const rot = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!spin) return;
    const spinLoop = Animated.loop(
      Animated.timing(rot, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })
    );
    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    spinLoop.start();
    bobLoop.start();
    return () => {
      spinLoop.stop();
      bobLoop.stop();
    };
  }, [spin]);

  const rotate = rot.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.12] });

  const ball = (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Defs>
        <SvgGradient id="pbTop" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#FF5A5A" />
          <Stop offset="1" stopColor="#E4222B" />
        </SvgGradient>
      </Defs>
      {/* nền trắng + viền */}
      <Circle cx="50" cy="50" r="46" fill="#F8FAFC" stroke="#0F172A" strokeWidth="5" />
      {/* nửa trên đỏ */}
      <Path d="M4,50 a46,46 0 0 1 92,0 Z" fill="url(#pbTop)" />
      {/* dải giữa */}
      <Line x1="4" y1="50" x2="96" y2="50" stroke="#0F172A" strokeWidth="7" />
      {/* nút giữa */}
      <Circle cx="50" cy="50" r="16" fill="#0F172A" />
      <Circle cx="50" cy="50" r="10" fill="#F8FAFC" stroke="#0F172A" strokeWidth="3" />
      <Circle cx="50" cy="50" r="4" fill="#E2E8F0" />
    </Svg>
  );

  if (!spin) return <View>{ball}</View>;

  return <Animated.View style={{ transform: [{ translateY }, { rotate }] }}>{ball}</Animated.View>;
}
