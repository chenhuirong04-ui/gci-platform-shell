-- GCI Platform Phase 1 — Auth & Permission tables
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ── 1. companies（公司抬头，Phase 1 只建表，UI Phase 2 补）──────────────
create table if not exists public.companies (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  name_en      text,
  logo_url     text,
  address      text,
  address_en   text,
  trn          text,
  bank_name    text,
  bank_account text,
  bank_iban    text,
  bank_swift   text,
  created_at   timestamptz default now()
);

-- ── 2. user_profiles（关联 auth.users，modules 驱动权限）─────────────────
create table if not exists public.user_profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  display_name     text not null,
  role_label       text not null default 'Staff',
  modules          text[] not null default '{}',
  default_company_id uuid references public.companies(id),
  is_active        boolean not null default true,
  created_at       timestamptz default now()
);

-- ── 3. RLS：user_profiles 只允许本人读自己的行 ───────────────────────────
alter table public.user_profiles enable row level security;

create policy "users can read own profile"
  on public.user_profiles for select
  using (auth.uid() = id);

-- Admin service-role 绕过 RLS，Supabase Dashboard 直接操作不受影响

-- ── 4. 种入 GCI 默认公司抬头（先建一条，方便后续绑定用户）────────────────
insert into public.companies (id, name, name_en, trn)
values (
  'a1000000-0000-0000-0000-000000000001',
  'Global Care Info 中东贸易',
  'Global Care Info General Trading LLC',
  '100XXXXXXXXX'
)
on conflict (id) do nothing;

-- ── 5. 初始化 Chris Admin 账号（需先在 Supabase Auth 创建用户，再填 UUID）
-- 步骤：
--   a) Supabase Dashboard → Authentication → Users → Add user
--      Email: chris@globalcareinfo.com  Password: 你设定的密码
--   b) 复制生成的 User UUID，替换下方 'YOUR-CHRIS-UUID'
--   c) 再次执行这段 INSERT

-- insert into public.user_profiles (id, display_name, role_label, modules, default_company_id)
-- values (
--   'YOUR-CHRIS-UUID',
--   'Chris',
--   'Admin',
--   ARRAY['crm','trade','quotation','finance','warehouse'],
--   'a1000000-0000-0000-0000-000000000001'
-- );

-- ── 6. 其他角色参考（创建员工账号后照此插入 user_profiles）─────────────────
-- China Team（全部业务）:
--   modules: ARRAY['crm','trade','quotation','warehouse']
--
-- Partner Quotation（只看报价）:
--   modules: ARRAY['quotation']
--
-- Finance（只看财务）:
--   modules: ARRAY['finance']
--
-- Warehouse（只看库存）:
--   modules: ARRAY['warehouse']
--
-- Sales（客户 + 报价 + 贸易）:
--   modules: ARRAY['crm','quotation','trade']
