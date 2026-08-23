alter table public.users
  add column if not exists full_name text;

create or replace function public.fn_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_company_name text;
  v_full_name text;
begin
  v_company_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'company_name'), ''),
    'Empresa ' || split_part(new.email, '@', 1)
  );
  v_full_name := nullif(trim(new.raw_user_meta_data->>'full_name'), '');

  insert into public.companies (name)
  values (v_company_name)
  returning id into v_company_id;

  insert into public.users (id, email, role, company_id, full_name)
  values (new.id, new.email, 'company_admin', v_company_id, v_full_name);

  return new;
end;
$$;

update public.users u
set full_name = nullif(trim(a.raw_user_meta_data->>'full_name'), '')
from auth.users a
where a.id = u.id
  and u.full_name is null
  and nullif(trim(a.raw_user_meta_data->>'full_name'), '') is not null;

comment on column public.users.full_name is
  'Nome completo informado no cadastro; dados sensíveis de autenticação permanecem no schema auth.';
