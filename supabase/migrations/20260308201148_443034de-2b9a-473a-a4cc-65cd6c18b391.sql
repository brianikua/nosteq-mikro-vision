
-- Drop unused tables (order matters for FK dependencies)
DROP TABLE IF EXISTS abuse_attributions CASCADE;
DROP TABLE IF EXISTS mitigation_actions CASCADE;
DROP TABLE IF EXISTS arp_entries CASCADE;
DROP TABLE IF EXISTS connection_tracking CASCADE;
DROP TABLE IF EXISTS device_interfaces CASCADE;
DROP TABLE IF EXISTS device_metrics CASCADE;
DROP TABLE IF EXISTS dhcp_leases CASCADE;
DROP TABLE IF EXISTS firewall_logs CASCADE;
DROP TABLE IF EXISTS firewall_rules CASCADE;
DROP TABLE IF EXISTS nat_rules CASCADE;
DROP TABLE IF EXISTS pppoe_sessions CASCADE;

-- Drop unused view
DROP VIEW IF EXISTS public.devices_safe;

-- Drop unused functions
DROP FUNCTION IF EXISTS public.encrypt_device_password(uuid, text);
DROP FUNCTION IF EXISTS public.decrypt_device_password(uuid);
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

-- Drop unused enums
DROP TYPE IF EXISTS public.abuse_category CASCADE;
DROP TYPE IF EXISTS public.device_status CASCADE;
DROP TYPE IF EXISTS public.mitigation_type CASCADE;
DROP TYPE IF EXISTS public.scan_status CASCADE;

-- Recreate scan_status since blacklist_scans still uses it
CREATE TYPE public.scan_status AS ENUM ('clean', 'listed', 'error');

-- Simplify devices table: remove MikroTik-specific columns, rename conceptually to monitored IPs
ALTER TABLE public.devices DROP COLUMN IF EXISTS username;
ALTER TABLE public.devices DROP COLUMN IF EXISTS password;
ALTER TABLE public.devices DROP COLUMN IF EXISTS port;
ALTER TABLE public.devices DROP COLUMN IF EXISTS model;
ALTER TABLE public.devices DROP COLUMN IF EXISTS routeros_version;
ALTER TABLE public.devices DROP COLUMN IF EXISTS password_secret_id;

-- Add status tracking columns
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS is_up boolean DEFAULT false;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS last_ping_at timestamptz;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS last_latency_ms integer;
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS check_interval_minutes integer DEFAULT 5;

-- Create notification config table
CREATE TABLE IF NOT EXISTS public.telegram_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id text NOT NULL,
  enabled boolean DEFAULT true,
  notify_down boolean DEFAULT true,
  notify_up boolean DEFAULT true,
  notify_blacklisted boolean DEFAULT true,
  notify_delisted boolean DEFAULT true,
  notify_summary boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.telegram_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage telegram_config" ON public.telegram_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Viewers can view telegram_config" ON public.telegram_config
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'viewer'));

-- Create notification log table
CREATE TABLE IF NOT EXISTS public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  ip_address text NOT NULL,
  message text NOT NULL,
  sent_at timestamptz DEFAULT now(),
  success boolean DEFAULT true,
  error_message text
);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage notification_log" ON public.notification_log
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE POLICY "Viewers can view notification_log" ON public.notification_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'viewer'));
