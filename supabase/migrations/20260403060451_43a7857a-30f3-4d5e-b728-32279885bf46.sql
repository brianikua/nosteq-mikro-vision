
-- Add new columns to existing devices table
ALTER TABLE public.devices
  ADD COLUMN IF NOT EXISTS type text DEFAULT 'Other',
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS os_version text,
  ADD COLUMN IF NOT EXISTS site_name text,
  ADD COLUMN IF NOT EXISTS site_address text,
  ADD COLUMN IF NOT EXISTS gps_lat double precision,
  ADD COLUMN IF NOT EXISTS gps_lng double precision,
  ADD COLUMN IF NOT EXISTS vpn_site_id uuid,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS noc_notes text,
  ADD COLUMN IF NOT EXISTS added_by uuid;

-- Add description column to ip_groups if missing
ALTER TABLE public.ip_groups
  ADD COLUMN IF NOT EXISTS description text;

-- Create VPN type enum
DO $$ BEGIN
  CREATE TYPE public.vpn_type AS ENUM ('WireGuard','OpenVPN','IPSec','SSTP','L2TP','Other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- vpn_sites table
CREATE TABLE IF NOT EXISTS public.vpn_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_name text NOT NULL,
  vpn_gateway_ip text NOT NULL,
  vpn_type text NOT NULL DEFAULT 'Other',
  tunnel_interface text,
  is_active boolean DEFAULT true,
  last_status text DEFAULT 'unknown',
  last_checked timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.vpn_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage vpn_sites" ON public.vpn_sites FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view vpn_sites" ON public.vpn_sites FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- system_config table
CREATE TABLE IF NOT EXISTS public.system_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.system_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage system_config" ON public.system_config FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view system_config" ON public.system_config FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- interfaces table
CREATE TABLE IF NOT EXISTS public.interfaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  name text NOT NULL,
  type text DEFAULT 'ethernet',
  description text,
  mac_address text,
  speed text,
  vlan_id integer,
  parent_interface_id uuid REFERENCES public.interfaces(id) ON DELETE SET NULL,
  is_public boolean DEFAULT false,
  monitor_uptime boolean DEFAULT false,
  link_status text DEFAULT 'unknown',
  notes text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.interfaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage interfaces" ON public.interfaces FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view interfaces" ON public.interfaces FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- ip_assignments table
CREATE TABLE IF NOT EXISTS public.ip_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interface_id uuid NOT NULL REFERENCES public.interfaces(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  ip_address text NOT NULL,
  ip_only text,
  prefix_length integer,
  ip_type text DEFAULT 'static',
  role text DEFAULT 'Other',
  is_public boolean DEFAULT false,
  monitor_uptime boolean DEFAULT false,
  monitor_blacklist boolean DEFAULT false,
  reachability_type text DEFAULT 'public',
  last_ping_ms integer,
  last_ping_at timestamptz,
  last_status text DEFAULT 'unknown',
  uptime_7d double precision,
  blacklist_count integer DEFAULT 0,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.ip_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage ip_assignments" ON public.ip_assignments FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view ip_assignments" ON public.ip_assignments FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- vlans table
CREATE TABLE IF NOT EXISTS public.vlans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  vlan_id integer NOT NULL,
  name text,
  description text,
  interface_id uuid REFERENCES public.interfaces(id) ON DELETE SET NULL,
  subnet text,
  gateway text,
  dhcp_enabled boolean DEFAULT false,
  dhcp_start text,
  dhcp_end text,
  purpose text,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.vlans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage vlans" ON public.vlans FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view vlans" ON public.vlans FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- static_routes table
CREATE TABLE IF NOT EXISTS public.static_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  destination text NOT NULL,
  gateway text NOT NULL,
  distance integer DEFAULT 1,
  comment text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.static_routes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage static_routes" ON public.static_routes FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view static_routes" ON public.static_routes FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- device_links table
CREATE TABLE IF NOT EXISTS public.device_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_a_id uuid REFERENCES public.devices(id) ON DELETE CASCADE,
  interface_a_id uuid REFERENCES public.interfaces(id) ON DELETE SET NULL,
  device_b_id uuid REFERENCES public.devices(id) ON DELETE CASCADE,
  interface_b_id uuid REFERENCES public.interfaces(id) ON DELETE SET NULL,
  link_type text DEFAULT 'ethernet',
  speed text,
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.device_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage device_links" ON public.device_links FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view device_links" ON public.device_links FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- ip_downtime_events table
CREATE TABLE IF NOT EXISTS public.ip_downtime_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_assignment_id uuid REFERENCES public.ip_assignments(id) ON DELETE CASCADE,
  device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE,
  down_at timestamptz NOT NULL,
  recovered_at timestamptz,
  duration_minutes integer,
  notified boolean DEFAULT false,
  escalated boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.ip_downtime_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage ip_downtime_events" ON public.ip_downtime_events FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view ip_downtime_events" ON public.ip_downtime_events FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- vpn_downtime_events table
CREATE TABLE IF NOT EXISTS public.vpn_downtime_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vpn_site_id uuid REFERENCES public.vpn_sites(id) ON DELETE CASCADE,
  down_at timestamptz NOT NULL,
  recovered_at timestamptz,
  duration_minutes integer,
  affected_ip_count integer DEFAULT 0,
  notified boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.vpn_downtime_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage vpn_downtime_events" ON public.vpn_downtime_events FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view vpn_downtime_events" ON public.vpn_downtime_events FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- abuse_reports table
CREATE TABLE IF NOT EXISTS public.abuse_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid REFERENCES public.devices(id) ON DELETE CASCADE,
  ip_assignment_id uuid REFERENCES public.ip_assignments(id) ON DELETE SET NULL,
  source_ip text,
  abuse_type text NOT NULL,
  provider text,
  strike_number integer DEFAULT 1,
  report_date timestamptz DEFAULT now(),
  raw_email_text text,
  action_taken text,
  status text DEFAULT 'new',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.abuse_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage abuse_reports" ON public.abuse_reports FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view abuse_reports" ON public.abuse_reports FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- abuse_checklist_progress table
CREATE TABLE IF NOT EXISTS public.abuse_checklist_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  abuse_report_id uuid NOT NULL REFERENCES public.abuse_reports(id) ON DELETE CASCADE,
  step_label text NOT NULL,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  completed_by uuid
);
ALTER TABLE public.abuse_checklist_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage abuse_checklist_progress" ON public.abuse_checklist_progress FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view abuse_checklist_progress" ON public.abuse_checklist_progress FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- change_log table
CREATE TABLE IF NOT EXISTS public.change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  device_id uuid REFERENCES public.devices(id) ON DELETE SET NULL,
  changed_by uuid,
  change_type text NOT NULL,
  field_name text,
  old_value text,
  new_value text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage change_log" ON public.change_log FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view change_log" ON public.change_log FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- Add FK from devices to vpn_sites
DO $$ BEGIN
  ALTER TABLE public.devices ADD CONSTRAINT devices_vpn_site_id_fkey
    FOREIGN KEY (vpn_site_id) REFERENCES public.vpn_sites(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_interfaces_device_id ON public.interfaces(device_id);
CREATE INDEX IF NOT EXISTS idx_ip_assignments_device_id ON public.ip_assignments(device_id);
CREATE INDEX IF NOT EXISTS idx_ip_assignments_interface_id ON public.ip_assignments(interface_id);
CREATE INDEX IF NOT EXISTS idx_vlans_device_id ON public.vlans(device_id);
CREATE INDEX IF NOT EXISTS idx_static_routes_device_id ON public.static_routes(device_id);
CREATE INDEX IF NOT EXISTS idx_ip_downtime_events_ip_assignment_id ON public.ip_downtime_events(ip_assignment_id);
CREATE INDEX IF NOT EXISTS idx_abuse_reports_device_id ON public.abuse_reports(device_id);
CREATE INDEX IF NOT EXISTS idx_change_log_device_id ON public.change_log(device_id);
