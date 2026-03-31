
-- Create ip_groups table
CREATE TABLE public.ip_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#00d4ff',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ip_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage ip_groups" ON public.ip_groups
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Viewers can view ip_groups" ON public.ip_groups
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- Create servers table
CREATE TABLE public.servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  server_type text NOT NULL DEFAULT 'Other',
  description text,
  group_id uuid REFERENCES public.ip_groups(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage servers" ON public.servers
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Viewers can view servers" ON public.servers
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- Add server-related columns to devices table
ALTER TABLE public.devices
  ADD COLUMN server_id uuid REFERENCES public.servers(id) ON DELETE SET NULL,
  ADD COLUMN ip_role text DEFAULT 'Other',
  ADD COLUMN ip_label text,
  ADD COLUMN is_primary boolean DEFAULT false,
  ADD COLUMN monitor_enabled boolean DEFAULT true;
