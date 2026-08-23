-- Legacy RPC from the pre one-user-per-company flow.
-- Keep it for migration history, but make it non-callable by client roles.
revoke execute on function public.fn_join_company(uuid) from public, anon, authenticated;
comment on function public.fn_join_company(uuid) is 'LEGACY/DISABLED: fluxo de entrada em empresa existente foi substituído por fn_create_own_company.';
