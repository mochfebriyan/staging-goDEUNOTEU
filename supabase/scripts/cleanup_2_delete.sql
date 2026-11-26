-- One-off cleanup, STEP 2 of 2: DELETE. Run cleanup_1_preview.sql first and
-- check the numbers. This cannot be undone (Supabase Free has no backups).
--
-- Removes every non-LINE customer and everything that belongs to them: items,
-- batch/tax bills, notifications, batches holding only their items, boxes
-- holding only those batches. Also removes auth accounts that are neither
-- LINE nor admin. LINE customers, their data and admin accounts stay.
-- Same rules as the preview; see its header.
--
-- One transaction: if any statement fails, nothing is deleted.

begin;

create temp table doomed_customers on commit drop as
  select id from customers where line_user_id is null;

create temp table doomed_batches on commit drop as
  select b.id from batches b
  where exists (select 1 from items i where i.batch_id = b.id and i.customer_id in (select id from doomed_customers))
    and not exists (select 1 from items i where i.batch_id = b.id and i.customer_id not in (select id from doomed_customers));

create temp table doomed_boxes on commit drop as
  select x.id from boxes x
  where exists (select 1 from batches b where b.box_id = x.id and b.id in (select id from doomed_batches))
    and not exists (select 1 from batches b where b.box_id = x.id and b.id not in (select id from doomed_batches));

-- tax_bills_guard_delete blocks deleting Lunas / Menunggu Konfirmasi tax
-- bills; switched off only inside this transaction.
alter table tax_bills disable trigger tax_bills_guard_delete;

-- Tax bills first: tax_bills.box_id blocks deleting the box.
delete from tax_bills
where customer_id in (select id from doomed_customers) or box_id in (select id from doomed_boxes);

-- Batches holding only non-LINE items (photos, items, batch bills cascade).
delete from batches where id in (select id from doomed_batches);

-- Non-LINE items and bills left in batches shared with LINE customers.
delete from items       where customer_id in (select id from doomed_customers);
delete from batch_bills where customer_id in (select id from doomed_customers);

delete from boxes where id in (select id from doomed_boxes);

alter table tax_bills enable trigger tax_bills_guard_delete;

-- The customers themselves (their notifications cascade).
delete from customers where id in (select id from doomed_customers);

-- Notifications of remaining customers that point at a bill deleted above.
delete from notifications n
where not exists (select 1 from batch_bills bb where bb.id = n.reference_id)
  and not exists (select 1 from tax_bills t where t.id = n.reference_id);

-- Auth accounts that are neither LINE nor admin.
delete from auth.users
where not (coalesce(raw_app_meta_data, '{}'::jsonb) ? 'line_sub')
  and id not in (select id from admins);

commit;

-- Afterwards, check: should list only LINE customers.
select name, line_user_id is not null as is_line from customers order by name;

-- Files: Supabase doesn't allow deleting storage files from SQL. Leftover
-- files of deleted customers / batches can be removed in the dashboard:
--   Storage → bukti-transfer → folders named after deleted customer ids
--   Storage → batch-photos  → folders named after deleted batch ids
