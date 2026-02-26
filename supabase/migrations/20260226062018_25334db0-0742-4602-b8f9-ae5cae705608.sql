
-- IP Reputation Module Schema

-- Enum for abuse categories
CREATE TYPE public.abuse_category AS ENUM (
  'spam', 'ddos', 'port_scanning', 'botnet', 'malware',
  'open_relay', 'brute_force', 'dns_amplification', 'smtp_abuse', 'other'
);

-- Enum for scan status
CREATE TYPE public.scan_status AS ENUM ('clean', 'listed', 'error');

-- Enum for mitigation action type
CREATE TYPE public.mitigation_type AS ENUM (
  'firewall_rule', 'rate_limit', 'port_block', 'customer_suspension', 'manual_review'
);

-- Public IP history per device
CREATE TABLE public.ip_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'mikrotik_api',
  is_current BOOLEAN NOT NULL DEFAULT true
);

-- Blacklist scan results
CREATE TABLE public.blacklist_scans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  provider TEXT NOT NULL,
  status public.scan_status NOT NULL DEFAULT 'clean',
  abuse_category public.abuse_category,
  confidence_score INTEGER DEFAULT 0,
  raw_response JSONB,
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ
);

-- Abuse attributions linking blacklist events to PPPoE users
CREATE TABLE public.abuse_attributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scan_id UUID NOT NULL REFERENCES public.blacklist_scans(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  pppoe_username TEXT,
  private_ip TEXT,
  abuse_category public.abuse_category NOT NULL,
  severity_score INTEGER NOT NULL DEFAULT 0,
  evidence JSONB,
  attributed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Mitigation recommendations and actions
CREATE TABLE public.mitigation_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attribution_id UUID REFERENCES public.abuse_attributions(id) ON DELETE SET NULL,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  action_type public.mitigation_type NOT NULL,
  description TEXT NOT NULL,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID,
  executed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- IP reputation summary (cached per device)
CREATE TABLE public.ip_reputation_summary (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  ip_address TEXT NOT NULL,
  reputation_score INTEGER NOT NULL DEFAULT 100,
  total_listings INTEGER NOT NULL DEFAULT 0,
  active_listings INTEGER NOT NULL DEFAULT 0,
  last_scan_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(device_id)
);

-- Enable RLS on all tables
ALTER TABLE public.ip_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklist_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abuse_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitigation_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ip_reputation_summary ENABLE ROW LEVEL SECURITY;

-- RLS policies: admins full access, viewers read-only
CREATE POLICY "Admins can manage ip_history" ON public.ip_history FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Viewers can view ip_history" ON public.ip_history FOR SELECT USING (has_role(auth.uid(), 'viewer'::app_role));

CREATE POLICY "Admins can manage blacklist_scans" ON public.blacklist_scans FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Viewers can view blacklist_scans" ON public.blacklist_scans FOR SELECT USING (has_role(auth.uid(), 'viewer'::app_role));

CREATE POLICY "Admins can manage abuse_attributions" ON public.abuse_attributions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Viewers can view abuse_attributions" ON public.abuse_attributions FOR SELECT USING (has_role(auth.uid(), 'viewer'::app_role));

CREATE POLICY "Admins can manage mitigation_actions" ON public.mitigation_actions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Viewers can view mitigation_actions" ON public.mitigation_actions FOR SELECT USING (has_role(auth.uid(), 'viewer'::app_role));

CREATE POLICY "Admins can manage ip_reputation_summary" ON public.ip_reputation_summary FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Viewers can view ip_reputation_summary" ON public.ip_reputation_summary FOR SELECT USING (has_role(auth.uid(), 'viewer'::app_role));

-- Superadmin policies
CREATE POLICY "Superadmins can manage ip_history" ON public.ip_history FOR ALL USING (has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Superadmins can manage blacklist_scans" ON public.blacklist_scans FOR ALL USING (has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Superadmins can manage abuse_attributions" ON public.abuse_attributions FOR ALL USING (has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Superadmins can manage mitigation_actions" ON public.mitigation_actions FOR ALL USING (has_role(auth.uid(), 'superadmin'::app_role));
CREATE POLICY "Superadmins can manage ip_reputation_summary" ON public.ip_reputation_summary FOR ALL USING (has_role(auth.uid(), 'superadmin'::app_role));

-- Enable realtime for reputation summary
ALTER PUBLICATION supabase_realtime ADD TABLE public.ip_reputation_summary;
ALTER PUBLICATION supabase_realtime ADD TABLE public.blacklist_scans;
