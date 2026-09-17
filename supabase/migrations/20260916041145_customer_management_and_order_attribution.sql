-- Customer groups: add a description field
ALTER TABLE public.customer_groups ADD COLUMN description text;

-- Customers: extend to a real B2B account record
ALTER TABLE public.customers
  ADD COLUMN email text,
  ADD COLUMN phone text,
  ADD COLUMN inventory_update_email text,
  ADD COLUMN support_email text,
  ADD COLUMN address text,
  ADD COLUMN city text,
  ADD COLUMN state text,
  ADD COLUMN zip text,
  ADD COLUMN country text,
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN updated_at timestamp DEFAULT now();

-- Customer contacts: a customer can have multiple named contact people
CREATE TABLE public.customer_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text,
  email text,
  phone text,
  created_at timestamp DEFAULT now()
);

-- Orders: attribute to a customer and/or customer group (nullable = generic/unattributed)
ALTER TABLE public.orders
  ADD COLUMN customer_id uuid REFERENCES public.customers(id),
  ADD COLUMN customer_group_id uuid REFERENCES public.customer_groups(id);

-- Learned lesson from the last round: Supabase's migration tool defaults new
-- tables to RLS-on with zero policies, which silently blocks every insert.
-- This project's permanent decision is app-level tenant_id filtering, no RLS.
ALTER TABLE public.customer_contacts DISABLE ROW LEVEL SECURITY;
