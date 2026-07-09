alter table tracking_gifts
  drop constraint if exists tracking_gifts_quantity_check;

alter table tracking_gifts
  drop constraint if exists tracking_gifts_quantity_nonzero;

alter table tracking_gifts
  add constraint tracking_gifts_quantity_nonzero check (quantity <> 0);
