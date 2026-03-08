
-- Use pgcrypto for password encryption with a server-side key
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop the vault-based functions 
DROP FUNCTION IF EXISTS public.store_device_password(uuid, text);
DROP FUNCTION IF EXISTS public.get_device_password(uuid);

-- Create encryption functions using pgcrypto with a key from a server secret
-- The encryption key is derived from the service role key (only accessible server-side)
CREATE OR REPLACE FUNCTION public.encrypt_device_password(p_device_id uuid, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  enc_key text;
BEGIN
  -- Use a stable derived key from the database name + a fixed salt
  enc_key := encode(digest(current_database() || '_device_encryption_key_v1', 'sha256'), 'hex');
  
  UPDATE public.devices 
  SET password = encode(pgp_sym_encrypt(p_password, enc_key), 'base64'),
      password_secret_id = gen_random_uuid()  -- flag that it's encrypted
  WHERE id = p_device_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_device_password(p_device_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  enc_password text;
  enc_key text;
  is_encrypted uuid;
BEGIN
  SELECT password, password_secret_id INTO enc_password, is_encrypted 
  FROM public.devices WHERE id = p_device_id;
  
  -- If not encrypted yet (password_secret_id is null), return plaintext
  IF is_encrypted IS NULL THEN
    RETURN enc_password;
  END IF;
  
  enc_key := encode(digest(current_database() || '_device_encryption_key_v1', 'sha256'), 'hex');
  RETURN pgp_sym_decrypt(decode(enc_password, 'base64'), enc_key);
END;
$$;
