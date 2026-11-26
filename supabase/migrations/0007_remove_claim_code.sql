-- Remove the claim-code flow (0003 / 0005).
--
-- Every customer signs up with LINE from the start, so there are no
-- admin-created customers to link with a one-time code. The first LINE login
-- always creates the profile via register_customer() (0004 / 0005), which
-- stays.
--
-- Run once in the Supabase SQL Editor after 0006_customer_batch_members.sql.

drop function if exists link_customer(text);
drop function if exists generate_missing_claim_codes();
drop function if exists generate_claim_code(uuid);
drop function if exists new_claim_code();
drop function if exists require_admin_or_sql_editor();

alter table customers drop column if exists claim_code;
