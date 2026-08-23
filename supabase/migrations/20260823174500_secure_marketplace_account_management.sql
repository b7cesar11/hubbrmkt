drop policy if exists tenant_isolation_marketplace_accounts on public.marketplace_accounts;

drop policy if exists marketplace_accounts_select_company on public.marketplace_accounts;
create policy marketplace_accounts_select_company on public.marketplace_accounts
  for select to authenticated
  using (company_id = (select public.fn_current_company_id()));

drop policy if exists marketplace_accounts_insert_admin on public.marketplace_accounts;
create policy marketplace_accounts_insert_admin on public.marketplace_accounts
  for insert to authenticated
  with check (
    company_id = (select public.fn_current_company_id())
    and (select public.fn_current_role()) in ('company_admin','super_admin')
  );

drop policy if exists marketplace_accounts_update_admin on public.marketplace_accounts;
create policy marketplace_accounts_update_admin on public.marketplace_accounts
  for update to authenticated
  using (
    company_id = (select public.fn_current_company_id())
    and (select public.fn_current_role()) in ('company_admin','super_admin')
  )
  with check (
    company_id = (select public.fn_current_company_id())
    and (select public.fn_current_role()) in ('company_admin','super_admin')
  );

drop policy if exists marketplace_accounts_delete_admin on public.marketplace_accounts;
create policy marketplace_accounts_delete_admin on public.marketplace_accounts
  for delete to authenticated
  using (
    company_id = (select public.fn_current_company_id())
    and (select public.fn_current_role()) in ('company_admin','super_admin')
  );

create or replace function public.fn_upsert_marketplace_account(
  p_account_id uuid,
  p_platform_id uuid,
  p_name text,
  p_document_type text,
  p_profile_config jsonb,
  p_is_default boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_company_id uuid;
  v_role text;
  v_account_id uuid;
begin
  if auth.uid() is null then raise exception 'Não autenticado'; end if;
  select u.company_id, u.role into v_company_id, v_role from public.users u where u.id = auth.uid();
  if v_company_id is null then raise exception 'Usuário sem empresa vinculada'; end if;
  if v_role not in ('company_admin','super_admin') then raise exception 'Somente administradores podem alterar contas de marketplace'; end if;
  if nullif(trim(p_name),'') is null then raise exception 'Nome da conta é obrigatório'; end if;
  if p_document_type is not null and p_document_type not in ('cpf','cnpj') then raise exception 'Tipo de documento inválido'; end if;
  if not exists (select 1 from public.platforms where id = p_platform_id) then raise exception 'Marketplace inválido'; end if;

  if p_is_default then
    update public.marketplace_accounts
    set is_default = false, updated_at = now()
    where company_id = v_company_id and platform_id = p_platform_id and active;
  end if;

  if p_account_id is null then
    insert into public.marketplace_accounts (
      company_id, platform_id, name, document_type, profile_config, is_default, active
    ) values (
      v_company_id, p_platform_id, trim(p_name), p_document_type,
      coalesce(p_profile_config,'{}'::jsonb), coalesce(p_is_default,false), true
    ) returning id into v_account_id;
  else
    update public.marketplace_accounts
    set platform_id = p_platform_id,
        name = trim(p_name),
        document_type = p_document_type,
        profile_config = coalesce(p_profile_config,'{}'::jsonb),
        is_default = coalesce(p_is_default,false),
        updated_at = now()
    where id = p_account_id and company_id = v_company_id
    returning id into v_account_id;
    if v_account_id is null then raise exception 'Conta não encontrada para esta empresa'; end if;
  end if;

  return v_account_id;
end;
$$;
revoke all on function public.fn_upsert_marketplace_account(uuid,uuid,text,text,jsonb,boolean) from public, anon;
grant execute on function public.fn_upsert_marketplace_account(uuid,uuid,text,text,jsonb,boolean) to authenticated;
