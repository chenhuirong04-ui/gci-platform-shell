revoke all on function public.assistant_preview_action_center_action(text,uuid,jsonb,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.assistant_execute_action_center_action(text,uuid,jsonb,text,text,text,uuid,text,text) from public,anon,authenticated,service_role;
drop function if exists public.assistant_preview_action_center_action(text,uuid,jsonb,text,text,text);
drop function if exists public.assistant_execute_action_center_action(text,uuid,jsonb,text,text,text,uuid,text,text);
