-- LINE Login → customer linking (Customer Dashboard).
--
-- Admin creates customers by name only and doesn't know their LINE user id
-- (`sub`), so the first LINE login is matched with a one-time claim code:
--   1. Admin generates a code for the customer and sends it over LINE chat.
--   2. The customer signs in with LINE and enters the code once.
--   3. link_customer() stores auth_user_id + line_user_id and clears the
--      code. Later logins match on auth_user_id automatically.
--
-- The LINE provider is a Supabase custom OIDC/OAuth provider named `line`
-- (client side: signInWithOAuth({ provider: 'custom:line' })).
--
-- Run once in the Supabase SQL Editor after 0002_item_description.sql.

alter table customers
  add column if not exists claim_code text unique;

-- 8 characters from an alphabet without look-alikes (0/O, 1/I/L), shown as
-- GO-XXXX-XXXX. Uses gen_random_uuid() bytes, so no extension is needed.
create or replace function new_claim_code() returns text
language plpgsql volatile as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  v_bytes bytea := uuid_send(gen_random_uuid());
  v_raw text := '';
begin
  for i in 0..7 loop
    v_raw := v_raw || substr(v_alphabet, (get_byte(v_bytes, i) % length(v_alphabet)) + 1, 1);
  end loop;
  return 'GO-' || substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4);
end;
$$;

-- Admin GO (from the app) or the SQL Editor (session user postgres).
create or replace function require_admin_or_sql_editor() returns void
language plpgsql stable as $$
begin
  if not (is_admin() or session_user = 'postgres') then
    raise exception 'Hanya Admin GO yang boleh melakukan aksi ini.' using errcode = '42501';
  end if;
end;
$$;

-- New code for one customer (replaces any unused one). Refuses customers
-- that are already linked to a LINE account.
create or replace function generate_claim_code(p_customer_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_code text;
  v_linked uuid;
begin
  perform require_admin_or_sql_editor();
  select auth_user_id into v_linked from customers where id = p_customer_id for update;
  if not found then
    raise exception 'Customer tidak ditemukan.';
  end if;
  if v_linked is not null then
    raise exception 'Customer ini sudah tersambung ke akun LINE.';
  end if;
  loop
    v_code := new_claim_code();
    exit when not exists (select 1 from customers where claim_code = v_code);
  end loop;
  update customers set claim_code = v_code where id = p_customer_id;
  return v_code;
end;
$$;

-- Fill in codes for every customer that isn't linked yet and has none.
-- Returns how many codes were created.
create or replace function generate_missing_claim_codes() returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_count integer := 0;
begin
  perform require_admin_or_sql_editor();
  for v_id in select id from customers where auth_user_id is null and claim_code is null loop
    perform generate_claim_code(v_id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Called by the signed-in customer with the code from Admin GO.
-- Returns { id, name, avatar_url } of the linked customer.
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

  select provider_id into v_line_id
  from auth.identities
  where user_id = v_uid and provider in ('custom:line', 'line')
  limit 1;
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

revoke execute on function new_claim_code() from public, anon, authenticated;
revoke execute on function require_admin_or_sql_editor() from public, anon;
revoke execute on function generate_claim_code(uuid) from public, anon;
revoke execute on function generate_missing_claim_codes() from public, anon;
revoke execute on function link_customer(text) from public, anon;
grant execute on function generate_claim_code(uuid) to authenticated;
grant execute on function generate_missing_claim_codes() to authenticated;
grant execute on function link_customer(text) to authenticated;
