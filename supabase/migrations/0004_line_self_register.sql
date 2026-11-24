-- New customers sign up themselves with LINE.
--
-- First LINE login, two choices on the Customer Dashboard:
--   • New customer  → register_customer(): creates a customers row (new
--     uuid) named after the LINE display name, linked to this LINE account.
--   • Already ordered (Admin created their row) → link_customer(code) from
--     0003, so their existing orders stay attached to them.
--
-- Run once in the Supabase SQL Editor after 0003_line_claim_code.sql.

create or replace function register_customer() returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_line_id text;
  v_name text;
  v_picture text;
  v_customer customers;
begin
  if v_uid is null then
    raise exception 'Masuk dengan LINE dulu.' using errcode = '42501';
  end if;

  select * into v_customer from customers where auth_user_id = v_uid;
  if found then
    -- Already registered (e.g. double click): just return it.
    return json_build_object('id', v_customer.id, 'name', v_customer.name, 'avatar_url', v_customer.avatar_url);
  end if;

  select provider_id into v_line_id
  from auth.identities
  where user_id = v_uid and provider in ('custom:line', 'line')
  limit 1;
  if v_line_id is null then
    raise exception 'Daftar hanya bisa lewat LINE.' using errcode = '42501';
  end if;

  select
    nullif(trim(coalesce(raw_user_meta_data ->> 'name', raw_user_meta_data ->> 'full_name', raw_user_meta_data ->> 'nickname')), ''),
    coalesce(raw_user_meta_data ->> 'picture', raw_user_meta_data ->> 'avatar_url')
  into v_name, v_picture
  from auth.users where id = v_uid;

  insert into customers (name, auth_user_id, line_user_id, avatar_url)
  values (left(coalesce(v_name, 'Customer LINE'), 100), v_uid, v_line_id, v_picture)
  returning * into v_customer;

  return json_build_object('id', v_customer.id, 'name', v_customer.name, 'avatar_url', v_customer.avatar_url);
end;
$$;

revoke execute on function register_customer() from public, anon;
grant execute on function register_customer() to authenticated;
