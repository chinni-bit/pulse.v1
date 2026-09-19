-- Owner-requested Tenant Info page (2026-09-19): tenant needs contact info,
-- address, and a timezone field alongside its existing name/slug/status.
ALTER TABLE public.tenants ADD COLUMN contact_name text;
ALTER TABLE public.tenants ADD COLUMN contact_phone text;
ALTER TABLE public.tenants ADD COLUMN contact_email text;
ALTER TABLE public.tenants ADD COLUMN address text;
ALTER TABLE public.tenants ADD COLUMN timezone text NOT NULL DEFAULT 'America/New_York';

ALTER TABLE public.tenants ADD CONSTRAINT tenants_contact_name_length CHECK (contact_name IS NULL OR char_length(contact_name) <= 150);
ALTER TABLE public.tenants ADD CONSTRAINT tenants_contact_phone_length CHECK (contact_phone IS NULL OR char_length(contact_phone) <= 30);
ALTER TABLE public.tenants ADD CONSTRAINT tenants_contact_email_length CHECK (contact_email IS NULL OR char_length(contact_email) <= 200);
ALTER TABLE public.tenants ADD CONSTRAINT tenants_address_length CHECK (address IS NULL OR char_length(address) <= 300);
