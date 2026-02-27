
-- Fix RESTRICTIVE policies on devices table to be PERMISSIVE
DROP POLICY IF EXISTS "Admins can delete devices" ON public.devices;
DROP POLICY IF EXISTS "Admins can insert devices" ON public.devices;
DROP POLICY IF EXISTS "Admins can update devices" ON public.devices;
DROP POLICY IF EXISTS "Admins can view all devices" ON public.devices;
DROP POLICY IF EXISTS "Viewers can view devices but not passwords" ON public.devices;

CREATE POLICY "Admins can view all devices" ON public.devices FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can insert devices" ON public.devices FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update devices" ON public.devices FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete devices" ON public.devices FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Viewers can view devices" ON public.devices FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));
CREATE POLICY "Superadmins can manage devices" ON public.devices FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));

-- Fix RESTRICTIVE policies on other tables too
DROP POLICY IF EXISTS "Admins can manage abuse_attributions" ON public.abuse_attributions;
DROP POLICY IF EXISTS "Superadmins can manage abuse_attributions" ON public.abuse_attributions;
DROP POLICY IF EXISTS "Viewers can view abuse_attributions" ON public.abuse_attributions;
CREATE POLICY "Admins can manage abuse_attributions" ON public.abuse_attributions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Superadmins can manage abuse_attributions" ON public.abuse_attributions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Viewers can view abuse_attributions" ON public.abuse_attributions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));

DROP POLICY IF EXISTS "Admins can manage blacklist_scans" ON public.blacklist_scans;
DROP POLICY IF EXISTS "Superadmins can manage blacklist_scans" ON public.blacklist_scans;
DROP POLICY IF EXISTS "Viewers can view blacklist_scans" ON public.blacklist_scans;
CREATE POLICY "Admins can manage blacklist_scans" ON public.blacklist_scans FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Superadmins can manage blacklist_scans" ON public.blacklist_scans FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Viewers can view blacklist_scans" ON public.blacklist_scans FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));

DROP POLICY IF EXISTS "Admins can manage ip_history" ON public.ip_history;
DROP POLICY IF EXISTS "Superadmins can manage ip_history" ON public.ip_history;
DROP POLICY IF EXISTS "Viewers can view ip_history" ON public.ip_history;
CREATE POLICY "Admins can manage ip_history" ON public.ip_history FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Superadmins can manage ip_history" ON public.ip_history FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Viewers can view ip_history" ON public.ip_history FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));

DROP POLICY IF EXISTS "Admins can manage ip_reputation_summary" ON public.ip_reputation_summary;
DROP POLICY IF EXISTS "Superadmins can manage ip_reputation_summary" ON public.ip_reputation_summary;
DROP POLICY IF EXISTS "Viewers can view ip_reputation_summary" ON public.ip_reputation_summary;
CREATE POLICY "Admins can manage ip_reputation_summary" ON public.ip_reputation_summary FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Superadmins can manage ip_reputation_summary" ON public.ip_reputation_summary FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Viewers can view ip_reputation_summary" ON public.ip_reputation_summary FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));

DROP POLICY IF EXISTS "Admins can manage mitigation_actions" ON public.mitigation_actions;
DROP POLICY IF EXISTS "Superadmins can manage mitigation_actions" ON public.mitigation_actions;
DROP POLICY IF EXISTS "Viewers can view mitigation_actions" ON public.mitigation_actions;
CREATE POLICY "Admins can manage mitigation_actions" ON public.mitigation_actions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Superadmins can manage mitigation_actions" ON public.mitigation_actions FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'superadmin'));
CREATE POLICY "Viewers can view mitigation_actions" ON public.mitigation_actions FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'viewer'));
