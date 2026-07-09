-- 启用 UUID 扩展
create extension if not exists "uuid-ossp";

-- ============================================================
-- 客户表
-- ============================================================
create table if not exists customers (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  company text,
  phone text,
  wechat text,
  email text,
  tags text[] default '{}',
  notes text,
  customer_type text not null default '潜在伙伴'
    check (customer_type in ('潜在伙伴', '客户', '伙伴')),
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ============================================================
-- 客户位置表（一对多）
-- ============================================================
create table if not exists customer_locations (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete cascade not null,
  latitude double precision not null,
  longitude double precision not null,
  address text,
  created_at timestamptz default now() not null
);

-- ============================================================
-- 拜访记录表
-- ============================================================
create table if not exists visits (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  visited_at timestamptz default now() not null,
  notes text,
  location_id uuid references customer_locations(id) on delete set null,
  created_at timestamptz default now() not null
);

-- ============================================================
-- 赠品记录表（属于拜访）
-- ============================================================
create table if not exists gifts (
  id uuid primary key default uuid_generate_v4(),
  visit_id uuid references visits(id) on delete cascade not null,
  name text not null,
  quantity integer default 1 not null,
  notes text,
  created_at timestamptz default now() not null
);

-- ============================================================
-- 跟进记录表
-- ============================================================
create type follow_up_method as enum ('phone', 'wechat', 'email', 'other');

create table if not exists follow_ups (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  method follow_up_method default 'phone' not null,
  content text not null,
  followed_at timestamptz default now() not null,
  created_at timestamptz default now() not null
);

-- ============================================================
-- 跟踪记录表（新版：合并拜访 + 跟进）
-- ============================================================
create type tracking_method as enum ('visit', 'phone', 'wechat', 'email', 'other');

create table if not exists tracking_records (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  method tracking_method default 'phone' not null,
  content text not null,
  location_id uuid references customer_locations(id) on delete set null,
  tracked_at timestamptz default now() not null,
  created_at timestamptz default now() not null
);

-- ============================================================
-- 销售记录表
-- ============================================================
create table if not exists sales_records (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  product_name text not null,
  quantity integer default 1 not null,
  unit_price numeric(12, 2),
  amount numeric(12, 2),
  sale_date date default current_date not null,
  notes text,
  created_at timestamptz default now() not null
);

-- ============================================================
-- 商机表
-- ============================================================
create type opportunity_stage as enum (
  'initial_contact',
  'interested',
  'quoting',
  'negotiating',
  'won',
  'lost'
);

create table if not exists opportunities (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  product text,
  estimated_amount numeric(12, 2),
  stage opportunity_stage default 'initial_contact' not null,
  expected_close_date date,
  notes text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ============================================================
-- 任务提醒表
-- ============================================================
create type task_status as enum ('pending', 'done', 'postponed');

create table if not exists tasks (
  id uuid primary key default uuid_generate_v4(),
  customer_id uuid references customers(id) on delete set null,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  notes text,
  remind_at timestamptz,
  status task_status default 'pending' not null,
  created_at timestamptz default now() not null
);

-- ============================================================
-- 验证码临时存储表
-- ============================================================
create table if not exists otp_codes (
  id uuid primary key default uuid_generate_v4(),
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer default 0 not null,
  used boolean default false not null,
  created_at timestamptz default now() not null
);

-- ============================================================
-- 自动更新 updated_at 的触发器
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger customers_updated_at
  before update on customers
  for each row execute function update_updated_at();

create trigger opportunities_updated_at
  before update on opportunities
  for each row execute function update_updated_at();

-- ============================================================
-- Row Level Security（每个用户只能看自己的数据）
-- ============================================================
alter table customers enable row level security;
alter table customer_locations enable row level security;
alter table visits enable row level security;
alter table gifts enable row level security;
alter table follow_ups enable row level security;
alter table tracking_records enable row level security;
alter table sales_records enable row level security;
alter table opportunities enable row level security;
alter table tasks enable row level security;
alter table otp_codes enable row level security;

-- customers
create policy "用户只能访问自己的客户" on customers
  for all using (auth.uid() = user_id);

-- customer_locations（通过 customer 关联）
create policy "用户只能访问自己客户的位置" on customer_locations
  for all using (
    exists (
      select 1 from customers where customers.id = customer_locations.customer_id
        and customers.user_id = auth.uid()
    )
  );

-- visits
create policy "用户只能访问自己的拜访记录" on visits
  for all using (auth.uid() = user_id);

-- gifts（通过 visit 关联）
create policy "用户只能访问自己拜访的赠品" on gifts
  for all using (
    exists (
      select 1 from visits where visits.id = gifts.visit_id
        and visits.user_id = auth.uid()
    )
  );

-- follow_ups
create policy "用户只能访问自己的跟进记录" on follow_ups
  for all using (auth.uid() = user_id);

-- tracking_records
create policy "用户只能访问自己的跟踪记录" on tracking_records
  for all using (auth.uid() = user_id);

-- sales_records
create policy "用户只能访问自己的销售记录" on sales_records
  for all using (auth.uid() = user_id);

-- opportunities
create policy "用户只能访问自己的商机" on opportunities
  for all using (auth.uid() = user_id);

-- tasks
create policy "用户只能访问自己的任务" on tasks
  for all using (auth.uid() = user_id);

-- otp_codes
create policy "禁止客户端直接访问验证码" on otp_codes
  using (false);

create index if not exists tracking_records_customer_id_idx on tracking_records(customer_id);
create index if not exists tracking_records_user_id_idx on tracking_records(user_id);
create index if not exists tracking_records_tracked_at_idx on tracking_records(tracked_at desc);
create index if not exists sales_records_customer_id_idx on sales_records(customer_id);
create index if not exists sales_records_user_id_idx on sales_records(user_id);
create index if not exists sales_records_sale_date_idx on sales_records(sale_date desc);
create index if not exists otp_codes_phone_created_at_idx on otp_codes(phone, created_at desc);
