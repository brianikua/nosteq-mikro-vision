-- Create system_settings singleton table
CREATE TABLE public.system_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  default_check_interval integer NOT NULL DEFAULT 5,
  down_confirmation_count integer NOT NULL DEFAULT 3,
  escalation_timer_minutes integer NOT NULL DEFAULT 30,
  alert_threshold_latency_ms integer NOT NULL DEFAULT 500,
  alert_threshold_packet_loss integer NOT NULL DEFAULT 50,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Seed default row
INSERT INTO public.system_settings (id) VALUES (1);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage system_settings"
ON public.system_settings FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Viewers can view system_settings"
ON public.system_settings FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'viewer'::app_role));

-- Add escalation tracking to devices
ALTER TABLE public.devices
ADD COLUMN consecutive_failures integer NOT NULL DEFAULT 0,
ADD COLUMN down_since timestamp with time zone,
ADD COLUMN escalation_sent boolean NOT NULL DEFAULT false;