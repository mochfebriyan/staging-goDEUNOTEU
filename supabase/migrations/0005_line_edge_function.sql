-- LINE Login moved to the `line-auth` Edge Function
-- (supabase/functions/line-auth/index.ts).
--
-- Supabase's custom OIDC provider rejects LINE web-login ID tokens (HS256),
-- so the Edge Function verifies them with LINE and creates the auth user
-- itself. The LINE user id is stored in auth.users.raw_app_meta_data
-- ->> 'line_sub' (writable only by the service role), not in
-- auth.identities, so both customer functions read it from there.
--
-- Run once in the Supabase SQL Editor after 0004_line_self_register.sql.

create or replace function link_customer(p_code text) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_line_id text;
  v_picture text;
  v_customer customers;
begin
  if v_uid is null then
    raise exception 'Masuk dengan LINE dulu.' using errcode = '42501';
  end if;
  if exists (select 1 from customers where auth_user_id = v_uid) then
    raise exception 'Akun LINE ini sudah tersambung ke customer.';
  end if;

  select raw_app_meta_data ->> 'line_sub' into v_line_id
  from auth.users where id = v_uid;
  if v_line_id is null then
    raise exception 'Kode hanya bisa dipakai setelah masuk dengan LINE.' using errcode = '42501';
  end if;

  select coalesce(raw_user_meta_data ->> 'picture', raw_user_meta_data ->> 'avatar_url')
  into v_picture
  from auth.users where id = v_uid;

  update customers
  set auth_user_id = v_uid,
      line_user_id = v_line_id,
      avatar_url = coalesce(v_picture, avatar_url),
      claim_code = null
  where claim_code = upper(trim(p_code)) and auth_user_id is null
  returning * into v_customer;

  if v_customer.id is null then
    raise exception 'Kode tidak valid atau sudah dipakai. Minta kode baru ke admin.';
  end if;

  return json_build_object('id', v_customer.id, 'name', v_customer.name, 'avatar_url', v_customer.avatar_url);
end;
$$;

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

  select raw_app_meta_data ->> 'line_sub' into v_line_id
  from auth.users where id = v_uid;
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
