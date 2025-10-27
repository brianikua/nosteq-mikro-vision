import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Cpu, HardDrive, Network, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface DeviceCardProps {
  device: {
    id: string;
    name: string;
    ip_address: string;
    model: string | null;
    routeros_version: string | null;
    metrics: {
      status: "online" | "offline" | "warning";
      uptime: string | null;
      cpu_load: number | null;
      memory_usage: number | null;
      total_traffic: number | null;
    } | null;
  };
}

export const DeviceCard = ({ device }: DeviceCardProps) => {
  const status = device.metrics?.status || "offline";
  
  const statusColors = {
    online: "status-online",
    offline: "status-offline",
    warning: "status-warning",
  };

  const statusBadgeVariants = {
    online: "default",
    offline: "destructive",
    warning: "secondary",
  } as const;

  const handleDelete = async () => {
    if (!confirm(`Are you sure you want to delete ${device.name}?`)) return;

    try {
      const { error } = await supabase
        .from("devices")
        .delete()
        .eq("id", device.id);

      if (error) throw error;
      toast.success("Device deleted successfully");
      window.location.reload();
    } catch (error) {
      console.error("Error deleting device:", error);
      toast.error("Failed to delete device");
    }
  };

  return (
    <Card className="hover:border-primary/50 transition-all duration-300 border-border/50">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Activity className={`h-5 w-5 ${statusColors[status]}`} />
            <CardTitle className="text-lg">{device.name}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={statusBadgeVariants[status]} className="capitalize">
              {status}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleDelete}
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="text-sm text-muted-foreground space-y-1">
          <p className="font-mono">{device.ip_address}</p>
          {device.model && <p>{device.model}</p>}
          {device.routeros_version && <p>RouterOS {device.routeros_version}</p>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm">
              <p className="text-muted-foreground">CPU</p>
              <p className="font-mono font-semibold">
                {device.metrics?.cpu_load !== null ? `${device.metrics.cpu_load}%` : "N/A"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm">
              <p className="text-muted-foreground">Memory</p>
              <p className="font-mono font-semibold">
                {device.metrics?.memory_usage !== null ? `${device.metrics.memory_usage}%` : "N/A"}
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 pt-2 border-t border-border/50">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm">
            <p className="text-muted-foreground">Uptime</p>
            <p className="font-mono text-xs">
              {device.metrics?.uptime || "Unknown"}
            </p>
          </div>
        </div>

        {device.metrics?.total_traffic !== null && (
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-muted-foreground" />
            <div className="text-sm">
              <p className="text-muted-foreground">Traffic</p>
              <p className="font-mono text-xs">
                {(device.metrics.total_traffic / 1024 / 1024).toFixed(2)} MB
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
