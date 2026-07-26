import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { useApp } from '../AppContext';
import HabitEditor from '../components/HabitEditor';
import CreatureView from '../components/CreatureView';
import { Habit, ReminderTime, reminderLabel } from '../types';
import { resolveForm } from '../species';
import { Colors, radius, spacing, TAB_BAR_SPACE } from '../theme';
import { useThemedStyles } from '../theme-context';

function fmtTime(r: ReminderTime | null): string {
  if (!r) return 'Không nhắc';
  return `⏰ ${reminderLabel(r)}`;
}

export default function HabitsScreen() {
  const { data, addHabit, updateHabit, deleteHabit } = useApp();
  const styles = useThemedStyles(makeStyles);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);

  const openNew = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (h: Habit) => { setEditing(h); setEditorOpen(true); };

  const handleSave = (input: { title: string; reminder: ReminderTime | null }) => {
    if (editing) updateHabit(editing.id, input);
    else addHabit(input);
    setEditorOpen(false);
  };
  const handleDelete = () => {
    if (editing) deleteHabit(editing.id);
    setEditorOpen(false);
  };

  return (
    <View style={styles.wrap}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Mục tiêu của bạn</Text>
        <Text style={styles.subtitle}>{data.habits.length} mục tiêu · chạm để chỉnh sửa</Text>

        {data.habits.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🎯</Text>
            <Text style={styles.emptyText}>Chưa có mục tiêu nào. Nhấn nút + để thêm.</Text>
          </View>
        ) : (
          data.habits.map((h) => {
            const form = resolveForm(h.creature);
            return (
              <Pressable key={h.id} onPress={() => openEdit(h)} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
                <CreatureView creature={h.creature} size={48} animate={false} />
                <View style={styles.mid}>
                  <Text style={styles.rowTitle} numberOfLines={1}>{h.title}</Text>
                  <Text style={styles.rowSub}>{form.stage === 0 ? 'Trứng' : form.name} · {fmtTime(h.reminder)}</Text>
                </View>
                <Text style={styles.chev}>›</Text>
              </Pressable>
            );
          })
        )}
      </ScrollView>

      <Pressable style={styles.fab} onPress={openNew} accessibilityRole="button" accessibilityLabel="Thêm mục tiêu">
        <Text style={styles.fabText}>+</Text>
      </Pressable>

      <HabitEditor
        visible={editorOpen}
        initial={editing}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
        onDelete={editing ? handleDelete : undefined}
      />
    </View>
  );
}

const makeStyles = (colors: Colors) => StyleSheet.create({
  wrap: { flex: 1 },
  content: { padding: spacing.lg, paddingTop: spacing.xl, paddingBottom: TAB_BAR_SPACE + 60 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800' },
  subtitle: { color: colors.textDim, fontSize: 13, marginTop: spacing.xs, marginBottom: spacing.lg },
  empty: { alignItems: 'center', padding: spacing.xxl },
  emptyEmoji: { fontSize: 48 },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center', marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
  pressed: { opacity: 0.75 },
  mid: { flex: 1, marginLeft: spacing.md },
  rowTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  rowSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  chev: { color: colors.textDim, fontSize: 26, fontWeight: '300' },
  fab: { position: 'absolute', right: spacing.xl, bottom: TAB_BAR_SPACE, width: 60, height: 60, borderRadius: 30, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabText: { color: '#fff', fontSize: 32, fontWeight: '300', marginTop: -2 },
});
