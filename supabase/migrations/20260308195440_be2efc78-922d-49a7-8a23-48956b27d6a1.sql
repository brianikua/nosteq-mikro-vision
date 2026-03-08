
-- Fix 1: Change default role for new signups from 'admin' to 'viewer'
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_count integer;
BEGIN
  SELECT count(*) INTO user_count FROM public.user_roles;
  IF user_count = 0 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'superadmin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'viewer');
  END IF;
  RETURN NEW;
END;
$function$;

-- Fix 2: Create a secure view that excludes password for general queries
CREATE OR REPLACE VIEW public.devices_safe AS
SELECT id, name, ip_address, username, port, model, routeros_version, created_at, updated_at
FROM public.devices;

-- Fix 3: Update config for check-ip-reputation to disable JWT (we validate in code)
