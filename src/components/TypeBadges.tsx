import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTypes, typeColor, typeLabel } from '../pokemonTypes';
import { radius } from '../theme';

interface Props {
  formId: number | null; // null = trứng → không hiện gì
  size?: 'sm' | 'md';
}

// Chip hệ (type) của Pokémon, màu theo hệ. Lấy dữ liệu từ PokéAPI qua useTypes.
export default function TypeBadges({ formId, size = 'md' }: Props) {
  const types = useTypes(formId);
  if (formId == null || types.length === 0) return null;
  const sm = size === 'sm';
  return (
    <View style={styles.row}>
      {types.map((t) => {
        const col = typeColor(t);
        return (
          <View
            key={t}
            style={[
              styles.chip,
              sm && styles.chipSm,
              { backgroundColor: col + '26', borderColor: col + '66' },
            ]}
          >
            <View style={[styles.dot, sm && styles.dotSm, { backgroundColor: col }]} />
            <Text style={[styles.label, sm && styles.labelSm, { color: col }]}>{typeLabel(t)}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  chipSm: { paddingHorizontal: 7, paddingVertical: 2, gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotSm: { width: 5, height: 5, borderRadius: 3 },
  label: { fontSize: 12, fontWeight: '800' },
  labelSm: { fontSize: 10.5 },
});
