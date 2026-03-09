import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Wifi, Trash2, Shield } from "lucide-react";
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

interface IPMonitorTableProps {
  refreshTrigger: boolean;
}

export const IPMonitorTable = ({ refreshTrigger }: IPMonitorTableProps) => {
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
    } catch {
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
    } catch {
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
        <p className="text-muted-foreground">No IPs monitored yet. Click "Add IP" to get started.</p>
      </div>
    );
  }

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-card/50">
            <TableHead>Status</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>IP Address</TableHead>
            <TableHead>Latency</TableHead>
            <TableHead>Reputation</TableHead>
            <TableHead>Blacklists</TableHead>
            <TableHead>Last Check</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ips.map((ip) => {
            const isUp = ip.is_up === true;
            const isDown = ip.is_up === false;
            const repScore = ip.reputation?.reputation_score ?? null;
            const listings = ip.reputation?.active_listings ?? 0;

            return (
              <TableRow key={ip.id} className="hover:bg-card/30">
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className={`h-2.5 w-2.5 rounded-full ${isUp ? "bg-[hsl(var(--success))]" : isDown ? "bg-destructive" : "bg-muted-foreground"}`} />
                    <Badge variant={isUp ? "default" : isDown ? "destructive" : "secondary"} className="text-xs">
                      {isUp ? "UP" : isDown ? "DOWN" : "N/A"}
                    </Badge>
                  </div>
                </TableCell>
                <TableCell className="font-medium">{ip.name}</TableCell>
                <TableCell className="font-mono text-sm">{ip.ip_address}</TableCell>
                <TableCell className="font-mono text-sm">
                  {ip.last_latency_ms !== null ? `${ip.last_latency_ms}ms` : "—"}
                </TableCell>
                <TableCell>
                  <span className={`font-mono text-sm font-semibold ${
                    repScore === null ? "text-muted-foreground" :
                    repScore >= 80 ? "text-[hsl(var(--success))]" :
                    repScore >= 50 ? "text-[hsl(var(--warning))]" :
                    "text-destructive"
                  }`}>
                    {repScore !== null ? `${repScore}/100` : "—"}
                  </span>
                </TableCell>
                <TableCell>
                  {listings > 0 ? (
                    <div className="flex items-center gap-1 text-xs text-destructive">
                      <Shield className="h-3 w-3" />
                      <span>{listings}</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">Clean</span>
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {ip.last_ping_at ? new Date(ip.last_ping_at).toLocaleString() : "Never"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handlePing(ip)}
                      disabled={!!pinging[ip.id]}
                    >
                      <Wifi className={`h-4 w-4 ${pinging[ip.id] ? "animate-pulse text-primary" : ""}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => setDeleteTarget(ip)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <DeleteIPDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        deviceName={deleteTarget?.name ?? ""}
        ipAddress={deleteTarget?.ip_address ?? ""}
        onConfirm={handleDeleteConfirm}
      />
    </div>
  );
};
