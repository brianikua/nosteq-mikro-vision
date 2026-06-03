
CREATE TABLE public.ip_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cidr text NOT NULL,
  label text,
  vlan_id integer,
  block_type text CHECK (block_type IN ('Uplink','Customer','Infrastructure','Management')),
  gateway text,
  broadcast text,
  total_ips integer,
  usable_ips integer,
  assigned_ips integer DEFAULT 0,
  status text CHECK (status IN ('healthy','warning','critical')) DEFAULT 'healthy',
  blacklisted_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ip_blocks TO authenticated;
GRANT ALL ON public.ip_blocks TO service_role;
ALTER TABLE public.ip_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ip_blocks_select_auth" ON public.ip_blocks FOR SELECT TO authenticated USING (true);
CREATE POLICY "ip_blocks_admin_write" ON public.ip_blocks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE TABLE public.ip_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id uuid REFERENCES public.ip_blocks(id) ON DELETE CASCADE,
  ip_address text NOT NULL,
  role text,
  status text CHECK (status IN ('active','idle','reserved','unassigned')) DEFAULT 'unassigned',
  is_blacklisted boolean DEFAULT false,
  rbl_lists text[] DEFAULT '{}',
  last_ping_ms integer,
  assigned_to text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ip_addresses TO authenticated;
GRANT ALL ON public.ip_addresses TO service_role;
ALTER TABLE public.ip_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ip_addresses_select_auth" ON public.ip_addresses FOR SELECT TO authenticated USING (true);
CREATE POLICY "ip_addresses_admin_write" ON public.ip_addresses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER ip_blocks_touch BEFORE UPDATE ON public.ip_blocks
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER ip_addresses_touch BEFORE UPDATE ON public.ip_addresses
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX ip_addresses_block_id_idx ON public.ip_addresses(block_id);
CREATE INDEX ip_addresses_blacklisted_idx ON public.ip_addresses(is_blacklisted) WHERE is_blacklisted = true;
