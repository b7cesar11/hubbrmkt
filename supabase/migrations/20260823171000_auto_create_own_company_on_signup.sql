create or replace function public.fn_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_company_name text;
begin
  v_company_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'company_name'), ''),
    'Empresa ' || split_part(new.email, '@', 1)
  );

  insert into public.companies (name)
  values (v_company_name)
  returning id into v_company_id;

  insert into public.users (id, email, role, company_id)
  values (new.id, new.email, 'company_admin', v_company_id);

  return new;
end;
$$;

revoke execute on function public.fn_handle_new_auth_user() from public, anon, authenticated;

do $$
declare
  v_user record;
  v_company_id uuid;
begin
  for v_user in
    select id, email from public.users where company_id is null
  loop
    insert into public.companies (name)
    values ('Empresa ' || split_part(v_user.email, '@', 1))
    returning id into v_company_id;

    update public.users
    set company_id = v_company_id
    where id = v_user.id and company_id is null;
  end loop;
end $$;
