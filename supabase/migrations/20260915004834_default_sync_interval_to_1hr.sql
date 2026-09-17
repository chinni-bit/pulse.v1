ALTER TABLE public.channels ALTER COLUMN sync_frequency_minutes SET DEFAULT 60;
UPDATE public.channels SET sync_frequency_minutes = 60;
