-- Owner-directed redesign (2026-09-19): "channels" (Amazon/Wayfair/Walmart
-- API sync config) becomes "customer_integrations" - a technical record that
-- a customers row can optionally point to, for whichever customers actually
-- have real API integration. Business-facing "who do we sell to" now lives
-- entirely in customers/customer_groups; customer_integrations is pure
-- sync plumbing (credentials/schedule), same columns as before, just
-- correctly scoped and named.

ALTER TABLE public.channels RENAME TO customer_integrations;
ALTER TABLE public.customer_integrations RENAME CONSTRAINT channels_pkey TO customer_integrations_pkey;
ALTER TABLE public.customer_integrations RENAME CONSTRAINT channels_tenant_id_channel_name_key TO customer_integrations_tenant_id_channel_name_key;
ALTER TABLE public.customer_integrations RENAME CONSTRAINT channels_tenant_id_fkey TO customer_integrations_tenant_id_fkey;

-- channel_configs is config key/value storage FOR an integration row
-- (Amazon refresh_token, selling_partner_id today) - same rename logic.
ALTER TABLE public.channel_configs RENAME TO customer_integration_configs;
ALTER TABLE public.customer_integration_configs RENAME COLUMN channel_id TO integration_id;
ALTER TABLE public.customer_integration_configs RENAME CONSTRAINT channel_configs_pkey TO customer_integration_configs_pkey;
ALTER TABLE public.customer_integration_configs RENAME CONSTRAINT channel_configs_tenant_id_fkey TO customer_integration_configs_tenant_id_fkey;
ALTER TABLE public.customer_integration_configs RENAME CONSTRAINT channel_configs_channel_id_fkey TO customer_integration_configs_integration_id_fkey;
ALTER TABLE public.customer_integration_configs RENAME CONSTRAINT channel_configs_tenant_id_channel_id_config_key_key TO customer_integration_configs_tenant_id_integration_id_config_key_key;

-- Pointer FROM customers TO its integration record (only set for
-- API-integrated customers; everyone else stays NULL).
ALTER TABLE public.customers ADD COLUMN integration_id uuid REFERENCES public.customer_integrations(id);
CREATE INDEX idx_customers_integration_id_fk ON public.customers(integration_id);

-- created_by on brands/product_types, closing the gap flagged last round -
-- now consistent with finish_groups/countries/product_variants/
-- product_mappings/product_customer_exclusivity.
ALTER TABLE public.brands ADD COLUMN created_by uuid REFERENCES public.users(id);
CREATE INDEX idx_brands_created_by_fk ON public.brands(created_by);
ALTER TABLE public.product_types ADD COLUMN created_by uuid REFERENCES public.users(id);
CREATE INDEX idx_product_types_created_by_fk ON public.product_types(created_by);

-- Seed the 9 customer-group categories the owner specified, for every
-- existing tenant. Reference data, same pattern as the countries seed.
INSERT INTO public.customer_groups (tenant_id, name)
SELECT t.id, g.name
FROM public.tenants t
CROSS JOIN (VALUES
  ('ECom Channels'),
  ('ECom Resellers'),
  ('Big Box Stores'),
  ('Independent Stores'),
  ('Market Places'),
  ('Value/Discount Customers'),
  ('Specialty Stores'),
  ('Social Media'),
  ('Others')
) AS g(name)
ON CONFLICT (tenant_id, name) DO NOTHING;
