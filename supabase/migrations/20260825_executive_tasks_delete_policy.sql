-- GCI Executive Desk — executive_tasks: add missing DELETE RLS policy
-- Run in Supabase SQL Editor (project: gci-trade-260521 / efrkvwhzpgahjgfukjth)
-- Root cause of "/tasks 已完成删除按钮点了但没真的删除": 20260817_executive_tasks.sql
-- only ever granted select/insert/update policies, no delete policy. With
-- RLS enabled and no matching policy, a delete matches zero rows (Supabase
-- returns success, not an error) — the app's deleteExecutiveTask() call was
-- always a silent no-op. Additive only: no existing policy/column/table
-- touched, same auth.uid() is not null convention already used by this
-- table's own select/insert/update policies.

create policy "executive_tasks_delete"
  on executive_tasks for delete
  using (auth.uid() is not null);
