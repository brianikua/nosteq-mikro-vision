
-- Notification channels table for multi-recipient Telegram
CREATE TABLE public.notification_channels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  channel_type TEXT NOT NULL DEFAULT 'personal' CHECK (channel_type IN ('personal', 'group', 'noc', 'management')),
  alert_types JSONB NOT NULL DEFAULT '["down","up","blacklisted","delisted","summary","critical"]'::jsonb,
  mute_schedule TEXT NOT NULL DEFAULT 'always_active' CHECK (mute_schedule IN ('always_active', 'business_hours', 'custom')),
  mute_start TIME,
  mute_end TIME,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins and superadmins can manage notification_channels"
ON public.notification_channels
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Viewers can view notification_channels"
ON public.notification_channels
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'viewer'::app_role));
