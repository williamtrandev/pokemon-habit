import { useState } from 'react';
import { useApp } from '@app/AppContext';
import { type Habit, type ReminderTime, reminderLabel } from '@app/types';
import { habitStreak } from '@app/gameLogic';
import { todayStr } from '@app/date';
import { feedbackTap } from '@app/feedback';
import Icon from '@web/ui/Icon';
import HabitEditor from '@web/ui/components/HabitEditor';
import { Page, PageHead } from '@web/ui/components/Layout';

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

  const today = todayStr();

  return (
    <>
      <Page>
        {/* Nút thêm nằm trong header, không phải nút tròn nổi ở góc dưới phải.
            Nút nổi (FAB) là quy ước của Android/iOS cho ngón tay; trên máy tính nó vừa che
            nội dung vừa nằm xa chỗ mắt đang đọc, và không có nhãn nên phải đoán. */}
        <PageHead title="Mục tiêu" sub={`${data.habits.length} mục tiêu · bấm một mục để sửa`}>
          <button
            type="button"
            onClick={openNew}
            className="flex items-center gap-2 rounded-pill bg-primary px-5 py-2.5 text-[13.5px] font-extrabold text-white transition-colors hover:brightness-110"
          >
            <Icon name="add" size={17} />
            Thêm mục tiêu
          </button>
        </PageHead>

        {data.habits.length === 0 ? (
          <div className="grid justify-items-center gap-2 rounded-card border border-dashed border-line bg-card px-6 py-16 text-center">
            <span className="text-5xl">🎯</span>
            <p className="mt-2 text-lg font-extrabold text-ink">Chưa có mục tiêu nào</p>
            <p className="max-w-sm text-sm text-ink-dim">
              Mỗi mục tiêu mới sẽ nở ra một quả trứng Pokémon. Hoàn thành mỗi ngày để nuôi nó lớn.
            </p>
            <button
              type="button"
              onClick={openNew}
              className="mt-4 rounded-pill bg-primary px-6 py-3 font-extrabold text-white transition-colors hover:brightness-110"
            >
              Thêm mục tiêu đầu tiên
            </button>
          </div>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {data.habits.map((h) => {
              const streak = habitStreak(h, today);
              return (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => openEdit(h)}
                    className="group flex w-full items-center gap-3 rounded-card border border-line bg-card p-4 text-left transition-colors hover:border-primary/50"
                  >
                    <span className="grid size-11 shrink-0 place-items-center rounded-ctl bg-primary/12 text-primary-soft">
                      <Icon name="flag" size={19} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15.5px] font-bold text-ink">{h.title}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        {streak > 0 && (
                          <span className="nums inline-flex items-center gap-1 text-[12px] font-extrabold text-accent">
                            <Icon name="flame" size={11} />
                            {streak} ngày
                          </span>
                        )}
                        <span className="text-[12px] text-ink-dim">
                          {h.reminder ? `⏰ ${reminderLabel(h.reminder)}` : 'Không nhắc'}
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-ink-dim transition-colors group-hover:text-primary-soft">
                      <Icon name="chevron-forward" size={17} />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Page>

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
