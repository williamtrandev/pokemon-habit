import React from 'react';
import { View, Text, Pressable, StyleSheet, Platform, LayoutAnimation, UIManager } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, radius, spacing } from '../theme';
import { useTheme, useThemedStyles } from '../theme-context';

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

// Thanh điều hướng nổi dạng viên thuốc: tab đang chọn phình ra thành pill primary
// kèm nhãn; tab còn lại chỉ hiện icon. Chuyển tab có hiệu ứng phình mượt.
export default function TabBar<T extends string>({ tabs, active, onChange }: Props<T>) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const press = (key: T) => {
    if (key === active) return;
    LayoutAnimation.configureNext(
      LayoutAnimation.create(200, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)
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
              style={[styles.tab, on && styles.tabActive]}
              hitSlop={6}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={t.label}
            >
              <Ionicons name={on ? t.icon : t.iconOutline} size={22} color={on ? '#fff' : colors.textDim} />
              {on && (
                <Text style={styles.label} numberOfLines={1}>
                  {t.label}
                </Text>
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
      shadowColor: colors.primary,
      shadowOpacity: 0.22,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 12,
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 46,
      minWidth: 46,
      paddingHorizontal: spacing.md,
      borderRadius: radius.pill,
    },
    tabActive: {
      backgroundColor: colors.primary,
      paddingHorizontal: spacing.lg,
    },
    label: {
      color: '#fff',
      fontWeight: '800',
      fontSize: 13,
      marginLeft: spacing.sm,
    },
  });
