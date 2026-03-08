
CREATE TABLE public.sms_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_url text NOT NULL,
  webhook_method text NOT NULL DEFAULT 'POST',
  client_number text NOT NULL,
  isp_contact_name text,
  isp_contact_number text,
  enabled boolean DEFAULT true,
  notify_down boolean DEFAULT true,
  notify_up boolean DEFAULT true,
  notify_blacklisted boolean DEFAULT true,
  notify_delisted boolean DEFAULT true,
  notify_summary boolean DEFAULT true,
  message_template text DEFAULT '{{status_emoji}} {{device_name}} ({{ip_address}}) is {{status}}. Latency: {{latency}}ms',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.sms_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage sms_config"
  ON public.sms_config FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Viewers can view sms_config"
  ON public.sms_config FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));
