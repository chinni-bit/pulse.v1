-- Warehouses: soft-deactivate instead of hard delete
ALTER TABLE public.warehouses
  ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Products: taxonomy + detail-popup fields
ALTER TABLE public.products
  ADD COLUMN product_type text,
  ADD COLUMN finish text,
  ADD COLUMN finish_group text,
  ADD COLUMN dimensions text,
  ADD COLUMN country_of_origin text;

ALTER TABLE public.products
  ADD CONSTRAINT products_product_type_length CHECK (product_type IS NULL OR char_length(product_type) <= 60),
  ADD CONSTRAINT products_finish_length CHECK (finish IS NULL OR char_length(finish) <= 60),
  ADD CONSTRAINT products_finish_group_length CHECK (finish_group IS NULL OR char_length(finish_group) <= 60),
  ADD CONSTRAINT products_dimensions_length CHECK (dimensions IS NULL OR char_length(dimensions) <= 100),
  ADD CONSTRAINT products_country_of_origin_length CHECK (country_of_origin IS NULL OR char_length(country_of_origin) <= 60);

-- product_mappings: optional label so multiple listings per channel are distinguishable
ALTER TABLE public.product_mappings
  ADD COLUMN listing_name text;
