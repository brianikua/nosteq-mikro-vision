import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Shield, Search, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

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

export const IPReputationTab = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [scanning, setScanning] = useState(false);
  const [summary, setSummary] = useState<ReputationSummary | null>(null);
  const [lastResults, setLastResults] = useState<ScanResult[]>([]);
  const [loading, setLoading] = useState(true);

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
    };
    loadSummary();
  }, [selectedDevice]);

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
    </div>
  );
};
