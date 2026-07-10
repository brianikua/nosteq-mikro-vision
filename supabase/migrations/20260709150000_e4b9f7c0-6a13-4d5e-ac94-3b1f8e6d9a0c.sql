
-- Phase 2 of the monitoring rebuild: network auto-discovery. The on-prem
-- collector sweeps these CIDR ranges (it must run inside the LAN — Supabase's
-- cloud functions cannot reach private-IP devices, same constraint already
-- true for SNMP polling) and auto-adds whatever it finds as monitored devices.
CREATE TABLE IF NOT EXISTS public.scan_ranges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cidr text NOT NULL,
  description text,
  enabled boolean DEFAULT true,
  last_scanned_at timestamptz,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.scan_ranges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage scan_ranges" ON public.scan_ranges FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view scan_ranges" ON public.scan_ranges FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS discovery_source text NOT NULL DEFAULT 'manual';

DO $$ BEGIN
  ALTER TABLE public.devices ADD CONSTRAINT devices_discovery_source_check
    CHECK (discovery_source IN ('manual', 'discovery'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
