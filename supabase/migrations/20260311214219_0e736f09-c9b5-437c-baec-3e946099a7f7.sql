ALTER TABLE public.sms_config 
  ADD COLUMN IF NOT EXISTS sms_user_id text,
  ADD COLUMN IF NOT EXISTS sms_sender_id text,
  ADD COLUMN IF NOT EXISTS techra_api_key text;