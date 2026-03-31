import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Loader2, ChevronDown, Monitor, MapPin, Wifi, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface DeviceRow {
  id: string;
  name: string;
  ip_address: string;
  is_up: boolean | null;
  last_latency_ms: number | null;
  last_ping_at: string | null;
  server_id: string | null;
  ip_role: string | null;
  ip_label: string | null;
  is_primary: boolean | null;
  check_ports: number[] | null;
  reputation?: { active_listings: number } | null;
}

interface ServerInfo {
  id: string;
  name: string;
  location: string | null;
  server_type: string;
  group_name: string | null;
  group_color: string | null;
}

interface IPServerViewProps {
  refreshTrigger: boolean;
}

export const IPServerView = ({ refreshTrigger }: IPServerViewProps) => {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());
  const [pinging, setPinging] = useState<Record<string, boolean>>({});

  const fetchData = async () => {
    setLoading(true);
    try {
      const [devicesRes, serversRes, groupsRes] = await Promise.all([
        supabase.from("devices").select("id, name, ip_address, is_up, last_latency_ms, last_ping_at, server_id, ip_role, ip_label, is_primary, check_ports"),
        supabase.from("servers").select("id, name, location, server_type, group_id"),
        supabase.from("ip_groups").select("id, name, color"),
      ]);

      const groupMap: Record<string, { name: string; color: string }> = {};
      (groupsRes.data || []).forEach((g: any) => { groupMap[g.id] = { name: g.name, color: g.color }; });

      // Fetch reputation summaries
      const repRes = await supabase.from("ip_reputation_summary").select("device_id, active_listings");
      const repMap: Record<string, { active_listings: number }> = {};
      (repRes.data || []).forEach((r: any) => { repMap[r.device_id] = { active_listings: r.active_listings }; });

      setDevices((devicesRes.data || []).map((d: any) => ({ ...d, reputation: repMap[d.id] || null })));
      setServers((serversRes.data || []).map((s: any) => ({
        ...s,
        group_name: s.group_id ? groupMap[s.group_id]?.name || null : null,
        group_color: s.group_id ? groupMap[s.group_id]?.color || null : null,
      })));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [refreshTrigger]);

  const serverGroups = useMemo(() => {
    const map: Record<string, DeviceRow[]> = {};
    servers.forEach(s => { map[s.id] = []; });
    const unassigned: DeviceRow[] = [];

    devices.forEach(d => {
      if (d.server_id && map[d.server_id]) {
        map[d.server_id].push(d);
      } else {
        unassigned.push(d);
      }
    });

    return { map, unassigned };
  }, [devices, servers]);

  const toggleServer = (id: string) => {
    setExpandedServers(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handlePing = async (device: DeviceRow) => {
    setPinging(p => ({ ...p, [device.id]: true }));
    try {
      const { data } = await supabase.functions.invoke("ping-device", {
        body: { ip_address: device.ip_address, check_ports: device.check_ports || [80, 443] },
      });
      if (data) {
        await supabase.from("devices").update({
          is_up: data.reachable ?? false,
          last_ping_at: new Date().toISOString(),
          last_latency_ms: data.latency_ms ?? 0,
        }).eq("id", device.id);
        toast[data.reachable ? "success" : "error"](`${device.name}: ${data.reachable ? `Up (${data.latency_ms}ms)` : "Down"}`);
        fetchData();
      }
    } catch { toast.error("Ping failed"); }
    finally { setPinging(p => ({ ...p, [device.id]: false })); }
  };

  const getServerStatus = (deviceList: DeviceRow[]) => {
    if (deviceList.length === 0) return "empty";
    const upCount = deviceList.filter(d => d.is_up === true).length;
    const downCount = deviceList.filter(d => d.is_up === false).length;
    const hasBlacklist = deviceList.some(d => (d.reputation?.active_listings ?? 0) > 0);
    if (downCount === deviceList.length) return "down";
    if (upCount === deviceList.length && !hasBlacklist) return "up";
    return "partial";
  };

  const statusConfig = {
    up: { label: "ALL UP", icon: "✅", borderClass: "border-[hsl(var(--success))]/40", bgClass: "bg-[hsl(var(--success))]/5" },
    down: { label: "ALL DOWN", icon: "🔴", borderClass: "border-destructive/40", bgClass: "bg-destructive/5" },
    partial: { label: "PARTIAL", icon: "⚠️", borderClass: "border-[hsl(var(--warning))]/40", bgClass: "bg-[hsl(var(--warning))]/5" },
    empty: { label: "NO IPs", icon: "📭", borderClass: "border-border/50", bgClass: "bg-card/50" },
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (servers.length === 0 && devices.length === 0) {
    return (
      <div className="text-center py-16">
        <Monitor className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-muted-foreground text-lg">No servers configured.</p>
        <p className="text-muted-foreground/70 text-sm">Go to Admin → Servers to create server groups, or use Flat List view.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {servers.map(server => {
        const serverDevices = serverGroups.map[server.id] || [];
        const status = getServerStatus(serverDevices);
        const cfg = statusConfig[status];
        const isOpen = expandedServers.has(server.id);
        const upCount = serverDevices.filter(d => d.is_up === true).length;

        return (
          <Collapsible key={server.id} open={isOpen} onOpenChange={() => toggleServer(server.id)}>
            <CollapsibleTrigger asChild>
              <div
                role="button"
                tabIndex={0}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg border transition-all cursor-pointer",
                  cfg.borderClass, cfg.bgClass,
                  isOpen && "rounded-b-none",
                  "hover:opacity-90"
                )}
              >
                <Monitor className="h-5 w-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{server.name}</span>
                    <Badge variant="secondary" className="text-[10px]">{server.server_type}</Badge>
                    {server.group_name && (
                      <Badge variant="outline" className="text-[10px]" style={{ borderColor: server.group_color || undefined }}>
                        {server.group_name}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {server.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{server.location}</span>}
                    <span>{cfg.icon} {status === "partial" ? `${upCount} of ${serverDevices.length} IPs up` : cfg.label}</span>
                  </div>
                </div>
                <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isOpen && "rotate-180")} />
              </div>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className={cn("border border-t-0 rounded-b-lg px-2 py-2 space-y-1", cfg.borderClass, "bg-card/30")}>
                {serverDevices.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-2 py-2">No IPs assigned to this server.</p>
                ) : (
                  serverDevices.map(d => {
                    const isUp = d.is_up === true;
                    const isDown = d.is_up === false;
                    const listings = d.reputation?.active_listings ?? 0;
                    return (
                      <div key={d.id} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent/30 transition-colors">
                        <div className={cn("h-2 w-2 rounded-full shrink-0", isUp ? "bg-[hsl(var(--success))]" : isDown ? "bg-destructive" : "bg-muted-foreground")} />
                        <span className="font-mono text-xs shrink-0">{d.ip_address}</span>
                        {d.ip_label && <span className="text-xs text-muted-foreground">{d.ip_label}</span>}
                        {d.ip_role && d.ip_role !== "Other" && <Badge variant="outline" className="text-[9px] py-0">{d.ip_role}</Badge>}
                        {d.is_primary && <Badge className="text-[9px] py-0 bg-primary/20 text-primary">★ Primary</Badge>}
                        <Badge variant={isUp ? "default" : isDown ? "destructive" : "secondary"} className="text-[10px] ml-auto">
                          {isUp ? "UP" : isDown ? "DOWN" : "N/A"}
                        </Badge>
                        <span className={cn("text-xs font-mono", d.last_latency_ms !== null && d.last_latency_ms < 100 ? "text-[hsl(var(--success))]" : d.last_latency_ms !== null && d.last_latency_ms <= 300 ? "text-[hsl(var(--warning))]" : "text-destructive")}>
                          {d.last_latency_ms !== null ? `${d.last_latency_ms}ms` : "—"}
                        </span>
                        {listings > 0 && <Badge variant="destructive" className="text-[9px]">🛡{listings}</Badge>}
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handlePing(d)} disabled={!!pinging[d.id]}>
                          <Wifi className={cn("h-3 w-3", pinging[d.id] && "animate-pulse text-primary")} />
                        </Button>
                      </div>
                    );
                  })
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      {/* Unassigned IPs */}
      {serverGroups.unassigned.length > 0 && (
        <Collapsible defaultOpen>
          <CollapsibleTrigger asChild>
            <div role="button" tabIndex={0} className="flex items-center gap-3 px-4 py-3 rounded-lg border border-border/50 bg-card/30 cursor-pointer hover:opacity-90">
              <Globe className="h-5 w-5 text-muted-foreground shrink-0" />
              <span className="text-sm font-medium">📭 Unassigned IPs ({serverGroups.unassigned.length})</span>
              <ChevronDown className="h-4 w-4 text-muted-foreground ml-auto" />
            </div>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="border border-t-0 border-border/50 rounded-b-lg px-2 py-2 space-y-1 bg-card/30">
              {serverGroups.unassigned.map(d => {
                const isUp = d.is_up === true;
                const isDown = d.is_up === false;
                return (
                  <div key={d.id} className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-accent/30 transition-colors">
                    <div className={cn("h-2 w-2 rounded-full shrink-0", isUp ? "bg-[hsl(var(--success))]" : isDown ? "bg-destructive" : "bg-muted-foreground")} />
                    <span className="font-medium text-xs">{d.name}</span>
                    <span className="font-mono text-xs text-muted-foreground">{d.ip_address}</span>
                    <Badge variant={isUp ? "default" : isDown ? "destructive" : "secondary"} className="text-[10px] ml-auto">
                      {isUp ? "UP" : isDown ? "DOWN" : "N/A"}
                    </Badge>
                    <span className="text-xs font-mono text-muted-foreground">
                      {d.last_latency_ms !== null ? `${d.last_latency_ms}ms` : "—"}
                    </span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handlePing(d)} disabled={!!pinging[d.id]}>
                      <Wifi className={cn("h-3 w-3", pinging[d.id] && "animate-pulse text-primary")} />
                    </Button>
                  </div>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
};
