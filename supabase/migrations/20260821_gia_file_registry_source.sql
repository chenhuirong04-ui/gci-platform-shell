-- GCI Executive Desk — GIA Multi-Source File Intake: provenance columns.
-- Run in Supabase SQL Editor (project: gci-trade-260521 / efrkvwhzpgahjgfukjth)
-- Additive only — no drop/delete/truncate, no change to any existing row.
-- Records WHERE a registered file actually came from (previously every row
-- was implicitly "someone picked a local file"), so gia_file_registry can
-- distinguish a local upload from a fetched Gmail attachment / existing
-- Drive file / URL-fetched file.

alter table gia_file_registry
  add column if not exists source_type text not null default 'upload',
  -- 'upload' | 'gmail_attachment' | 'drive_file' | 'url'
  add column if not exists source_ref  text;
  -- 'upload': null. 'gmail_attachment': '{messageId}:{attachmentId}'.
  -- 'drive_file': the existing Drive file id. 'url': the source URL.

create index if not exists idx_gfr_source_type on gia_file_registry(source_type);
