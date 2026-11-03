-- GCI Quotation — BOQ P0-02: save a quotation header + its items in ONE transaction.
-- Before this, the client wrote quotation_records and quotation_items with separate REST calls: an items insert could
-- fail after the header was saved (reported as success), and an update deleted all items before inserting the new
-- ones (a failed insert lost them). public.save_quotation_with_items() does the whole save atomically:
--   * any error (constraint, bad input, conflict) rolls back the header AND the items — nothing half-written;
--   * an update refuses to replace existing items with an empty list (protects against a failed/empty load);
--   * optimistic lock: an update MUST pass p_expected_updated_at (null is refused) and it must equal the row's updated_at;
--   * header update only touches the keys present in p_record (same semantics as the old PostgREST PATCH);
--   * item columns are whitelisted; sort_order is the array position.
-- Permissions: SECURITY INVOKER — runs with the caller's own table privileges (anon/authenticated already hold them on
-- both tables, see baseline 40). No table, column, policy, RLS setting, grant on a table, or row is changed.
-- Idempotent (create or replace). Rollback: rollbacks/20261103090000_quotation_save_atomic_rpc.rollback.sql

-- ── STEP 0 — before snapshot (read-only; run separately, keep the output) ──
-- select count(*) records, (select count(*) from public.quotation_items) items from public.quotation_records;
-- select proname from pg_proc where proname = 'save_quotation_with_items';   -- expect 0 rows
-- select count(*) from public.quotation_records where updated_at is null;     -- expect 0 (such a quote could not be updated: no version token)

begin;

-- ── 1. Preflight ──
do $$
begin
  if to_regclass('public.quotation_records') is null or to_regclass('public.quotation_items') is null then
    raise exception 'preflight failed: public.quotation_records / public.quotation_items do not exist';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'quotation_records' and column_name = 'updated_at'
                   and data_type = 'timestamp with time zone') then
    raise exception 'preflight failed: public.quotation_records.updated_at is missing or not timestamptz';
  end if;
end $$;

-- ── 2. Function ──
create or replace function public.save_quotation_with_items(
  p_id                  uuid,
  p_record              jsonb,
  p_items               jsonb,
  p_expected_updated_at timestamptz default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_id       uuid;
  v_cur      public.quotation_records%rowtype;
  v_existing integer;
  v_updated  timestamptz;
begin
  if p_record is null or jsonb_typeof(p_record) <> 'object' then
    raise exception 'QUOTATION_SAVE_INVALID: p_record must be a JSON object';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'QUOTATION_SAVE_INVALID: p_items must be a JSON array';
  end if;

  if p_id is null then
    -- New quotation: absent keys fall back to the column defaults.
    insert into public.quotation_records (
      quote_no, customer_name, project_name, customer_id, project_id, deal_id, salesperson, phone_wa,
      quote_type, status, source, supplier_cost_total, selling_total, profit_total, margin_percent,
      vat_amount, grand_total, terms_notes, pdf_url, trade_pi_id, created_by, quote_date
    ) values (
      p_record->>'quote_no', p_record->>'customer_name', p_record->>'project_name',
      (p_record->>'customer_id')::uuid, (p_record->>'project_id')::uuid, p_record->>'deal_id',
      p_record->>'salesperson', p_record->>'phone_wa',
      coalesce(p_record->>'quote_type', 'TRADE'), coalesce(p_record->>'status', 'DRAFT'),
      coalesce(p_record->>'source', 'Manual'),
      coalesce((p_record->>'supplier_cost_total')::numeric, 0), coalesce((p_record->>'selling_total')::numeric, 0),
      coalesce((p_record->>'profit_total')::numeric, 0), coalesce((p_record->>'margin_percent')::numeric, 0),
      coalesce((p_record->>'vat_amount')::numeric, 0), coalesce((p_record->>'grand_total')::numeric, 0),
      p_record->>'terms_notes', p_record->>'pdf_url', p_record->>'trade_pi_id',
      coalesce(p_record->>'created_by', 'Admin'), p_record->>'quote_date'
    )
    returning id into v_id;
  else
    -- Existing quotation: the caller must prove which version it edited — no update without a version token.
    if p_expected_updated_at is null then
      raise exception 'QUOTATION_SAVE_VERSION_REQUIRED: updating quotation % requires p_expected_updated_at', p_id;
    end if;
    -- Lock the header so concurrent saves of the same quote run one after another.
    select * into v_cur from public.quotation_records where id = p_id for update;
    if not found then
      raise exception 'QUOTATION_SAVE_NOT_FOUND: quotation % does not exist', p_id;
    end if;
    if v_cur.updated_at is distinct from p_expected_updated_at then
      raise exception 'QUOTATION_SAVE_CONFLICT: quotation % was changed elsewhere (now %, expected %)',
        p_id, v_cur.updated_at, p_expected_updated_at;
    end if;
    select count(*) into v_existing from public.quotation_items where quotation_id = p_id;
    if v_existing > 0 and jsonb_array_length(p_items) = 0 then
      raise exception 'QUOTATION_SAVE_EMPTY_ITEMS: refusing to replace % existing items with an empty list', v_existing;
    end if;

    update public.quotation_records set
      quote_no            = case when p_record ? 'quote_no'            then p_record->>'quote_no'                     else quote_no end,
      customer_name       = case when p_record ? 'customer_name'       then p_record->>'customer_name'                else customer_name end,
      project_name        = case when p_record ? 'project_name'        then p_record->>'project_name'                 else project_name end,
      customer_id         = case when p_record ? 'customer_id'         then (p_record->>'customer_id')::uuid          else customer_id end,
      project_id          = case when p_record ? 'project_id'          then (p_record->>'project_id')::uuid           else project_id end,
      deal_id             = case when p_record ? 'deal_id'             then p_record->>'deal_id'                      else deal_id end,
      salesperson         = case when p_record ? 'salesperson'         then p_record->>'salesperson'                  else salesperson end,
      phone_wa            = case when p_record ? 'phone_wa'            then p_record->>'phone_wa'                     else phone_wa end,
      quote_type          = case when p_record ? 'quote_type'          then p_record->>'quote_type'                   else quote_type end,
      status              = case when p_record ? 'status'              then p_record->>'status'                       else status end,
      source              = case when p_record ? 'source'              then p_record->>'source'                       else source end,
      supplier_cost_total = case when p_record ? 'supplier_cost_total' then (p_record->>'supplier_cost_total')::numeric else supplier_cost_total end,
      selling_total       = case when p_record ? 'selling_total'       then (p_record->>'selling_total')::numeric     else selling_total end,
      profit_total        = case when p_record ? 'profit_total'        then (p_record->>'profit_total')::numeric      else profit_total end,
      margin_percent      = case when p_record ? 'margin_percent'      then (p_record->>'margin_percent')::numeric    else margin_percent end,
      vat_amount          = case when p_record ? 'vat_amount'          then (p_record->>'vat_amount')::numeric        else vat_amount end,
      grand_total         = case when p_record ? 'grand_total'         then (p_record->>'grand_total')::numeric       else grand_total end,
      terms_notes         = case when p_record ? 'terms_notes'         then p_record->>'terms_notes'                  else terms_notes end,
      pdf_url             = case when p_record ? 'pdf_url'             then p_record->>'pdf_url'                      else pdf_url end,
      trade_pi_id         = case when p_record ? 'trade_pi_id'         then p_record->>'trade_pi_id'                  else trade_pi_id end,
      created_by          = case when p_record ? 'created_by'          then p_record->>'created_by'                   else created_by end,
      quote_date          = case when p_record ? 'quote_date'          then p_record->>'quote_date'                   else quote_date end,
      updated_at          = now()
    where id = p_id;

    delete from public.quotation_items where quotation_id = p_id;
    v_id := p_id;
  end if;

  insert into public.quotation_items (
    quotation_id, item_name, description, qty, unit, supplier_cost, selling_price, profit_amount,
    margin_percent, vat_amount, line_total, currency, item_notes, sort_order
  )
  select v_id, e->>'item_name', e->>'description',
         coalesce((e->>'qty')::numeric, 1), coalesce(e->>'unit', 'pcs'),
         coalesce((e->>'supplier_cost')::numeric, 0), coalesce((e->>'selling_price')::numeric, 0),
         coalesce((e->>'profit_amount')::numeric, 0), coalesce((e->>'margin_percent')::numeric, 0),
         coalesce((e->>'vat_amount')::numeric, 0), coalesce((e->>'line_total')::numeric, 0),
         coalesce(e->>'currency', 'AED'), e->>'item_notes', (o - 1)::integer
  from jsonb_array_elements(p_items) with ordinality as t(e, o);

  select updated_at into v_updated from public.quotation_records where id = v_id;
  return jsonb_build_object('id', v_id, 'updated_at', v_updated);
end $$;

comment on function public.save_quotation_with_items(uuid, jsonb, jsonb, timestamptz) is
  'BOQ P0-02: atomic save of quotation_records + quotation_items (all-or-nothing, empty-items guard, optimistic lock).';

-- ── 3. Execute grant — same roles that already hold table privileges on both tables; invoker rights only ──
revoke all on function public.save_quotation_with_items(uuid, jsonb, jsonb, timestamptz) from public;
grant execute on function public.save_quotation_with_items(uuid, jsonb, jsonb, timestamptz) to anon, authenticated, service_role;

-- ── 4. Self-register ──
do $$
begin
  if to_regclass('ops.migration_ledger') is not null then
    insert into ops.migration_ledger (version, name, kind, notes)
    values ('20261103090000', 'quotation_save_atomic_rpc', 'schema',
            'BOQ P0-02: save_quotation_with_items() — atomic header+items save, empty-items guard, optimistic lock (SECURITY INVOKER)')
    on conflict (version) do nothing;
  end if;
end $$;

commit;

notify pgrst, 'reload schema';

-- ── STEP 5 — verification (read-only) ──
-- (a) function present, invoker rights
-- select proname, prosecdef from pg_proc where proname = 'save_quotation_with_items';   -- 1 row, prosecdef = false
-- (b) execute grantees
-- select grantee, privilege_type from information_schema.routine_privileges where routine_name = 'save_quotation_with_items' order by 1;
-- (c) historical data unchanged: compare with STEP 0
-- select count(*) records, (select count(*) from public.quotation_items) items from public.quotation_records;
