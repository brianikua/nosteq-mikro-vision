
-- ip_assignments uptime monitoring: mirrors devices.consecutive_failures so a single
-- transient probe failure doesn't immediately flip last_status to 'down' and fire an
-- alert. Without this, the new cron-monitor ip_assignments loop would flap on any
-- one-off packet loss instead of requiring N consecutive failures like the devices loop.
ALTER TABLE public.ip_assignments
  ADD COLUMN IF NOT EXISTS consecutive_failures integer DEFAULT 0;
