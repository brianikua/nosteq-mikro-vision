
-- PPPoE Sessions table
CREATE TABLE public.pppoe_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  username text NOT NULL,
  service text,
  caller_id text,
  address text,
  uptime text,
  encoding text,
  session_id text,
  mikrotik_id text,
  collected_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.pppoe_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage pppoe_sessions" ON public.pppoe_sessions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Superadmins can manage pppoe_sessions" ON public.pppoe_sessions FOR ALL TO authenticated USING (has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view pppoe_sessions" ON public.pppoe_sessions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'viewer'::app_role));

-- DHCP Leases table
CREATE TABLE public.dhcp_leases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  address text NOT NULL,
  mac_address text,
  host_name text,
  server text,
  status text,
  expires_after text,
  last_seen text,
  mikrotik_id text,
  collected_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.dhcp_leases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage dhcp_leases" ON public.dhcp_leases FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Superadmins can manage dhcp_leases" ON public.dhcp_leases FOR ALL TO authenticated USING (has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view dhcp_leases" ON public.dhcp_leases FOR SELECT TO authenticated USING (has_role(auth.uid(), 'viewer'::app_role));

-- ARP Entries table
CREATE TABLE public.arp_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  address text NOT NULL,
  mac_address text,
  interface text,
  is_dynamic boolean DEFAULT true,
  is_complete boolean DEFAULT true,
  mikrotik_id text,
  collected_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.arp_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage arp_entries" ON public.arp_entries FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Superadmins can manage arp_entries" ON public.arp_entries FOR ALL TO authenticated USING (has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view arp_entries" ON public.arp_entries FOR SELECT TO authenticated USING (has_role(auth.uid(), 'viewer'::app_role));
