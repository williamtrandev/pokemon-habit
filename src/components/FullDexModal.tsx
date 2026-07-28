import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { Colors, radius, spacing } from '../theme';
import { useTheme, useThemedStyles } from '../theme-context';
import { MAX_EVO_CHAIN, fetchEvolutionChain, EvoChain, MegaForm } from '../species';
import { fetchMegas } from '../megaForms';
import CreatureImage from './CreatureImage';

interface Props {
  visible: boolean;
  onClose: () => void;
  caught: Set<number>; // id các loài đã get (tô sáng trong cây tiến hoá)
}

const CHAIN_IDS = Array.from({ length: MAX_EVO_CHAIN }, (_, i) => i + 1);

// Danh sách DẠNG CƠ BẢN của mọi dòng tiến hoá. LAZY: mỗi ô tự fetch chain khi được
// FlatList render (ảo hoá -> chỉ ô đang thấy mới tải). Click 1 con -> cây tiến hoá.
export default function FullDexModal({ visible, onClose, caught }: Props) {
  const styles = useThemedStyles(makeStyles);
  const [selected, setSelected] = useState<EvoChain | null>(null);
  // chainId rỗng/404 -> ẩn hẳn ô (không hiện "—").
  const [hidden, setHidden] = useState<Set<number>>(() => new Set());
  const markEmpty = useCallback((id: number) => setHidden((h) => (h.has(id) ? h : new Set(h).add(id))), []);
  const data = useMemo(() => CHAIN_IDS.filter((n) => !hidden.has(n)), [hidden]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Toàn bộ Pokédex</Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.close}>
            <Text style={styles.closeX}>✕</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>Dạng cơ bản · chạm để xem cây tiến hoá</Text>

        <FlatList
          data={data}
          keyExtractor={(n) => String(n)}
          numColumns={3}
          initialNumToRender={18}
          maxToRenderPerBatch={18}
          windowSize={5}
          removeClippedSubviews
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.list}
          renderItem={({ item: chainId }) => (
            <BaseCell chainId={chainId} caught={caught} onOpen={setSelected} onEmpty={markEmpty} />
          )}
        />
      </View>

      <ChainSheet chain={selected} caught={caught} onClose={() => setSelected(null)} />
    </Modal>
  );
}

// Một ô dạng cơ bản — tự lazy-fetch chain khi mount (chỉ khi FlatList render ô này).
function BaseCell({ chainId, caught, onOpen, onEmpty }: { chainId: number; caught: Set<number>; onOpen: (c: EvoChain) => void; onEmpty: (id: number) => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [chain, setChain] = useState<EvoChain | null>(null);

  useEffect(() => {
    let alive = true;
    fetchEvolutionChain(chainId).then((c) => {
      if (!alive) return;
      if (!c) { onEmpty(chainId); return; } // chain rỗng/404 -> ẩn ô (không hiện "—")
      setChain(c);
    });
    return () => {
      alive = false;
    };
  }, [chainId]);

  const base = chain?.line[0];
  const got = !!base && caught.has(base.id);

  return (
    <Pressable disabled={!chain} onPress={() => chain && onOpen(chain)} style={[styles.cell, got && styles.cellGot]}>
      {base ? (
        <CreatureImage formId={base.id} size={58} />
      ) : (
        <View style={styles.silhouette}>
          <ActivityIndicator size="small" color={colors.textDim} />
        </View>
      )}
      <Text style={styles.name} numberOfLines={1}>{base?.name ?? ''}</Text>
      <Text style={[styles.tag, got && styles.tagGot]} numberOfLines={1}>
        {got ? '✓ Đã get' : chain && chain.line.length > 1 ? `${chain.line.length} bậc` : ' '}
      </Text>
    </Pressable>
  );
}

// Sheet cây tiến hoá của 1 dòng: base → ... + Mega (nếu có). Con đã get tô sáng.
function ChainSheet({ chain, caught, onClose }: { chain: EvoChain | null; caught: Set<number>; onClose: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [megas, setMegas] = useState<MegaForm[] | null>(null); // null = đang tra

  useEffect(() => {
    if (!chain) { setMegas(null); return; }
    let alive = true;
    setMegas(null);
    const finalId = chain.line[chain.line.length - 1].id;
    fetchMegas(finalId).then((ms) => { if (alive) setMegas(ms); });
    return () => { alive = false; };
  }, [chain]);

  return (
    <Modal visible={!!chain} animationType="fade" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Cây tiến hoá</Text>
          <View style={styles.chainRow}>
            {chain?.line.map((f, i) => (
              <React.Fragment key={f.id}>
                {i > 0 && <Text style={styles.arrow}>→</Text>}
                <View style={[styles.chainNode, caught.has(f.id) ? styles.chainNodeGot : styles.chainNodeDim]}>
                  <View style={!caught.has(f.id) ? styles.imgLocked : undefined}>
                    <CreatureImage formId={f.id} size={64} />
                  </View>
                  <Text style={styles.chainName} numberOfLines={2}>{f.name}</Text>
                  <Text style={[styles.tag, caught.has(f.id) && styles.tagGot]}>
                    {caught.has(f.id) ? '✓ Đã get' : `Bậc ${i + 1}`}
                  </Text>
                </View>
              </React.Fragment>
            ))}
          </View>

          <Text style={styles.megaHead}>🔮 Mega tiến hoá</Text>
          {megas === null ? (
            <ActivityIndicator size="small" color={colors.textDim} style={{ marginTop: spacing.sm }} />
          ) : megas.length === 0 ? (
            <Text style={styles.megaNone}>Loài này không có Mega.</Text>
          ) : (
            <View style={styles.megaRow}>
              {megas.map((m) => (
                <View key={m.id} style={[styles.chainNode, caught.has(m.id) ? styles.chainNodeGot : styles.chainNodeDim]}>
                  <View style={!caught.has(m.id) ? styles.imgLocked : undefined}>
                    <CreatureImage formId={m.id} size={64} />
                  </View>
                  <Text style={styles.chainName} numberOfLines={2}>{m.name}</Text>
                  <Text style={[styles.tag, caught.has(m.id) && styles.tagGot]}>
                    {caught.has(m.id) ? '✓ Đã get' : 'Mega'}
                  </Text>
                </View>
              ))}
            </View>
          )}

          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeText}>Đóng</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg, paddingTop: 64 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg },
    title: { color: colors.text, fontSize: 22, fontWeight: '800' },
    subtitle: { color: colors.textDim, fontSize: 13, paddingHorizontal: spacing.lg, marginTop: 2, marginBottom: spacing.sm },
    close: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    closeX: { color: colors.text, fontSize: 16, fontWeight: '800' },
    list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
    row: { gap: spacing.sm },
    cell: { flex: 1 / 3, alignItems: 'center', backgroundColor: colors.cardAlt, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, marginBottom: spacing.sm },
    cellGot: { borderColor: colors.primary, shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 7, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
    silhouette: { width: 58, height: 58, borderRadius: 12, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
    name: { color: colors.text, fontSize: 11, fontWeight: '700', marginTop: 3, maxWidth: '92%' },
    tag: { color: colors.textDim, fontSize: 10, fontWeight: '700', marginTop: 1 },
    tagGot: { color: colors.green },
    // Sheet
    backdrop: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.bgSoft, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, marginBottom: spacing.md },
    sheetTitle: { color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: spacing.md },
    chainRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: spacing.xs },
    arrow: { color: colors.textDim, fontSize: 16 },
    chainNode: { alignItems: 'center', backgroundColor: colors.cardAlt, borderRadius: radius.md, borderWidth: 1, paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, width: 104 },
    chainNodeGot: { borderColor: colors.primary },
    chainNodeDim: { borderColor: colors.border, opacity: 0.65 },
    imgLocked: { opacity: 0.3 },
    chainName: { color: colors.text, fontSize: 12, fontWeight: '700', marginTop: 3, width: '100%', textAlign: 'center' },
    megaHead: { color: colors.text, fontSize: 14, fontWeight: '800', marginTop: spacing.lg, marginBottom: spacing.sm },
    megaNone: { color: colors.textDim, fontSize: 12, fontStyle: 'italic' },
    megaRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: spacing.sm },
    closeBtn: { marginTop: spacing.lg, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: spacing.md, alignItems: 'center' },
    closeText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  });
