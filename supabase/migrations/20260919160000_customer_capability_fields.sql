-- Owner-requested (2026-09-19): per-customer capability fields for how
-- each communication happens - inventory feed, order import, shipping/
-- tracking updates, invoicing, cancellations. Each gets a controlled
-- method (how) plus free-text details (specifics: an email address, an
-- FTP path, which integration, etc). Same controlled vocabulary across
-- all 5 for a simple, reusable UI control.
--
-- Drops the old inventory_update_email column - it only captured "email
-- address for inventory updates" with no method concept, now fully
-- superseded by inventory_feed_method/inventory_feed_details (method=EMAIL,
-- details=that same address). Zero customers exist yet, zero data at risk.

ALTER TABLE public.customers DROP COLUMN inventory_update_email;

ALTER TABLE public.customers ADD COLUMN inventory_feed_method text NOT NULL DEFAULT 'NONE';
ALTER TABLE public.customers ADD COLUMN inventory_feed_details text;

ALTER TABLE public.customers ADD COLUMN order_import_method text NOT NULL DEFAULT 'NONE';
ALTER TABLE public.customers ADD COLUMN order_import_details text;

ALTER TABLE public.customers ADD COLUMN shipping_tracking_method text NOT NULL DEFAULT 'NONE';
ALTER TABLE public.customers ADD COLUMN shipping_tracking_details text;

ALTER TABLE public.customers ADD COLUMN invoicing_method text NOT NULL DEFAULT 'NONE';
ALTER TABLE public.customers ADD COLUMN invoicing_details text;

ALTER TABLE public.customers ADD COLUMN cancellation_method text NOT NULL DEFAULT 'NONE';
ALTER TABLE public.customers ADD COLUMN cancellation_details text;

ALTER TABLE public.customers ADD CONSTRAINT customers_inventory_feed_method_allowed
  CHECK (inventory_feed_method IN ('API','EMAIL','FTP','PORTAL','EDI','MANUAL','NONE'));
ALTER TABLE public.customers ADD CONSTRAINT customers_order_import_method_allowed
  CHECK (order_import_method IN ('API','EMAIL','FTP','PORTAL','EDI','MANUAL','NONE'));
ALTER TABLE public.customers ADD CONSTRAINT customers_shipping_tracking_method_allowed
  CHECK (shipping_tracking_method IN ('API','EMAIL','FTP','PORTAL','EDI','MANUAL','NONE'));
ALTER TABLE public.customers ADD CONSTRAINT customers_invoicing_method_allowed
  CHECK (invoicing_method IN ('API','EMAIL','FTP','PORTAL','EDI','MANUAL','NONE'));
ALTER TABLE public.customers ADD CONSTRAINT customers_cancellation_method_allowed
  CHECK (cancellation_method IN ('API','EMAIL','FTP','PORTAL','EDI','MANUAL','NONE'));

ALTER TABLE public.customers ADD CONSTRAINT customers_inventory_feed_details_length CHECK (inventory_feed_details IS NULL OR char_length(inventory_feed_details) <= 300);
ALTER TABLE public.customers ADD CONSTRAINT customers_order_import_details_length CHECK (order_import_details IS NULL OR char_length(order_import_details) <= 300);
ALTER TABLE public.customers ADD CONSTRAINT customers_shipping_tracking_details_length CHECK (shipping_tracking_details IS NULL OR char_length(shipping_tracking_details) <= 300);
ALTER TABLE public.customers ADD CONSTRAINT customers_invoicing_details_length CHECK (invoicing_details IS NULL OR char_length(invoicing_details) <= 300);
ALTER TABLE public.customers ADD CONSTRAINT customers_cancellation_details_length CHECK (cancellation_details IS NULL OR char_length(cancellation_details) <= 300);
