-- GCI Executive Desk — Task 9: Decision Follow-through
-- Run in Supabase SQL Editor (project: gci-trade-260521 / efrkvwhzpgahjgfukjth)
-- Pure additive ALTER — no drop/truncate/delete, no rewriting of existing
-- decision content. Existing decided rows simply get NULL execution_status
-- (never batch-guessed) until Chris explicitly sets one going forward.

alter table executive_decisions add column if not exists execution_status text;
alter table executive_decisions add column if not exists assignee text;
alter table executive_decisions add column if not exists execution_due_at timestamptz;
alter table executive_decisions add column if not exists execution_note text;
alter table executive_decisions add column if not exists completed_at timestamptz;
alter table executive_decisions add column if not exists follow_up_at timestamptz;

create index if not exists idx_ed_execution_status on executive_decisions(execution_status);
create index if not exists idx_ed_execution_due_at on executive_decisions(execution_due_at);
create index if not exists idx_ed_follow_up_at on executive_decisions(follow_up_at);
