-- Nestora Pulse Phase 1: Initial Schema
-- Created: 2026-09-09
-- Purpose: Multi-tenant authentication system

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- TENANTS TABLE (Multi-tenant isolation)
-- ============================================
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  api_key TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- USERS TABLE (Linked to Supabase auth)
-- ============================================
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  ms_id TEXT UNIQUE,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'manager', 'user')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'deleted')),
  permissions JSONB DEFAULT '{}'::jsonb,
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- USER_PERMISSIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.user_permissions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_scope JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  UNIQUE(user_id, module, action)
);

-- ============================================
-- PRODUCTS TABLE (Nested under tenant)
-- ============================================
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  cost DECIMAL(12, 2),
  msrp DECIMAL(12, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  UNIQUE(tenant_id, sku)
);

-- ============================================
-- CHANNELS TABLE (Sales channels per tenant)
-- ============================================
CREATE TABLE IF NOT EXISTS public.channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- WAREHOUSES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.warehouses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  capacity INTEGER,
  region TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- INVENTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.inventory (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  last_sync TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  UNIQUE(product_id, warehouse_id, channel_id)
);

-- ============================================
-- CATALOG_MAPPINGS TABLE (Product mappings per channel)
-- ============================================
CREATE TABLE IF NOT EXISTS public.catalog_mappings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  channel_sku TEXT NOT NULL,
  channel_title TEXT NOT NULL,
  price DECIMAL(12, 2),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  UNIQUE(channel_id, channel_sku)
);

-- ============================================
-- ORDERS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  order_id TEXT NOT NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  price DECIMAL(12, 2),
  date TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),

  UNIQUE(tenant_id, channel, order_id)
);

-- ============================================
-- SYNC_LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  channel_id UUID REFERENCES public.channels(id) ON DELETE SET NULL,
  event TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
  error TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- TEAMS_SYNC TABLE (Microsoft Teams integration)
-- ============================================
CREATE TABLE IF NOT EXISTS public.teams_sync (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  teams_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  due_date DATE,
  assigned_to TEXT,
  sync_direction TEXT DEFAULT 'bidirectional',
  last_synced TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX idx_users_tenant_id ON public.users(tenant_id);
CREATE INDEX idx_users_email ON public.users(email);
CREATE INDEX idx_products_tenant_id ON public.products(tenant_id);
CREATE INDEX idx_products_sku ON public.products(sku);
CREATE INDEX idx_channels_tenant_id ON public.channels(tenant_id);
CREATE INDEX idx_warehouses_tenant_id ON public.warehouses(tenant_id);
CREATE INDEX idx_inventory_product_id ON public.inventory(product_id);
CREATE INDEX idx_inventory_warehouse_id ON public.inventory(warehouse_id);
CREATE INDEX idx_orders_tenant_id ON public.orders(tenant_id);
CREATE INDEX idx_sync_logs_tenant_id ON public.sync_logs(tenant_id);
CREATE INDEX idx_teams_sync_tenant_id ON public.teams_sync(tenant_id);

-- ============================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams_sync ENABLE ROW LEVEL SECURITY;

-- TENANTS: Admin-only access
CREATE POLICY "tenants_admin_access" ON public.tenants
  USING (auth.uid() IN (
    SELECT id FROM public.users
    WHERE role = 'admin'
  ));

-- USERS: Users can see own profile + tenant members
CREATE POLICY "users_own_profile" ON public.users
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "users_tenant_members" ON public.users
  FOR SELECT USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

-- USER_PERMISSIONS: Users can see own permissions + their tenant's permissions
CREATE POLICY "user_permissions_own" ON public.user_permissions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "user_permissions_tenant" ON public.user_permissions
  FOR SELECT USING (
    user_id IN (
      SELECT id FROM public.users
      WHERE tenant_id = (
        SELECT tenant_id FROM public.users WHERE id = auth.uid()
      )
    )
  );

-- PRODUCTS: Accessible by tenant members
CREATE POLICY "products_tenant_access" ON public.products
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

-- CHANNELS: Accessible by tenant members
CREATE POLICY "channels_tenant_access" ON public.channels
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

-- WAREHOUSES: Accessible by tenant members
CREATE POLICY "warehouses_tenant_access" ON public.warehouses
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

-- INVENTORY: Accessible by tenant members
CREATE POLICY "inventory_tenant_access" ON public.inventory
  USING (
    product_id IN (
      SELECT id FROM public.products
      WHERE tenant_id = (
        SELECT tenant_id FROM public.users WHERE id = auth.uid()
      )
    )
  );

-- CATALOG_MAPPINGS: Accessible by tenant members
CREATE POLICY "catalog_mappings_tenant_access" ON public.catalog_mappings
  USING (
    product_id IN (
      SELECT id FROM public.products
      WHERE tenant_id = (
        SELECT tenant_id FROM public.users WHERE id = auth.uid()
      )
    )
  );

-- ORDERS: Accessible by tenant members
CREATE POLICY "orders_tenant_access" ON public.orders
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

-- SYNC_LOGS: Accessible by tenant members
CREATE POLICY "sync_logs_tenant_access" ON public.sync_logs
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

-- TEAMS_SYNC: Accessible by tenant members
CREATE POLICY "teams_sync_tenant_access" ON public.teams_sync
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.users WHERE id = auth.uid()
    )
  );

-- ============================================
-- UTILITY FUNCTIONS
-- ============================================

-- Function to create first tenant + admin user
CREATE OR REPLACE FUNCTION public.create_tenant_with_admin(
  p_tenant_name TEXT,
  p_tenant_slug TEXT,
  p_email TEXT,
  p_auth_id UUID
)
RETURNS TABLE (tenant_id UUID, user_id UUID) AS $$
DECLARE
  v_tenant_id UUID;
  v_user_id UUID;
BEGIN
  -- Create tenant
  INSERT INTO public.tenants (name, slug)
  VALUES (p_tenant_name, p_tenant_slug)
  RETURNING id INTO v_tenant_id;

  -- Create admin user
  INSERT INTO public.users (id, tenant_id, email, role)
  VALUES (p_auth_id, v_tenant_id, p_email, 'admin')
  RETURNING id INTO v_user_id;

  RETURN QUERY SELECT v_tenant_id, v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant function execution to authenticated users
GRANT EXECUTE ON FUNCTION public.create_tenant_with_admin TO authenticated;

-- ============================================
-- COMMENTS (Documentation)
-- ============================================
COMMENT ON TABLE public.tenants IS 'Multi-tenant workspace isolation - each tenant is independent';
COMMENT ON TABLE public.users IS 'Users linked to Supabase auth system - one row per auth user per tenant';
COMMENT ON TABLE public.products IS 'Furniture products managed per tenant';
COMMENT ON TABLE public.channels IS 'Sales channels (Shopify, Amazon, Direct, etc) per tenant';
COMMENT ON TABLE public.inventory IS 'Real-time inventory levels across warehouses and channels';
COMMENT ON TABLE public.orders IS 'Order records synced from all channels';
COMMENT ON TABLE public.teams_sync IS 'Microsoft Teams calendar/task sync integration';
