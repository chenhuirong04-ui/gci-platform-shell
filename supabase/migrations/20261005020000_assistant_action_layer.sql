-- GCI Executive Assistant Action Layer v2.
-- Extends the existing private audit/idempotency store and adds expiring
-- confirmation previews. No second business master is introduced.

alter table assistant_private.idempotency_requests
  alter column customer_id drop not null,
  add column if not exists module text,
  add column if not exists target_type text,
  add column if not exists target_id uuid,
  add column if not exists request_id uuid not null default gen_random_uuid();

alter table assistant_private.audit_log
  alter column customer_id drop not null,
  add column if not exists action_type text,
  add column if not exists module text,
  add column if not exists target_type text,
  add column if not exists reason text,
  add column if not exists request_id uuid not null default gen_random_uuid(),
  add column if not exists confirmation_required boolean not null default false,
  add column if not exists confirmed_by text;

update assistant_private.audit_log
set action_type = action,
    module = coalesce(module, 'crm'),
    target_type = coalesce(target_type, case when action = 'followup_create' then 'followup' when action = 'contact_upsert' then 'contact' else 'customer' end)
where action_type is null or module is null or target_type is null;

create table if not exists assistant_private.action_previews (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action_type text not null,
  module text not null,
  target_type text not null,
  target_id uuid,
  payload jsonb not null,
  request_hash text not null,
  reason text not null,
  risk_level text not null check (risk_level in ('medium', 'high')),
  before_state jsonb,
  proposed_state jsonb not null,
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  confirmed_by text,
  confirmed_at timestamptz,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists assistant_action_previews_expiry_idx
  on assistant_private.action_previews(expires_at);

alter table assistant_private.action_previews enable row level security;
revoke all on assistant_private.action_previews from public, anon, authenticated;
grant select, insert, update on assistant_private.action_previews to service_role;

create or replace function public.assistant_preview_business_action(
  p_action_type text,
  p_target_id uuid,
  p_payload jsonb,
  p_request_hash text,
  p_reason text,
  p_actor text default 'gci-executive-assistant'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, assistant_private, pg_temp
as $$
declare
  v_risk text;
  v_module text;
  v_target_type text;
  v_before jsonb;
  v_preview assistant_private.action_previews%rowtype;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'assistant_service_role_required' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or length(btrim(coalesce(p_reason, ''))) not between 1 and 1000 then
    raise exception 'assistant_invalid_payload' using errcode = '22023';
  end if;

  v_risk := case
    when p_action_type in ('quotation_draft_update','invoice_draft_update','customer_status_update','customer_owner_update','project_update','supplier_product_price_update') then 'medium'
    when p_action_type in ('invoice_issue','project_complete','customer_close') then 'high'
  end;
  if v_risk is null then
    raise exception 'assistant_invalid_payload' using errcode = '22023';
  end if;

  v_module := case
    when p_action_type like 'quotation_%' then 'quotation'
    when p_action_type like 'invoice_%' then 'invoice'
    when p_action_type like 'customer_%' then 'crm'
    when p_action_type like 'project_%' then 'project'
    when p_action_type like 'supplier_%' then 'supplier'
  end;
  v_target_type := case
    when p_action_type like 'quotation_%' then 'quotation'
    when p_action_type like 'invoice_%' then 'invoice'
    when p_action_type like 'customer_%' then 'customer'
    when p_action_type like 'project_%' then 'project'
    when p_action_type like 'supplier_product_%' then 'supplier_product'
  end;
  if p_target_id is null then
    raise exception 'assistant_invalid_payload' using errcode = '22023';
  end if;

  case v_target_type
    when 'quotation' then select to_jsonb(t) into v_before from public.quotation_records t where id = p_target_id;
    when 'invoice' then select to_jsonb(t) into v_before from public.invoice_drafts t where id = p_target_id;
    when 'customer' then select to_jsonb(t) into v_before from public.crm_customers t where id = p_target_id;
    when 'project' then select to_jsonb(t) into v_before from public.crm_projects t where id = p_target_id;
    when 'supplier_product' then select to_jsonb(t) into v_before from public.supplier_products t where id = p_target_id;
  end case;
  if v_before is null then
    raise exception 'assistant_target_not_found' using errcode = 'P0002';
  end if;

  insert into assistant_private.action_previews (
    actor, action_type, module, target_type, target_id, payload,
    request_hash, reason, risk_level, before_state, proposed_state
  ) values (
    p_actor, p_action_type, v_module, v_target_type, p_target_id, p_payload,
    p_request_hash, btrim(p_reason), v_risk, v_before, v_before || p_payload
  ) returning * into v_preview;

  return jsonb_build_object(
    'ok', true,
    'preview_id', v_preview.id,
    'risk', v_risk,
    'action_type', p_action_type,
    'module', v_module,
    'target_type', v_target_type,
    'target_id', p_target_id,
    'before', v_before,
    'proposed', v_preview.proposed_state,
    'reason', v_preview.reason,
    'expires_at', v_preview.expires_at,
    'confirmation_required', true
  );
end;
$$;

create or replace function public.assistant_execute_business_action(
  p_action_type text,
  p_target_id uuid,
  p_payload jsonb,
  p_idempotency_key text,
  p_request_hash text,
  p_reason text,
  p_confirmation_token uuid default null,
  p_confirmed_by text default null,
  p_actor text default 'gci-executive-assistant'
)
returns jsonb
language plpgsql
security invoker
set search_path = public, assistant_private, pg_temp
as $$
declare
  v_risk text;
  v_module text;
  v_target_type text;
  v_inserted integer := 0;
  v_existing_hash text;
  v_existing_response jsonb;
  v_before jsonb;
  v_after jsonb;
  v_result jsonb;
  v_created_id uuid;
  v_customer_id uuid;
  v_request_id uuid := gen_random_uuid();
  v_preview assistant_private.action_previews%rowtype;
  v_items jsonb;
  v_item jsonb;
  v_subtotal numeric := 0;
  v_cost_total numeric := 0;
  v_vat_rate numeric := 5;
  v_vat numeric := 0;
  v_total numeric := 0;
  v_currency text := 'AED';
  v_status text;
begin
  if current_setting('request.jwt.claim.role', true) is distinct from 'service_role' then
    raise exception 'assistant_service_role_required' using errcode = '42501';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object'
     or length(coalesce(p_idempotency_key, '')) not between 8 and 200
     or p_request_hash !~ '^[0-9a-f]{64}$'
     or length(btrim(coalesce(p_reason, ''))) not between 1 and 1000
     or length(coalesce(p_actor, '')) not between 1 and 100 then
    raise exception 'assistant_invalid_payload' using errcode = '22023';
  end if;

  v_risk := case
    when p_action_type in ('task_create','quotation_draft_create','invoice_draft_create','project_note_update','supplier_note_update') then 'low'
    when p_action_type in ('quotation_draft_update','invoice_draft_update','customer_status_update','customer_owner_update','project_update','supplier_product_price_update') then 'medium'
    when p_action_type in ('invoice_issue','project_complete','customer_close') then 'high'
  end;
  if v_risk is null then raise exception 'assistant_forbidden_action' using errcode = '42501'; end if;

  v_module := case
    when p_action_type = 'task_create' then 'management'
    when p_action_type like 'quotation_%' then 'quotation'
    when p_action_type like 'invoice_%' then 'invoice'
    when p_action_type like 'customer_%' then 'crm'
    when p_action_type like 'project_%' then 'project'
    when p_action_type like 'supplier_%' then 'supplier'
  end;
  v_target_type := case
    when p_action_type = 'task_create' then 'task'
    when p_action_type like 'quotation_%' then 'quotation'
    when p_action_type like 'invoice_%' then 'invoice'
    when p_action_type like 'customer_%' then 'customer'
    when p_action_type like 'project_%' then 'project'
    when p_action_type = 'supplier_note_update' then 'supplier'
    when p_action_type like 'supplier_product_%' then 'supplier_product'
  end;

  insert into assistant_private.idempotency_requests (
    action, idempotency_key, request_hash, actor, customer_id, module,
    target_type, target_id, request_id
  ) values (
    p_action_type, p_idempotency_key, p_request_hash, p_actor, null, v_module,
    v_target_type, p_target_id, v_request_id
  ) on conflict (action, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select request_hash, response into v_existing_hash, v_existing_response
    from assistant_private.idempotency_requests
    where action = p_action_type and idempotency_key = p_idempotency_key;
    if v_existing_hash is distinct from p_request_hash then
      raise exception 'assistant_idempotency_conflict' using errcode = '23505';
    end if;
    if v_existing_response is null then
      raise exception 'assistant_idempotency_incomplete' using errcode = '55000';
    end if;
    return v_existing_response || jsonb_build_object('idempotent_replay', true);
  end if;

  if v_risk <> 'low' then
    if p_confirmation_token is null or length(btrim(coalesce(p_confirmed_by, ''))) < 1 then
      raise exception 'assistant_confirmation_required' using errcode = '42501';
    end if;
    select * into v_preview from assistant_private.action_previews
    where id = p_confirmation_token for update;
    if v_preview.id is null then raise exception 'assistant_confirmation_invalid' using errcode = 'P0002'; end if;
    if v_preview.expires_at < now() then raise exception 'assistant_confirmation_expired' using errcode = '57014'; end if;
    if v_preview.executed_at is not null or v_preview.actor <> p_actor
       or v_preview.action_type <> p_action_type
       or v_preview.target_id is distinct from p_target_id
       or v_preview.request_hash <> p_request_hash then
      raise exception 'assistant_confirmation_mismatch' using errcode = '22023';
    end if;
    update assistant_private.action_previews
      set confirmed_by = btrim(p_confirmed_by), confirmed_at = now()
      where id = p_confirmation_token;
  end if;

  if p_action_type = 'task_create' then
    if length(btrim(coalesce(p_payload->>'title',''))) not between 1 and 500
       or coalesce(p_payload->>'business_area','OTHER') not in ('25H_AI','TRADE','ECOMMERCE','COMPANY_ADMIN','OTHER')
       or coalesce(p_payload->>'priority','P3') not in ('P1','P2','P3') then
      raise exception 'assistant_invalid_payload' using errcode = '22023';
    end if;
    if p_payload ? 'related_customer_id' then v_customer_id := (p_payload->>'related_customer_id')::uuid; end if;
    insert into public.executive_tasks (
      title, description, business_area, priority, due_at, reminder_at,
      related_customer_id, source, status
    ) values (
      btrim(p_payload->>'title'), nullif(btrim(p_payload->>'description'), ''),
      coalesce(p_payload->>'business_area','OTHER'), coalesce(p_payload->>'priority','P3'),
      nullif(p_payload->>'due_at','')::timestamptz, nullif(p_payload->>'reminder_at','')::timestamptz,
      v_customer_id, 'assistant_api', 'open'
    ) returning id, to_jsonb(executive_tasks.*) into v_created_id, v_after;

  elsif p_action_type = 'quotation_draft_create' then
    v_customer_id := (p_payload->>'customer_id')::uuid;
    select to_jsonb(c) into v_before from public.crm_customers c where id = v_customer_id and is_active = true;
    if v_before is null then raise exception 'assistant_target_not_found' using errcode = 'P0002'; end if;
    v_items := p_payload->'items';
    if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) not between 1 and 100 then raise exception 'assistant_invalid_payload' using errcode = '22023'; end if;
    v_currency := coalesce(nullif(p_payload->>'currency',''), 'AED');
    v_vat_rate := coalesce(nullif(p_payload->>'vat_rate','')::numeric, 5);
    for v_item in select value from jsonb_array_elements(v_items) loop
      if length(btrim(coalesce(v_item->>'item_name',''))) < 1 then raise exception 'assistant_invalid_payload' using errcode = '22023'; end if;
      v_subtotal := v_subtotal + coalesce((v_item->>'qty')::numeric,0) * coalesce((v_item->>'selling_price')::numeric,0);
      v_cost_total := v_cost_total + coalesce((v_item->>'qty')::numeric,0) * coalesce((v_item->>'supplier_cost')::numeric,0);
    end loop;
    v_vat := round(v_subtotal * v_vat_rate / 100, 2); v_total := v_subtotal + v_vat;
    insert into public.quotation_records (
      quote_no, customer_name, project_name, customer_id, project_id, quote_type,
      status, source, supplier_cost_total, selling_total, profit_total,
      margin_percent, vat_amount, grand_total, terms_notes, created_by, quote_date
    ) values (
      'EA-' || to_char(current_date,'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
      v_before->>'customer_name', nullif(p_payload->>'project_name',''), v_customer_id,
      nullif(p_payload->>'project_id','')::uuid, coalesce(p_payload->>'quote_type','CUSTOM'),
      'DRAFT', 'assistant_api', v_cost_total, v_subtotal, v_subtotal-v_cost_total,
      case when v_subtotal=0 then 0 else round((v_subtotal-v_cost_total)*100/v_subtotal,2) end,
      v_vat, v_total, nullif(p_payload->>'terms_notes',''), p_actor, current_date::text
    ) returning id, to_jsonb(quotation_records.*) into v_created_id, v_after;
    insert into public.quotation_items (
      quotation_id,item_name,description,qty,unit,supplier_cost,selling_price,
      profit_amount,margin_percent,vat_amount,line_total,currency,item_notes,sort_order
    ) select v_created_id, btrim(x->>'item_name'), nullif(x->>'description',''),
      coalesce((x->>'qty')::numeric,0), coalesce(nullif(x->>'unit',''),'PCS'),
      coalesce((x->>'supplier_cost')::numeric,0), coalesce((x->>'selling_price')::numeric,0),
      (coalesce((x->>'selling_price')::numeric,0)-coalesce((x->>'supplier_cost')::numeric,0))*coalesce((x->>'qty')::numeric,0),
      case when coalesce((x->>'selling_price')::numeric,0)=0 then 0 else round((coalesce((x->>'selling_price')::numeric,0)-coalesce((x->>'supplier_cost')::numeric,0))*100/coalesce((x->>'selling_price')::numeric,0),2) end,
      round(coalesce((x->>'selling_price')::numeric,0)*coalesce((x->>'qty')::numeric,0)*v_vat_rate/100,2),
      round(coalesce((x->>'selling_price')::numeric,0)*coalesce((x->>'qty')::numeric,0)*(1+v_vat_rate/100),2),
      v_currency, nullif(x->>'notes',''), ord::integer-1
    from jsonb_array_elements(v_items) with ordinality as t(x,ord);
    v_after := v_after || jsonb_build_object('items',(
      select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order),'[]'::jsonb)
      from public.quotation_items i where i.quotation_id=v_created_id
    ));

  elsif p_action_type = 'invoice_draft_create' then
    v_customer_id := (p_payload->>'customer_id')::uuid;
    select to_jsonb(c) into v_before from public.crm_customers c where id = v_customer_id and is_active = true;
    if v_before is null then raise exception 'assistant_target_not_found' using errcode = 'P0002'; end if;
    v_items := p_payload->'items';
    if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) not between 1 and 100 then raise exception 'assistant_invalid_payload' using errcode = '22023'; end if;
    v_vat_rate := coalesce(nullif(p_payload->>'vat_rate','')::numeric, 5);
    v_currency := coalesce(nullif(p_payload->>'currency',''),'AED');
    v_items := (select jsonb_agg(jsonb_build_object(
      'id', gen_random_uuid(), 'description', btrim(x->>'description'),
      'qty', coalesce((x->>'qty')::numeric,1), 'unitPrice', coalesce((x->>'unit_price')::numeric,0),
      'amount', coalesce((x->>'qty')::numeric,1)*coalesce((x->>'unit_price')::numeric,0)
    ) order by ord) from jsonb_array_elements(v_items) with ordinality as t(x,ord));
    if exists (select 1 from jsonb_array_elements(v_items) x where length(btrim(coalesce(x->>'description',''))) < 1) then raise exception 'assistant_invalid_payload' using errcode = '22023'; end if;
    select coalesce(sum((x->>'amount')::numeric),0) into v_subtotal from jsonb_array_elements(v_items) x;
    v_vat := round(v_subtotal*v_vat_rate/100,2); v_total := v_subtotal+v_vat;
    insert into public.invoice_drafts (
      invoice_no, customer_name, bill_to, invoice_date, due_date, currency, items,
      subtotal, vat_rate, vat_amount, total, payment_terms, other_comments,
      related_quotation, status, notes
    ) values (
      'INV-EA-' || to_char(current_date,'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,6)),
      v_before->>'customer_name', coalesce(p_payload->'bill_to',jsonb_build_object('name',v_before->>'customer_name')),
      coalesce(nullif(p_payload->>'invoice_date','')::date,current_date),
      coalesce(nullif(p_payload->>'due_date','')::date,current_date+30), v_currency, v_items,
      v_subtotal,v_vat_rate,v_vat,v_total,coalesce(p_payload->>'payment_terms',''),
      coalesce(p_payload->>'other_comments',''),coalesce(p_payload->>'related_quotation',''),
      'draft',coalesce(p_payload->>'notes','')
    ) returning id, to_jsonb(invoice_drafts.*) into v_created_id, v_after;

  elsif p_action_type = 'project_note_update' then
    select to_jsonb(t) into v_before from public.crm_projects t where id=p_target_id for update;
    if v_before is null or length(btrim(coalesce(p_payload->>'note',''))) not between 1 and 5000 then raise exception 'assistant_invalid_payload' using errcode='22023'; end if;
    update public.crm_projects set notes=concat_ws(E'\n',nullif(notes,''),'['||to_char(now() at time zone 'Asia/Dubai','YYYY-MM-DD HH24:MI')||' assistant] '||btrim(p_payload->>'note')),updated_at=now() where id=p_target_id returning to_jsonb(crm_projects.*) into v_after;

  elsif p_action_type = 'supplier_note_update' then
    select to_jsonb(t) into v_before from public.suppliers t where id=p_target_id for update;
    if v_before is null or length(btrim(coalesce(p_payload->>'note',''))) not between 1 and 5000 then raise exception 'assistant_invalid_payload' using errcode='22023'; end if;
    update public.suppliers set notes=concat_ws(E'\n',nullif(notes,''),'['||to_char(now() at time zone 'Asia/Dubai','YYYY-MM-DD HH24:MI')||' assistant] '||btrim(p_payload->>'note')),updated_at=now() where id=p_target_id returning to_jsonb(suppliers.*) into v_after;

  elsif p_action_type = 'customer_status_update' then
    v_status := p_payload->>'status';
    if v_status not in ('新询盘','需求整理中','待报价','已报价待确认','合同待签','执行中','暂缓','已成交') then raise exception 'assistant_invalid_payload' using errcode='22023'; end if;
    select to_jsonb(t) into v_before from public.crm_customers t where id=p_target_id for update;
    if v_before is null then raise exception 'assistant_target_not_found' using errcode='P0002'; end if;
    update public.crm_customers set status=v_status,updated_at=now() where id=p_target_id returning to_jsonb(crm_customers.*) into v_after;

  elsif p_action_type = 'customer_owner_update' then
    if length(btrim(coalesce(p_payload->>'owner',''))) not between 1 and 200 then raise exception 'assistant_invalid_payload' using errcode='22023'; end if;
    select to_jsonb(t) into v_before from public.crm_customers t where id=p_target_id for update;
    if v_before is null then raise exception 'assistant_target_not_found' using errcode='P0002'; end if;
    update public.crm_customers set owner=btrim(p_payload->>'owner'),updated_at=now() where id=p_target_id returning to_jsonb(crm_customers.*) into v_after;

  elsif p_action_type = 'project_update' then
    v_status := p_payload->>'status';
    if v_status is not null and v_status not in ('active','on_hold') then raise exception 'assistant_invalid_payload' using errcode='22023'; end if;
    select to_jsonb(t) into v_before from public.crm_projects t where id=p_target_id for update;
    if v_before is null then raise exception 'assistant_target_not_found' using errcode='P0002'; end if;
    update public.crm_projects set status=coalesce(v_status,status),notes=case when p_payload?'notes' then nullif(btrim(p_payload->>'notes'),'') else notes end,updated_at=now() where id=p_target_id returning to_jsonb(crm_projects.*) into v_after;

  elsif p_action_type = 'supplier_product_price_update' then
    select to_jsonb(t) into v_before from public.supplier_products t where id=p_target_id for update;
    if v_before is null then raise exception 'assistant_target_not_found' using errcode='P0002'; end if;
    update public.supplier_products set
      indicative_price_min=case when p_payload?'indicative_price_min' then (p_payload->>'indicative_price_min')::numeric else indicative_price_min end,
      indicative_price_max=case when p_payload?'indicative_price_max' then (p_payload->>'indicative_price_max')::numeric else indicative_price_max end,
      default_currency=case when p_payload?'currency' then p_payload->>'currency' else default_currency end,
      updated_at=now() where id=p_target_id returning to_jsonb(supplier_products.*) into v_after;

  elsif p_action_type = 'quotation_draft_update' then
    select to_jsonb(t)||jsonb_build_object('items',(
      select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order),'[]'::jsonb)
      from public.quotation_items i where i.quotation_id=t.id
    )) into v_before from public.quotation_records t where id=p_target_id and status='DRAFT' for update;
    if v_before is null then raise exception 'assistant_invalid_transition' using errcode='22023'; end if;
    if p_payload ? 'items' then
      v_items := p_payload->'items'; v_subtotal:=0; v_cost_total:=0;
      if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items) not between 1 and 100 then raise exception 'assistant_invalid_payload' using errcode='22023'; end if;
      v_vat_rate:=coalesce(nullif(p_payload->>'vat_rate','')::numeric,5);
      v_currency:=coalesce(nullif(p_payload->>'currency',''),'AED');
      for v_item in select value from jsonb_array_elements(v_items) loop
        if length(btrim(coalesce(v_item->>'item_name','')))<1 then raise exception 'assistant_invalid_payload' using errcode='22023'; end if;
        v_subtotal:=v_subtotal+coalesce((v_item->>'qty')::numeric,0)*coalesce((v_item->>'selling_price')::numeric,0);
        v_cost_total:=v_cost_total+coalesce((v_item->>'qty')::numeric,0)*coalesce((v_item->>'supplier_cost')::numeric,0);
      end loop;
      v_vat:=round(v_subtotal*v_vat_rate/100,2); v_total:=v_subtotal+v_vat;
      delete from public.quotation_items where quotation_id=p_target_id;
      insert into public.quotation_items (quotation_id,item_name,description,qty,unit,supplier_cost,selling_price,profit_amount,margin_percent,vat_amount,line_total,currency,item_notes,sort_order)
      select p_target_id,btrim(x->>'item_name'),nullif(x->>'description',''),coalesce((x->>'qty')::numeric,0),coalesce(nullif(x->>'unit',''),'PCS'),coalesce((x->>'supplier_cost')::numeric,0),coalesce((x->>'selling_price')::numeric,0),
        (coalesce((x->>'selling_price')::numeric,0)-coalesce((x->>'supplier_cost')::numeric,0))*coalesce((x->>'qty')::numeric,0),
        case when coalesce((x->>'selling_price')::numeric,0)=0 then 0 else round((coalesce((x->>'selling_price')::numeric,0)-coalesce((x->>'supplier_cost')::numeric,0))*100/coalesce((x->>'selling_price')::numeric,0),2) end,
        round(coalesce((x->>'selling_price')::numeric,0)*coalesce((x->>'qty')::numeric,0)*v_vat_rate/100,2),round(coalesce((x->>'selling_price')::numeric,0)*coalesce((x->>'qty')::numeric,0)*(1+v_vat_rate/100),2),v_currency,nullif(x->>'notes',''),ord::integer-1
      from jsonb_array_elements(v_items) with ordinality as t(x,ord);
      update public.quotation_records set supplier_cost_total=v_cost_total,selling_total=v_subtotal,profit_total=v_subtotal-v_cost_total,margin_percent=case when v_subtotal=0 then 0 else round((v_subtotal-v_cost_total)*100/v_subtotal,2) end,vat_amount=v_vat,grand_total=v_total,terms_notes=case when p_payload?'terms_notes' then nullif(p_payload->>'terms_notes','') else terms_notes end,updated_at=now() where id=p_target_id returning to_jsonb(quotation_records.*) into v_after;
    else
      update public.quotation_records set terms_notes=case when p_payload?'terms_notes' then nullif(p_payload->>'terms_notes','') else terms_notes end,updated_at=now() where id=p_target_id returning to_jsonb(quotation_records.*) into v_after;
    end if;
    v_after:=v_after||jsonb_build_object('items',(select coalesce(jsonb_agg(to_jsonb(i) order by i.sort_order),'[]'::jsonb) from public.quotation_items i where i.quotation_id=p_target_id));

  elsif p_action_type = 'invoice_draft_update' then
    select to_jsonb(t) into v_before from public.invoice_drafts t where id=p_target_id and status='draft' for update;
    if v_before is null then raise exception 'assistant_invalid_transition' using errcode='22023'; end if;
    if p_payload?'items' then
      v_items:=p_payload->'items';
      if jsonb_typeof(v_items)<>'array' or jsonb_array_length(v_items) not between 1 and 100 then raise exception 'assistant_invalid_payload' using errcode='22023'; end if;
      v_items:=(select jsonb_agg(jsonb_build_object('id',gen_random_uuid(),'description',btrim(x->>'description'),'qty',coalesce((x->>'qty')::numeric,1),'unitPrice',coalesce((x->>'unit_price')::numeric,0),'amount',coalesce((x->>'qty')::numeric,1)*coalesce((x->>'unit_price')::numeric,0)) order by ord) from jsonb_array_elements(v_items) with ordinality as t(x,ord));
      select coalesce(sum((x->>'amount')::numeric),0) into v_subtotal from jsonb_array_elements(v_items) x;
      v_vat_rate:=coalesce(nullif(p_payload->>'vat_rate','')::numeric,(v_before->>'vat_rate')::numeric,5);
      v_vat:=round(v_subtotal*v_vat_rate/100,2); v_total:=v_subtotal+v_vat;
    else
      v_items:=v_before->'items'; v_subtotal:=(v_before->>'subtotal')::numeric; v_vat_rate:=(v_before->>'vat_rate')::numeric; v_vat:=(v_before->>'vat_amount')::numeric; v_total:=(v_before->>'total')::numeric;
    end if;
    update public.invoice_drafts set
      items=v_items,subtotal=v_subtotal,vat_rate=v_vat_rate,vat_amount=v_vat,total=v_total,
      due_date=case when p_payload?'due_date' then (p_payload->>'due_date')::date else due_date end,
      payment_terms=case when p_payload?'payment_terms' then p_payload->>'payment_terms' else payment_terms end,
      notes=case when p_payload?'notes' then p_payload->>'notes' else notes end,
      updated_at=now() where id=p_target_id returning to_jsonb(invoice_drafts.*) into v_after;

  elsif p_action_type = 'invoice_issue' then
    select to_jsonb(t) into v_before from public.invoice_drafts t where id=p_target_id and status='approved' for update;
    if v_before is null then raise exception 'assistant_invalid_transition' using errcode='22023'; end if;
    update public.invoice_drafts set status='issued',updated_at=now() where id=p_target_id returning to_jsonb(invoice_drafts.*) into v_after;

  elsif p_action_type = 'project_complete' then
    select to_jsonb(t) into v_before from public.crm_projects t where id=p_target_id and status<>'completed' for update;
    if v_before is null then raise exception 'assistant_invalid_transition' using errcode='22023'; end if;
    update public.crm_projects set status='completed',updated_at=now() where id=p_target_id returning to_jsonb(crm_projects.*) into v_after;

  elsif p_action_type = 'customer_close' then
    select to_jsonb(t) into v_before from public.crm_customers t where id=p_target_id and is_active=true for update;
    if v_before is null then raise exception 'assistant_invalid_transition' using errcode='22023'; end if;
    update public.crm_customers set status='已关闭',is_active=false,updated_at=now() where id=p_target_id returning to_jsonb(crm_customers.*) into v_after;
  end if;

  v_created_id := coalesce(v_created_id,p_target_id);
  if v_after is null then raise exception 'assistant_invalid_payload' using errcode='22023'; end if;
  v_result := jsonb_build_object('ok',true,'action_type',p_action_type,'risk',v_risk,'target_type',v_target_type,'target_id',v_created_id,'result',v_after,'request_id',v_request_id,'idempotent_replay',false);

  insert into assistant_private.audit_log (
    actor, action, action_type, module, target_type, customer_id, target_id,
    idempotency_key, request_hash, before_state, after_state, reason,
    request_id, confirmation_required, confirmed_by
  ) values (
    p_actor,p_action_type,p_action_type,v_module,v_target_type,v_customer_id,v_created_id,
    p_idempotency_key,p_request_hash,v_before,v_after,btrim(p_reason),
    v_request_id,v_risk<>'low',case when v_risk<>'low' then btrim(p_confirmed_by) else null end
  );
  update assistant_private.idempotency_requests set response=v_result,completed_at=now(),target_id=v_created_id where action=p_action_type and idempotency_key=p_idempotency_key;
  if v_risk<>'low' then update assistant_private.action_previews set executed_at=now() where id=p_confirmation_token; end if;
  return v_result;
end;
$$;

revoke all on function public.assistant_preview_business_action(text,uuid,jsonb,text,text,text) from public,anon,authenticated;
revoke all on function public.assistant_execute_business_action(text,uuid,jsonb,text,text,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.assistant_preview_business_action(text,uuid,jsonb,text,text,text) to service_role;
grant execute on function public.assistant_execute_business_action(text,uuid,jsonb,text,text,text,uuid,text,text) to service_role;

do $$ begin
  if to_regclass('ops.migration_ledger') is not null then
    insert into ops.migration_ledger(version,name,kind,notes)
    values('20261005020000','assistant_action_layer','schema','Unified Assistant read contexts and confirmed business action RPC')
    on conflict(version) do nothing;
  end if;
end $$;
