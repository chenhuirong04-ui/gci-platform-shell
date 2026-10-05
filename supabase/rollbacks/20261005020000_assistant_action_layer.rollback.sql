-- Rollback removes only the v2 functions and preview table. Additive audit
-- columns are retained so historical audit records remain readable.
revoke all on function public.assistant_preview_business_action(text,uuid,jsonb,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.assistant_execute_business_action(text,uuid,jsonb,text,text,text,uuid,text,text) from public,anon,authenticated,service_role;
drop function if exists public.assistant_preview_business_action(text,uuid,jsonb,text,text,text);
drop function if exists public.assistant_execute_business_action(text,uuid,jsonb,text,text,text,uuid,text,text);
drop table if exists assistant_private.action_previews;
