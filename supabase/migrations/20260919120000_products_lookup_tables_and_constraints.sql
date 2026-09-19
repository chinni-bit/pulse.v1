-- Products table redesign, owner-requested 2026-09-19:
-- 1. brand_name -> FK to new brands table
-- 2. status default ACTIVE -> FUTURE
-- 3. reorder_threshold must be > 0
-- 4. product_type -> FK to new product_types table
-- 5. country_of_origin -> FK to new countries table
-- 6. 8 dimension/weight columns: > 0 or NULL (nullable when not yet defined)
-- 7. deleted_at -> deactivated_at rename
-- 8. created_by / updated_by / deactivated_by FK -> users
-- 9. upc1 / upc2, each unique per tenant, nullable

-- ---------------------------------------------------------------------
-- 1. Lookup tables
-- ---------------------------------------------------------------------

-- brands and product_types are tenant-scoped, mirroring the existing
-- finish_groups pattern (same shape: id/tenant_id/name/created_at).
CREATE TABLE public.brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp DEFAULT now(),
  CONSTRAINT brands_name_length CHECK (char_length(name) <= 100),
  CONSTRAINT brands_tenant_id_name_key UNIQUE (tenant_id, name)
);
ALTER TABLE public.brands DISABLE ROW LEVEL SECURITY;

CREATE TABLE public.product_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamp DEFAULT now(),
  CONSTRAINT product_types_name_length CHECK (char_length(name) <= 60),
  CONSTRAINT product_types_tenant_id_name_key UNIQUE (tenant_id, name)
);
ALTER TABLE public.product_types DISABLE ROW LEVEL SECURITY;

-- countries is a global reference list (not tenant-scoped) - a country
-- is a real-world fact, not tenant-specific data, unlike brands/types
-- which are each tenant's own taxonomy.
CREATE TABLE public.countries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iso2 char(2) NOT NULL UNIQUE,
  name text NOT NULL UNIQUE,
  created_at timestamp DEFAULT now()
);
ALTER TABLE public.countries DISABLE ROW LEVEL SECURITY;

INSERT INTO public.countries (iso2, name) VALUES
('AF','Afghanistan'),('AL','Albania'),('DZ','Algeria'),('AD','Andorra'),('AO','Angola'),
('AG','Antigua and Barbuda'),('AR','Argentina'),('AM','Armenia'),('AU','Australia'),('AT','Austria'),
('AZ','Azerbaijan'),('BS','Bahamas'),('BH','Bahrain'),('BD','Bangladesh'),('BB','Barbados'),
('BY','Belarus'),('BE','Belgium'),('BZ','Belize'),('BJ','Benin'),('BT','Bhutan'),
('BO','Bolivia'),('BA','Bosnia and Herzegovina'),('BW','Botswana'),('BR','Brazil'),('BN','Brunei'),
('BG','Bulgaria'),('BF','Burkina Faso'),('BI','Burundi'),('CV','Cabo Verde'),('KH','Cambodia'),
('CM','Cameroon'),('CA','Canada'),('CF','Central African Republic'),('TD','Chad'),('CL','Chile'),
('CN','China'),('CO','Colombia'),('KM','Comoros'),('CG','Congo'),('CD','Congo (DRC)'),
('CR','Costa Rica'),('CI','Cote d''Ivoire'),('HR','Croatia'),('CU','Cuba'),('CY','Cyprus'),
('CZ','Czechia'),('DK','Denmark'),('DJ','Djibouti'),('DM','Dominica'),('DO','Dominican Republic'),
('EC','Ecuador'),('EG','Egypt'),('SV','El Salvador'),('GQ','Equatorial Guinea'),('ER','Eritrea'),
('EE','Estonia'),('SZ','Eswatini'),('ET','Ethiopia'),('FJ','Fiji'),('FI','Finland'),
('FR','France'),('GA','Gabon'),('GM','Gambia'),('GE','Georgia'),('DE','Germany'),
('GH','Ghana'),('GR','Greece'),('GD','Grenada'),('GT','Guatemala'),('GN','Guinea'),
('GW','Guinea-Bissau'),('GY','Guyana'),('HT','Haiti'),('HN','Honduras'),('HK','Hong Kong'),
('HU','Hungary'),('IS','Iceland'),('IN','India'),('ID','Indonesia'),('IR','Iran'),
('IQ','Iraq'),('IE','Ireland'),('IL','Israel'),('IT','Italy'),('JM','Jamaica'),
('JP','Japan'),('JO','Jordan'),('KZ','Kazakhstan'),('KE','Kenya'),('KI','Kiribati'),
('KP','Korea (North)'),('KR','Korea (South)'),('KW','Kuwait'),('KG','Kyrgyzstan'),('LA','Laos'),
('LV','Latvia'),('LB','Lebanon'),('LS','Lesotho'),('LR','Liberia'),('LY','Libya'),
('LI','Liechtenstein'),('LT','Lithuania'),('LU','Luxembourg'),('MO','Macao'),('MG','Madagascar'),
('MW','Malawi'),('MY','Malaysia'),('MV','Maldives'),('ML','Mali'),('MT','Malta'),
('MH','Marshall Islands'),('MR','Mauritania'),('MU','Mauritius'),('MX','Mexico'),('FM','Micronesia'),
('MD','Moldova'),('MC','Monaco'),('MN','Mongolia'),('ME','Montenegro'),('MA','Morocco'),
('MZ','Mozambique'),('MM','Myanmar'),('NA','Namibia'),('NR','Nauru'),('NP','Nepal'),
('NL','Netherlands'),('NZ','New Zealand'),('NI','Nicaragua'),('NE','Niger'),('NG','Nigeria'),
('MK','North Macedonia'),('NO','Norway'),('OM','Oman'),('PK','Pakistan'),('PW','Palau'),
('PA','Panama'),('PG','Papua New Guinea'),('PY','Paraguay'),('PE','Peru'),('PH','Philippines'),
('PL','Poland'),('PT','Portugal'),('QA','Qatar'),('RO','Romania'),('RU','Russia'),
('RW','Rwanda'),('KN','Saint Kitts and Nevis'),('LC','Saint Lucia'),('VC','Saint Vincent and the Grenadines'),('WS','Samoa'),
('SM','San Marino'),('ST','Sao Tome and Principe'),('SA','Saudi Arabia'),('SN','Senegal'),('RS','Serbia'),
('SC','Seychelles'),('SL','Sierra Leone'),('SG','Singapore'),('SK','Slovakia'),('SI','Slovenia'),
('SB','Solomon Islands'),('SO','Somalia'),('ZA','South Africa'),('SS','South Sudan'),('ES','Spain'),
('LK','Sri Lanka'),('SD','Sudan'),('SR','Suriname'),('SE','Sweden'),('CH','Switzerland'),
('SY','Syria'),('TW','Taiwan'),('TJ','Tajikistan'),('TZ','Tanzania'),('TH','Thailand'),
('TL','Timor-Leste'),('TG','Togo'),('TO','Tonga'),('TT','Trinidad and Tobago'),('TN','Tunisia'),
('TR','Turkey'),('TM','Turkmenistan'),('TV','Tuvalu'),('UG','Uganda'),('UA','Ukraine'),
('AE','United Arab Emirates'),('GB','United Kingdom'),('US','United States'),('UY','Uruguay'),('UZ','Uzbekistan'),
('VU','Vanuatu'),('VA','Vatican City'),('VE','Venezuela'),('VN','Vietnam'),('YE','Yemen'),
('ZM','Zambia'),('ZW','Zimbabwe');

-- ---------------------------------------------------------------------
-- 2. Backfill brands from existing distinct products.brand_name values,
--    per tenant, then add + populate products.brand_id.
--    (product_type and country_of_origin are currently unset on every
--    product per pre-migration check, so there is nothing to backfill
--    for those two - the new FK columns start all-NULL.)
-- ---------------------------------------------------------------------

INSERT INTO public.brands (tenant_id, name)
SELECT DISTINCT tenant_id, brand_name
FROM public.products
WHERE brand_name IS NOT NULL AND brand_name <> ''
ON CONFLICT (tenant_id, name) DO NOTHING;

ALTER TABLE public.products ADD COLUMN brand_id uuid REFERENCES public.brands(id);
ALTER TABLE public.products ADD COLUMN product_type_id uuid REFERENCES public.product_types(id);
ALTER TABLE public.products ADD COLUMN country_of_origin_id uuid REFERENCES public.countries(id);

UPDATE public.products p
SET brand_id = b.id
FROM public.brands b
WHERE b.tenant_id = p.tenant_id AND b.name = p.brand_name;

CREATE INDEX idx_products_brand_id_fk ON public.products(brand_id);
CREATE INDEX idx_products_product_type_id_fk ON public.products(product_type_id);
CREATE INDEX idx_products_country_of_origin_id_fk ON public.products(country_of_origin_id);
CREATE INDEX idx_brands_tenant_id_fk ON public.brands(tenant_id);
CREATE INDEX idx_product_types_tenant_id_fk ON public.product_types(tenant_id);

ALTER TABLE public.products DROP COLUMN brand_name;
ALTER TABLE public.products DROP COLUMN product_type;
ALTER TABLE public.products DROP COLUMN country_of_origin;

-- ---------------------------------------------------------------------
-- 3. status default -> FUTURE (existing rows keep whatever they have;
--    this only changes what new inserts get when status is omitted)
-- ---------------------------------------------------------------------

ALTER TABLE public.products ALTER COLUMN status SET DEFAULT 'FUTURE';

-- ---------------------------------------------------------------------
-- 4. reorder_threshold must be positive
-- ---------------------------------------------------------------------

ALTER TABLE public.products ADD CONSTRAINT products_reorder_threshold_positive
  CHECK (reorder_threshold > 0);

-- ---------------------------------------------------------------------
-- 5. Dimension/weight columns: > 0 when set, NULL allowed (not yet
--    defined). All already nullable; just adding the check.
-- ---------------------------------------------------------------------

ALTER TABLE public.products ADD CONSTRAINT products_product_length_positive
  CHECK (product_length IS NULL OR product_length > 0);
ALTER TABLE public.products ADD CONSTRAINT products_product_width_positive
  CHECK (product_width IS NULL OR product_width > 0);
ALTER TABLE public.products ADD CONSTRAINT products_product_height_positive
  CHECK (product_height IS NULL OR product_height > 0);
ALTER TABLE public.products ADD CONSTRAINT products_product_weight_positive
  CHECK (product_weight IS NULL OR product_weight > 0);
ALTER TABLE public.products ADD CONSTRAINT products_carton_length_positive
  CHECK (carton_length IS NULL OR carton_length > 0);
ALTER TABLE public.products ADD CONSTRAINT products_carton_width_positive
  CHECK (carton_width IS NULL OR carton_width > 0);
ALTER TABLE public.products ADD CONSTRAINT products_carton_height_positive
  CHECK (carton_height IS NULL OR carton_height > 0);
ALTER TABLE public.products ADD CONSTRAINT products_carton_weight_positive
  CHECK (carton_weight IS NULL OR carton_weight > 0);

-- ---------------------------------------------------------------------
-- 6. deleted_at -> deactivated_at
-- ---------------------------------------------------------------------

ALTER TABLE public.products RENAME COLUMN deleted_at TO deactivated_at;

-- ---------------------------------------------------------------------
-- 7. Ownership columns. "deleted by" renamed to deactivated_by for
--    consistency with the deactivated_at rename above (same concept).
-- ---------------------------------------------------------------------

ALTER TABLE public.products ADD COLUMN created_by uuid REFERENCES public.users(id);
ALTER TABLE public.products ADD COLUMN updated_by uuid REFERENCES public.users(id);
ALTER TABLE public.products ADD COLUMN deactivated_by uuid REFERENCES public.users(id);

CREATE INDEX idx_products_created_by_fk ON public.products(created_by);
CREATE INDEX idx_products_updated_by_fk ON public.products(updated_by);
CREATE INDEX idx_products_deactivated_by_fk ON public.products(deactivated_by);

-- ---------------------------------------------------------------------
-- 8. UPC1 / UPC2: nullable, unique per tenant (mirrors the existing
--    tenant_id+sku uniqueness pattern - Postgres UNIQUE allows any
--    number of NULLs, so "not yet defined" is unaffected).
-- ---------------------------------------------------------------------

ALTER TABLE public.products ADD COLUMN upc1 text;
ALTER TABLE public.products ADD COLUMN upc2 text;

ALTER TABLE public.products ADD CONSTRAINT products_upc1_length CHECK (upc1 IS NULL OR char_length(upc1) <= 20);
ALTER TABLE public.products ADD CONSTRAINT products_upc2_length CHECK (upc2 IS NULL OR char_length(upc2) <= 20);
ALTER TABLE public.products ADD CONSTRAINT products_tenant_id_upc1_key UNIQUE (tenant_id, upc1);
ALTER TABLE public.products ADD CONSTRAINT products_tenant_id_upc2_key UNIQUE (tenant_id, upc2);
