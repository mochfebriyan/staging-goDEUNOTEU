-- Realistic test data for performance testing (LOCAL Docker Supabase only).
-- Run once after supabase start / db reset, in Studio's SQL Editor
-- (http://localhost:54323) or with psql. Fake names only, no real data.
--
-- Result: 300 customers, 20 boxes, 400 batches (200 already in boxes),
-- 2000 items, ~2000 batch bills. That means the dashboard has to page
-- through more than 1000 items, like a real shop after a few months.

select setseed(0.42);  -- same "random" data every time, so runs are comparable

insert into customers (name)
select 'Perf Customer ' || lpad(g::text, 3, '0')
from generate_series(1, 285) g;

insert into boxes (box_number, status)
select 'PERF-BOX-' || lpad(g::text, 3, '0'), 'Di WH Jepang'
from generate_series(1, 20) g;

with b as (
  select id, row_number() over (order by box_number) as rn
  from boxes where box_number like 'PERF-BOX-%'
)
insert into batches (batch_number, box_id, order_id_wh, order_type, order_status)
select
  'PERF-BATCH-' || lpad(g::text, 4, '0'),
  case when g <= 200 then (select id from b where rn = ((g - 1) % 20) + 1) end,
  'WH-PERF-' || g,
  (array['ReqShare', 'Admin', 'Persod'])[1 + g % 3]::order_type,
  (case when g <= 200 then 'Di WH Jepang' else 'Dibeli dari Seller' end)::order_status
from generate_series(1, 400) g;

with c as (select array_agg(id) as ids from customers)
insert into items (batch_id, customer_id, tipe_barang, tipe_kartu, price_idr, weight_grams)
select
  bt.id,
  c.ids[1 + floor(random() * array_length(c.ids, 1))::int],
  (case when i % 2 = 0 then 'Kartu' else 'Ganci' end)::tipe_barang,
  case when i % 2 = 0 then (array['Tops', 'Skirt', 'Shoes', 'Dress'])[1 + i % 4]::tipe_kartu end,
  20000 + floor(random() * 200000),
  case when i % 2 = 1 then 50 end
from batches bt
cross join generate_series(1, 5) i
cross join c
where bt.batch_number like 'PERF-BATCH-%';

insert into batch_bills (batch_id, customer_id, total)
select i.batch_id, i.customer_id, sum(i.price_idr)
from items i
join batches b on b.id = i.batch_id
where b.batch_number like 'PERF-BATCH-%'
group by i.batch_id, i.customer_id;

select
  (select count(*) from customers)   as customers,
  (select count(*) from boxes)       as boxes,
  (select count(*) from batches)     as batches,
  (select count(*) from items)       as items,
  (select count(*) from batch_bills) as batch_bills;
