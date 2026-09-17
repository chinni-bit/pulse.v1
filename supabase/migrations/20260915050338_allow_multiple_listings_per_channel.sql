ALTER TABLE public.product_mappings
  DROP CONSTRAINT product_mappings_tenant_id_product_id_channel_key,
  ADD CONSTRAINT product_mappings_tenant_product_channel_sku_key UNIQUE (tenant_id, product_id, channel, channel_sku);
