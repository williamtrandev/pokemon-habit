import React, { useEffect, useId, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Creature, healthState } from '../types';
import { resolveForm, displayFormId } from '../species';
import { useTheme } from '../theme-context';
import CreatureImage from './CreatureImage';

interface Props {
  creature: Creature;
  size?: number;
  animate?: boolean;
  popKey?: number;
  particles?: boolean;
  glowColor?: string; // quầng sáng tuỳ chọn (mặc định dùng màu theme)
  minGlowSize?: number; // ngưỡng kích thước bật quầng sáng
}

export default function CreatureView({ creature, size = 120, animate = true, popKey = 0, particles = false, glowColor, minGlowSize = 70 }: Props) {
  const { colors } = useTheme();
  const glowId = useId();
  const form = resolveForm(creature);
  const formId = displayFormId(creature);
  const shiny = form.stage >= 3 && creature.branch === 'legendary';
  const hs = healthState(creature.vitality, creature.fainted);
  const isFaint = hs.key === 'fainted';
  const lowEnergy = hs.key === 'critical' || isFaint;

  const bob = useRef(new Animated.Value(0)).current;
  const breathe = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!animate || lowEnergy) return;
    const speed = hs.key === 'weak' ? 2400 : 1500;
    const mk = (v: Animated.Value, dur: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(v, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );
    const a = mk(bob, speed);
    const b = mk(breathe, speed * 0.85);
    a.start();
    b.start();
    return () => { a.stop(); b.stop(); };
  }, [animate, lowEnergy, hs.key, bob, breathe]);

  useEffect(() => {
    if (popKey === 0) return;
    pop.setValue(0.4);
    Animated.spring(pop, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }).start();
  }, [popKey, pop]);

  const translateY = bob.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.06] });
  const scaleY = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const scaleX = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] });
  const sway = bob.interpolate({ inputRange: [0, 1], outputRange: ['-2deg', '2deg'] });

  // Thể trạng: mờ dần + xám + rũ + badge
  const opacity = isFaint ? 0.5 : hs.key === 'critical' ? 0.62 : hs.key === 'weak' ? 0.82 : 1;
  const grayOverlay = hs.key === 'weak' ? 0.25 : hs.key === 'critical' ? 0.4 : isFaint ? 0.55 : 0;
  const badgeSize = size * 0.26;
  // Quầng sáng nền chỉ bật cho ảnh đủ lớn (thẻ/chi tiết), không cho thumbnail nhỏ.
  const glowOn = size >= minGlowSize && !isFaint;
  const glowFill = glowColor ?? colors.glow;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {glowOn && (
        <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <RadialGradient id={glowId} cx="50%" cy="52%" r="50%">
              <Stop offset="0" stopColor={glowFill} stopOpacity={glowColor ? 0.55 : 1} />
              <Stop offset="1" stopColor={glowFill} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width={size} height={size} fill={`url(#${glowId})`} />
        </Svg>
      )}

      {particles && !isFaint && hs.key !== 'weak' && (
        <Particles color={creature.color} size={size} count={size >= 130 ? 6 : 4} />
      )}

      <Animated.View
        style={{
          opacity,
          transform: isFaint
            ? [{ rotate: `${hs.tilt}deg` }, { scaleY: 0.9 }]
            : [{ translateY }, { scaleX }, { scaleY }, { rotate: sway }, { scale: pop }, { rotate: `${hs.tilt}deg` }],
        }}
      >
        <CreatureImage formId={formId} shiny={shiny} size={size} />
        {grayOverlay > 0 && (
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: `rgba(100,116,139,${grayOverlay})` }]} />
        )}
      </Animated.View>

      {hs.badge ? (
        <Text style={{ position: 'absolute', right: size * 0.04, bottom: size * 0.02, fontSize: badgeSize }}>
          {hs.badge}
        </Text>
      ) : null}
    </View>
  );
}

function Particles({ color, size, count }: { color: string; size: number; count: number }) {
  const items = useRef(
    Array.from({ length: count }, (_, i) => ({ v: new Animated.Value(0), x: (Math.random() - 0.5) * size * 0.6, delay: i * 400, dur: 1800 + Math.random() * 1200, s: 4 + Math.random() * 3 }))
  ).current;

  useEffect(() => {
    const anims = items.map((it) =>
      Animated.loop(Animated.timing(it.v, { toValue: 1, duration: it.dur, delay: it.delay, easing: Easing.linear, useNativeDriver: true }))
    );
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [items]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {items.map((it, i) => {
        const translateY = it.v.interpolate({ inputRange: [0, 1], outputRange: [size * 0.5, size * 0.05] });
        const opacity = it.v.interpolate({ inputRange: [0, 0.2, 0.8, 1], outputRange: [0, 0.9, 0.6, 0] });
        return (
          <Animated.View
            key={i}
            style={{ position: 'absolute', left: size / 2 + it.x, top: 0, width: it.s, height: it.s, borderRadius: it.s / 2, backgroundColor: color, opacity, transform: [{ translateY }] }}
          />
        );
      })}
    </View>
  );
}
