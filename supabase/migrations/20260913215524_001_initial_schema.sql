-- Nestora Pulse v1 - Complete Schema (19 tables for multi-tenant inventory)

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL,
  module_permissions JSONB DEFAULT '{"sales":true,"purchase":true,"accounting":true}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, email)
);
CREATE INDEX idx_users_tenant_id ON users(tenant_id);

CREATE TABLE warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, code)
);
CREATE INDEX idx_warehouses_tenant_id ON warehouses(tenant_id);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  brand_name TEXT,
  cost DECIMAL(10, 2),
  msrp DECIMAL(10, 2),
  customer_exclusivity TEXT,
  status TEXT DEFAULT 'ACTIVE',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  deleted_at TIMESTAMP,
  UNIQUE(tenant_id, sku)
);
CREATE INDEX idx_products_tenant_id ON products(tenant_id);
CREATE INDEX idx_products_sku ON products(sku);

CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  variant_type TEXT,
  related_product_id UUID REFERENCES products(id),
  quantity_in_bundle INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_product_variants_tenant_id ON product_variants(tenant_id);

CREATE TABLE product_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  channel TEXT,
  channel_product_id TEXT,
  channel_sku TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, product_id, channel)
);
CREATE INDEX idx_product_mappings_tenant_id ON product_mappings(tenant_id);

CREATE TABLE inventory_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  quantity_received INTEGER NOT NULL,
  quantity_available INTEGER NOT NULL,
  quantity_allocated INTEGER DEFAULT 0,
  quantity_fulfilled INTEGER DEFAULT 0,
  cost_per_unit DECIMAL(10, 2) NOT NULL,
  original_landed_date DATE NOT NULL,
  source TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, batch_number)
);
CREATE INDEX idx_inventory_batches_tenant_id ON inventory_batches(tenant_id);
CREATE INDEX idx_inventory_batches_product_id ON inventory_batches(product_id);

CREATE TABLE batch_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
  location_code TEXT,
  quantity INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_batch_locations_tenant_id ON batch_locations(tenant_id);

CREATE TABLE batch_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
  movement_type TEXT,
  quantity INTEGER,
  from_warehouse_id UUID REFERENCES warehouses(id),
  to_warehouse_id UUID REFERENCES warehouses(id),
  reason TEXT,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_batch_movements_tenant_id ON batch_movements(tenant_id);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_number TEXT NOT NULL,
  channel TEXT,
  channel_order_id TEXT,
  customer_name TEXT,
  customer_email TEXT,
  status TEXT DEFAULT 'PENDING',
  total_amount DECIMAL(10, 2),
  shipping_address TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, order_number)
);
CREATE INDEX idx_orders_tenant_id ON orders(tenant_id);
CREATE INDEX idx_orders_status ON orders(status);

CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity_ordered INTEGER,
  unit_price DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_order_items_tenant_id ON order_items(tenant_id);

CREATE TABLE order_fulfillment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES inventory_batches(id) ON DELETE CASCADE,
  quantity_fulfilled INTEGER,
  fulfilled_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_order_fulfillment_tenant_id ON order_fulfillment(tenant_id);

CREATE TABLE returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  return_number TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, return_number)
);
CREATE INDEX idx_returns_tenant_id ON returns(tenant_id);

CREATE TABLE return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  return_id UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  order_item_id UUID NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  quantity_returned INTEGER,
  condition TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_return_items_tenant_id ON return_items(tenant_id);

CREATE TABLE refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  return_id UUID NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  amount DECIMAL(10, 2),
  status TEXT DEFAULT 'PENDING',
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_refunds_tenant_id ON refunds(tenant_id);

CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_name TEXT,
  is_active BOOLEAN DEFAULT true,
  sync_frequency_minutes INTEGER DEFAULT 5,
  last_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, channel_name)
);
CREATE INDEX idx_channels_tenant_id ON channels(tenant_id);

CREATE TABLE channel_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  config_key TEXT,
  config_value TEXT,
  is_encrypted BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(tenant_id, channel_id, config_key)
);
CREATE INDEX idx_channel_configs_tenant_id ON channel_configs(tenant_id);

CREATE TABLE sync_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel TEXT,
  sync_type TEXT,
  status TEXT,
  records_synced INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_sync_logs_tenant_id ON sync_logs(tenant_id);
CREATE INDEX idx_sync_logs_date ON sync_logs(created_at);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  entity_type TEXT,
  entity_id UUID,
  action TEXT,
  changes JSONB,
  ip_address TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_logs_date ON audit_logs(created_at);
