import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Wifi, Trash2, Shield, Clock, ChevronDown, Globe, Pencil,
  Search, ArrowUpDown, Download, RefreshCw, ShieldCheck, BellOff, StickyNote,
  Activity,
} from "lucide-react";
import { EditIPDialog } from "./EditIPDialog";
import { DeleteIPDialog } from "./DeleteIPDialog";
import { LinkToServerDialog } from "./LinkToServerDialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  LineChart, Line, ResponsiveContainer, YAxis,
} from "recharts";

const PORT_LABELS: Record<number, string> = {
  21: "FTP", 22: "SSH", 23: "Telnet", 25: "SMTP", 53: "DNS",
  80: "HTTP", 110: "POP3", 143: "IMAP", 443: "HTTPS", 445: "SMB",
  993: "IMAPS", 995: "POP3S", 1433: "MSSQL", 1723: "PPTP",
  3306: "MySQL", 3389: "RDP", 5432: "Postgres", 5900: "VNC",
  8080: "HTTP-Alt", 8291: "Winbox", 8443: "HTTPS-Alt",
  8728: "MikroTik", 8729: "MikroTik-S",
};

interface MonitoredIP {
  id: string;
  name: string;
  ip_address: string;
  is_up: boolean | null;
  last_ping_at: string | null;
  last_latency_ms: number | null;
  check_interval_minutes: number | null;
  check_ports: number[] | null;
  notify_number: string[] | null;
  created_at: string;
  reputation?: { reputation_score: number; active_listings: number; total_listings: number; last_scan_at: string | null } | null;
}

interface IPMonitorListProps {
  refreshTrigger: boolean;
}

type SortKey = "name" | "ip_address" | "latency" | "status" | "listings";
type SortDir = "asc" | "desc";
type StatusFilter = "all" | "up" | "down" | "blacklisted";

export const IPMonitorList = ({ refreshTrigger }: IPMonitorListProps) => {
  const [ips, setIps] = useState<MonitoredIP[]>([]);
  const [loading, setLoading] = useState(true);
  const [pinging, setPinging] = useState<Record<string, boolean>>({});
  const [openPorts, setOpenPorts] = useState<Record<string, number[]>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editDevice, setEditDevice] = useState<MonitoredIP | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MonitoredIP | null>(null);
  const [linkTarget, setLinkTarget] = useState<MonitoredIP | null>(null);

  // Search, filter, sort
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Notes per device
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [savingNote, setSavingNote] = useState<string | null>(null);

  // Ping history for sparklines
  const [pingHistory, setPingHistory] = useState<Record<string, number[]>>({});

  const fetchIPs = async () => {
    setLoading(true);
    try {
      const { data: devices, error } = await supabase
        .from("devices")
        .select("id, name, ip_address, is_up, last_ping_at, last_latency_ms, check_interval_minutes, check_ports, notify_number, created_at")
        .order("name");
      if (error) throw error;

      const deviceIds = (devices || []).map(d => d.id);

      const [repRes, notesRes] = await Promise.all([
        Promise.all((devices || []).map(async (d) => {
          const { data: rep } = await supabase
            .from("ip_reputation_summary")
            .select("reputation_score, active_listings, total_listings, last_scan_at")
            .eq("device_id", d.id)
            .maybeSingle();
          return { id: d.id, rep };
        })),
        supabase.from("ip_notes").select("device_id, note_text").in("device_id", deviceIds.length > 0 ? deviceIds : ["__none__"]),
      ]);

      const repMap = Object.fromEntries(repRes.map(r => [r.id, r.rep]));
      const notesMap: Record<string, string> = {};
      (notesRes.data || []).forEach((n: any) => { notesMap[n.device_id] = n.note_text; });
      setNotes(notesMap);

      setIps((devices || []).map(d => ({ ...d, reputation: repMap[d.id] })));
    } catch (e) {
      console.error("Error fetching IPs:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchIPs(); }, [refreshTrigger]);

  // Filtered + sorted IPs
  const filteredIps = useMemo(() => {
    let result = [...ips];

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(ip => ip.name.toLowerCase().includes(q) || ip.ip_address.includes(q));
    }

    // Status filter
    if (statusFilter === "up") result = result.filter(ip => ip.is_up === true);
    else if (statusFilter === "down") result = result.filter(ip => ip.is_up === false);
    else if (statusFilter === "blacklisted") result = result.filter(ip => (ip.reputation?.active_listings ?? 0) > 0);

    // Sort
    result.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.name.localeCompare(b.name); break;
        case "ip_address": cmp = a.ip_address.localeCompare(b.ip_address); break;
        case "latency": cmp = (a.last_latency_ms ?? 9999) - (b.last_latency_ms ?? 9999); break;
        case "status": cmp = (a.is_up === true ? 0 : a.is_up === false ? 2 : 1) - (b.is_up === true ? 0 : b.is_up === false ? 2 : 1); break;
        case "listings": cmp = (b.reputation?.active_listings ?? 0) - (a.reputation?.active_listings ?? 0); break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [ips, searchQuery, statusFilter, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

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

      // Track ping history for sparkline
      setPingHistory(prev => {
        const history = [...(prev[ip.id] || []), latency].slice(-20);
        return { ...prev, [ip.id]: history };
      });

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

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    try {
      const { error } = await supabase.from("devices").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("IP removed");
      setDeleteTarget(null);
      fetchIPs();
    } catch { toast.error("Failed to remove IP"); }
  };

  // Bulk actions
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filteredIps.length) setSelected(new Set());
    else setSelected(new Set(filteredIps.map(ip => ip.id)));
  };

  const handleBulkRefresh = async () => {
    const targets = ips.filter(ip => selected.has(ip.id));
    toast.info(`Pinging ${targets.length} IPs...`);
    for (const ip of targets) {
      try {
        const { data } = await supabase.functions.invoke("ping-device", {
          body: { ip_address: ip.ip_address, check_ports: ip.check_ports || [80, 443] },
        });
        if (data) {
          await supabase.from("devices").update({
            is_up: data.reachable ?? false,
            last_ping_at: new Date().toISOString(),
            last_latency_ms: data.latency_ms ?? 0,
          }).eq("id", ip.id);
        }
      } catch { /* skip */ }
    }
    toast.success("Bulk ping complete");
    setSelected(new Set());
    fetchIPs();
  };

  const handleBulkBlacklistCheck = async () => {
    const targets = ips.filter(ip => selected.has(ip.id));
    toast.info(`Running blacklist check on ${targets.length} IPs...`);
    for (const ip of targets) {
      try {
        await supabase.functions.invoke("check-ip-reputation", { body: { device_id: ip.id } });
      } catch { /* skip */ }
    }
    toast.success("Bulk blacklist check complete");
    setSelected(new Set());
    fetchIPs();
  };

  const handleExportCSV = () => {
    const targets = ips.filter(ip => selected.size > 0 ? selected.has(ip.id) : true);
    const csv = [
      "Name,IP Address,Status,Latency (ms),Blacklist Listings",
      ...targets.map(ip =>
        `"${ip.name}","${ip.ip_address}","${ip.is_up === true ? "UP" : ip.is_up === false ? "DOWN" : "N/A"}",${ip.last_latency_ms ?? ""},${ip.reputation?.active_listings ?? 0}`
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nosteq-ip-monitor-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  // Save note
  const handleSaveNote = async (deviceId: string, text: string) => {
    setSavingNote(deviceId);
    try {
      const { data: existing } = await supabase.from("ip_notes").select("id").eq("device_id", deviceId).maybeSingle();
      if (existing) {
        await supabase.from("ip_notes").update({ note_text: text, updated_at: new Date().toISOString() }).eq("device_id", deviceId);
      } else {
        await supabase.from("ip_notes").insert({ device_id: deviceId, note_text: text });
      }
      setNotes(prev => ({ ...prev, [deviceId]: text }));
      toast.success("Note saved");
    } catch { toast.error("Failed to save note"); }
    finally { setSavingNote(null); }
  };

  const getLatencyBadge = (ms: number | null) => {
    if (ms === null) return { color: "text-muted-foreground", bg: "" };
    if (ms < 100) return { color: "text-[hsl(var(--success))]", bg: "bg-[hsl(var(--success))]/10" };
    if (ms <= 300) return { color: "text-[hsl(var(--warning))]", bg: "bg-[hsl(var(--warning))]/10" };
    return { color: "text-destructive", bg: "bg-destructive/10" };
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[300px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
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
    <div className="space-y-3">
      {/* Search & Filter Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or IP..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="up">UP Only</SelectItem>
            <SelectItem value="down">DOWN Only</SelectItem>
            <SelectItem value="blacklisted">Blacklisted</SelectItem>
          </SelectContent>
        </Select>
        {/* Sort buttons */}
        <div className="flex gap-1">
          {([
            { key: "name" as SortKey, label: "Name" },
            { key: "latency" as SortKey, label: "Latency" },
            { key: "status" as SortKey, label: "Status" },
            { key: "listings" as SortKey, label: "Listings" },
          ]).map(s => (
            <Button
              key={s.key}
              variant={sortKey === s.key ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={() => toggleSort(s.key)}
            >
              {s.label}
              {sortKey === s.key && <ArrowUpDown className="h-3 w-3" />}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleExportCSV}>
          <Download className="h-3.5 w-3.5 mr-1" /> CSV
        </Button>
      </div>

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 animate-in slide-in-from-top-1">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleBulkRefresh}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleBulkBlacklistCheck}>
              <ShieldCheck className="h-3 w-3 mr-1" /> Blacklist Check
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={handleExportCSV}>
              <Download className="h-3 w-3 mr-1" /> Export CSV
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Select All */}
      <div className="flex items-center gap-2 px-2">
        <Checkbox
          checked={selected.size === filteredIps.length && filteredIps.length > 0}
          onCheckedChange={selectAll}
        />
        <span className="text-xs text-muted-foreground">
          {filteredIps.length} IP{filteredIps.length !== 1 ? "s" : ""} shown
        </span>
      </div>

      {/* IP List */}
      {filteredIps.map((ip) => {
        const isUp = ip.is_up === true;
        const isDown = ip.is_up === false;
        const isOpen = expandedId === ip.id;
        const repScore = ip.reputation?.reputation_score ?? null;
        const listings = ip.reputation?.active_listings ?? 0;
        const latencyBadge = getLatencyBadge(ip.last_latency_ms);
        const history = pingHistory[ip.id] || [];

        return (
          <Collapsible key={ip.id} open={isOpen} onOpenChange={(open) => setExpandedId(open ? ip.id : null)}>
            <div className="flex items-center gap-1">
              <Checkbox
                checked={selected.has(ip.id)}
                onCheckedChange={() => toggleSelect(ip.id)}
                className="ml-1"
                onClick={e => e.stopPropagation()}
              />
              <CollapsibleTrigger asChild>
                <div
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") e.currentTarget.click(); }}
                  className={cn(
                    "flex-1 flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all duration-200 text-left cursor-pointer",
                    "hover:bg-accent/50",
                    isOpen ? "bg-accent/30 border-primary/40 rounded-b-none" : "bg-card/50 border-border/50"
                  )}
                >
                  {/* Status dot */}
                  <div className={cn("h-2.5 w-2.5 rounded-full shrink-0", isUp ? "bg-[hsl(var(--success))]" : isDown ? "bg-destructive" : "bg-muted-foreground")} />

                  <span className="font-medium truncate min-w-[80px] max-w-[140px]">{ip.name}</span>
                  <span className="font-mono text-sm text-muted-foreground shrink-0 hidden sm:inline">{ip.ip_address}</span>

                  <Badge variant={isUp ? "default" : isDown ? "destructive" : "secondary"} className="text-xs shrink-0">
                    {isUp ? "UP" : isDown ? "DOWN" : "N/A"}
                  </Badge>

                  {/* Colored latency badge */}
                  <Badge variant="outline" className={cn("text-xs shrink-0 font-mono hidden sm:inline-flex", latencyBadge.color, latencyBadge.bg)}>
                    {ip.last_latency_ms !== null ? `${ip.last_latency_ms}ms` : "—"}
                  </Badge>

                  {/* Mini sparkline */}
                  {history.length > 2 && (
                    <div className="w-16 h-6 hidden md:block shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={history.map((v, i) => ({ i, v }))}>
                          <YAxis domain={["dataMin", "dataMax"]} hide />
                          <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={1.5} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Blacklist indicator */}
                  {listings > 0 && (
                    <div className="flex items-center gap-1 text-xs text-destructive shrink-0">
                      <Shield className="h-3 w-3" /><span>{listings}</span>
                    </div>
                  )}

                  {/* Last checked */}
                  <span className="text-[10px] text-muted-foreground shrink-0 hidden lg:inline">
                    {ip.last_ping_at ? new Date(ip.last_ping_at).toLocaleTimeString() : ""}
                  </span>

                  <div className="ml-auto flex items-center gap-1.5 shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => handlePing(e, ip)} disabled={!!pinging[ip.id]}>
                      <Wifi className={cn("h-3.5 w-3.5", pinging[ip.id] && "animate-pulse text-primary")} />
                    </Button>
                    <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform duration-200", isOpen && "rotate-180")} />
                  </div>
                </div>
              </CollapsibleTrigger>
            </div>

            <CollapsibleContent>
              <div className="border border-t-0 border-primary/40 rounded-b-lg bg-card/80 px-6 py-5 space-y-4 animate-in slide-in-from-top-1 duration-200 ml-7">
                {/* Detail grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <DetailItem label="Status" value={isUp ? "Online" : isDown ? "Offline" : "Unknown"} valueClass={isUp ? "text-[hsl(var(--success))]" : isDown ? "text-destructive" : "text-muted-foreground"} />
                  <DetailItem label="Latency" value={ip.last_latency_ms !== null ? `${ip.last_latency_ms}ms` : "—"} valueClass={latencyBadge.color} />
                  <DetailItem
                    label="Reputation"
                    value={repScore !== null ? `${repScore}/100` : "Not scanned"}
                    valueClass={repScore === null ? "text-muted-foreground" : repScore >= 80 ? "text-[hsl(var(--success))]" : repScore >= 50 ? "text-[hsl(var(--warning))]" : "text-destructive"}
                  />
                  <DetailItem label="Blacklists" value={listings > 0 ? `${listings} active` : "Clean"} valueClass={listings > 0 ? "text-destructive" : "text-[hsl(var(--success))]"} />
                </div>

                {/* Sparkline chart larger */}
                {history.length > 2 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Activity className="h-3 w-3" /> Ping History (last {history.length} pings)</p>
                    <div className="h-16 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={history.map((v, i) => ({ i, v }))}>
                          <YAxis domain={["dataMin", "dataMax"]} hide />
                          <Line type="monotone" dataKey="v" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2, fill: "hsl(var(--primary))" }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {/* Ports */}
                {ip.check_ports && ip.check_ports.length > 0 && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Port Status</p>
                    <div className="flex flex-wrap gap-1.5">
                      {ip.check_ports.map((port) => {
                        const deviceOpenPorts = openPorts[ip.id];
                        const isScanned = deviceOpenPorts !== undefined;
                        const isPortOpen = isScanned && deviceOpenPorts.includes(port);
                        return (
                          <Badge key={port} variant="outline" className={cn("text-xs font-mono gap-1.5 py-0.5",
                            isScanned ? isPortOpen ? "border-[hsl(var(--success))]/50 bg-[hsl(var(--success))]/10 text-[hsl(var(--success))]" : "border-destructive/50 bg-destructive/10 text-destructive" : ""
                          )}>
                            <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", isScanned ? isPortOpen ? "bg-[hsl(var(--success))]" : "bg-destructive" : "bg-muted-foreground")} />
                            {port}{PORT_LABELS[port] ? ` ${PORT_LABELS[port]}` : ""}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <DetailItem label="Check Interval" value={ip.check_interval_minutes ? `${ip.check_interval_minutes} min` : "5 min"} />
                  <DetailItem label="SMS Notify" value={ip.notify_number && ip.notify_number.length > 0 ? ip.notify_number.join(", ") : "Not set"} valueClass={ip.notify_number && ip.notify_number.length > 0 ? undefined : "text-muted-foreground"} />
                  <DetailItem label="Last Check" value={ip.last_ping_at ? new Date(ip.last_ping_at).toLocaleString() : "Never"} />
                  <DetailItem label="Added" value={new Date(ip.created_at).toLocaleDateString()} />
                </div>

                {/* Notes */}
                <div>
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><StickyNote className="h-3 w-3" /> Notes</p>
                  <div className="flex gap-2">
                    <Textarea
                      rows={2}
                      className="text-xs flex-1"
                      placeholder="Add notes about this device..."
                      value={notes[ip.id] || ""}
                      onChange={e => setNotes(prev => ({ ...prev, [ip.id]: e.target.value }))}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="self-end text-xs"
                      disabled={savingNote === ip.id}
                      onClick={() => handleSaveNote(ip.id, notes[ip.id] || "")}
                    >
                      {savingNote === ip.id ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 pt-2 border-t border-border/50 flex-wrap">
                  <Button variant="outline" size="sm" onClick={(e) => handlePing(e, ip)} disabled={!!pinging[ip.id]}>
                    <Wifi className={cn("h-3.5 w-3.5 mr-1.5", pinging[ip.id] && "animate-pulse")} />
                    {pinging[ip.id] ? "Pinging..." : "Refresh"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={async (e) => {
                    e.stopPropagation();
                    toast.info("Running blacklist check...");
                    try {
                      await supabase.functions.invoke("check-ip-reputation", { body: { device_id: ip.id } });
                      toast.success("Blacklist check complete");
                      fetchIPs();
                    } catch { toast.error("Check failed"); }
                  }}>
                    <ShieldCheck className="h-3.5 w-3.5 mr-1.5" /> Blacklist Check
                  </Button>
                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setEditDevice(ip); }}>
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); setLinkTarget(ip); }}>
                    <Server className="h-3.5 w-3.5 mr-1.5" /> Link to Server
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); setDeleteTarget(ip); }}>
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Remove
                  </Button>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        );
      })}

      <EditIPDialog device={editDevice} open={!!editDevice} onOpenChange={(open) => { if (!open) setEditDevice(null); }} onSaved={fetchIPs} />
      <DeleteIPDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} deviceName={deleteTarget?.name ?? ""} ipAddress={deleteTarget?.ip_address ?? ""} onConfirm={handleDeleteConfirm} />
      <LinkToServerDialog open={!!linkTarget} onOpenChange={(open) => !open && setLinkTarget(null)} deviceId={linkTarget?.id ?? ""} deviceName={linkTarget?.name ?? ""} onLinked={fetchIPs} />
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
