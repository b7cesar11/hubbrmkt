-- Optimize RLS evaluation without changing authorization semantics.

drop policy if exists select_company_users on public.users;
create policy select_company_users on public.users
  for select to authenticated
  using (company_id = public.fn_current_company_id() or id = (select auth.uid()));

drop policy if exists write_super_admin on public.platforms;
create policy platforms_insert_super_admin on public.platforms for insert to authenticated
  with check (public.fn_current_role() = 'super_admin');
create policy platforms_update_super_admin on public.platforms for update to authenticated
  using (public.fn_current_role() = 'super_admin')
  with check (public.fn_current_role() = 'super_admin');
create policy platforms_delete_super_admin on public.platforms for delete to authenticated
  using (public.fn_current_role() = 'super_admin');

drop policy if exists write_super_admin on public.platform_fee_rules;
create policy fee_rules_insert_super_admin on public.platform_fee_rules for insert to authenticated
  with check (public.fn_current_role() = 'super_admin');
create policy fee_rules_update_super_admin on public.platform_fee_rules for update to authenticated
  using (public.fn_current_role() = 'super_admin')
  with check (public.fn_current_role() = 'super_admin');
create policy fee_rules_delete_super_admin on public.platform_fee_rules for delete to authenticated
  using (public.fn_current_role() = 'super_admin');

drop policy if exists write_super_admin on public.platform_promotions;
create policy promotions_insert_super_admin on public.platform_promotions for insert to authenticated
  with check (public.fn_current_role() = 'super_admin');
create policy promotions_update_super_admin on public.platform_promotions for update to authenticated
  using (public.fn_current_role() = 'super_admin')
  with check (public.fn_current_role() = 'super_admin');
create policy promotions_delete_super_admin on public.platform_promotions for delete to authenticated
  using (public.fn_current_role() = 'super_admin');
