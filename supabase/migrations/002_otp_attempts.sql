alter table otp_codes
  add column if not exists attempts integer not null default 0;
