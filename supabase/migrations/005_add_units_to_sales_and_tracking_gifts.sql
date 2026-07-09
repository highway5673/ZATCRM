alter table tracking_gifts
  add column if not exists unit text;

alter table sales_records
  add column if not exists unit text;
