
CREATE TABLE public.release_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version text NOT NULL,
  build_number integer NOT NULL DEFAULT 1,
  release_date timestamp with time zone NOT NULL DEFAULT now(),
  category text NOT NULL DEFAULT 'Feature',
  title text NOT NULL,
  description text NOT NULL,
  is_major boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.release_notes ENABLE ROW LEVEL SECURITY;

-- Everyone authenticated can read
CREATE POLICY "Authenticated users can view release_notes"
ON public.release_notes FOR SELECT TO authenticated
USING (true);

-- Only superadmins can manage
CREATE POLICY "Superadmins can manage release_notes"
ON public.release_notes FOR ALL TO authenticated
USING (has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));
