-- Owner-requested (2026-09-19): lookup/taxonomy tables should be
-- deactivate-only, never hard-deleted (matching the pattern already used
-- by products, warehouses, customers, tenants) - and a deactivated entry
-- must not be selectable for NEW records, while existing links stay intact.
-- This migration adds is_active to the 4 tables that didn't have it yet.

ALTER TABLE public.brands ADD COLUMN is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.product_types ADD COLUMN is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.finish_groups ADD COLUMN is_active boolean NOT NULL DEFAULT true;
ALTER TABLE public.customer_groups ADD COLUMN is_active boolean NOT NULL DEFAULT true;
