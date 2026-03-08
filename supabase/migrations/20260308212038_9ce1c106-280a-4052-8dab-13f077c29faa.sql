ALTER TABLE public.devices
  ALTER COLUMN notify_number TYPE text[]
  USING CASE WHEN notify_number IS NOT NULL THEN ARRAY[notify_number] ELSE NULL END;