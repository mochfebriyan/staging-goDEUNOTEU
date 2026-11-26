-- One-off cleanup, STEP 1 of 2: PREVIEW. Deletes nothing.
--
-- Goal: remove every customer who didn't sign up with LINE, plus everything
-- that belongs to them, and every auth account that is neither LINE nor admin.
--
--   non-LINE customer   customers.line_user_id is null
--   their data          items, batch_bills, tax_bills, notifications
--   their batches       batches with items from non-LINE customers only
--                       (a batch shared with a LINE customer stays; only the
--                       non-LINE items/bills in it go)
--   their boxes         boxes whose batches are all deleted above
--   auth accounts       not LINE (no app_metadata.line_sub) and not in admins
--   KEPT                LINE customers and their data, admin accounts, batches
--                       and boxes that had no items at all
--
-- The SQL Editor shows only one result, so everything is in a single query.
-- Then run cleanup_2_delete.sql.

with
doomed_customers as (select id, name from customers where line_user_id is null),
doomed_batches as (
  select b.id, b.batch_number from batches b
  where exists (select 1 from items i where i.batch_id = b.id and i.customer_id in (select id from doomed_customers))
    and not exists (select 1 from items i where i.batch_id = b.id and i.customer_id not in (select id from doomed_customers))
),
doomed_boxes as (
  select x.id, x.box_number from boxes x
  where exists (select 1 from batches b where b.box_id = x.id and b.id in (select id from doomed_batches))
    and not exists (select 1 from batches b where b.box_id = x.id and b.id not in (select id from doomed_batches))
),
doomed_auth as (
  select id, email from auth.users
  where not (coalesce(raw_app_meta_data, '{}'::jsonb) ? 'line_sub') and id not in (select id from admins)
)
select 'KEEP  customers (LINE)' as what, count(*)::int as n, string_agg(name, ', ' order by name) as examples
  from customers where line_user_id is not null
union all select 'KEEP  auth users (LINE)', count(*)::int, null from auth.users where raw_app_meta_data ? 'line_sub'
union all select 'KEEP  auth users (admin)', count(*)::int, string_agg(email, ', ') from auth.users where id in (select id from admins)
union all select 'DELETE customers (non-LINE)', count(*)::int, string_agg(name, ', ' order by name) from doomed_customers
union all select 'DELETE batches', count(*)::int, string_agg(batch_number, ', ' order by batch_number) from doomed_batches
union all select 'DELETE boxes', count(*)::int, string_agg(box_number, ', ' order by box_number) from doomed_boxes
union all select 'DELETE items', count(*)::int, null from items
  where customer_id in (select id from doomed_customers) or batch_id in (select id from doomed_batches)
union all select 'DELETE batch_bills', count(*)::int, null from batch_bills
  where customer_id in (select id from doomed_customers) or batch_id in (select id from doomed_batches)
union all select 'DELETE tax_bills', count(*)::int, null from tax_bills
  where customer_id in (select id from doomed_customers) or box_id in (select id from doomed_boxes)
union all select 'DELETE notifications', count(*)::int, null from notifications
  where customer_id in (select id from doomed_customers)
union all select 'DELETE auth users (not LINE, not admin)', count(*)::int, string_agg(coalesce(email, id::text), ', ') from doomed_auth;
