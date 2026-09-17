-- Finish groups: master table instead of free text
CREATE TABLE public.finish_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp DEFAULT now(),
  UNIQUE (tenant_id, name)
);

-- Seed from any existing free-text values so nothing is lost
INSERT INTO public.finish_groups (tenant_id, name)
SELECT DISTINCT tenant_id, finish_group FROM public.products
WHERE finish_group IS NOT NULL AND finish_group <> ''
ON CONFLICT DO NOTHING;

ALTER TABLE public.products ADD COLUMN finish_group_id uuid REFERENCES public.finish_groups(id);

UPDATE public.products p
SET finish_group_id = fg.id
FROM public.finish_groups fg
WHERE fg.tenant_id = p.tenant_id AND fg.name = p.finish_group;

ALTER TABLE public.products DROP COLUMN finish_group;

-- Structured dimensions/weight instead of one free-text field
ALTER TABLE public.products
  ADD COLUMN product_length numeric,
  ADD COLUMN product_width numeric,
  ADD COLUMN product_height numeric,
  ADD COLUMN dimension_unit text DEFAULT 'in',
  ADD COLUMN product_weight numeric,
  ADD COLUMN weight_unit text DEFAULT 'lbs',
  ADD COLUMN carton_length numeric,
  ADD COLUMN carton_width numeric,
  ADD COLUMN carton_height numeric,
  ADD COLUMN carton_weight numeric,
  ADD COLUMN dimension_notes text;

ALTER TABLE public.products DROP COLUMN dimensions;

-- Customer exclusivity: replace the free-text field with a proper
-- customers/customer_groups model, multi-select capable
CREATE TABLE public.customer_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  customer_group_id uuid REFERENCES public.customer_groups(id),
  created_at timestamp DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE TABLE public.product_customer_exclusivity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  customer_group_id uuid REFERENCES public.customer_groups(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  created_at timestamp DEFAULT now(),
  CONSTRAINT one_of_group_or_customer CHECK (
    (customer_group_id IS NOT NULL AND customer_id IS NULL) OR
    (customer_group_id IS NULL AND customer_id IS NOT NULL)
  ),
  UNIQUE (tenant_id, product_id, customer_group_id, customer_id)
);

ALTER TABLE public.products DROP COLUMN customer_exclusivity;
