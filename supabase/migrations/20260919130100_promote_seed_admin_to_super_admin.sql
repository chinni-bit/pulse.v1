-- Owner confirmed 2026-09-19: promote the one real seeded account so the
-- new Tenant Info edit feature (super_admin-only per owner's spec) is
-- actually usable. super_admin already existed in the role CHECK
-- constraint and in admin/users.tsx's UI, just unused until now.
UPDATE public.users SET role = 'super_admin' WHERE email = 'admin@nestora.local' AND role = 'admin';
