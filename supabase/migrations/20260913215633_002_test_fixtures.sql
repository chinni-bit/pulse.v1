-- Test Fixtures: 2 tenants, 4 users per tenant, 3 warehouses, 15 products, 20 orders, 3 returns

-- Tenant 1: Nestora Primary
INSERT INTO tenants (id, name, slug) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'Nestora Primary', 'nestora-primary'),
  ('550e8400-e29b-41d4-a716-446655440002', 'Nestora QA', 'nestora-qa');

-- Users (Tenant 1): SUPER_ADMIN, ADMIN, EDITOR, VIEWER
INSERT INTO users (id, tenant_id, email, full_name, role) VALUES
  ('660e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'super.admin@nestora.com', 'Super Admin User', 'SUPER_ADMIN'),
  ('660e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 'admin@nestora.com', 'Admin User', 'ADMIN'),
  ('660e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440001', 'editor@nestora.com', 'Editor User', 'EDITOR'),
  ('660e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440001', 'viewer@nestora.com', 'Viewer User', 'VIEWER'),
  ('660e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440002', 'qa.admin@nestora.com', 'QA Admin', 'ADMIN'),
  ('660e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440002', 'qa.editor@nestora.com', 'QA Editor', 'EDITOR'),
  ('660e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440002', 'qa.viewer@nestora.com', 'QA Viewer', 'VIEWER'),
  ('660e8400-e29b-41d4-a716-446655440008', '550e8400-e29b-41d4-a716-446655440002', 'qa.super@nestora.com', 'QA Super Admin', 'SUPER_ADMIN');

-- Warehouses (Tenant 1): NJ/WH100, MS/WH800, WFS/WH200
INSERT INTO warehouses (id, tenant_id, code, name, location) VALUES
  ('770e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'NJ/WH100', 'New Jersey Warehouse', 'Newark, NJ'),
  ('770e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 'MS/WH800', 'Mississippi Warehouse', 'Jackson, MS'),
  ('770e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440001', 'WFS/WH200', 'Wayfair 3PL Warehouse', 'Kentucky, KY'),
  ('770e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440002', 'NJ/WH100', 'QA NJ Warehouse', 'Newark, NJ'),
  ('770e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440002', 'MS/WH800', 'QA MS Warehouse', 'Jackson, MS'),
  ('770e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440002', 'WFS/WH200', 'QA WFS Warehouse', 'Kentucky, KY');

-- Products (Tenant 1): 15 test products across 6 brands
INSERT INTO products (id, tenant_id, sku, title, brand_name, cost, msrp, status) VALUES
  ('880e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'SB-CRIB-001', 'Suite Bebe Convertible Crib', 'Suite Bebe', 250.00, 599.99, 'ACTIVE'),
  ('880e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 'BC-DRESSER-001', 'Baby Cache Dresser', 'Baby Cache', 180.00, 449.99, 'ACTIVE'),
  ('880e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440001', 'CN-MATTRESS-001', 'Centennial Crib Mattress', 'Centennial Nursery', 45.00, 99.99, 'ACTIVE'),
  ('880e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440001', 'KG-ROCKER-001', 'Kingsley Rocking Chair', 'Kingsley', 120.00, 299.99, 'ACTIVE'),
  ('880e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440001', '1ST-CHAIR-001', 'The 1st Chair Classic', 'The 1st Chair', 85.00, 199.99, 'ACTIVE'),
  ('880e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440001', 'OO-MOBILE-001', 'Olive & Opie Mobile', 'Olive & Opie', 35.00, 79.99, 'ACTIVE'),
  ('880e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440001', 'SB-CRIB-002', 'Suite Bebe Standard Crib', 'Suite Bebe', 200.00, 479.99, 'ACTIVE'),
  ('880e8400-e29b-41d4-a716-446655440008', '550e8400-e29b-41d4-a716-446655440001', 'BC-NIGHTSTAND-001', 'Baby Cache Nightstand', 'Baby Cache', 95.00, 229.99, 'ACTIVE'),
  ('880e8400-e29b-41d4-a716-446655440009', '550e8400-e29b-41d4-a716-446655440001', 'CN-SHEET-001', 'Centennial Sheet Set', 'Centennial Nursery', 25.00, 59.99, 'ACTIVE'),
  ('880e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440001', 'KG-TABLE-001', 'Kingsley Side Table', 'Kingsley', 65.00, 149.99, 'ACTIVE'),
  ('880e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440001', '1ST-STOOL-001', 'The 1st Chair Ottoman', 'The 1st Chair', 45.00, 99.99, 'ACTIVE'),
  ('880e8400-e29b-41d4-a716-446655440012', '550e8400-e29b-41d4-a716-446655440001', 'OO-LIGHT-001', 'Olive & Opie Night Light', 'Olive & Opie', 20.00, 49.99, 'ACTIVE'),
  ('880e8400-e29b-41d4-a716-446655440013', '550e8400-e29b-41d4-a716-446655440001', 'SB-CHANGING-001', 'Suite Bebe Changing Table', 'Suite Bebe', 150.00, 349.99, 'ACTIVE'),
  ('880e8400-e29b-41d4-a716-446655440014', '550e8400-e29b-41d4-a716-446655440001', 'BC-CRIB-001', 'Baby Cache Premium Crib', 'Baby Cache', 275.00, 699.99, 'ACTIVE'),
  ('880e8400-e29b-41d4-a716-446655440015', '550e8400-e29b-41d4-a716-446655440001', 'CN-BUMPER-001', 'Centennial Crib Bumper', 'Centennial Nursery', 35.00, 89.99, 'ACTIVE');

-- Inventory Batches (FIFO): 5 batches per product
INSERT INTO inventory_batches (id, tenant_id, product_id, batch_number, quantity_received, quantity_available, cost_per_unit, original_landed_date, source) VALUES
  ('990e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'BATCH-001-SEP', 100, 95, 250.00, '2026-09-01', 'PURCHASE'),
  ('990e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 'BATCH-002-AUG', 50, 42, 245.00, '2026-08-15', 'PURCHASE'),
  ('990e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440002', 'BATCH-003-SEP', 75, 70, 180.00, '2026-09-02', 'PURCHASE'),
  ('990e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440003', 'BATCH-004-SEP', 200, 195, 45.00, '2026-09-03', 'PURCHASE'),
  ('990e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440004', 'BATCH-005-SEP', 60, 58, 120.00, '2026-09-04', 'PURCHASE');

-- Orders (Tenant 1): 20 test orders
INSERT INTO orders (id, tenant_id, order_number, channel, customer_name, customer_email, status, total_amount) VALUES
  ('aa0e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'ORD-001', 'AMAZON', 'John Doe', 'john@example.com', 'PENDING', 599.99),
  ('aa0e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 'ORD-002', 'WALMART', 'Jane Smith', 'jane@example.com', 'CONFIRMED', 449.99),
  ('aa0e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440001', 'ORD-003', 'WAYFAIR', 'Bob Johnson', 'bob@example.com', 'PROCESSING', 1099.98),
  ('aa0e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440001', 'ORD-004', 'SHOPIFY', 'Alice Brown', 'alice@example.com', 'SHIPPED', 299.99),
  ('aa0e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440001', 'ORD-005', 'AMAZON', 'Charlie Wilson', 'charlie@example.com', 'DELIVERED', 199.99),
  ('aa0e8400-e29b-41d4-a716-446655440006', '550e8400-e29b-41d4-a716-446655440001', 'ORD-006', 'WALMART', 'Diana Lee', 'diana@example.com', 'PENDING', 79.99),
  ('aa0e8400-e29b-41d4-a716-446655440007', '550e8400-e29b-41d4-a716-446655440001', 'ORD-007', 'WAYFAIR', 'Eve Martinez', 'eve@example.com', 'PENDING', 479.99),
  ('aa0e8400-e29b-41d4-a716-446655440008', '550e8400-e29b-41d4-a716-446655440001', 'ORD-008', 'SHOPIFY', 'Frank Rodriguez', 'frank@example.com', 'CONFIRMED', 229.99),
  ('aa0e8400-e29b-41d4-a716-446655440009', '550e8400-e29b-41d4-a716-446655440001', 'ORD-009', 'AMAZON', 'Grace Taylor', 'grace@example.com', 'PROCESSING', 59.99),
  ('aa0e8400-e29b-41d4-a716-446655440010', '550e8400-e29b-41d4-a716-446655440001', 'ORD-010', 'WALMART', 'Henry Anderson', 'henry@example.com', 'SHIPPED', 149.99),
  ('aa0e8400-e29b-41d4-a716-446655440011', '550e8400-e29b-41d4-a716-446655440001', 'ORD-011', 'WAYFAIR', 'Iris Thomas', 'iris@example.com', 'DELIVERED', 99.99),
  ('aa0e8400-e29b-41d4-a716-446655440012', '550e8400-e29b-41d4-a716-446655440001', 'ORD-012', 'SHOPIFY', 'Jack Jackson', 'jack@example.com', 'PENDING', 49.99),
  ('aa0e8400-e29b-41d4-a716-446655440013', '550e8400-e29b-41d4-a716-446655440001', 'ORD-013', 'AMAZON', 'Karen White', 'karen@example.com', 'PENDING', 349.99),
  ('aa0e8400-e29b-41d4-a716-446655440014', '550e8400-e29b-41d4-a716-446655440001', 'ORD-014', 'WALMART', 'Leo Harris', 'leo@example.com', 'CONFIRMED', 699.99),
  ('aa0e8400-e29b-41d4-a716-446655440015', '550e8400-e29b-41d4-a716-446655440001', 'ORD-015', 'WAYFAIR', 'Mona Martin', 'mona@example.com', 'PROCESSING', 89.99),
  ('aa0e8400-e29b-41d4-a716-446655440016', '550e8400-e29b-41d4-a716-446655440001', 'ORD-016', 'SHOPIFY', 'Nathan Green', 'nathan@example.com', 'SHIPPED', 599.99),
  ('aa0e8400-e29b-41d4-a716-446655440017', '550e8400-e29b-41d4-a716-446655440001', 'ORD-017', 'AMAZON', 'Olivia Adams', 'olivia@example.com', 'DELIVERED', 449.99),
  ('aa0e8400-e29b-41d4-a716-446655440018', '550e8400-e29b-41d4-a716-446655440001', 'ORD-018', 'WALMART', 'Paul Nelson', 'paul@example.com', 'PENDING', 1099.98),
  ('aa0e8400-e29b-41d4-a716-446655440019', '550e8400-e29b-41d4-a716-446655440001', 'ORD-019', 'WAYFAIR', 'Quinn Carter', 'quinn@example.com', 'CONFIRMED', 299.99),
  ('aa0e8400-e29b-41d4-a716-446655440020', '550e8400-e29b-41d4-a716-446655440001', 'ORD-020', 'SHOPIFY', 'Rachel Mitchell', 'rachel@example.com', 'PROCESSING', 179.99);

-- Order Items (Tenant 1)
INSERT INTO order_items (id, tenant_id, order_id, product_id, quantity_ordered, unit_price) VALUES
  ('bb0e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440001', '880e8400-e29b-41d4-a716-446655440001', 1, 599.99),
  ('bb0e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440002', '880e8400-e29b-41d4-a716-446655440002', 1, 449.99),
  ('bb0e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440001', 1, 599.99),
  ('bb0e8400-e29b-41d4-a716-446655440004', '550e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440003', '880e8400-e29b-41d4-a716-446655440002', 1, 449.99),
  ('bb0e8400-e29b-41d4-a716-446655440005', '550e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440004', '880e8400-e29b-41d4-a716-446655440004', 1, 299.99);

-- Returns (Tenant 1): 3 returns
INSERT INTO returns (id, tenant_id, order_id, return_number, status) VALUES
  ('cc0e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440001', 'RET-001', 'PENDING'),
  ('cc0e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440005', 'RET-002', 'RECEIVED'),
  ('cc0e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440001', 'aa0e8400-e29b-41d4-a716-446655440014', 'RET-003', 'APPROVED');

-- Return Items
INSERT INTO return_items (id, tenant_id, return_id, order_item_id, quantity_returned, condition) VALUES
  ('dd0e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'cc0e8400-e29b-41d4-a716-446655440001', 'bb0e8400-e29b-41d4-a716-446655440001', 1, 'DAMAGED'),
  ('dd0e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 'cc0e8400-e29b-41d4-a716-446655440002', 'bb0e8400-e29b-41d4-a716-446655440005', 1, 'GOOD'),
  ('dd0e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440001', 'cc0e8400-e29b-41d4-a716-446655440003', 'bb0e8400-e29b-41d4-a716-446655440002', 1, 'NEW');

-- Channels (Tenant 1): Amazon, Walmart, Wayfair
INSERT INTO channels (id, tenant_id, channel_name, is_active, sync_frequency_minutes) VALUES
  ('ee0e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'AMAZON', true, 5),
  ('ee0e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440001', 'WALMART', true, 5),
  ('ee0e8400-e29b-41d4-a716-446655440003', '550e8400-e29b-41d4-a716-446655440001', 'WAYFAIR', true, 5);
