
-- Security audit MED-4: ip_blocks/ip_addresses granted SELECT to any
-- authenticated user regardless of role, unlike every other table in the
-- schema (which gates read access on at least the 'viewer' role). Align them.
DROP POLICY IF EXISTS "ip_blocks_select_auth" ON public.ip_blocks;
CREATE POLICY "ip_blocks_select_auth" ON public.ip_blocks FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

DROP POLICY IF EXISTS "ip_addresses_select_auth" ON public.ip_addresses;
CREATE POLICY "ip_addresses_select_auth" ON public.ip_addresses FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role) OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

-- Security audit MED-5: ip_address columns are plain TEXT with no format
-- validation below the application layer, so any write that bypasses the UI
-- (direct REST API call) could store a non-IP string that then flows
-- unvalidated into outbound probe/lookup URLs downstream.
--
-- NOT VALID: applies and enforces the constraint on all new inserts/updates
-- immediately, without scanning/failing on whatever existing rows might
-- already be in the live table (unverifiable from this repo). Run
-- `VALIDATE CONSTRAINT <name>` per table once you've confirmed existing data
-- is clean, to also cover historical rows.
DO $$ BEGIN
  ALTER TABLE public.devices ADD CONSTRAINT devices_ip_address_format
    CHECK (ip_address ~ '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$') NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.ip_assignments ADD CONSTRAINT ip_assignments_ip_address_format
    CHECK (ip_address ~ '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(?:/(?:[0-9]|[12][0-9]|3[0-2]))?$') NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.ip_addresses ADD CONSTRAINT ip_addresses_ip_address_format
    CHECK (ip_address ~ '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$') NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.scan_ranges ADD CONSTRAINT scan_ranges_cidr_format
    CHECK (cidr ~ '^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)/(?:[0-9]|[12][0-9]|3[0-2])$') NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
