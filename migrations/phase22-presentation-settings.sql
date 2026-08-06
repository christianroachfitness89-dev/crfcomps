-- Phase 22: Presentation payment links

-- Stripe checkout URLs for Gold and Silver packages, editable from Settings.
do $$
begin
  if not exists (select 1 from information_schema.columns where table_name = 'site_settings' and column_name = 'stripe_gold_url') then
    alter table public.site_settings add column stripe_gold_url text;
  end if;
  if not exists (select 1 from information_schema.columns where table_name = 'site_settings' and column_name = 'stripe_silver_url') then
    alter table public.site_settings add column stripe_silver_url text;
  end if;
end
$$;
