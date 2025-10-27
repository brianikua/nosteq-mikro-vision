-- Create enum for device status
CREATE TYPE public.device_status AS ENUM ('online', 'offline', 'warning');

-- Create devices table
CREATE TABLE public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  ip_address TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL,
  password TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 8728,
  model TEXT,
  routeros_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create device_metrics table to store historical data
CREATE TABLE public.device_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  status device_status NOT NULL,
  uptime TEXT,
  cpu_load INTEGER, -- percentage
  memory_usage INTEGER, -- percentage
  total_traffic BIGINT, -- bytes
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create interfaces table
CREATE TABLE public.device_interfaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL, -- 'up' or 'down'
  rx_rate BIGINT, -- bytes per second
  tx_rate BIGINT, -- bytes per second
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_interfaces ENABLE ROW LEVEL SECURITY;

-- RLS Policies (admin only access)
CREATE POLICY "Authenticated users can view devices"
  ON public.devices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert devices"
  ON public.devices FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update devices"
  ON public.devices FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete devices"
  ON public.devices FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can view metrics"
  ON public.device_metrics FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert metrics"
  ON public.device_metrics FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can view interfaces"
  ON public.device_interfaces FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert interfaces"
  ON public.device_interfaces FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Create index for better performance
CREATE INDEX idx_device_metrics_device_id ON public.device_metrics(device_id);
CREATE INDEX idx_device_metrics_recorded_at ON public.device_metrics(recorded_at DESC);
CREATE INDEX idx_device_interfaces_device_id ON public.device_interfaces(device_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for devices table
CREATE TRIGGER update_devices_updated_at
  BEFORE UPDATE ON public.devices
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();