-- Owner-requested (2026-09-19):
-- 1. Length caps on products.status/dimension_unit/weight_unit/dimension_notes/description
-- 2. countries becomes tenant-scoped (was global) - add tenant_id, backfill per existing tenant
-- 3. created_by on countries, finish_groups, product_variants, product_mappings,
--    product_customer_exclusivity

-- 1. Length constraints
ALTER TABLE public.products ADD CONSTRAINT products_status_length CHECK (status IS NULL OR char_length(status) <= 20);
ALTER TABLE public.products ADD CONSTRAINT products_dimension_unit_length CHECK (dimension_unit IS NULL OR char_length(dimension_unit) <= 20);
ALTER TABLE public.products ADD CONSTRAINT products_weight_unit_length CHECK (weight_unit IS NULL OR char_length(weight_unit) <= 20);
ALTER TABLE public.products ADD CONSTRAINT products_dimension_notes_length CHECK (dimension_notes IS NULL OR char_length(dimension_notes) <= 250);
ALTER TABLE public.products ADD CONSTRAINT products_description_length CHECK (description IS NULL OR char_length(description) <= 2000);

-- 2. countries: drop the old GLOBAL uniqueness first (it would otherwise
-- collide the moment a second tenant's copy of "AF"/"Afghanistan" is
-- inserted), then add tenant_id + created_by, backfill per tenant, then
-- add the new PER-TENANT uniqueness.
ALTER TABLE public.countries DROP CONSTRAINT countries_iso2_key;
ALTER TABLE public.countries DROP CONSTRAINT countries_name_key;

ALTER TABLE public.countries ADD COLUMN tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE;
ALTER TABLE public.countries ADD COLUMN created_by uuid REFERENCES public.users(id);

INSERT INTO public.countries (tenant_id, iso2, name)
SELECT t.id, c.iso2, c.name
FROM public.tenants t
CROSS JOIN public.countries c
WHERE c.tenant_id IS NULL;

DELETE FROM public.countries WHERE tenant_id IS NULL;

ALTER TABLE public.countries ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE public.countries ADD CONSTRAINT countries_tenant_id_iso2_key UNIQUE (tenant_id, iso2);
ALTER TABLE public.countries ADD CONSTRAINT countries_tenant_id_name_key UNIQUE (tenant_id, name);
CREATE INDEX idx_countries_tenant_id_fk ON public.countries(tenant_id);
CREATE INDEX idx_countries_created_by_fk ON public.countries(created_by);

-- 3. created_by on the other 4 tables
ALTER TABLE public.finish_groups ADD COLUMN created_by uuid REFERENCES public.users(id);
CREATE INDEX idx_finish_groups_created_by_fk ON public.finish_groups(created_by);

ALTER TABLE public.product_variants ADD COLUMN created_by uuid REFERENCES public.users(id);
CREATE INDEX idx_product_variants_created_by_fk ON public.product_variants(created_by);

ALTER TABLE public.product_mappings ADD COLUMN created_by uuid REFERENCES public.users(id);
CREATE INDEX idx_product_mappings_created_by_fk ON public.product_mappings(created_by);

ALTER TABLE public.product_customer_exclusivity ADD COLUMN created_by uuid REFERENCES public.users(id);
CREATE INDEX idx_product_customer_exclusivity_created_by_fk ON public.product_customer_exclusivity(created_by);
