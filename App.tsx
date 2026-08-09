import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Platform, StatusBar, Animated, Easing } from 'react-native';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from './src/AppContext';
import { ThemeProvider, useTheme, useThemedStyles } from './src/theme-context';
import AppBackground from './src/components/AppBackground';
import HomeScreen from './src/screens/HomeScreen';
import HabitsScreen from './src/screens/HabitsScreen';
import HistoryScreen from './src/screens/HistoryScreen';
import PartyScreen from './src/screens/PartyScreen';
import CreatureImage from './src/components/CreatureImage';
import TabBar, { TabItem } from './src/components/TabBar';
import Pokeball from './src/components/Pokeball';
import { Colors, spacing } from './src/theme';

type Tab = 'home' | 'party' | 'habits' | 'history';

const TABS: TabItem<Tab>[] = [
  { key: 'home', label: 'Hôm nay', icon: 'checkmark-done', iconOutline: 'checkmark-done-outline' },
  { key: 'party', label: 'Bầy', icon: 'heart', iconOutline: 'heart-outline' },
  { key: 'habits', label: 'Mục tiêu', icon: 'flag', iconOutline: 'flag-outline' },
  { key: 'history', label: 'Pokédex', icon: 'albums', iconOutline: 'albums-outline' },
];

function Shell() {
  const { ready } = useApp();
  const styles = useThemedStyles(makeStyles);
  const [tab, setTab] = useState<Tab>('home');

  // Chuyển tab: màn mới mờ + trượt nhẹ lên, mượt hơn cắt phụt.
  const anim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [tab]);

  if (!ready) {
    return (
      <View style={styles.loading}>
        <Pokeball size={92} spin />
        <Text style={styles.loadingText}>Đang tải Pokédex...</Text>
      </View>
    );
  }

  return (
    <View style={styles.body}>
      <Animated.View
        style={[
          styles.screen,
          { opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
        ]}
      >
        {tab === 'home' && <HomeScreen onGoHabits={() => setTab('habits')} />}
        {tab === 'party' && <PartyScreen />}
        {tab === 'habits' && <HabitsScreen />}
        {tab === 'history' && <HistoryScreen />}
      </Animated.View>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      <HatchOverlay />
    </View>
  );
}

// Lớp phủ ăn mừng khi NỞ một Pokémon mới vào bộ sưu tập.
function HatchOverlay() {
  const { hatchEvent, clearHatchEvent } = useApp();
  const styles = useThemedStyles(makeStyles);
  const [shown, setShown] = useState<typeof hatchEvent>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    if (!hatchEvent) return;
    setShown(hatchEvent);
    opacity.setValue(0);
    scale.setValue(0.6);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
    ]).start();
    const t = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setShown(null);
        clearHatchEvent();
      });
    }, 2800);
    return () => clearTimeout(t);
  }, [hatchEvent]);

  if (!shown) return null;
  return (
    <Animated.View style={[styles.overlay, { opacity }]} pointerEvents="none">
      <Animated.View style={[styles.overlayCard, { transform: [{ scale }] }]}>
        {shown.kind === 'duplicate' ? (
          <>
            <Text style={styles.overlayBurst}>🥚</Text>
            <Text style={{ fontSize: 90 }}>🔍</Text>
            <Text style={styles.overlayTitle}>Chưa tìm được loài mới</Text>
            <Text style={styles.overlaySub}>Bầy đã có hết những loài bốc trúng — trứng vẫn còn, thử lại nhé!</Text>
          </>
        ) : shown.kind === 'milestone' ? (
          <>
            <Text style={styles.overlayBurst}>🎉🔥🎉</Text>
            <Text style={{ fontSize: 90 }}>🥚✨</Text>
            <Text style={styles.overlayTitle}>Chuỗi {shown.streak} ngày!</Text>
            <Text style={styles.overlaySub}>Phần thưởng: 1 trứng HIẾM (shiny) ✨ — chạm để nở!</Text>
          </>
        ) : (
          <>
            <Text style={styles.overlayBurst}>{shown.kind === 'evolve' ? '✨🎉✨' : '🥚✨'}</Text>
            <CreatureImage formId={shown.id} shiny={shown.shiny} size={140} />
            <Text style={styles.overlayTitle}>{shown.kind === 'evolve' ? 'Tiến hoá!' : 'Nở trứng!'}</Text>
            <Text style={styles.overlaySub}>
              {shown.shiny ? 'Pokémon Shiny ✨' : shown.kind === 'evolve' ? 'Bé đã lớn hơn rồi!' : 'Pokémon mới vào bầy!'}
            </Text>
          </>
        )}
      </Animated.View>
    </Animated.View>
  );
}

function Root() {
  const { scheme } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <AppBackground>
      <SafeAreaView style={styles.safe}>
        <ExpoStatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <Shell />
      </SafeAreaView>
    </AppBackground>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <Root />
      </AppProvider>
    </ThemeProvider>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: 'transparent', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    body: { flex: 1 },
    screen: { flex: 1 },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingEmoji: { fontSize: 64 },
    loadingText: { color: colors.textDim, marginTop: spacing.md, fontSize: 15 },
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000000CC', alignItems: 'center', justifyContent: 'center' },
    overlayCard: { alignItems: 'center', padding: spacing.xl },
    overlayBurst: { fontSize: 30, marginBottom: spacing.md },
    overlayTitle: { color: '#fff', fontSize: 32, fontWeight: '900', marginTop: spacing.md },
    overlaySub: { color: '#C4B5FD', fontSize: 16, fontWeight: '700', marginTop: spacing.xs, textAlign: 'center', paddingHorizontal: spacing.lg },
  });
