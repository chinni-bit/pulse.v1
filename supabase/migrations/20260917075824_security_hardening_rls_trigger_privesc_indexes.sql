-- ROOT CAUSE FIX: an event trigger was silently forcing RLS on for every
-- new table in this database, directly fighting this project's permanent
-- architecture decision (app-level tenant_id filtering, RLS always off).
-- This is what actually caused the "new table came out with RLS enabled"
-- bug hit repeatedly across this project's history (Customers round, the
-- taxonomy round, the warehouse/inventory round) - not a Supabase default,
-- a leftover trigger from an earlier, abandoned RLS-based design. Removing
-- it at the source instead of continuing to patch around it every round.
DROP EVENT TRIGGER IF EXISTS ensure_rls;
DROP FUNCTION IF EXISTS public.rls_auto_enable();

-- SECURITY: create_tenant_with_admin() was a SECURITY DEFINER function
-- callable by the public anon role (no authentication required) via
-- /rest/v1/rpc/create_tenant_with_admin. It creates a brand new tenant AND
-- inserts a public.users row with role='admin' for any caller-supplied
-- auth id/email - a real unauthenticated privilege-escalation path that
-- directly undermines this project's "admin-created accounts only, no
-- self-service signup" policy. Confirmed unused by the current app code
-- (no references anywhere in src/) before dropping - this was leftover
-- from an earlier, since-abandoned onboarding flow.
DROP FUNCTION IF EXISTS public.create_tenant_with_admin(text, text, text, uuid);

-- Orphaned RLS policies on two tables where RLS itself is disabled (per
-- the permanent no-RLS decision) - the policies are dead weight that only
-- confuses the security advisor and anyone reading the schema later.
DROP POLICY IF EXISTS tenant_isolation ON public.teams_sync;
DROP POLICY IF EXISTS user_permissions_own ON public.user_permissions;

-- PERFORMANCE: cover every foreign key that lacked an index (found via
-- direct pg_constraint/pg_index introspection - every join this app does
-- through a foreign key relationship benefits from this as real data
-- volume grows).
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id_fk ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_batch_locations_batch_id_fk ON public.batch_locations(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_locations_warehouse_id_fk ON public.batch_locations(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_batch_movements_batch_id_fk ON public.batch_movements(batch_id);
CREATE INDEX IF NOT EXISTS idx_batch_movements_created_by_fk ON public.batch_movements(created_by);
CREATE INDEX IF NOT EXISTS idx_batch_movements_from_warehouse_id_fk ON public.batch_movements(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_batch_movements_to_warehouse_id_fk ON public.batch_movements(to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_channel_configs_channel_id_fk ON public.channel_configs(channel_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_customer_id_fk ON public.customer_contacts(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_contacts_tenant_id_fk ON public.customer_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_customer_group_id_fk ON public.customers(customer_group_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_lines_adjustment_id_fk ON public.inventory_adjustment_lines(adjustment_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_lines_batch_id_fk ON public.inventory_adjustment_lines(batch_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_lines_tenant_id_fk ON public.inventory_adjustment_lines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_adjustments_approved_by_fk ON public.inventory_adjustments(approved_by);
CREATE INDEX IF NOT EXISTS idx_inv_adjustments_created_batch_id_fk ON public.inventory_adjustments(created_batch_id);
CREATE INDEX IF NOT EXISTS idx_inv_adjustments_linked_count_id_fk ON public.inventory_adjustments(linked_count_id);
CREATE INDEX IF NOT EXISTS idx_inv_adjustments_linked_qc_hold_id_fk ON public.inventory_adjustments(linked_qc_hold_id);
CREATE INDEX IF NOT EXISTS idx_inv_adjustments_product_id_fk ON public.inventory_adjustments(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_adjustments_submitted_by_fk ON public.inventory_adjustments(submitted_by);
CREATE INDEX IF NOT EXISTS idx_inv_adjustments_tenant_id_fk ON public.inventory_adjustments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_adjustments_warehouse_id_fk ON public.inventory_adjustments(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_audit_log_performed_by_fk ON public.inventory_audit_log(performed_by);
CREATE INDEX IF NOT EXISTS idx_inv_audit_log_product_id_fk ON public.inventory_audit_log(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_audit_log_tenant_id_fk ON public.inventory_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_audit_log_warehouse_id_fk ON public.inventory_audit_log(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_batches_expected_warehouse_id_fk ON public.inventory_batches(expected_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_batches_shipment_id_fk ON public.inventory_batches(shipment_id);
CREATE INDEX IF NOT EXISTS idx_inv_counts_counted_by_fk ON public.inventory_counts(counted_by);
CREATE INDEX IF NOT EXISTS idx_inv_counts_product_id_fk ON public.inventory_counts(product_id);
CREATE INDEX IF NOT EXISTS idx_inv_counts_resulting_adjustment_id_fk ON public.inventory_counts(resulting_adjustment_id);
CREATE INDEX IF NOT EXISTS idx_inv_counts_tenant_id_fk ON public.inventory_counts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_counts_warehouse_id_fk ON public.inventory_counts(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_lcw_lines_batch_id_fk ON public.inventory_landed_cost_worksheet_lines(batch_id);
CREATE INDEX IF NOT EXISTS idx_inv_lcw_lines_tenant_id_fk ON public.inventory_landed_cost_worksheet_lines(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_lcw_created_by_fk ON public.inventory_landed_cost_worksheets(created_by);
CREATE INDEX IF NOT EXISTS idx_inv_lcw_finalized_by_fk ON public.inventory_landed_cost_worksheets(finalized_by);
CREATE INDEX IF NOT EXISTS idx_inv_lcw_shipment_id_fk ON public.inventory_landed_cost_worksheets(shipment_id);
CREATE INDEX IF NOT EXISTS idx_inv_lcw_tenant_id_fk ON public.inventory_landed_cost_worksheets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_qc_holds_batch_id_fk ON public.inventory_qc_holds(batch_id);
CREATE INDEX IF NOT EXISTS idx_inv_qc_holds_placed_by_fk ON public.inventory_qc_holds(placed_by);
CREATE INDEX IF NOT EXISTS idx_inv_qc_holds_resolved_by_fk ON public.inventory_qc_holds(resolved_by);
CREATE INDEX IF NOT EXISTS idx_inv_qc_holds_tenant_id_fk ON public.inventory_qc_holds(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_qc_holds_warehouse_id_fk ON public.inventory_qc_holds(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_shipments_created_by_fk ON public.inventory_shipments(created_by);
CREATE INDEX IF NOT EXISTS idx_inv_shipments_tenant_id_fk ON public.inventory_shipments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_shipments_vendor_id_fk ON public.inventory_shipments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_inv_transfers_batch_id_fk ON public.inventory_transfers(batch_id);
CREATE INDEX IF NOT EXISTS idx_inv_transfers_completed_by_fk ON public.inventory_transfers(completed_by);
CREATE INDEX IF NOT EXISTS idx_inv_transfers_from_warehouse_id_fk ON public.inventory_transfers(from_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_inv_transfers_initiated_by_fk ON public.inventory_transfers(initiated_by);
CREATE INDEX IF NOT EXISTS idx_inv_transfers_tenant_id_fk ON public.inventory_transfers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_inv_transfers_to_warehouse_id_fk ON public.inventory_transfers(to_warehouse_id);
CREATE INDEX IF NOT EXISTS idx_order_fulfillment_batch_id_fk ON public.order_fulfillment(batch_id);
CREATE INDEX IF NOT EXISTS idx_order_fulfillment_order_item_id_fk ON public.order_fulfillment(order_item_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id_fk ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id_fk ON public.order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_group_id_fk ON public.orders(customer_group_id);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id_fk ON public.orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_pce_customer_group_id_fk ON public.product_customer_exclusivity(customer_group_id);
CREATE INDEX IF NOT EXISTS idx_pce_customer_id_fk ON public.product_customer_exclusivity(customer_id);
CREATE INDEX IF NOT EXISTS idx_pce_product_id_fk ON public.product_customer_exclusivity(product_id);
CREATE INDEX IF NOT EXISTS idx_product_mappings_product_id_fk ON public.product_mappings(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id_fk ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_related_product_id_fk ON public.product_variants(related_product_id);
CREATE INDEX IF NOT EXISTS idx_products_finish_group_id_fk ON public.products(finish_group_id);
CREATE INDEX IF NOT EXISTS idx_refunds_return_id_fk ON public.refunds(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_order_item_id_fk ON public.return_items(order_item_id);
CREATE INDEX IF NOT EXISTS idx_return_items_return_id_fk ON public.return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_returns_order_id_fk ON public.returns(order_id);
