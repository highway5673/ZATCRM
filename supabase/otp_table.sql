-- 验证码临时存储表
create table if not exists otp_codes (
  id uuid primary key default uuid_generate_v4(),
  phone text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer default 0 not null,
  used boolean default false not null,
  created_at timestamptz default now() not null
);

-- 仅服务端可访问，App 客户端无法直接读写
alter table otp_codes enable row level security;
create policy "禁止客户端直接访问" on otp_codes using (false);

-- 5分钟后自动清理过期验证码（需要 pg_cron 扩展，可选）
-- 不需要立即配置，不影响功能
