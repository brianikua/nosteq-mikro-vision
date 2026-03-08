
-- Create vault helper functions
CREATE OR REPLACE FUNCTION public.store_device_password(p_device_id uuid, p_password text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
DECLARE
  secret_id uuid;
  old_secret_id uuid;
BEGIN
  SELECT password_secret_id INTO old_secret_id FROM public.devices WHERE id = p_device_id;
  
  INSERT INTO vault.secrets (secret, name, description)
  VALUES (p_password, 'device_password_' || p_device_id::text, 'MikroTik device password')
  RETURNING id INTO secret_id;
  
  UPDATE public.devices 
  SET password_secret_id = secret_id, password = '***encrypted***'
  WHERE id = p_device_id;
  
  IF old_secret_id IS NOT NULL THEN
    DELETE FROM vault.secrets WHERE id = old_secret_id;
  END IF;
  
  RETURN secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_device_password(p_device_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault'
AS $$
DECLARE
  secret_val text;
  sec_id uuid;
BEGIN
  SELECT password_secret_id INTO sec_id FROM public.devices WHERE id = p_device_id;
  
  IF sec_id IS NULL THEN
    SELECT password INTO secret_val FROM public.devices WHERE id = p_device_id;
    RETURN secret_val;
  END IF;
  
  SELECT decrypted_secret INTO secret_val FROM vault.decrypted_secrets WHERE id = sec_id;
  RETURN secret_val;
END;
$$;
