-- Keep payment credentials encrypted in Supabase Vault and expose them only to server-side service_role.
create or replace function public.infiskies_get_razorpay_secrets()
returns jsonb
language sql
security definer
set search_path = public, vault
as $function$
  select jsonb_build_object(
    'key_id', max(decrypted_secret) filter (where name = 'infiskies_razorpay_key_id'),
    'key_secret', max(decrypted_secret) filter (where name = 'infiskies_razorpay_key_secret')
  )
  from vault.decrypted_secrets
  where name in ('infiskies_razorpay_key_id', 'infiskies_razorpay_key_secret');
$function$;

revoke all on function public.infiskies_get_razorpay_secrets() from public;
revoke all on function public.infiskies_get_razorpay_secrets() from anon;
revoke all on function public.infiskies_get_razorpay_secrets() from authenticated;
grant execute on function public.infiskies_get_razorpay_secrets() to service_role;
