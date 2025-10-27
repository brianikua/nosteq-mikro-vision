import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { DeviceCard } from "./DeviceCard";
import { Loader2 } from "lucide-react";

interface Device {
  id: string;
  name: string;
  ip_address: string;
  model: string | null;
  routeros_version: string | null;
}

interface DeviceMetrics {
  status: "online" | "offline" | "warning";
  uptime: string | null;
  cpu_load: number | null;
  memory_usage: number | null;
  total_traffic: number | null;
}

interface DeviceWithMetrics extends Device {
  metrics: DeviceMetrics | null;
}

interface DeviceGridProps {
  refreshTrigger: boolean;
}

export const DeviceGrid = ({ refreshTrigger }: DeviceGridProps) => {
  const [devices, setDevices] = useState<DeviceWithMetrics[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDevices = async () => {
    setLoading(true);
    try {
      const { data: devicesData, error: devicesError } = await supabase
        .from("devices")
        .select("*")
        .order("name");

      if (devicesError) throw devicesError;

      if (devicesData) {
        const devicesWithMetrics = await Promise.all(
          devicesData.map(async (device) => {
            const { data: metricsData } = await supabase
              .from("device_metrics")
              .select("*")
              .eq("device_id", device.id)
              .order("recorded_at", { ascending: false })
              .limit(1)
              .maybeSingle();

            return {
              ...device,
              metrics: metricsData || {
                status: "offline" as const,
                uptime: null,
                cpu_load: null,
                memory_usage: null,
                total_traffic: null,
              },
            };
          })
        );

        setDevices(devicesWithMetrics);
      }
    } catch (error) {
      console.error("Error fetching devices:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, [refreshTrigger]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground text-lg">
          No devices configured. Click "Add Device" to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {devices.map((device) => (
        <DeviceCard key={device.id} device={device} />
      ))}
    </div>
  );
};
