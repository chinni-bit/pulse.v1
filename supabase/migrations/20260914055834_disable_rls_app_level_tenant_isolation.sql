-- Phase 1A architecture decision (see DAY_1_COMPLETION_SUMMARY.md):
-- multi-tenant isolation is enforced at the application level (every query
-- filters by tenant_id), not via RLS. These tables had RLS enabled with
-- zero policies defined, which blocks ALL access for anon/authenticated
-- roles. Disabling RLS to match the documented design (confirmed by user).
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_locations DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_movements DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_configs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.channels DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_fulfillment DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_mappings DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.returns DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses DISABLE ROW LEVEL SECURITY;
