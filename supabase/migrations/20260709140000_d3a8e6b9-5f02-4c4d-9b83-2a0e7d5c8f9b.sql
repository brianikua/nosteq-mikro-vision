
-- Phase 1 of the monitoring rebuild: notification_channels becomes multi-medium
-- (telegram/sms/email) instead of Telegram-only, so a single channel row can
-- route an alert to whichever medium the operator actually wants it on.
ALTER TABLE public.notification_channels
  ADD COLUMN IF NOT EXISTS medium text NOT NULL DEFAULT 'telegram',
  ADD COLUMN IF NOT EXISTS destination text;

DO $$ BEGIN
  ALTER TABLE public.notification_channels ADD CONSTRAINT notification_channels_medium_check
    CHECK (medium IN ('telegram', 'sms', 'email'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Backfill existing (Telegram-only) rows so destination carries the same
-- value chat_id already held.
UPDATE public.notification_channels SET destination = chat_id WHERE destination IS NULL;

ALTER TABLE public.notification_channels ALTER COLUMN destination SET NOT NULL;

-- email_config: same shape/RLS pattern as sms_config, the third alert medium.
CREATE TABLE IF NOT EXISTS public.email_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  smtp_host text NOT NULL,
  smtp_port integer NOT NULL DEFAULT 587,
  smtp_username text NOT NULL,
  smtp_password text NOT NULL,
  from_address text NOT NULL,
  enabled boolean DEFAULT true,
  notify_down boolean DEFAULT true,
  notify_up boolean DEFAULT true,
  notify_blacklisted boolean DEFAULT true,
  notify_delisted boolean DEFAULT true,
  notify_summary boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.email_config ENABLE ROW LEVEL SECURITY;

-- Admin/superadmin only (no viewer SELECT) — matches the security audit's
-- CRIT-2 fix: config tables holding live credentials should never be
-- viewer-readable, unlike the original telegram_config/sms_config policies.
CREATE POLICY "Admins and superadmins can manage email_config"
  ON public.email_config FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- Security audit CRIT-2: telegram_config/sms_config previously granted the
-- 'viewer' role full-row SELECT, which exposed the live bot token / SMS
-- gateway key to the lowest-privileged accounts (and Settings.tsx fetched
-- them unconditionally). notification_channels itself holds destinations
-- (chat IDs/phone/email), not credentials, so its existing viewer policy is
-- left as-is — only the two tables actually holding secrets are tightened.
DROP POLICY IF EXISTS "Viewers can view telegram_config" ON public.telegram_config;
DROP POLICY IF EXISTS "Viewers can view sms_config" ON public.sms_config;
