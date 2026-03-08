-- Drop all existing RESTRICTIVE policies and recreate as PERMISSIVE

-- sms_config
DROP POLICY IF EXISTS "Admins and superadmins can manage sms_config" ON public.sms_config;
DROP POLICY IF EXISTS "Viewers can view sms_config" ON public.sms_config;

CREATE POLICY "Admins and superadmins can manage sms_config" ON public.sms_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Viewers can view sms_config" ON public.sms_config
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- user_roles
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

CREATE POLICY "Admins can manage all roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- devices
DROP POLICY IF EXISTS "Admins can view all devices" ON public.devices;
DROP POLICY IF EXISTS "Admins can insert devices" ON public.devices;
DROP POLICY IF EXISTS "Admins can update devices" ON public.devices;
DROP POLICY IF EXISTS "Admins can delete devices" ON public.devices;
DROP POLICY IF EXISTS "Viewers can view devices" ON public.devices;
DROP POLICY IF EXISTS "Superadmins can manage devices" ON public.devices;

CREATE POLICY "Superadmins can manage devices" ON public.devices
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Admins can view all devices" ON public.devices
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert devices" ON public.devices
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update devices" ON public.devices
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete devices" ON public.devices
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Viewers can view devices" ON public.devices
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- blacklist_scans
DROP POLICY IF EXISTS "Admins can manage blacklist_scans" ON public.blacklist_scans;
DROP POLICY IF EXISTS "Superadmins can manage blacklist_scans" ON public.blacklist_scans;
DROP POLICY IF EXISTS "Viewers can view blacklist_scans" ON public.blacklist_scans;

CREATE POLICY "Admins can manage blacklist_scans" ON public.blacklist_scans
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Superadmins can manage blacklist_scans" ON public.blacklist_scans
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Viewers can view blacklist_scans" ON public.blacklist_scans
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- ip_history
DROP POLICY IF EXISTS "Admins can manage ip_history" ON public.ip_history;
DROP POLICY IF EXISTS "Superadmins can manage ip_history" ON public.ip_history;
DROP POLICY IF EXISTS "Viewers can view ip_history" ON public.ip_history;

CREATE POLICY "Admins can manage ip_history" ON public.ip_history
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Superadmins can manage ip_history" ON public.ip_history
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Viewers can view ip_history" ON public.ip_history
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- ip_reputation_summary
DROP POLICY IF EXISTS "Admins can manage ip_reputation_summary" ON public.ip_reputation_summary;
DROP POLICY IF EXISTS "Superadmins can manage ip_reputation_summary" ON public.ip_reputation_summary;
DROP POLICY IF EXISTS "Viewers can view ip_reputation_summary" ON public.ip_reputation_summary;

CREATE POLICY "Admins can manage ip_reputation_summary" ON public.ip_reputation_summary
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Superadmins can manage ip_reputation_summary" ON public.ip_reputation_summary
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Viewers can view ip_reputation_summary" ON public.ip_reputation_summary
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- telegram_config
DROP POLICY IF EXISTS "Admins can manage telegram_config" ON public.telegram_config;
DROP POLICY IF EXISTS "Viewers can view telegram_config" ON public.telegram_config;

CREATE POLICY "Admins can manage telegram_config" ON public.telegram_config
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Viewers can view telegram_config" ON public.telegram_config
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));

-- notification_log
DROP POLICY IF EXISTS "Admins can manage notification_log" ON public.notification_log;
DROP POLICY IF EXISTS "Viewers can view notification_log" ON public.notification_log;

CREATE POLICY "Admins can manage notification_log" ON public.notification_log
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'superadmin'::app_role));

CREATE POLICY "Viewers can view notification_log" ON public.notification_log
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'viewer'::app_role));