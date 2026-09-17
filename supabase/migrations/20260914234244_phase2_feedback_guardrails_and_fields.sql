-- Products: guardrails against negative values and unbounded field lengths
ALTER TABLE public.products
  ADD CONSTRAINT products_cost_nonnegative CHECK (cost IS NULL OR cost >= 0),
  ADD CONSTRAINT products_msrp_nonnegative CHECK (msrp IS NULL OR msrp >= 0),
  ADD CONSTRAINT products_sku_length CHECK (char_length(sku) <= 40),
  ADD CONSTRAINT products_title_length CHECK (char_length(title) <= 200),
  ADD CONSTRAINT products_brand_name_length CHECK (brand_name IS NULL OR char_length(brand_name) <= 100),
  ADD CONSTRAINT products_status_allowed CHECK (status IN ('ACTIVE', 'INACTIVE', 'FUTURE'));

-- Warehouses: address + contact info
ALTER TABLE public.warehouses
  ADD COLUMN address text,
  ADD COLUMN contact_name text,
  ADD COLUMN contact_phone text,
  ADD COLUMN contact_email text;

-- Users: expand role to a 3-tier model (super_admin / admin / user)
ALTER TABLE public.users
  ADD CONSTRAINT users_role_allowed CHECK (role IN ('super_admin', 'admin', 'user'));

-- sync_logs: let a sync run reference exactly which orders/items it touched, for drill-down
ALTER TABLE public.sync_logs
  ADD COLUMN synced_order_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN pushed_items jsonb NOT NULL DEFAULT '[]';
