
-- Fix the security definer view issue by using SECURITY INVOKER
DROP VIEW IF EXISTS public.devices_safe;
CREATE VIEW public.devices_safe WITH (security_invoker = true) AS
SELECT id, name, ip_address, username, port, model, routeros_version, created_at, updated_at
FROM public.devices;
