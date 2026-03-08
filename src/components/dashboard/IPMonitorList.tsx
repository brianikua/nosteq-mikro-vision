import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, Wifi, Trash2, Shield, Clock, ChevronDown, Globe } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface MonitoredIP {
  id: string;
  name: string;
  ip_address: string;
  is_up: boolean | null;
  last_ping_at: string | null;
  last_latency_ms: number | null;
  check_interval_minutes: number | null;
  check_ports: number[] | null;
  created_at: string;
  reputation?: { reputation_score: number; active_listings: number; total_listings: number; last_scan_at: string | null } | null;
}

interface IPMonitorListProps {
  refreshTrigger: boolean;
}

export const IPMonitorList = ({ refreshTrigger }: IPMonitorListProps) => {
  const [ips, setIps] = useState<MonitoredIP[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinging, setPinging] = useState<Record<string, boolean>>({});
  const [openPorts, setOpenPorts] = useState<Record<string, number[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchIPs = async () => {
    setLoading(true);
    try {
      const { data: devices, error } = await supabase
        .from("devices")
        .select("id, name, ip_address, is_up, last_ping_at, last_latency_ms, check_interval_minutes, check_ports, created_at")
        .order("name");
      if (error) throw error;

      const withReputation = await Promise.all(
        (devices || []).map(async (d) => {
          const { data: rep } = await supabase
            .from("ip_reputation_summary")
            .select("reputation_score, active_listings, total_listings, last_scan_at")
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

  const handlePing = async (e: React.MouseEvent, ip: MonitoredIP) => {
    e.stopPropagation();
    setPinging((p) => ({ ...p, [ip.id]: true }));
    try {
      const { data, error } = await supabase.functions.invoke("ping-device", {
        body: { ip_address: ip.ip_address, check_ports: ip.check_ports || [80, 443] },
      });
      if (error) throw error;
      const isUp = data?.reachable ?? false;
      const latency = data?.latency_ms ?? 0;
      const detectedOpenPorts: number[] = data?.open_ports ?? [];
      setOpenPorts((prev) => ({ ...prev, [ip.id]: detectedOpenPorts }));
      await supabase.from("devices").update({
        is_up: isUp,
        last_ping_at: new Date().toISOString(),
        last_latency_ms: latency,
      }).eq("id", ip.id);
      toast[isUp ? "success" : "error"](`${ip.name}: ${isUp ? `Up (${latency}ms)` : "Down"}${detectedOpenPorts.length ? ` | Ports: ${detectedOpenPorts.join(",")}` : ""}`);
      fetchIPs();
    } catch {
      toast.error("Ping failed");
    } finally {
      setPinging((p) => ({ ...p, [ip.id]: false }));
    }
  };

  const handleDelete = async (e: React.MouseEvent, ip: MonitoredIP) => {
    e.stopPropagation();
    if (!confirm(`Remove ${ip.name} (${ip.ip_address})?`)) return;
    try {
      const { error } = await supabase.from("devices").delete().eq("id", ip.id);
      if (error) throw error;
      toast.success("IP removed");
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
        <Globe className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-muted-foreground text-lg">No IPs monitored yet.</p>
        <p className="text-muted-foreground/70 text-sm">Click "Add IP" to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {ips.map((ip) => {
        const isUp = ip.is_up === true;
        const isDown = ip.is_up === false;
        const isOpen = expandedId === ip.id;
        const repScore = ip.reputation?.reputation_score ?? null;
        const listings = ip.reputation?.active_listings ?? 0;

        return (
          <Collapsible
            key={ip.id}
            open={isOpen}
            onOpenChange={(open) => setExpandedId(open ? ip.id : null)}
          >
            <CollapsibleTrigger asChild>
              <button
                className={cn(
                  "w-full flex items-center gap-4 px-4 py-3 rounded-lg border transition-all duration-200 text-left",
                  "hover:bg-accent/50 cursor-pointer",
                  isOpen
                    ? "bg-accent/30 border-primary/40 rounded-b-none"
                    : "bg-card/50 border-border/50"
                )}
              >
                {/* Status dot */}
                <div
                  className={cn(
                    "h-2.5 w-2.5 rounded-full shrink-0",
                    isUp ? "bg-[hsl(var(--success))]" : isDown ? "bg-destructive" : "bg-muted-foreground"
                  )}
                />

                {/* Label */}
                <span className="font-medium truncate min-w-[100px] max-w-[160px]">{ip.name}</span>

                {/* IP */}
                <span className="font-mono text-sm text-muted-foreground shrink-0">{ip.ip_address}</span>

                {/* Status badge */}
                <Badge
                  variant={isUp ? "default" : isDown ? "destructive" : "secondary"}
                  className="text-xs shrink-0"
                >
                  {isUp ? "UP" : isDown ? "DOWN" : "N/A"}
                </Badge>

                {/* Latency */}
                <span className={cn(
                  "font-mono text-sm shrink-0 hidden sm:inline",
                  isUp ? "text-[hsl(var(--success))]" : "text-muted-foreground"
                )}>
                  {ip.last_latency_ms !== null ? `${ip.last_latency_ms}ms` : "—"}
                </span>

                {/* Blacklist indicator */}
                {listings > 0 && (
                  <div className="flex items-center gap-1 text-xs text-destructive shrink-0">
                    <Shield className="h-3 w-3" />
                    <span>{listings}</span>
                  </div>
                )}

                <div className="ml-auto flex items-center gap-2 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={(e) => handlePing(e, ip)}
                    disabled={!!pinging[ip.id]}
                  >
                    <Wifi className={cn("h-3.5 w-3.5", pinging[ip.id] && "animate-pulse text-primary")} />
                  </Button>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform duration-200",
                      isOpen && "rotate-180"
                    )}
                  />
                </div>
              </button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="border border-t-0 border-primary/40 rounded-b-lg bg-card/80 px-6 py-5 space-y-4 animate-in slide-in-from-top-1 duration-200">
                {/* Detail grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <DetailItem label="Status" value={isUp ? "Online" : isDown ? "Offline" : "Unknown"} valueClass={isUp ? "text-[hsl(var(--success))]" : isDown ? "text-destructive" : "text-muted-foreground"} />
                  <DetailItem label="Latency" value={ip.last_latency_ms !== null ? `${ip.last_latency_ms}ms` : "—"} />
                  <DetailItem
                    label="Reputation"
                    value={repScore !== null ? `${repScore}/100` : "Not scanned"}
                    valueClass={
                      repScore === null ? "text-muted-foreground" :
                      repScore >= 80 ? "text-[hsl(var(--success))]" :
                      repScore >= 50 ? "text-[hsl(var(--warning))]" :
                      "text-destructive"
                    }
                  />
                  <DetailItem label="Blacklists" value={listings > 0 ? `${listings} active` : "Clean"} valueClass={listings > 0 ? "text-destructive" : "text-[hsl(var(--success))]"} />
                </div>

                {/* Ports */}
                {ip.check_ports && ip.check_ports.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Port Status</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ip.check_ports.map((port) => {
                        const deviceOpenPorts = openPorts[ip.id];
                        const isScanned = deviceOpenPorts !== undefined;
                        const isOpen = isScanned && deviceOpenPorts.includes(port);
                        return (
                          <Badge
                            key={port}
                            variant="outline"
                            className={cn(
                              "text-xs font-mono gap-1.5 py-0.5",
                              isScanned
                                ? isOpen
                                  ? "border-[hsl(var(--success))]/50 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]"
                                  : "border-destructive/50 bg-destructive/10 text-destructive"
                                : ""
                            )}
                          >
                            <span className={cn(
                              "h-1.5 w-1.5 rounded-full shrink-0",
                              isScanned
                                ? isOpen ? "bg-[hsl(var(--success))]" : "bg-destructive"
                                : "bg-muted-foreground"
                            )} />
                            {port}
                          </Badge>
                        );
                      })}
                    </div>
                    {openPorts[ip.id] === undefined && (
                      <p className="text-xs text-muted-foreground/60 mt-1">Ping to scan ports</p>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <DetailItem label="Check Interval" value={ip.check_interval_minutes ? `${ip.check_interval_minutes} min` : "5 min"} />
                  <DetailItem label="Last Check" value={ip.last_ping_at ? new Date(ip.last_ping_at).toLocaleString() : "Never"} />
                  <DetailItem label="Last Scan" value={ip.reputation?.last_scan_at ? new Date(ip.reputation.last_scan_at).toLocaleString() : "Never"} />
                  <DetailItem label="Added" value={new Date(ip.created_at).toLocaleDateString()} />
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={(e) => handlePing(e, ip)}
                    disabled={!!pinging[ip.id]}
                  >
                    <Wifi className={cn("h-3.5 w-3.5 mr-1.5", pinging[ip.id] && "animate-pulse")} />
                    {pinging[ip.id] ? "Pinging..." : "Ping Now"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={(e) => handleDelete(e, ip)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Remove
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}
    </div>
  );
};

function DetailItem({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className={cn("text-sm font-semibold font-mono", valueClass)}>{value}</p>
    </div>
  );
}
