-- Create reputation_history table to track scores over time
CREATE TABLE public.reputation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  ip_address text NOT NULL,
  reputation_score integer NOT NULL,
  active_listings integer NOT NULL DEFAULT 0,
  recorded_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Add index for efficient queries
CREATE INDEX idx_reputation_history_device_date ON public.reputation_history(device_id, recorded_at DESC);

-- Enable RLS
ALTER TABLE public.reputation_history ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can manage reputation_history" ON public.reputation_history
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Viewers can view reputation_history" ON public.reputation_history
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));