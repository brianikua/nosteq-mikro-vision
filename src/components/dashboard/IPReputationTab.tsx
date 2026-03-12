import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Shield, Search, AlertTriangle, CheckCircle, Clock, ShieldAlert, Lightbulb, History, Calendar, CalendarIcon, Filter, X, TrendingUp, RefreshCw, Info, Flame, ExternalLink } from "lucide-react";
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
const PROVIDER_INSIGHTS: Record<string, { reason: string; firewall: string; category: string; delist_url: string }> = {
  "Spamhaus ZEN": { reason: "Your IP was detected sending spam, hosting malware, or part of a botnet. ZEN is a combined list (SBL+XBL+PBL).", firewall: "Block outbound SMTP (port 25) for all subscribers. Use connection rate limiting.", category: "spam/malware", delist_url: "https://check.spamhaus.org/listed/" },
  "Spamhaus SBL": { reason: "Direct spam source or spam operation detected from your IP range.", firewall: "Block port 25 outbound, investigate which subscriber is sending bulk email.", category: "spam", delist_url: "https://check.spamhaus.org/listed/" },
  "Spamhaus XBL": { reason: "Exploited system (virus/trojan/botnet) detected sending spam from your network.", firewall: "Rate-limit outbound connections per subscriber. Block port 25. Scan for compromised hosts.", category: "botnet/exploit", delist_url: "https://check.spamhaus.org/listed/" },
  "Spamhaus PBL": { reason: "Your IP is in a dynamic/residential range that should not send email directly.", firewall: "No firewall fix needed — configure mail to relay through an authorized SMTP server with proper rDNS.", category: "policy", delist_url: "https://check.spamhaus.org/listed/" },
  "Barracuda": { reason: "Spam or malicious email traffic detected from your IP.", firewall: "Block outbound SMTP (port 25). Set up SPF/DKIM/DMARC records.", category: "spam", delist_url: "https://www.barracudacentral.org/lookups/lookup-reputation" },
  "SpamCop": { reason: "Users reported receiving spam from your IP address.", firewall: "Block port 25 for non-mail-server subscribers. Monitor abuse complaints.", category: "spam", delist_url: "https://www.spamcop.net/bl.shtml" },
  "SORBS Combined": { reason: "Detected as open relay, open proxy, or spam source.", firewall: "Block open relay ports (25, 587). Ensure no open proxies on ports 1080, 3128, 8080.", category: "spam/proxy", delist_url: "http://www.sorbs.net/lookup.shtml" },
  "SORBS Spam": { reason: "Active spam sending detected from your IP.", firewall: "Block port 25 outbound for all non-authorized hosts.", category: "spam", delist_url: "http://www.sorbs.net/lookup.shtml" },
  "SORBS New Spam": { reason: "Recently started sending spam from your IP.", firewall: "Immediately block port 25 and investigate the source subscriber.", category: "spam", delist_url: "http://www.sorbs.net/lookup.shtml" },
  "SORBS Recent Spam": { reason: "Spam activity detected in the recent past.", firewall: "Block port 25 and submit delisting request after resolving.", category: "spam", delist_url: "http://www.sorbs.net/lookup.shtml" },
  "UCEProtect L1": { reason: "Individual IP detected sending spam or malicious traffic.", firewall: "Block port 25, rate-limit connections, investigate source.", category: "spam", delist_url: "https://www.uceprotect.net/en/rblcheck.php" },
  "UCEProtect L2": { reason: "Multiple IPs in your /24 subnet are listed — network-wide abuse detected.", firewall: "Apply subnet-wide SMTP blocking and aggressive rate limiting. Contact upstream.", category: "network abuse", delist_url: "https://www.uceprotect.net/en/rblcheck.php" },
  "UCEProtect L3": { reason: "Your entire ASN/provider range has abuse issues.", firewall: "Implement BCP38, block port 25 network-wide, enable uRPF.", category: "network abuse", delist_url: "https://www.uceprotect.net/en/rblcheck.php" },
  "CBL (Abuseat)": { reason: "Botnet or virus activity detected — your IP is sending spam via compromised device.", firewall: "Block port 25, rate-limit new connections (100/min per subscriber), detect port scanning.", category: "botnet", delist_url: "https://www.abuseat.org/lookup.cgi" },
  "PSBL": { reason: "Passive spam block — your IP sent email to a spamtrap.", firewall: "Block port 25 for residential/dynamic IPs.", category: "spam", delist_url: "https://psbl.org/listing" },
  "DroneBL": { reason: "Open proxy, botnet drone, or IRC abuse detected from your IP.", firewall: "Block proxy ports (1080, 3128, 8080), rate-limit IRC (6667), block port 25.", category: "botnet/proxy", delist_url: "https://dronebl.org/lookup" },
  "WPBL": { reason: "Your IP sent unsolicited email to a monitored address.", firewall: "Block outbound SMTP for non-mail hosts.", category: "spam", delist_url: "https://www.wpbl.info/" },
  "Mailspike": { reason: "Poor email sending reputation based on behavior analysis.", firewall: "Ensure proper rDNS, SPF, DKIM. Block port 25 for non-mail hosts.", category: "reputation", delist_url: "https://mailspike.org/iplookup.html" },
  "NiX Spam": { reason: "German spam blacklist — detected spam from your IP.", firewall: "Block outbound SMTP, ensure proper email authentication.", category: "spam", delist_url: "https://www.dnsbl.manitu.net/" },
  "TruncateGBUDB": { reason: "Poor sender reputation based on email pattern analysis.", firewall: "Block port 25, implement rate limiting on email connections.", category: "reputation", delist_url: "https://www.gbudb.com/truncate/" },
  "abuse.ch Spam": { reason: "Malware or spam distribution detected by abuse.ch.", firewall: "Block known C&C ports, rate-limit connections, block port 25.", category: "malware", delist_url: "https://abuse.ch/" },
  "InterServer": { reason: "Spam or abuse detected from your IP.", firewall: "Block port 25, rate-limit outbound connections.", category: "spam", delist_url: "https://rbl.interserver.net/" },
  "0spam": { reason: "Automated spam detection flagged your IP.", firewall: "Block outbound SMTP for non-authorized hosts.", category: "spam", delist_url: "https://www.0spam.org/" },
  "s5h.net": { reason: "Detected as spam source or open relay.", firewall: "Block port 25, close open relays.", category: "spam", delist_url: "http://www.usenix.org.uk/content/rbl.html" },
  "INPS": { reason: "Spam or abuse detected from your IP.", firewall: "Block port 25, investigate source.", category: "spam", delist_url: "https://dnsbl.inps.de/" },
  "Blocklist.de DNSBL": { reason: "Brute-force attacks, DDoS, or spam detected from your IP.", firewall: "Rate-limit SSH/FTP (max 5 attempts/min). Block port 25. Enable port scan detection.", category: "brute force", delist_url: "https://www.blocklist.de/en/search.html" },
  "Blocklist.de": { reason: "Attack traffic (brute-force, DDoS, spam) reported from your IP.", firewall: "Rate-limit connections, block common attack ports, enable PSD (Port Scan Detection).", category: "brute force", delist_url: "https://www.blocklist.de/en/search.html" },
  "DNSRBL": { reason: "General blacklist detection — spam or abuse.", firewall: "Block port 25, apply standard anti-abuse firewall rules.", category: "spam", delist_url: "https://www.dnsrbl.com/" },
  "HostKarma": { reason: "Poor sending reputation or suspicious traffic patterns.", firewall: "Block port 25, ensure rDNS is configured, implement rate limiting.", category: "reputation", delist_url: "https://wiki.junkemailfilter.com/index.php/Spam_DNS_Lists" },
  "UBL Unsubscore": { reason: "High unsubscribe rate detected — likely sending unwanted email.", firewall: "Block port 25 for non-mail hosts. Review mail server configuration.", category: "spam", delist_url: "https://www.lashback.com/blacklist/" },
  "AbuseIPDB": { reason: "Multiple abuse reports filed against your IP (brute-force, DDoS, scanning, spam).", firewall: "Rate-limit connections (100/min), enable port scan detection, block port 25, drop bogon traffic.", category: "general abuse", delist_url: "https://www.abuseipdb.com/check/" },
  "VirusTotal": { reason: "Multiple security vendors flagged your IP for malware, phishing, or malicious activity.", firewall: "Block known malware ports, rate-limit connections, implement DNS filtering.", category: "malware", delist_url: "https://www.virustotal.com/gui/ip-address/" },
  "IPQualityScore": { reason: "High fraud score — detected as proxy, VPN, tor exit, or bot traffic source.", firewall: "Block proxy ports (1080, 3128, 8080), block tor exit traffic, rate-limit connections.", category: "proxy/fraud", delist_url: "https://www.ipqualityscore.com/free-ip-lookup-proxy-vpn-test" },
  "IP-API (Proxy/Hosting)": { reason: "Your IP is flagged as a hosting/proxy IP — may affect email deliverability.", firewall: "Ensure proper rDNS. This is informational — hosting IPs are often flagged but not necessarily abusive.", category: "informational", delist_url: "" },
};

const getProviderInsight = (provider: string) => {
  return PROVIDER_INSIGHTS[provider] || {
    reason: "This provider detected suspicious or abusive activity from your IP address.",
    firewall: "Block outbound SMTP (port 25), rate-limit connections, and review firewall rules.",
    category: "unknown",
    delist_url: "",
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
  const [globalHistoryEntries, setGlobalHistoryEntries] = useState<HistoryEntry[]>([]);
  const [reputationTrend, setReputationTrend] = useState<ReputationPoint[]>([]);
  const [trendRange, setTrendRange] = useState<TrendRange>("30d");

  // Auto-refresh state
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const loadGlobalHistory = useCallback(async () => {
    const { data } = await supabase
      .from("blacklist_scans")
      .select("id, provider, ip_address, scanned_at, confidence_score")
      .gt("confidence_score", 0)
      .order("scanned_at", { ascending: false })
      .limit(1000);
    if (data) setGlobalHistoryEntries(data);
  }, []);

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
    loadGlobalHistory();
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

        // Refresh trend chart + history for analytics
        await loadTrend(selectedDevice, trendRange);

        // Reload blacklist history so analytics auto-update
        const { data: historyData } = await supabase
          .from("blacklist_scans")
          .select("id, provider, ip_address, scanned_at, confidence_score")
          .eq("device_id", selectedDevice)
          .gt("confidence_score", 0)
          .order("scanned_at", { ascending: false })
          .limit(500);

        if (historyData) {
          setAllHistoryEntries(historyData);
        }

        // Reload global history for cross-IP analytics
        await loadGlobalHistory();
      }
    } catch (e) {
      console.error("Scan failed:", e);
      toast.error("Scan failed");
    } finally {
      setScanning(false);
    }
  };

  // ── Auto-refresh logic ──
  useEffect(() => {
    // Clear previous timers
    if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    if (autoRefreshInterval > 0 && selectedDevice) {
      setCountdown(autoRefreshInterval);
      
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => (prev <= 1 ? autoRefreshInterval : prev - 1));
      }, 1000);

      autoRefreshRef.current = setInterval(() => {
        handleScan();
        setCountdown(autoRefreshInterval);
      }, autoRefreshInterval * 1000);
    } else {
      setCountdown(0);
    }

    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [autoRefreshInterval, selectedDevice]);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
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
      <div className="flex items-center gap-4 flex-wrap">
        <Select value={selectedDevice} onValueChange={(val) => {
          setSelectedDevice(val);
          // Auto-run scan after state update
          setTimeout(() => {
            const btn = document.getElementById("run-blacklist-scan-btn");
            if (btn) btn.click();
          }, 300);
        }}>
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
        <Button id="run-blacklist-scan-btn" onClick={handleScan} disabled={scanning || !selectedDevice}>
          {scanning ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Scanning 34+ providers...</>
          ) : (
            <><Search className="h-4 w-4 mr-2" /> Run Blacklist Scan</>
          )}
        </Button>

        {/* Auto-refresh controls */}
        <div className="flex items-center gap-2 ml-auto">
          <RefreshCw className={cn("h-4 w-4 text-muted-foreground", autoRefreshInterval > 0 && "text-primary animate-spin")} style={autoRefreshInterval > 0 ? { animationDuration: "3s" } : {}} />
          <Select value={String(autoRefreshInterval)} onValueChange={(v) => setAutoRefreshInterval(Number(v))}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue placeholder="Auto refresh" />
            </SelectTrigger>
            <SelectContent>
              {AUTO_REFRESH_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {autoRefreshInterval > 0 && countdown > 0 && (
            <Badge variant="outline" className="text-xs font-mono">
              {formatCountdown(countdown)}
            </Badge>
          )}
        </div>
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

      {/* Reputation Trend Chart + Analytics */}
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
        <CardContent className="space-y-4">
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

          {/* Blacklist Analytics: Most blocked IP + Top blocking providers (ALL IPs) */}
          {globalHistoryEntries.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-border/50">
              <p className="col-span-full text-[10px] text-muted-foreground uppercase tracking-wider">Across all monitored IPs</p>
              {/* Most Blacklisted IPs */}
              <div className="space-y-2">
                <p className="text-xs font-medium flex items-center gap-1.5 text-destructive">
                  <Flame className="h-3.5 w-3.5" /> Most Blacklisted IPs
                </p>
                {(() => {
                  const ipCounts: Record<string, number> = {};
                  globalHistoryEntries.forEach(e => {
                    ipCounts[e.ip_address] = (ipCounts[e.ip_address] || 0) + 1;
                  });
                  const sorted = Object.entries(ipCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
                  const max = sorted[0]?.[1] || 1;
                  return sorted.map(([ip, count]) => (
                    <div key={ip} className="flex items-center gap-2">
                      <span className="text-xs font-mono w-32 truncate">{ip}</span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-destructive rounded-full transition-all"
                          style={{ width: `${(count / max) * 100}%` }}
                        />
                      </div>
                      <Badge variant="destructive" className="text-[10px] min-w-[2.5rem] justify-center">
                        {count}
                      </Badge>
                    </div>
                  ));
                })()}
              </div>

              {/* Top Blocking Providers */}
              <div className="space-y-2">
                <p className="text-xs font-medium flex items-center gap-1.5 text-[hsl(var(--warning))]">
                  <ShieldAlert className="h-3.5 w-3.5" /> Top Blocking Providers
                </p>
                {(() => {
                  const provCounts: Record<string, number> = {};
                  globalHistoryEntries.forEach(e => {
                    provCounts[e.provider] = (provCounts[e.provider] || 0) + 1;
                  });
                  const sorted = Object.entries(provCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
                  const max = sorted[0]?.[1] || 1;
                  return sorted.map(([provider, count]) => {
                    const insight = getProviderInsight(provider);
                    return (
                      <HoverCard key={provider}>
                        <HoverCardTrigger asChild>
                          <div className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors">
                            <span className="text-xs truncate w-32">{provider}</span>
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[hsl(var(--warning))] rounded-full transition-all"
                                style={{ width: `${(count / max) * 100}%` }}
                              />
                            </div>
                            <Badge variant="outline" className="text-[10px] min-w-[2.5rem] justify-center">
                              {count}
                            </Badge>
                          </div>
                        </HoverCardTrigger>
                        <HoverCardContent className="w-72 text-xs space-y-2">
                          <p className="font-medium">{provider}</p>
                          <p className="text-muted-foreground">{insight.reason}</p>
                          <div className="pt-1 border-t border-border/50">
                            <p className="font-medium text-primary flex items-center gap-1">
                              <ShieldAlert className="h-3 w-3" /> Fix
                            </p>
                            <p className="text-muted-foreground">{insight.firewall}</p>
                          </div>
                          <Badge variant="secondary" className="text-[10px]">{insight.category}</Badge>
                        </HoverCardContent>
                      </HoverCard>
                    );
                  });
                })()}
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
            <CardDescription>
              {lastResults.filter(r => r.listed).length > 0
                ? `${lastResults.filter(r => r.listed).length} of ${lastResults.length} providers flagged your IP — expand listed items for details`
                : `All ${lastResults.length} providers report clean`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {/* Listed providers first with expandable insights */}
            {lastResults.filter(r => r.listed).length > 0 && (
              <div className="space-y-1 mb-4">
                <p className="text-xs font-medium text-destructive mb-2 flex items-center gap-1.5">
                  <Flame className="h-3.5 w-3.5" /> Listed — tap for reason & firewall fix
                </p>
                <Accordion type="multiple" className="w-full">
                  {lastResults.filter(r => r.listed).map((r, i) => {
                    const insight = getProviderInsight(r.provider);
                    return (
                      <AccordionItem key={`listed-${i}`} value={`listed-${i}`} className="border-destructive/20">
                        <AccordionTrigger className="py-2 px-3 rounded-md bg-destructive/10 border border-destructive/20 hover:no-underline">
                          <div className="flex items-center gap-2 text-sm">
                            <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                            <span className="truncate">{r.provider}</span>
                            <Badge variant="destructive" className="text-xs ml-auto mr-2">Listed</Badge>
                            <Badge variant="outline" className="text-xs">{insight.category}</Badge>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-3 pt-3">
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs font-medium text-destructive flex items-center gap-1.5 mb-1">
                                <Info className="h-3.5 w-3.5" /> Why you're listed
                              </p>
                              <p className="text-sm text-muted-foreground">{insight.reason}</p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-primary flex items-center gap-1.5 mb-1">
                                <ShieldAlert className="h-3.5 w-3.5" /> Recommended Firewall Action
                              </p>
                              <p className="text-sm text-muted-foreground">{insight.firewall}</p>
                            </div>
                            {r.confidence > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-muted-foreground">Confidence:</span>
                                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-32">
                                  <div
                                    className="h-full bg-destructive rounded-full transition-all"
                                    style={{ width: `${Math.min(r.confidence, 100)}%` }}
                                  />
                                </div>
                                <span className="text-xs font-mono text-muted-foreground">{r.confidence}%</span>
                              </div>
                            )}
                            {insight.delist_url && (
                              <div className="pt-1">
                                <a
                                  href={insight.delist_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline bg-primary/10 px-3 py-1.5 rounded-md transition-colors hover:bg-primary/20"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  Request Delisting
                                </a>
                              </div>
                            )}
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
            )}

            {/* Clean providers grid */}
            {lastResults.filter(r => !r.listed).length > 0 && (
              <div>
                <p className="text-xs font-medium text-[hsl(var(--success))] mb-2 flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5" /> Clean ({lastResults.filter(r => !r.listed).length})
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                  {lastResults.filter(r => !r.listed).map((r, i) => (
                    <div
                      key={`clean-${i}`}
                      className="flex items-center justify-between px-3 py-1.5 rounded-md text-sm bg-card border border-border/30"
                    >
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-3 w-3 text-[hsl(var(--success))]" />
                        <span className="truncate text-xs">{r.provider}</span>
                      </div>
                      <Badge variant="secondary" className="text-[10px]">Clean</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
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
