-- Phase 1: CRM 重设计数据库迁移
-- 在 Supabase SQL Editor 中手动执行

-- 1. customers 表新增 customer_type 字段
alter table customers
  add column if not exists customer_type text not null default '潜在伙伴'
  check (customer_type in ('潜在伙伴', '客户', '伙伴'));

-- 2. 新建跟踪记录表（合并拜访+跟进）
create type if not exists tracking_method as enum (
  'visit',
  'phone',
  'wechat',
  'email',
  'other'
);

create table if not exists tracking_records (
  id            uuid primary key default uuid_generate_v4(),
  customer_id   uuid references customers(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  method        tracking_method not null default 'phone',
  content       text not null,
  location_id   uuid references customer_locations(id) on delete set null,
  tracked_at    timestamptz default now() not null,
  created_at    timestamptz default now() not null
);

alter table tracking_records enable row level security;

create policy if not exists "用户只能访问自己的跟踪记录" on tracking_records
  for all using (auth.uid() = user_id);

create index if not exists tracking_records_customer_id_idx on tracking_records(customer_id);
create index if not exists tracking_records_user_id_idx on tracking_records(user_id);
create index if not exists tracking_records_tracked_at_idx on tracking_records(tracked_at desc);

-- 3. 新建销售记录表
create table if not exists sales_records (
  id            uuid primary key default uuid_generate_v4(),
  customer_id   uuid references customers(id) on delete cascade not null,
  user_id       uuid references auth.users(id) on delete cascade not null,
  product_name  text not null,
  quantity      integer not null default 1,
  unit_price    numeric(12, 2),
  amount        numeric(12, 2),
  sale_date     date not null default current_date,
  notes         text,
  created_at    timestamptz default now() not null
);

alter table sales_records enable row level security;

create policy if not exists "用户只能访问自己的销售记录" on sales_records
  for all using (auth.uid() = user_id);

create index if not exists sales_records_customer_id_idx on sales_records(customer_id);
create index if not exists sales_records_user_id_idx on sales_records(user_id);
create index if not exists sales_records_sale_date_idx on sales_records(sale_date desc);
