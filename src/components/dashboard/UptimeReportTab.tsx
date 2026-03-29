import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Download, TrendingUp, TrendingDown, Clock, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, AreaChart, Area,
} from "recharts";
import { format, subDays, subHours, differenceInMinutes, parseISO } from "date-fns";

type DateRange = "24h" | "7d" | "30d" | "90d";

interface DeviceRow {
  id: string;
  name: string;
  ip_address: string;
  is_up: boolean | null;
  last_ping_at: string | null;
  created_at: string;
}

interface DowntimeEvent {
  device_id: string;
  device_name: string;
  ip_address: string;
  event_type: string;
  sent_at: string;
}

interface UptimeStats {
  device_id: string;
  name: string;
  ip_address: string;
  uptimePercent: number;
  downtimeMinutes: number;
  totalDownEvents: number;
  avgDowntimeDuration: number;
  currentStatus: boolean | null;
}

export const UptimeReportTab = () => {
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [events, setEvents] = useState<DowntimeEvent[]>([]);
  const [range, setRange] = useState<DateRange>("7d");
  const [loading, setLoading] = useState(true);

  const rangeStart = useMemo(() => {
    const now = new Date();
    switch (range) {
      case "24h": return subHours(now, 24);
      case "7d": return subDays(now, 7);
      case "30d": return subDays(now, 30);
      case "90d": return subDays(now, 90);
    }
  }, [range]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [devRes, logRes] = await Promise.all([
        supabase.from("devices").select("id, name, ip_address, is_up, last_ping_at, created_at"),
        supabase
          .from("notification_log")
          .select("*")
          .in("event_type", ["down", "up"])
          .gte("sent_at", rangeStart.toISOString())
          .order("sent_at", { ascending: true }),
      ]);

      if (devRes.data) setDevices(devRes.data);
      if (logRes.data) {
        const mapped: DowntimeEvent[] = logRes.data.map((l) => {
          const dev = devRes.data?.find((d) => d.ip_address === l.ip_address);
          return {
            device_id: dev?.id || "",
            device_name: dev?.name || l.ip_address,
            ip_address: l.ip_address,
            event_type: l.event_type,
            sent_at: l.sent_at || "",
          };
        });
        setEvents(mapped);
      }
      setLoading(false);
    };
    load();
  }, [rangeStart]);

  const stats: UptimeStats[] = useMemo(() => {
    const now = new Date();
    const totalMinutes = differenceInMinutes(now, rangeStart);

    return devices.map((dev) => {
      const devEvents = events
        .filter((e) => e.ip_address === dev.ip_address)
        .sort((a, b) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime());

      let downtimeMinutes = 0;
      let downCount = 0;
      let lastDownAt: Date | null = null;

      for (const ev of devEvents) {
        if (ev.event_type === "down") {
          if (!lastDownAt) {
            lastDownAt = new Date(ev.sent_at);
            downCount++;
          }
        } else if (ev.event_type === "up" && lastDownAt) {
          downtimeMinutes += differenceInMinutes(new Date(ev.sent_at), lastDownAt);
          lastDownAt = null;
        }
      }

      // If still down, count until now
      if (lastDownAt) {
        downtimeMinutes += differenceInMinutes(now, lastDownAt);
      }

      const uptimePercent = totalMinutes > 0
        ? Math.max(0, Math.min(100, ((totalMinutes - downtimeMinutes) / totalMinutes) * 100))
        : 100;

      return {
        device_id: dev.id,
        name: dev.name,
        ip_address: dev.ip_address,
        uptimePercent: Math.round(uptimePercent * 100) / 100,
        downtimeMinutes,
        totalDownEvents: downCount,
        avgDowntimeDuration: downCount > 0 ? Math.round(downtimeMinutes / downCount) : 0,
        currentStatus: dev.is_up,
      };
    });
  }, [devices, events, rangeStart]);

  const chartData = useMemo(() => {
    return stats
      .sort((a, b) => a.uptimePercent - b.uptimePercent)
      .map((s) => ({
        name: s.name.length > 12 ? s.name.slice(0, 12) + "…" : s.name,
        fullName: s.name,
        uptime: s.uptimePercent,
        downtime: Math.round((100 - s.uptimePercent) * 100) / 100,
      }));
  }, [stats]);

  const timelineData = useMemo(() => {
    const buckets: Record<string, Record<string, number>> = {};
    const bucketFormat = range === "24h" ? "HH:00" : "MMM dd";

    events.forEach((ev) => {
      if (ev.event_type !== "down") return;
      const key = format(parseISO(ev.sent_at), bucketFormat);
      if (!buckets[key]) buckets[key] = {};
      buckets[key][ev.device_name] = (buckets[key][ev.device_name] || 0) + 1;
    });

    return Object.entries(buckets)
      .map(([time, devCounts]) => ({ time, ...devCounts, total: Object.values(devCounts).reduce((a, b) => a + b, 0) }))
      .sort((a, b) => a.time.localeCompare(b.time));
  }, [events, range]);

  const exportCSV = () => {
    const header = "Device,IP Address,Uptime %,Downtime (min),Down Events,Avg Duration (min),Current Status\n";
    const rows = stats.map((s) =>
      `"${s.name}","${s.ip_address}",${s.uptimePercent},${s.downtimeMinutes},${s.totalDownEvents},${s.avgDowntimeDuration},${s.currentStatus ? "UP" : "DOWN"}`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `uptime-report-${range}-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  };

  const getUptimeColor = (pct: number) => {
    if (pct >= 99.9) return "text-[hsl(var(--success))]";
    if (pct >= 99) return "text-[hsl(var(--warning))]";
    return "text-destructive";
  };

  const getUptimeBg = (pct: number) => {
    if (pct >= 99.9) return "hsl(142, 76%, 36%)";
    if (pct >= 99) return "hsl(45, 93%, 47%)";
    return "hsl(0, 84%, 60%)";
  };

  const overallUptime = stats.length > 0
    ? Math.round((stats.reduce((a, s) => a + s.uptimePercent, 0) / stats.length) * 100) / 100
    : 100;

  const totalDownEvents = stats.reduce((a, s) => a + s.totalDownEvents, 0);
  const worstDevice = stats.length > 0 ? stats.reduce((a, b) => a.uptimePercent < b.uptimePercent ? a : b) : null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Clock className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">Uptime Report</h2>
          <p className="text-sm text-muted-foreground">Network availability analytics across all monitored IPs</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={range} onValueChange={(v) => setRange(v as DateRange)}>
            <SelectTrigger className="w-[130px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Last 24h</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
              <SelectItem value="90d">Last 90 Days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={exportCSV}>
            <Download className="h-4 w-4 mr-2" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Overall Uptime</p>
                <p className={`text-3xl font-bold ${getUptimeColor(overallUptime)}`}>{overallUptime}%</p>
              </div>
              <TrendingUp className="h-8 w-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Monitored IPs</p>
                <p className="text-3xl font-bold">{devices.length}</p>
              </div>
              <Wifi className="h-8 w-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Down Events</p>
                <p className="text-3xl font-bold text-destructive">{totalDownEvents}</p>
              </div>
              <WifiOff className="h-8 w-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Worst Device</p>
                <p className="text-lg font-bold truncate">{worstDevice?.name || "—"}</p>
                {worstDevice && (
                  <p className={`text-sm ${getUptimeColor(worstDevice.uptimePercent)}`}>{worstDevice.uptimePercent}%</p>
                )}
              </div>
              <TrendingDown className="h-8 w-8 text-muted-foreground/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Uptime Bar Chart */}
      {chartData.length > 0 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Uptime by Device</CardTitle>
          </CardHeader>
          <CardContent>
            <div style={{ height: Math.max(250, chartData.length * 40) }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" width={75} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
                    formatter={(value: number, name: string) => [
                      `${value}%`,
                      name === "uptime" ? "Uptime" : "Downtime",
                    ]}
                    labelFormatter={(label) => {
                      const item = chartData.find((c) => c.name === label);
                      return item?.fullName || label;
                    }}
                  />
                  <Bar dataKey="uptime" stackId="a" fill="hsl(142, 76%, 36%)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="downtime" stackId="a" fill="hsl(0, 84%, 60%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Downtime Timeline */}
      {timelineData.length > 0 && (
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base">Downtime Events Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timelineData} margin={{ left: 10, right: 10, top: 5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Area type="monotone" dataKey="total" stroke="hsl(0, 84%, 60%)" fill="hsl(0, 84%, 60%)" fillOpacity={0.2} name="Down Events" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Per-Device Table */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base">Per-Device Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/50">
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Device</th>
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">IP</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Uptime</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Downtime</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Events</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Avg Duration</th>
                  <th className="text-center py-2 px-3 text-muted-foreground font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats
                  .sort((a, b) => a.uptimePercent - b.uptimePercent)
                  .map((s) => (
                    <tr key={s.device_id} className="border-b border-border/30 hover:bg-muted/30">
                      <td className="py-2.5 px-3 font-medium">{s.name}</td>
                      <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground">{s.ip_address}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`font-bold ${getUptimeColor(s.uptimePercent)}`}>{s.uptimePercent}%</span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {s.downtimeMinutes < 60
                          ? `${s.downtimeMinutes}m`
                          : `${Math.floor(s.downtimeMinutes / 60)}h ${s.downtimeMinutes % 60}m`}
                      </td>
                      <td className="py-2.5 px-3 text-right">{s.totalDownEvents}</td>
                      <td className="py-2.5 px-3 text-right text-muted-foreground">
                        {s.avgDowntimeDuration > 0 ? `${s.avgDowntimeDuration}m` : "—"}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant={s.currentStatus ? "default" : "destructive"} className="text-xs">
                          {s.currentStatus ? "UP" : "DOWN"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
