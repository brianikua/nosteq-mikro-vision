
-- IP notes for inline notes in the detail drawer
CREATE TABLE public.ip_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id UUID NOT NULL,
  note_text TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.ip_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and superadmins can manage ip_notes"
ON public.ip_notes FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Viewers can view ip_notes"
ON public.ip_notes FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'viewer'::app_role));

CREATE UNIQUE INDEX idx_ip_notes_device ON public.ip_notes(device_id);
