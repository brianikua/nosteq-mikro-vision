
-- Pre-existing bug fix: devices.ip_address has carried a UNIQUE constraint since the
-- original schema, but AddDeviceWizard.tsx hardcodes ip_address = '0.0.0.0' for every
-- device that isn't part of the separate ping-monitoring flow (it's an unused legacy
-- field for that form). In production this means the wizard can only ever successfully
-- create one such device before every later save fails on a unique violation. A device
-- inventory table has no correctness requirement that ip_address be globally unique
-- (multiple placeholder/legacy rows, or legitimately overlapping IPs across sites/VRFs,
-- are both valid), so the constraint is simply wrong here.
ALTER TABLE public.devices DROP CONSTRAINT IF EXISTS devices_ip_address_key;

-- SNMP monitoring for MikroTik switches/routers (LAN-only, polled by an on-prem collector).
-- Extends the existing devices/interfaces inventory tables rather than duplicating them;
-- snmp_reachable/last_snmp_poll_at are kept separate from the ping-based is_up/last_ping_at
-- columns (owned by the cron-monitor function) so the two monitors never race on the same fields.

ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS snmp_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS snmp_version text DEFAULT 'v2c',
  ADD COLUMN IF NOT EXISTS snmp_community text,
  ADD COLUMN IF NOT EXISTS snmp_port integer DEFAULT 161,
  ADD COLUMN IF NOT EXISTS snmp_reachable boolean,
  ADD COLUMN IF NOT EXISTS sys_uptime_seconds bigint,
  ADD COLUMN IF NOT EXISTS cpu_load_pct integer,
  ADD COLUMN IF NOT EXISTS last_snmp_poll_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.devices ADD CONSTRAINT devices_snmp_version_check
    CHECK (snmp_version IN ('v1', 'v2c'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.interfaces
  ADD COLUMN IF NOT EXISTS if_index integer,
  ADD COLUMN IF NOT EXISTS admin_status text,
  ADD COLUMN IF NOT EXISTS speed_mbps integer,
  ADD COLUMN IF NOT EXISTS last_in_octets bigint,
  ADD COLUMN IF NOT EXISTS last_out_octets bigint,
  ADD COLUMN IF NOT EXISTS in_bps bigint,
  ADD COLUMN IF NOT EXISTS out_bps bigint,
  ADD COLUMN IF NOT EXISTS last_snmp_poll_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_interfaces_device_ifindex
  ON public.interfaces(device_id, if_index) WHERE if_index IS NOT NULL;

-- interface_metrics: time-series bandwidth history, mirrors the existing
-- reputation_history pattern (base table holds latest snapshot, history table holds trend).
CREATE TABLE IF NOT EXISTS public.interface_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interface_id uuid NOT NULL REFERENCES public.interfaces(id) ON DELETE CASCADE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  in_bps bigint,
  out_bps bigint,
  in_octets bigint,
  out_octets bigint,
  in_errors bigint,
  out_errors bigint
);
ALTER TABLE public.interface_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage interface_metrics" ON public.interface_metrics FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view interface_metrics" ON public.interface_metrics FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

CREATE INDEX IF NOT EXISTS idx_interface_metrics_interface_id_recorded_at
  ON public.interface_metrics(interface_id, recorded_at DESC);

-- Enable realtime so DeviceDetail can reflect a fresh poll without a manual refresh.
ALTER PUBLICATION supabase_realtime ADD TABLE public.interface_metrics;
