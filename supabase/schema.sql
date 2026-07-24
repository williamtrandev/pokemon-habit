-- Habit Pet — schema Supabase
-- Chạy trong Supabase Dashboard -> SQL Editor -> New query -> Run.
-- Mô hình: mỗi user giữ MỘT khối JSON (toàn bộ AppData). RLS đảm bảo user chỉ
-- đọc/ghi dữ liệu của chính mình.

create table if not exists public.user_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_state enable row level security;

-- Chỉ chủ sở hữu mới thao tác được trên hàng của mình.
create policy "user_state_select_own"
  on public.user_state for select
  using (auth.uid() = user_id);

create policy "user_state_insert_own"
  on public.user_state for insert
  with check (auth.uid() = user_id);

create policy "user_state_update_own"
  on public.user_state for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
