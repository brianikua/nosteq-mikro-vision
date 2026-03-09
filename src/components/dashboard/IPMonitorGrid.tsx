import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, Wifi, Trash2, Shield, Clock } from "lucide-react";
import { toast } from "sonner";
import { DeleteIPDialog } from "./DeleteIPDialog";

interface MonitoredIP {
  id: string;
  name: string;
  ip_address: string;
  is_up: boolean | null;
  last_ping_at: string | null;
  last_latency_ms: number | null;
  reputation?: { reputation_score: number; active_listings: number; last_scan_at: string | null } | null;
}

interface IPMonitorGridProps {
  refreshTrigger: boolean;
}

export const IPMonitorGrid = ({ refreshTrigger }: IPMonitorGridProps) => {
  const [ips, setIps] = useState<MonitoredIP[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinging, setPinging] = useState<Record<string, boolean>>({});

  const fetchIPs = async () => {
    setLoading(true);
    try {
      const { data: devices, error } = await supabase
        .from("devices")
        .select("id, name, ip_address, is_up, last_ping_at, last_latency_ms")
        .order("name");
      if (error) throw error;

      const withReputation = await Promise.all(
        (devices || []).map(async (d) => {
          const { data: rep } = await supabase
            .from("ip_reputation_summary")
            .select("reputation_score, active_listings, last_scan_at")
            .eq("device_id", d.id)
            .maybeSingle();
          return { ...d, reputation: rep };
        })
      );
      setIps(withReputation);
    } catch (e) {
      console.error("Error fetching IPs:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchIPs(); }, [refreshTrigger]);

  const handlePing = async (ip: MonitoredIP) => {
    setPinging((p) => ({ ...p, [ip.id]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("ping-device", {
        body: { ip_address: ip.ip_address },
      });
      if (error) throw error;

      const isUp = data?.reachable ?? false;
      const latency = data?.latency_ms ?? 0;

      await supabase.from("devices").update({
        is_up: isUp,
        last_ping_at: new Date().toISOString(),
        last_latency_ms: latency,
      }).eq("id", ip.id);

      toast[isUp ? "success" : "error"](`${ip.name}: ${isUp ? `Up (${latency}ms)` : "Down"}`);
      fetchIPs();
    } catch (e) {
      console.error("Ping failed:", e);
      toast.error("Ping failed");
    } finally {
      setPinging((p) => ({ ...p, [ip.id]: false }));
    }
  };

  const [deleteTarget, setDeleteTarget] = useState<MonitoredIP | null>(null);

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from("devices").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("IP removed");
      setDeleteTarget(null);
      fetchIPs();
    } catch (e) {
      console.error("Delete failed:", e);
      toast.error("Failed to remove IP");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (ips.length === 0) {
    return (
      <div className="text-center py-16">
        <Globe className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-muted-foreground text-lg">No IPs monitored yet.</p>
        <p className="text-muted-foreground/70 text-sm">Click "Add IP" to get started.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {ips.map((ip) => (
        <IPCard key={ip.id} ip={ip} pinging={!!pinging[ip.id]} onPing={handlePing} onDelete={handleDelete} />
      ))}
    </div>
  );
};

// Need to import Globe for the empty state
import { Globe } from "lucide-react";

function IPCard({
  ip,
  pinging,
  onPing,
  onDelete,
}: {
  ip: MonitoredIP;
  pinging: boolean;
  onPing: (ip: MonitoredIP) => void;
  onDelete: (ip: MonitoredIP) => void;
}) {
  const isUp = ip.is_up === true;
  const isDown = ip.is_up === false;
  const isUnknown = ip.is_up === null;
  const repScore = ip.reputation?.reputation_score ?? null;

  const statusColor = isUp
    ? "text-[hsl(var(--success))]"
    : isDown
    ? "text-destructive"
    : "text-muted-foreground";

  const statusBadge = isUp
    ? "default"
    : isDown
    ? "destructive"
    : "secondary";

  const repColor =
    repScore === null
      ? "text-muted-foreground"
      : repScore >= 80
      ? "text-[hsl(var(--success))]"
      : repScore >= 50
      ? "text-[hsl(var(--warning))]"
      : "text-destructive";

  return (
    <Card className="hover:border-primary/50 transition-all duration-300 border-border/50 group">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`h-2.5 w-2.5 rounded-full ${isUp ? "bg-[hsl(var(--success))] shadow-[var(--shadow-success)]" : isDown ? "bg-destructive shadow-[var(--shadow-danger)]" : "bg-muted-foreground"}`} />
            <CardTitle className="text-base truncate">{ip.name}</CardTitle>
          </div>
          <Badge variant={statusBadge as any} className="text-xs shrink-0">
            {isUp ? "UP" : isDown ? "DOWN" : "N/A"}
          </Badge>
        </div>
        <p className="font-mono text-sm text-muted-foreground">{ip.ip_address}</p>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <div className="grid grid-cols-2 gap-3">
          <div className="text-sm">
            <p className="text-muted-foreground text-xs">Latency</p>
            <p className={`font-mono font-semibold ${statusColor}`}>
              {ip.last_latency_ms !== null ? `${ip.last_latency_ms}ms` : "—"}
            </p>
          </div>
          <div className="text-sm">
            <p className="text-muted-foreground text-xs">Reputation</p>
            <p className={`font-mono font-semibold ${repColor}`}>
              {repScore !== null ? `${repScore}/100` : "—"}
            </p>
          </div>
        </div>

        {ip.reputation && ip.reputation.active_listings > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-destructive bg-destructive/10 rounded-md px-2 py-1">
            <Shield className="h-3 w-3" />
            <span>{ip.reputation.active_listings} blacklist{ip.reputation.active_listings > 1 ? "s" : ""}</span>
          </div>
        )}

        {ip.last_ping_at && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Last check: {new Date(ip.last_ping_at).toLocaleTimeString()}</span>
          </div>
        )}

        <div className="flex items-center gap-1 pt-1 border-t border-border/50">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onPing(ip)}
            disabled={pinging}
            className="flex-1 h-8 text-xs"
          >
            <Wifi className={`h-3.5 w-3.5 mr-1.5 ${pinging ? "animate-pulse" : ""}`} />
            {pinging ? "Pinging..." : "Ping"}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onDelete(ip)}
            className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
