create table if not exists tracking_gifts (
  id uuid primary key default uuid_generate_v4(),
  tracking_record_id uuid references tracking_records(id) on delete cascade not null,
  name text not null,
  quantity integer default 1 not null check (quantity > 0),
  created_at timestamptz default now() not null
);

alter table tracking_gifts enable row level security;

do $$ begin
  create policy "用户只能访问自己跟踪记录的赠品" on tracking_gifts
    for all
    using (
      exists (
        select 1 from tracking_records
        where tracking_records.id = tracking_gifts.tracking_record_id
          and tracking_records.user_id = auth.uid()
      )
    )
    with check (
      exists (
        select 1 from tracking_records
        where tracking_records.id = tracking_gifts.tracking_record_id
          and tracking_records.user_id = auth.uid()
      )
    );
exception when duplicate_object then null;
end $$;

create index if not exists tracking_gifts_tracking_record_id_idx
  on tracking_gifts(tracking_record_id);
