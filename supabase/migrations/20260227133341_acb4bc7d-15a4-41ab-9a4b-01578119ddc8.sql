
-- Firewall rules table
CREATE TABLE public.firewall_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  chain text NOT NULL,
  action text NOT NULL,
  src_address text,
  dst_address text,
  protocol text,
  dst_port text,
  src_port text,
  in_interface text,
  out_interface text,
  comment text,
  disabled boolean NOT NULL DEFAULT false,
  bytes bigint DEFAULT 0,
  packets bigint DEFAULT 0,
  rule_order integer DEFAULT 0,
  mikrotik_id text,
  collected_at timestamp with time zone NOT NULL DEFAULT now()
);

-- NAT rules table
CREATE TABLE public.nat_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  chain text NOT NULL,
  action text NOT NULL,
  src_address text,
  dst_address text,
  protocol text,
  dst_port text,
  src_port text,
  to_addresses text,
  to_ports text,
  in_interface text,
  out_interface text,
  comment text,
  disabled boolean NOT NULL DEFAULT false,
  bytes bigint DEFAULT 0,
  packets bigint DEFAULT 0,
  rule_order integer DEFAULT 0,
  mikrotik_id text,
  collected_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Connection tracking summary
CREATE TABLE public.connection_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  total_connections integer NOT NULL DEFAULT 0,
  tcp_connections integer DEFAULT 0,
  udp_connections integer DEFAULT 0,
  icmp_connections integer DEFAULT 0,
  top_sources jsonb,
  top_destinations jsonb,
  collected_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Firewall log entries
CREATE TABLE public.firewall_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  timestamp timestamp with time zone NOT NULL DEFAULT now(),
  chain text,
  action text,
  src_address text,
  dst_address text,
  protocol text,
  dst_port text,
  in_interface text,
  out_interface text,
  log_message text,
  collected_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.firewall_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nat_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connection_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.firewall_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for firewall_rules
CREATE POLICY "Admins can manage firewall_rules" ON public.firewall_rules FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Superadmins can manage firewall_rules" ON public.firewall_rules FOR ALL TO authenticated USING (has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view firewall_rules" ON public.firewall_rules FOR SELECT TO authenticated USING (has_role(auth.uid(), 'viewer'::app_role));

-- RLS policies for nat_rules
CREATE POLICY "Admins can manage nat_rules" ON public.nat_rules FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Superadmins can manage nat_rules" ON public.nat_rules FOR ALL TO authenticated USING (has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view nat_rules" ON public.nat_rules FOR SELECT TO authenticated USING (has_role(auth.uid(), 'viewer'::app_role));

-- RLS policies for connection_tracking
CREATE POLICY "Admins can manage connection_tracking" ON public.connection_tracking FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Superadmins can manage connection_tracking" ON public.connection_tracking FOR ALL TO authenticated USING (has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view connection_tracking" ON public.connection_tracking FOR SELECT TO authenticated USING (has_role(auth.uid(), 'viewer'::app_role));

-- RLS policies for firewall_logs
CREATE POLICY "Admins can manage firewall_logs" ON public.firewall_logs FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Superadmins can manage firewall_logs" ON public.firewall_logs FOR ALL TO authenticated USING (has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Viewers can view firewall_logs" ON public.firewall_logs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'viewer'::app_role));

-- Enable realtime for connection_tracking
ALTER PUBLICATION supabase_realtime ADD TABLE public.connection_tracking;
