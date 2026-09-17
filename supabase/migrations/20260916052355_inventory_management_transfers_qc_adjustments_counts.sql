-- Batches: PO/vendor lineage (sits unused until a PO module exists) plus
-- on-the-water tracking - a batch can now exist before it physically lands
-- at any warehouse.
ALTER TABLE public.inventory_batches
  ADD COLUMN po_number text,
  ADD COLUMN vendor_name text,
  ADD COLUMN status text NOT NULL DEFAULT 'RECEIVED',
  ADD COLUMN expected_warehouse_id uuid REFERENCES public.warehouses(id),
  ADD COLUMN expected_arrival_date date,
  ADD CONSTRAINT inventory_batches_status_check CHECK (status IN ('ON_WATER', 'RECEIVED'));

-- Transfers: inventory moving between two of our own warehouses. Initiating
-- a transfer removes the quantity from the source warehouse's on-hand
-- total immediately; it only lands in the destination's batch_locations
-- once an authorized user marks it received.
CREATE TABLE public.inventory_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.inventory_batches(id) ON DELETE CASCADE,
  from_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  to_warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'IN_TRANSIT' CHECK (status IN ('IN_TRANSIT', 'COMPLETED', 'CANCELLED')),
  expected_arrival_date date,
  notes text,
  initiated_by uuid REFERENCES public.users(id),
  initiated_at timestamp DEFAULT now(),
  completed_by uuid REFERENCES public.users(id),
  completed_at timestamp
);

-- QC holds: inventory pulled off the sellable shelf for inspection/repair.
-- No value change while holding - only the resolution (released back to
-- on-hand, or written off) is a real event, and a write-off becomes an
-- inventory_adjustments row.
CREATE TABLE public.inventory_qc_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.inventory_batches(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  reason text,
  status text NOT NULL DEFAULT 'HOLDING' CHECK (status IN ('HOLDING', 'RELEASED', 'WRITTEN_OFF')),
  placed_by uuid REFERENCES public.users(id),
  placed_at timestamp DEFAULT now(),
  resolved_by uuid REFERENCES public.users(id),
  resolved_at timestamp,
  resolution_notes text
);

-- Physical counts (per-line or Excel-batch-uploaded). A count that matches
-- the system quantity needs no adjustment; a variance links to one.
CREATE TABLE public.inventory_counts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  counted_quantity integer NOT NULL,
  system_quantity_at_count integer NOT NULL,
  variance integer GENERATED ALWAYS AS (counted_quantity - system_quantity_at_count) STORED,
  counted_by uuid REFERENCES public.users(id),
  counted_at timestamp DEFAULT now(),
  notes text,
  upload_batch_id uuid,
  resulting_adjustment_id uuid
);

-- Adjustments: the actual financial gain/loss ledger. Nothing here touches
-- real quantities until approved - submitted_by proposes, an authorized
-- (admin/super_admin) user approves (can be the same account, just needs
-- the role). Losses cost out FIFO from that warehouse's oldest batches
-- (inventory_adjustment_lines records exactly which batches/costs were
-- used); gains create a new batch priced at the entered or standard cost.
CREATE TABLE public.inventory_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id),
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id),
  adjustment_type text NOT NULL CHECK (adjustment_type IN ('LOSS', 'GAIN')),
  reason_code text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric(10, 2),
  total_value numeric(10, 2),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  source text NOT NULL DEFAULT 'MANUAL' CHECK (source IN ('MANUAL', 'COUNT', 'QC_RESOLUTION')),
  linked_count_id uuid REFERENCES public.inventory_counts(id),
  linked_qc_hold_id uuid REFERENCES public.inventory_qc_holds(id),
  created_batch_id uuid REFERENCES public.inventory_batches(id),
  notes text,
  submitted_by uuid REFERENCES public.users(id),
  submitted_at timestamp DEFAULT now(),
  approved_by uuid REFERENCES public.users(id),
  approved_at timestamp,
  approval_notes text
);

ALTER TABLE public.inventory_counts
  ADD CONSTRAINT inventory_counts_adjustment_fk FOREIGN KEY (resulting_adjustment_id) REFERENCES public.inventory_adjustments(id);

-- FIFO breakdown for a LOSS adjustment - which specific batches (and their
-- specific landed cost) the loss was actually taken from.
CREATE TABLE public.inventory_adjustment_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  adjustment_id uuid NOT NULL REFERENCES public.inventory_adjustments(id) ON DELETE CASCADE,
  batch_id uuid NOT NULL REFERENCES public.inventory_batches(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_cost numeric(10, 2)
);

-- Audit trail: every write this whole module makes, in one queryable place.
CREATE TABLE public.inventory_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  product_id uuid REFERENCES public.products(id),
  warehouse_id uuid REFERENCES public.warehouses(id),
  quantity_delta integer,
  value_delta numeric(10, 2),
  performed_by uuid REFERENCES public.users(id),
  performed_at timestamp DEFAULT now(),
  details jsonb
);

-- Same lesson as every prior round: Supabase's migration tool defaults new
-- tables to RLS-on with zero policies, which silently blocks every insert.
-- This project's permanent decision is app-level tenant_id filtering, no RLS.
ALTER TABLE public.inventory_transfers DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_qc_holds DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_counts DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_adjustments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_adjustment_lines DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_audit_log DISABLE ROW LEVEL SECURITY;
