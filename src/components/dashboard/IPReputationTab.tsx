import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Shield, Search, AlertTriangle, CheckCircle, Clock, ShieldAlert, Lightbulb, History, Calendar, CalendarIcon, Filter, X, TrendingUp, RefreshCw, Info, Flame } from "lucide-react";
import { toast } from "sonner";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { format, isAfter, isBefore, startOfDay, endOfDay, subHours, subDays } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { Switch } from "@/components/ui/switch";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

// ── Provider insight database ──
const PROVIDER_INSIGHTS: Record<string, { reason: string; firewall: string; category: string }> = {
  "Spamhaus ZEN": { reason: "Your IP was detected sending spam, hosting malware, or part of a botnet. ZEN is a combined list (SBL+XBL+PBL).", firewall: "Block outbound SMTP (port 25) for all subscribers. Use connection rate limiting.", category: "spam/malware" },
  "Spamhaus SBL": { reason: "Direct spam source or spam operation detected from your IP range.", firewall: "Block port 25 outbound, investigate which subscriber is sending bulk email.", category: "spam" },
  "Spamhaus XBL": { reason: "Exploited system (virus/trojan/botnet) detected sending spam from your network.", firewall: "Rate-limit outbound connections per subscriber. Block port 25. Scan for compromised hosts.", category: "botnet/exploit" },
  "Spamhaus PBL": { reason: "Your IP is in a dynamic/residential range that should not send email directly.", firewall: "No firewall fix needed — configure mail to relay through an authorized SMTP server with proper rDNS.", category: "policy" },
  "Barracuda": { reason: "Spam or malicious email traffic detected from your IP.", firewall: "Block outbound SMTP (port 25). Set up SPF/DKIM/DMARC records.", category: "spam" },
  "SpamCop": { reason: "Users reported receiving spam from your IP address.", firewall: "Block port 25 for non-mail-server subscribers. Monitor abuse complaints.", category: "spam" },
  "SORBS Combined": { reason: "Detected as open relay, open proxy, or spam source.", firewall: "Block open relay ports (25, 587). Ensure no open proxies on ports 1080, 3128, 8080.", category: "spam/proxy" },
  "SORBS Spam": { reason: "Active spam sending detected from your IP.", firewall: "Block port 25 outbound for all non-authorized hosts.", category: "spam" },
  "SORBS New Spam": { reason: "Recently started sending spam from your IP.", firewall: "Immediately block port 25 and investigate the source subscriber.", category: "spam" },
  "SORBS Recent Spam": { reason: "Spam activity detected in the recent past.", firewall: "Block port 25 and submit delisting request after resolving.", category: "spam" },
  "UCEProtect L1": { reason: "Individual IP detected sending spam or malicious traffic.", firewall: "Block port 25, rate-limit connections, investigate source.", category: "spam" },
  "UCEProtect L2": { reason: "Multiple IPs in your /24 subnet are listed — network-wide abuse detected.", firewall: "Apply subnet-wide SMTP blocking and aggressive rate limiting. Contact upstream.", category: "network abuse" },
  "UCEProtect L3": { reason: "Your entire ASN/provider range has abuse issues.", firewall: "Implement BCP38, block port 25 network-wide, enable uRPF.", category: "network abuse" },
  "CBL (Abuseat)": { reason: "Botnet or virus activity detected — your IP is sending spam via compromised device.", firewall: "Block port 25, rate-limit new connections (100/min per subscriber), detect port scanning.", category: "botnet" },
  "PSBL": { reason: "Passive spam block — your IP sent email to a spamtrap.", firewall: "Block port 25 for residential/dynamic IPs.", category: "spam" },
  "DroneBL": { reason: "Open proxy, botnet drone, or IRC abuse detected from your IP.", firewall: "Block proxy ports (1080, 3128, 8080), rate-limit IRC (6667), block port 25.", category: "botnet/proxy" },
  "WPBL": { reason: "Your IP sent unsolicited email to a monitored address.", firewall: "Block outbound SMTP for non-mail hosts.", category: "spam" },
  "Mailspike": { reason: "Poor email sending reputation based on behavior analysis.", firewall: "Ensure proper rDNS, SPF, DKIM. Block port 25 for non-mail hosts.", category: "reputation" },
  "NiX Spam": { reason: "German spam blacklist — detected spam from your IP.", firewall: "Block outbound SMTP, ensure proper email authentication.", category: "spam" },
  "TruncateGBUDB": { reason: "Poor sender reputation based on email pattern analysis.", firewall: "Block port 25, implement rate limiting on email connections.", category: "reputation" },
  "abuse.ch Spam": { reason: "Malware or spam distribution detected by abuse.ch.", firewall: "Block known C&C ports, rate-limit connections, block port 25.", category: "malware" },
  "InterServer": { reason: "Spam or abuse detected from your IP.", firewall: "Block port 25, rate-limit outbound connections.", category: "spam" },
  "0spam": { reason: "Automated spam detection flagged your IP.", firewall: "Block outbound SMTP for non-authorized hosts.", category: "spam" },
  "s5h.net": { reason: "Detected as spam source or open relay.", firewall: "Block port 25, close open relays.", category: "spam" },
  "INPS": { reason: "Spam or abuse detected from your IP.", firewall: "Block port 25, investigate source.", category: "spam" },
  "Blocklist.de DNSBL": { reason: "Brute-force attacks, DDoS, or spam detected from your IP.", firewall: "Rate-limit SSH/FTP (max 5 attempts/min). Block port 25. Enable port scan detection.", category: "brute force" },
  "Blocklist.de": { reason: "Attack traffic (brute-force, DDoS, spam) reported from your IP.", firewall: "Rate-limit connections, block common attack ports, enable PSD (Port Scan Detection).", category: "brute force" },
  "DNSRBL": { reason: "General blacklist detection — spam or abuse.", firewall: "Block port 25, apply standard anti-abuse firewall rules.", category: "spam" },
  "HostKarma": { reason: "Poor sending reputation or suspicious traffic patterns.", firewall: "Block port 25, ensure rDNS is configured, implement rate limiting.", category: "reputation" },
  "UBL Unsubscore": { reason: "High unsubscribe rate detected — likely sending unwanted email.", firewall: "Block port 25 for non-mail hosts. Review mail server configuration.", category: "spam" },
  "AbuseIPDB": { reason: "Multiple abuse reports filed against your IP (brute-force, DDoS, scanning, spam).", firewall: "Rate-limit connections (100/min), enable port scan detection, block port 25, drop bogon traffic.", category: "general abuse" },
  "VirusTotal": { reason: "Multiple security vendors flagged your IP for malware, phishing, or malicious activity.", firewall: "Block known malware ports, rate-limit connections, implement DNS filtering.", category: "malware" },
  "IPQualityScore": { reason: "High fraud score — detected as proxy, VPN, tor exit, or bot traffic source.", firewall: "Block proxy ports (1080, 3128, 8080), block tor exit traffic, rate-limit connections.", category: "proxy/fraud" },
  "IP-API (Proxy/Hosting)": { reason: "Your IP is flagged as a hosting/proxy IP — may affect email deliverability.", firewall: "Ensure proper rDNS. This is informational — hosting IPs are often flagged but not necessarily abusive.", category: "informational" },
};

const getProviderInsight = (provider: string) => {
  return PROVIDER_INSIGHTS[provider] || {
    reason: "This provider detected suspicious or abusive activity from your IP address.",
    firewall: "Block outbound SMTP (port 25), rate-limit connections, and review firewall rules.",
    category: "unknown",
  };
};

// Auto-refresh intervals
const AUTO_REFRESH_OPTIONS = [
  { label: "Off", value: 0 },
  { label: "5 min", value: 5 * 60 },
  { label: "15 min", value: 15 * 60 },
  { label: "30 min", value: 30 * 60 },
  { label: "1 hour", value: 60 * 60 },
];

interface Device {
  id: string;
  name: string;
  ip_address: string;
}

interface ScanResult {
  provider: string;
  listed: boolean;
  confidence: number;
  type: string;
  category: string | null;
}

interface ReputationSummary {
  reputation_score: number;
  active_listings: number;
  total_listings: number;
  last_scan_at: string | null;
}

interface HistoryEntry {
  id: string;
  provider: string;
  ip_address: string;
  scanned_at: string;
  confidence_score: number | null;
}

interface GroupedHistory {
  date: string;
  entries: HistoryEntry[];
  listedCount: number;
}

interface ReputationPoint {
  date: string;
  score: number;
  listings: number;
}

type TrendRange = "24h" | "7d" | "30d";

export const IPReputationTab = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [summary, setSummary] = useState<ReputationSummary | null>(null);
  const [lastResults, setLastResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [allHistoryEntries, setAllHistoryEntries] = useState<HistoryEntry[]>([]);
  const [reputationTrend, setReputationTrend] = useState<ReputationPoint[]>([]);
  const [trendRange, setTrendRange] = useState<TrendRange>("30d");

  // Filter states
  const [providerFilter, setProviderFilter] = useState<string>("all");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);

  // Get unique providers from history
  const uniqueProviders = useMemo(() => {
    const providers = new Set(allHistoryEntries.map(e => e.provider));
    return Array.from(providers).sort();
  }, [allHistoryEntries]);

  // Filter and group history
  const filteredHistory = useMemo(() => {
    let filtered = allHistoryEntries;

    // Apply provider filter
    if (providerFilter !== "all") {
      filtered = filtered.filter(e => e.provider === providerFilter);
    }

    // Apply date range filter
    if (startDate) {
      filtered = filtered.filter(e => !isBefore(new Date(e.scanned_at), startOfDay(startDate)));
    }
    if (endDate) {
      filtered = filtered.filter(e => !isAfter(new Date(e.scanned_at), endOfDay(endDate)));
    }

    // Group by date
    const grouped = filtered.reduce((acc: Record<string, HistoryEntry[]>, entry) => {
      const date = format(new Date(entry.scanned_at), "yyyy-MM-dd");
      if (!acc[date]) acc[date] = [];
      acc[date].push(entry);
      return acc;
    }, {});

    return Object.entries(grouped).map(([date, entries]) => ({
      date,
      entries,
      listedCount: entries.length,
    }));
  }, [allHistoryEntries, providerFilter, startDate, endDate]);

  const clearFilters = () => {
    setProviderFilter("all");
    setStartDate(undefined);
    setEndDate(undefined);
  };

  const hasActiveFilters = providerFilter !== "all" || startDate || endDate;

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("devices").select("id, name, ip_address").order("name");
      setDevices(data || []);
      if (data && data.length > 0) {
        setSelectedDevice(data[0].id);
      }
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    if (!selectedDevice) return;
    const loadSummary = async () => {
      const { data: rep } = await supabase
        .from("ip_reputation_summary")
        .select("*")
        .eq("device_id", selectedDevice)
        .maybeSingle();
      setSummary(rep);

      const { data: scans } = await supabase
        .from("blacklist_scans")
        .select("provider, confidence_score, raw_response")
        .eq("device_id", selectedDevice)
        .order("scanned_at", { ascending: false })
        .limit(50);

      if (scans) {
        setLastResults(scans.map((s: any) => ({
          provider: s.provider,
          listed: (s.confidence_score ?? 0) > 0,
          confidence: s.confidence_score ?? 0,
          type: "check",
          category: null,
        })));
      }

      // Load history for timeline (only listings)
      const { data: historyData } = await supabase
        .from("blacklist_scans")
        .select("id, provider, ip_address, scanned_at, confidence_score")
        .eq("device_id", selectedDevice)
        .gt("confidence_score", 0)
        .order("scanned_at", { ascending: false })
        .limit(500);

      if (historyData) {
        setAllHistoryEntries(historyData);
        // Clear filters when device changes
        setProviderFilter("all");
        setStartDate(undefined);
        setEndDate(undefined);
      }

    };
    loadSummary();
  }, [selectedDevice]);

  // Load reputation trend based on range
  const loadTrend = async (deviceId: string, range: TrendRange) => {
    const now = new Date();
    const since = range === "24h" ? subHours(now, 24) : range === "7d" ? subDays(now, 7) : subDays(now, 30);
    const dateFormat = range === "24h" ? "HH:mm" : "MMM d, HH:mm";

    const { data: trendData } = await supabase
      .from("reputation_history")
      .select("reputation_score, active_listings, recorded_at")
      .eq("device_id", deviceId)
      .gte("recorded_at", since.toISOString())
      .order("recorded_at", { ascending: true })
      .limit(200);

    if (trendData) {
      setReputationTrend(trendData.map((r: any) => ({
        date: format(new Date(r.recorded_at), dateFormat),
        score: r.reputation_score,
        listings: r.active_listings,
      })));
    }
  };

  useEffect(() => {
    if (!selectedDevice) return;
    loadTrend(selectedDevice, trendRange);
  }, [selectedDevice, trendRange]);

  const handleScan = async () => {
    if (!selectedDevice) return;
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("check-ip-reputation", {
        body: { device_id: selectedDevice },
      });
      if (error) throw error;
      if (data?.results?.[0]) {
        const r = data.results[0];
        toast.success(`Scan complete: Score ${r.reputation_score}/100, ${r.listings} listings found`);
        
        const { data: rep } = await supabase
          .from("ip_reputation_summary")
          .select("*")
          .eq("device_id", selectedDevice)
          .maybeSingle();
        setSummary(rep);

        if (r.details) {
          setLastResults(r.details);
        }

        // Refresh trend chart
        await loadTrend(selectedDevice, trendRange);
      }
    } catch (e) {
      console.error("Scan failed:", e);
      toast.error("Scan failed");
    } finally {
      setScanning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const device = devices.find((d) => d.id === selectedDevice);
  const scoreColor = !summary
    ? "text-muted-foreground"
    : summary.reputation_score >= 80
    ? "text-[hsl(var(--success))]"
    : summary.reputation_score >= 50
    ? "text-[hsl(var(--warning))]"
    : "text-destructive";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Select value={selectedDevice} onValueChange={setSelectedDevice}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Select IP" />
          </SelectTrigger>
          <SelectContent>
            {devices.map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name} ({d.ip_address})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleScan} disabled={scanning || !selectedDevice}>
          {scanning ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning 34+ providers...</>
          ) : (
            <><Search className="h-4 w-4 mr-2" /> Run Blacklist Scan</>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardDescription>IP Address</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-lg font-bold">{device?.ip_address ?? "—"}</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardDescription>Reputation Score</CardDescription>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold font-mono ${scoreColor}`}>
              {summary ? `${summary.reputation_score}` : "—"}
              <span className="text-sm text-muted-foreground font-normal">/100</span>
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardDescription>Active Listings</CardDescription>
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold font-mono ${summary && summary.active_listings > 0 ? "text-destructive" : "text-[hsl(var(--success))]"}`}>
              {summary ? summary.active_listings : "—"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardDescription>Last Scan</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-mono">
              {summary?.last_scan_at ? new Date(summary.last_scan_at).toLocaleString() : "Never"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Reputation Trend Chart */}
      <Card className="border-border/50">
        <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-5 w-5" /> Reputation Score Trend
            </CardTitle>
            <CardDescription className="mt-1">
              {reputationTrend.length > 0
                ? `Score history across ${reputationTrend.length} scan${reputationTrend.length > 1 ? "s" : ""} — higher is better`
                : "Run a scan to start tracking reputation trends over time"}
            </CardDescription>
          </div>
          <div className="flex gap-1">
            {(["24h", "7d", "30d"] as TrendRange[]).map((range) => (
              <Button
                key={range}
                variant={trendRange === range ? "default" : "outline"}
                size="sm"
                className="h-7 px-2.5 text-xs"
                onClick={() => setTrendRange(range)}
              >
                {range}
              </Button>
            ))}
          </div>
        </div>
        </CardHeader>
        <CardContent>
          {reputationTrend.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[180px] text-muted-foreground gap-2">
              <TrendingUp className="h-10 w-10 opacity-30" />
              <p className="text-sm">No trend data yet — run a scan to begin</p>
            </div>
          ) : (
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={reputationTrend} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    tickLine={false}
                    axisLine={false}
                    ticks={[0, 25, 50, 75, 100]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                      color: "hsl(var(--popover-foreground))",
                    }}
                    formatter={(value: number, name: string) => [
                      name === "score" ? `${value}/100` : value,
                      name === "score" ? "Reputation Score" : "Active Listings",
                    ]}
                  />
                  <ReferenceLine y={80} stroke="hsl(var(--success))" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <ReferenceLine y={50} stroke="hsl(var(--warning))" strokeDasharray="4 4" strokeOpacity={0.5} />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#scoreGradient)"
                    dot={{ fill: "hsl(var(--primary))", r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5, fill: "hsl(var(--primary))" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground justify-end">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-6 border-t-2 border-dashed border-[hsl(var(--success))]" />
                  Good (≥80)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-6 border-t-2 border-dashed border-[hsl(var(--warning))]" />
                  Fair (≥50)
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {lastResults.length > 0 && (

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-5 w-5" /> Scan Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {lastResults.map((r, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between px-3 py-2 rounded-md text-sm ${
                    r.listed ? "bg-destructive/10 border border-destructive/20" : "bg-card border border-border/30"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {r.listed ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                    ) : (
                      <CheckCircle className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                    )}
                    <span className="truncate">{r.provider}</span>
                  </div>
                  <Badge variant={r.listed ? "destructive" : "secondary"} className="text-xs">
                    {r.listed ? "Listed" : "Clean"}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Blacklist History Timeline */}
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <History className="h-5 w-5" /> Blacklisting History Timeline
              </CardTitle>
              <CardDescription className="mt-1">
                Historical record of blacklist detections for this IP address.
                {allHistoryEntries.length > 0 && (
                  <span className="ml-1">
                    {filteredHistory.reduce((sum, g) => sum + g.listedCount, 0)} of {allHistoryEntries.length} shown
                  </span>
                )}
              </CardDescription>
            </div>
            {/* Filters */}
            {allHistoryEntries.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <Filter className="h-4 w-4 text-muted-foreground" />
                {/* Provider filter */}
                <Select value={providerFilter} onValueChange={setProviderFilter}>
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder="All providers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All providers</SelectItem>
                    {uniqueProviders.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {/* Start date */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1.5", !startDate && "text-muted-foreground")}>
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {startDate ? format(startDate, "MMM d, yyyy") : "From date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={startDate}
                      onSelect={setStartDate}
                      disabled={(date) => endDate ? isAfter(date, endDate) : false}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                {/* End date */}
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("h-8 text-xs gap-1.5", !endDate && "text-muted-foreground")}>
                      <CalendarIcon className="h-3.5 w-3.5" />
                      {endDate ? format(endDate, "MMM d, yyyy") : "To date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={endDate}
                      onSelect={setEndDate}
                      disabled={(date) => startDate ? isBefore(date, startDate) : false}
                      initialFocus
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                {/* Clear filters */}
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-xs gap-1" onClick={clearFilters}>
                    <X className="h-3.5 w-3.5" /> Clear
                  </Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {allHistoryEntries.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-3 text-[hsl(var(--success))]" />
              <p className="font-medium">No blacklist detections</p>
              <p className="text-sm">This IP has not been found on any blacklists.</p>
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Filter className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="font-medium">No results match filters</p>
              <Button variant="link" size="sm" className="mt-1 text-xs" onClick={clearFilters}>Clear filters</Button>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
              
              <div className="space-y-6">
                {filteredHistory.map((group) => (
                  <div key={group.date} className="relative pl-10">
                    {/* Timeline dot */}
                    <div className="absolute left-2.5 top-1 w-3 h-3 rounded-full bg-destructive border-2 border-background" />
                    
                    {/* Date header */}
                    <div className="flex items-center gap-2 mb-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">
                        {format(new Date(group.date), "MMMM d, yyyy")}
                      </span>
                      <Badge variant="destructive" className="text-xs">
                        {group.listedCount} {group.listedCount === 1 ? "listing" : "listings"}
                      </Badge>
                    </div>
                    
                    {/* Entries for this date */}
                    <div className="space-y-1.5">
                      {group.entries.map((entry) => (
                        <div
                          key={entry.id}
                          className="flex items-center justify-between px-3 py-2 rounded-md text-sm bg-destructive/5 border border-destructive/20"
                        >
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                            <span className="font-mono text-xs text-muted-foreground">
                              {format(new Date(entry.scanned_at), "HH:mm")}
                            </span>
                            <span className="truncate">{entry.provider}</span>
                          </div>
                          <Badge variant="outline" className="text-xs font-mono">
                            {entry.ip_address}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto-scan status */}
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-5 w-5" /> Automated Scanning
          </CardTitle>
          <CardDescription>
            Blacklist scans run automatically every <strong>6 hours</strong> for all devices.
            Manual scans can be triggered anytime above.
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Anti-Blacklisting Recommendations */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-[hsl(var(--warning))]" /> Anti-Blacklisting Rules & Recommendations
          </CardTitle>
          <CardDescription>
            MikroTik firewall rules and best practices to prevent your IPs from getting blacklisted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="multiple" className="w-full">
            <AccordionItem value="smtp-blocking">
              <AccordionTrigger className="text-sm font-medium">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-destructive" />
                  Block Outbound SMTP (Port 25) — Prevents Spam Blacklisting
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Most blacklistings occur because compromised devices send spam via port 25. Block it for all subscribers except authorized mail servers.
                  </p>
                  <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`/ip firewall filter
add chain=forward protocol=tcp dst-port=25 \\
    src-address-list=!authorized-smtp \\
    action=drop comment="Block outbound SMTP - anti-spam"

/ip firewall address-list
add list=authorized-smtp address=<mail-server-ip> \\
    comment="Authorized mail server"`}
                  </pre>
                  <Badge variant="destructive" className="text-xs">Critical — #1 cause of blacklisting</Badge>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="dns-amplification">
              <AccordionTrigger className="text-sm font-medium">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-[hsl(var(--warning))]" />
                  Block DNS Amplification Attacks (Port 53)
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Open DNS resolvers are exploited for DDoS amplification attacks, leading to IP blacklisting. Only allow DNS to your resolvers.
                  </p>
                  <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`/ip firewall filter
add chain=forward protocol=udp dst-port=53 \\
    dst-address-list=!trusted-dns action=drop \\
    comment="Block DNS to non-trusted resolvers"

add chain=input protocol=udp dst-port=53 \\
    in-interface-list=WAN action=drop \\
    comment="Block external DNS queries to router"

/ip firewall address-list
add list=trusted-dns address=8.8.8.8 comment="Google DNS"
add list=trusted-dns address=1.1.1.1 comment="Cloudflare DNS"`}
                  </pre>
                  <Badge className="bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30 text-xs">High priority</Badge>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="rate-limiting">
              <AccordionTrigger className="text-sm font-medium">
                <div className="flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-[hsl(var(--warning))]" />
                  Rate-Limit Outbound Connections — Prevent Botnets & Brute Force
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Limit the number of new outbound connections per subscriber to detect and throttle compromised devices running botnets or brute-force attacks.
                  </p>
                  <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`/ip firewall filter
add chain=forward protocol=tcp connection-state=new \\
    connection-limit=100,32 action=add-src-to-address-list \\
    address-list=rate-limited address-list-timeout=1h \\
    comment="Detect high connection rate clients"

add chain=forward src-address-list=rate-limited \\
    action=drop comment="Drop traffic from rate-limited hosts"`}
                  </pre>
                  <Badge className="bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30 text-xs">High priority</Badge>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="ntp-ssdp">
              <AccordionTrigger className="text-sm font-medium">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Block NTP & SSDP Amplification (Ports 123, 1900)
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    NTP and SSDP protocols are commonly abused for DDoS amplification. Block inbound requests from WAN.
                  </p>
                  <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`/ip firewall filter
add chain=input protocol=udp dst-port=123 \\
    in-interface-list=WAN action=drop \\
    comment="Block NTP amplification from WAN"

add chain=input protocol=udp dst-port=1900 \\
    in-interface-list=WAN action=drop \\
    comment="Block SSDP amplification from WAN"

add chain=forward protocol=udp dst-port=1900 \\
    action=drop comment="Block SSDP forwarding"`}
                  </pre>
                  <Badge variant="secondary" className="text-xs">Recommended</Badge>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="bogon-filtering">
              <AccordionTrigger className="text-sm font-medium">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Drop Bogon & Spoofed Traffic
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Prevent spoofed source IPs from leaving your network. Many RBLs flag networks that allow spoofed traffic.
                  </p>
                  <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`/ip firewall address-list
add list=bogons address=0.0.0.0/8 comment="RFC 1122"
add list=bogons address=10.0.0.0/8 comment="RFC 1918"
add list=bogons address=100.64.0.0/10 comment="RFC 6598"
add list=bogons address=127.0.0.0/8 comment="Loopback"
add list=bogons address=169.254.0.0/16 comment="Link-local"
add list=bogons address=172.16.0.0/12 comment="RFC 1918"
add list=bogons address=192.168.0.0/16 comment="RFC 1918"
add list=bogons address=224.0.0.0/4 comment="Multicast"

/ip firewall filter
add chain=forward src-address-list=bogons \\
    out-interface-list=WAN action=drop \\
    comment="Drop bogon sources going to WAN"`}
                  </pre>
                  <Badge variant="secondary" className="text-xs">Recommended</Badge>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="port-scan">
              <AccordionTrigger className="text-sm font-medium">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  Detect & Block Port Scanning from Subscribers
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Port scanning from your network gets reported to abuse databases. Detect and auto-block scanning hosts.
                  </p>
                  <pre className="bg-muted p-3 rounded-md text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`/ip firewall filter
add chain=forward protocol=tcp psd=21,3s,3,1 \\
    action=add-src-to-address-list \\
    address-list=port-scanners address-list-timeout=2w \\
    comment="Detect port scanners"

add chain=forward src-address-list=port-scanners \\
    action=drop comment="Block detected port scanners"`}
                  </pre>
                  <Badge variant="secondary" className="text-xs">Recommended</Badge>
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="best-practices">
              <AccordionTrigger className="text-sm font-medium">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-4 w-4 text-[hsl(var(--success))]" />
                  General Best Practices
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <ul className="list-disc pl-5 space-y-1.5">
                    <li><strong>Set up rDNS (PTR records)</strong> — Ensure all your public IPs have proper reverse DNS. Missing rDNS is flagged by many RBLs.</li>
                    <li><strong>Configure SPF, DKIM, DMARC</strong> — If you host mail services, these DNS records prevent your domain from being used in spam.</li>
                    <li><strong>Monitor abuse@ mailbox</strong> — Respond to abuse complaints within 24 hours to avoid escalation to blacklists.</li>
                    <li><strong>Implement BCP38/uRPF</strong> — Enable unicast Reverse Path Forwarding to prevent IP spoofing from your network.</li>
                    <li><strong>Regularly update RouterOS</strong> — Keep MikroTik firmware up to date to patch known vulnerabilities.</li>
                    <li><strong>Use connection tracking</strong> — Drop invalid connections: <code className="bg-muted px-1 rounded">add chain=forward connection-state=invalid action=drop</code></li>
                    <li><strong>Request delisting proactively</strong> — After fixing issues, submit delisting requests to Spamhaus, Barracuda, SpamCop, etc.</li>
                  </ul>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>
    </div>
  );
};
