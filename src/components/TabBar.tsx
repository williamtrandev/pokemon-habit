import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform, LayoutAnimation, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Colors, radius, spacing } from '../theme';
import { useTheme, useThemedStyles } from '../theme-context';
import { feedbackTap } from '../feedback';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export interface TabItem<T extends string> {
  key: T;
  label: string;
  icon: keyof typeof Ionicons.glyphMap; // khi active (đặc)
  iconOutline: keyof typeof Ionicons.glyphMap; // khi thường (viền)
}

interface Props<T extends string> {
  tabs: TabItem<T>[];
  active: T;
  onChange: (key: T) => void;
}

// Đỏ Poké Ball cho tab đang chọn — nổi bật trên nền tím của app, đúng chất Pokémon.
const BALL_RED: [string, string] = ['#FF5A5A', '#E4222B'];

// Thanh điều hướng nổi: tab đang chọn phình thành viên gradient đỏ kèm nhãn;
// tab còn lại chỉ hiện icon mờ. Chuyển tab phình mượt.
export default function TabBar<T extends string>({ tabs, active, onChange }: Props<T>) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const press = (key: T) => {
    if (key === active) return;
    feedbackTap();
    LayoutAnimation.configureNext(
      LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.scaleXY)
    );
    onChange(key);
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.bar}>
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <Pressable
              key={t.key}
              onPress={() => press(t.key)}
              hitSlop={6}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}
            >
              {on ? (
                <LinearGradient
                  colors={BALL_RED}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.tab, styles.tabActive]}
                >
                  <Ionicons name={t.icon} size={20} color="#fff" />
                  <Text style={styles.label} numberOfLines={1}>
                    {t.label}
                  </Text>
                </LinearGradient>
              ) : (
                <View style={styles.tab}>
                  <Ionicons name={t.iconOutline} size={23} color={colors.textDim} />
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.lg,
    },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.bgSoft,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      shadowColor: '#000',
      shadowOpacity: 0.28,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12,
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 48,
      minWidth: 48,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
    },
    tabActive: {
      paddingHorizontal: spacing.lg,
      shadowColor: '#E4222B',
      shadowOpacity: 0.5,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    label: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 13,
      marginLeft: spacing.sm,
    },
  });
