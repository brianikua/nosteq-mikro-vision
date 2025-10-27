-- Create role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'viewer');

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Enable RLS on user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Policy for user_roles table (admins can manage, users can view their own)
CREATE POLICY "Admins can manage all roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Drop existing permissive policies on devices table
DROP POLICY IF EXISTS "Authenticated users can delete devices" ON public.devices;
DROP POLICY IF EXISTS "Authenticated users can insert devices" ON public.devices;
DROP POLICY IF EXISTS "Authenticated users can update devices" ON public.devices;
DROP POLICY IF EXISTS "Authenticated users can view devices" ON public.devices;

-- Create new restrictive policies for devices table
CREATE POLICY "Admins can view all devices"
ON public.devices
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Viewers can view devices but not passwords"
ON public.devices
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'viewer'));

CREATE POLICY "Admins can insert devices"
ON public.devices
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update devices"
ON public.devices
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete devices"
ON public.devices
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Update policies for device_metrics
DROP POLICY IF EXISTS "Authenticated users can insert metrics" ON public.device_metrics;
DROP POLICY IF EXISTS "Authenticated users can view metrics" ON public.device_metrics;

CREATE POLICY "Admins and viewers can view metrics"
ON public.device_metrics
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'viewer'));

CREATE POLICY "Admins can insert metrics"
ON public.device_metrics
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Update policies for device_interfaces
DROP POLICY IF EXISTS "Authenticated users can insert interfaces" ON public.device_interfaces;
DROP POLICY IF EXISTS "Authenticated users can view interfaces" ON public.device_interfaces;

CREATE POLICY "Admins and viewers can view interfaces"
ON public.device_interfaces
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'viewer'));

CREATE POLICY "Admins can insert interfaces"
ON public.device_interfaces
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));