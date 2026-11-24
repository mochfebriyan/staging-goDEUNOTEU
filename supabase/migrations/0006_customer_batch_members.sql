-- Customer Dashboard: who shares a ReqShare batch with me.
--
-- RLS lets a customer read only their own items/bills/customer row, but the
-- dashboard shows everyone in a ReqShare batch (name, item count, bill
-- total, payment status), as the admin's LINE recap does. This
-- security-definer function returns exactly those fields, and only for
-- ReqShare batches the signed-in customer has items in.
--
-- Run once in the Supabase SQL Editor after 0005_line_edge_function.sql.

create or replace function my_batch_members()
returns table (
  batch_id uuid,
  customer_id uuid,
  name text,
  item_count integer,
  total numeric,
  status bill_status
)
language sql stable security definer set search_path = public as $$
  with mine as (
    select distinct i.batch_id
    from items i
    join batches b on b.id = i.batch_id
    where i.customer_id = current_customer_id() and b.order_type = 'ReqShare'
  )
  select
    i.batch_id,
    i.customer_id,
    c.name,
    count(*)::integer as item_count,
    coalesce(max(bb.total), sum(i.price_idr)) as total,
    coalesce(max(bb.status::text), 'Belum Bayar')::bill_status as status
  from items i
  join mine m on m.batch_id = i.batch_id
  join customers c on c.id = i.customer_id
  left join batch_bills bb on bb.batch_id = i.batch_id and bb.customer_id = i.customer_id
  group by i.batch_id, i.customer_id, c.name;
$$;

revoke execute on function my_batch_members() from public, anon;
grant execute on function my_batch_members() to authenticated;
