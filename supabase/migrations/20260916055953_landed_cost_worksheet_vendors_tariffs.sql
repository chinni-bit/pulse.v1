-- Vendors/factories: previously just free text on a batch. Now a real,
-- configurable entity carrying the "standard values" the owner wants
-- pre-filled on a landed-cost worksheet (fully editable per worksheet).
CREATE TABLE public.vendors_factories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  country text,
  default_ocean_freight numeric(10, 2),
  default_drayage numeric(10, 2),
  default_unloading numeric(10, 2),
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now(),
  UNIQUE (tenant_id, name)
);

-- Tariff/customs duty rate by country of origin, matched against
-- products.country_of_origin - pulled onto a worksheet automatically,
-- editable there.
CREATE TABLE public.country_tariff_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  country text NOT NULL,
  duty_rate_percent numeric(6, 3) NOT NULL DEFAULT 0,
  updated_at timestamp DEFAULT now(),
  UNIQUE (tenant_id, country)
);

-- Tenant-wide inventory defaults - just procurement overhead % for now,
-- room to grow. One row per tenant.
CREATE TABLE public.inventory_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  default_procurement_overhead_percent numeric(6, 3) NOT NULL DEFAULT 10.0,
  updated_at timestamp DEFAULT now()
);

-- A shipment groups one or more batches that share the same freight/
-- drayage/unloading costs - either an import (po -> factory -> on water
-- -> warehouse) or a local purchase (po -> warehouse directly, no ocean
-- leg, freight/duty typically zero but drayage/unloading/overhead can
-- still apply).
CREATE TABLE public.inventory_shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vendor_id uuid REFERENCES public.vendors_factories(id),
  reference text,
  shipment_type text NOT NULL DEFAULT 'IMPORT' CHECK (shipment_type IN ('IMPORT', 'LOCAL')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),
  created_by uuid REFERENCES public.users(id),
  created_at timestamp DEFAULT now()
);

ALTER TABLE public.inventory_batches
  ADD COLUMN shipment_id uuid REFERENCES public.inventory_shipments(id),
  ADD COLUMN landed_cost_status text NOT NULL DEFAULT 'PENDING' CHECK (landed_cost_status IN ('PENDING', 'FINALIZED'));

-- The worksheet itself: one per shipment (or a single ad-hoc batch,
-- since a shipment can have just one line). Allocation method only
-- matters with more than one line, but is always recorded.
CREATE TABLE public.inventory_landed_cost_worksheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  shipment_id uuid NOT NULL REFERENCES public.inventory_shipments(id),
  allocation_method text NOT NULL DEFAULT 'VALUE' CHECK (allocation_method IN ('VOLUME', 'VALUE')),
  ocean_freight_total numeric(10, 2) NOT NULL DEFAULT 0,
  drayage_total numeric(10, 2) NOT NULL DEFAULT 0,
  unloading_total numeric(10, 2) NOT NULL DEFAULT 0,
  procurement_overhead_percent numeric(6, 3) NOT NULL DEFAULT 10.0,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'FINALIZED')),
  created_by uuid REFERENCES public.users(id),
  created_at timestamp DEFAULT now(),
  finalized_by uuid REFERENCES public.users(id),
  finalized_at timestamp
);

-- One line per batch in the worksheet - the actual computed breakdown,
-- kept permanently as the audit record of how a batch's landed cost was
-- derived, even after products/rates change later.
CREATE TABLE public.inventory_landed_cost_worksheet_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  worksheet_id uuid NOT NULL REFERENCES public.inventory_landed_cost_worksheets(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.inventory_batches(id),
  quantity integer NOT NULL,
  purchase_cost_per_unit numeric(10, 2) NOT NULL,
  country_of_origin text,
  customs_duty_rate_percent numeric(6, 3) NOT NULL DEFAULT 0,
  customs_duty_total numeric(10, 2) NOT NULL DEFAULT 0,
  allocation_weight numeric(12, 4) NOT NULL DEFAULT 0,
  allocated_ocean_freight numeric(10, 2) NOT NULL DEFAULT 0,
  allocated_drayage numeric(10, 2) NOT NULL DEFAULT 0,
  allocated_unloading numeric(10, 2) NOT NULL DEFAULT 0,
  procurement_overhead_total numeric(10, 2) NOT NULL DEFAULT 0,
  landed_cost_per_unit numeric(10, 2) NOT NULL DEFAULT 0,
  UNIQUE (worksheet_id, batch_id)
);

-- Same lesson every round: Supabase defaults new tables to RLS-on with
-- zero policies, which silently blocks every insert. This project's
-- permanent decision is app-level tenant_id filtering, no RLS.
ALTER TABLE public.vendors_factories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.country_tariff_rates DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_shipments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_landed_cost_worksheets DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_landed_cost_worksheet_lines DISABLE ROW LEVEL SECURITY;
