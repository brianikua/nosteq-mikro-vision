
-- Fix: use explicit schema for pgcrypto functions and a simpler key derivation
CREATE OR REPLACE FUNCTION public.encrypt_device_password(p_device_id uuid, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  enc_key text;
BEGIN
  enc_key := encode(extensions.digest(current_database() || '_device_encryption_key_v1', 'sha256'), 'hex');
  
  UPDATE public.devices 
  SET password = encode(extensions.pgp_sym_encrypt(p_password, enc_key), 'base64'),
      password_secret_id = gen_random_uuid()
  WHERE id = p_device_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_device_password(p_device_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  enc_password text;
  enc_key text;
  is_encrypted uuid;
BEGIN
  SELECT password, password_secret_id INTO enc_password, is_encrypted 
  FROM public.devices WHERE id = p_device_id;
  
  IF is_encrypted IS NULL THEN
    RETURN enc_password;
  END IF;
  
  enc_key := encode(extensions.digest(current_database() || '_device_encryption_key_v1', 'sha256'), 'hex');
  RETURN extensions.pgp_sym_decrypt(decode(enc_password, 'base64'), enc_key);
END;
$$;

-- Now migrate existing passwords
DO $$
DECLARE
  dev RECORD;
BEGIN
  FOR dev IN SELECT id, password FROM public.devices WHERE password_secret_id IS NULL AND password IS NOT NULL
  LOOP
    PERFORM public.encrypt_device_password(dev.id, dev.password);
  END LOOP;
END;
$$;
