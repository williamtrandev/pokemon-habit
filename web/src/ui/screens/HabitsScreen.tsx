import { useState } from 'react';
import { useApp } from '@app/AppContext';
import { type Habit, type ReminderTime, reminderLabel } from '@app/types';
import { feedbackTap } from '@app/feedback';
import Icon from '@web/ui/Icon';
import HabitEditor from '@web/ui/components/HabitEditor';

function fmtTime(r: ReminderTime | null): string {
  if (!r) return 'Không nhắc';
  return `⏰ ${reminderLabel(r)}`;
}

export default function HabitsScreen() {
  const { data, addHabit, updateHabit, deleteHabit } = useApp();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Habit | null>(null);

  const openNew = () => {
    feedbackTap();
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (h: Habit) => {
    feedbackTap();
    setEditing(h);
    setEditorOpen(true);
  };

  const handleSave = (input: { title: string; reminder: ReminderTime | null }) => {
    if (editing) void updateHabit(editing.id, input);
    else void addHabit(input);
    setEditorOpen(false);
  };
  const handleDelete = () => {
    if (editing) void deleteHabit(editing.id);
    setEditorOpen(false);
  };

  return (
    <>
      <div className="px-4 pt-6 pb-40">
        <h1 className="text-2xl font-extrabold text-ink">Mục tiêu của bạn</h1>
        <p className="mt-1 mb-4 text-[13px] text-ink-dim">{data.habits.length} mục tiêu · chạm để chỉnh sửa</p>

        {data.habits.length === 0 ? (
          <div className="grid justify-items-center gap-3 p-8 text-center">
            <span className="text-5xl">🎯</span>
            <p className="text-sm text-ink-dim">Chưa có mục tiêu nào. Nhấn nút + để thêm.</p>
          </div>
        ) : (
          data.habits.map((h) => (
            <button
              key={h.id}
              type="button"
              onClick={() => openEdit(h)}
              className="mb-2 flex w-full items-center rounded-card border border-line bg-card p-3 text-left transition-opacity active:opacity-75 hover:border-primary/50"
            >
              <span className="grid size-11 place-items-center rounded-[12px] bg-primary/10 text-primary-soft">
                <Icon name="flag" size={20} />
              </span>
              <span className="mx-3 min-w-0 flex-1">
                <span className="block truncate text-base font-bold text-ink">{h.title}</span>
                <span className="mt-0.5 block text-xs text-ink-dim">{fmtTime(h.reminder)}</span>
              </span>
              <Icon name="chevron-forward" size={18} className="text-ink-dim" />
            </button>
          ))
        )}
      </div>

      {/* FAB nổi trên tab bar, khớp vị trí bottom: TAB_BAR_SPACE của app native. */}
      <button
        type="button"
        onClick={openNew}
        aria-label="Thêm mục tiêu"
        className="absolute right-6 bottom-26 grid size-15 place-items-center rounded-full bg-primary text-white shadow-[0_4px_12px_rgba(139,92,246,0.5)] transition-transform active:scale-95"
      >
        <Icon name="add" size={30} />
      </button>

      <HabitEditor
        open={editorOpen}
        initial={editing}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
        onDelete={editing ? handleDelete : undefined}
      />
    </>
  );
}
