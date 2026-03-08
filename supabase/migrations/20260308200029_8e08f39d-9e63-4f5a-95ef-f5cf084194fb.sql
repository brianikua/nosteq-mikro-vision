
-- Add the column that wasn't created due to the earlier migration partial failure
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS password_secret_id uuid;
