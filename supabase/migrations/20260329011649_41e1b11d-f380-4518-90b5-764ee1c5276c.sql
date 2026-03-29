
-- Blacklist history: track when IPs are listed and delisted
CREATE TABLE public.blacklist_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID NOT NULL,
  provider TEXT NOT NULL,
  reason TEXT,
  listed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  delisted_at TIMESTAMP WITH TIME ZONE,
  confidence INTEGER DEFAULT 0,
  ip_address TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.blacklist_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage blacklist_history"
ON public.blacklist_history FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Viewers can view blacklist_history"
ON public.blacklist_history FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'viewer'::app_role));

-- Remediation tasks: checklist per blacklist listing
CREATE TABLE public.remediation_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID NOT NULL,
  blacklist_history_id UUID REFERENCES public.blacklist_history(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  step_label TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.remediation_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage remediation_tasks"
ON public.remediation_tasks FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Viewers can view remediation_tasks"
ON public.remediation_tasks FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'viewer'::app_role));

CREATE INDEX idx_blacklist_history_device ON public.blacklist_history(device_id);
CREATE INDEX idx_remediation_tasks_history ON public.remediation_tasks(blacklist_history_id);
