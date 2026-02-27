import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RefreshCw, Shield, ArrowRightLeft, Activity, AlertTriangle, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

interface Device {
  id: string;
  name: string;
  ip_address: string;
}

interface FirewallRule {
  id: string;
  chain: string;
  action: string;
  src_address: string | null;
  dst_address: string | null;
  protocol: string | null;
  dst_port: string | null;
  comment: string | null;
  disabled: boolean;
  bytes: number;
  packets: number;
  rule_order: number;
}

interface NATRule {
  id: string;
  chain: string;
  action: string;
  src_address: string | null;
  dst_address: string | null;
  protocol: string | null;
  dst_port: string | null;
  to_addresses: string | null;
  to_ports: string | null;
  comment: string | null;
  disabled: boolean;
  bytes: number;
  packets: number;
  rule_order: number;
}

interface ConnectionStats {
  id: string;
  total_connections: number;
  tcp_connections: number | null;
  udp_connections: number | null;
  icmp_connections: number | null;
  collected_at: string;
}

interface FirewallLog {
  id: string;
  chain: string | null;
  action: string | null;
  src_address: string | null;
  dst_address: string | null;
  protocol: string | null;
  dst_port: string | null;
  log_message: string | null;
  collected_at: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toString();
}

export const FirewallNATTab = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [firewallRules, setFirewallRules] = useState<FirewallRule[]>([]);
  const [natRules, setNatRules] = useState<NATRule[]>([]);
  const [connStats, setConnStats] = useState<ConnectionStats | null>(null);
  const [firewallLogs, setFirewallLogs] = useState<FirewallLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    fetchDevices();
  }, []);

  useEffect(() => {
    if (selectedDevice) {
      fetchFirewallData();
    }
  }, [selectedDevice]);

  const fetchDevices = async () => {
    const { data } = await supabase.from("devices").select("id, name, ip_address").order("name");
    if (data && data.length > 0) {
      setDevices(data);
      setSelectedDevice(data[0].id);
    }
  };

  const fetchFirewallData = async () => {
    if (!selectedDevice) return;
    setLoading(true);

    const [fwRes, natRes, connRes, logRes] = await Promise.all([
      supabase.from("firewall_rules").select("*").eq("device_id", selectedDevice).order("rule_order"),
      supabase.from("nat_rules").select("*").eq("device_id", selectedDevice).order("rule_order"),
      supabase.from("connection_tracking").select("*").eq("device_id", selectedDevice).order("collected_at", { ascending: false }).limit(1),
      supabase.from("firewall_logs").select("*").eq("device_id", selectedDevice).order("collected_at", { ascending: false }).limit(50),
    ]);

    setFirewallRules((fwRes.data as FirewallRule[]) || []);
    setNatRules((natRes.data as NATRule[]) || []);
    setConnStats((connRes.data as ConnectionStats[])?.[0] || null);
    setFirewallLogs((logRes.data as FirewallLog[]) || []);
    setLoading(false);
  };

  const handleScan = async () => {
    setScanning(true);
    toast.info("Fetching firewall & NAT data from router...");

    try {
      const { data, error } = await supabase.functions.invoke("fetch-firewall-data", {
        body: { device_id: selectedDevice },
      });

      if (error) throw error;

      if (data?.results?.[0]?.success) {
        toast.success(`Collected ${data.results[0].filter_rules} filter rules, ${data.results[0].nat_rules} NAT rules`);
        await fetchFirewallData();
      } else {
        toast.error(data?.results?.[0]?.error || "Failed to fetch data from router");
      }
    } catch (err: any) {
      console.error("Scan error:", err);
      toast.error("Failed to connect to router. Check device credentials.");
    } finally {
      setScanning(false);
    }
  };

  const getActionColor = (action: string) => {
    switch (action.toLowerCase()) {
      case "accept": return "default";
      case "drop": return "destructive";
      case "reject": return "destructive";
      case "masquerade": return "secondary";
      case "srcnat": case "dstnat": return "outline";
      case "log": return "secondary";
      default: return "outline";
    }
  };

  const activeFilterRules = firewallRules.filter(r => !r.disabled).length;
  const dropRules = firewallRules.filter(r => r.action === "drop" || r.action === "reject").length;

  return (
    <div className="space-y-6">
      {/* Device selector and scan button */}
      <div className="flex items-center gap-4">
        <Select value={selectedDevice} onValueChange={setSelectedDevice}>
          <SelectTrigger className="w-[280px] bg-card border-border/50">
            <SelectValue placeholder="Select a device" />
          </SelectTrigger>
          <SelectContent>
            {devices.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.name} ({d.ip_address})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleScan} disabled={scanning || !selectedDevice} variant="default" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Fetching..." : "Fetch from Router"}
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Shield className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{firewallRules.length}</p>
                <p className="text-sm text-muted-foreground">Filter Rules</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{activeFilterRules} active, {firewallRules.length - activeFilterRules} disabled</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ArrowRightLeft className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{natRules.length}</p>
                <p className="text-sm text-muted-foreground">NAT Rules</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8 text-chart-3" />
              <div>
                <p className="text-2xl font-bold">{connStats ? formatNumber(connStats.total_connections) : "—"}</p>
                <p className="text-sm text-muted-foreground">Active Connections</p>
              </div>
            </div>
            {connStats && (
              <p className="text-xs text-muted-foreground mt-2">
                TCP: {formatNumber(connStats.tcp_connections || 0)} · UDP: {formatNumber(connStats.udp_connections || 0)} · ICMP: {formatNumber(connStats.icmp_connections || 0)}
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <div>
                <p className="text-2xl font-bold">{dropRules}</p>
                <p className="text-sm text-muted-foreground">Drop/Reject Rules</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="filter" className="space-y-4">
        <TabsList className="bg-card border border-border/50">
          <TabsTrigger value="filter">Filter Rules</TabsTrigger>
          <TabsTrigger value="nat">NAT Rules</TabsTrigger>
          <TabsTrigger value="connections">Connections</TabsTrigger>
          <TabsTrigger value="logs">Firewall Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="filter">
          <Card className="bg-card border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Firewall Filter Rules</CardTitle>
              <CardDescription>Current filter rules from the router</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Chain</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Src Address</TableHead>
                      <TableHead>Dst Address</TableHead>
                      <TableHead>Protocol</TableHead>
                      <TableHead>Dst Port</TableHead>
                      <TableHead>Comment</TableHead>
                      <TableHead className="text-right">Traffic</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {firewallRules.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                          No firewall rules collected yet. Click "Fetch from Router" to collect data.
                        </TableCell>
                      </TableRow>
                    ) : (
                      firewallRules.map((rule) => (
                        <TableRow key={rule.id} className={rule.disabled ? "opacity-50" : ""}>
                          <TableCell className="font-mono text-xs">{rule.rule_order}</TableCell>
                          <TableCell><Badge variant="outline">{rule.chain}</Badge></TableCell>
                          <TableCell><Badge variant={getActionColor(rule.action)}>{rule.action}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{rule.src_address || "any"}</TableCell>
                          <TableCell className="font-mono text-xs">{rule.dst_address || "any"}</TableCell>
                          <TableCell>{rule.protocol || "any"}</TableCell>
                          <TableCell className="font-mono text-xs">{rule.dst_port || "—"}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs">{rule.comment || "—"}</TableCell>
                          <TableCell className="text-right text-xs">
                            <div>{formatBytes(rule.bytes)}</div>
                            <div className="text-muted-foreground">{formatNumber(rule.packets)} pkts</div>
                          </TableCell>
                          <TableCell>
                            {rule.disabled ? (
                              <XCircle className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <CheckCircle className="h-4 w-4 text-chart-3" />
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="nat">
          <Card className="bg-card border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">NAT Rules</CardTitle>
              <CardDescription>Network Address Translation rules</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Chain</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Src Address</TableHead>
                      <TableHead>Dst Address</TableHead>
                      <TableHead>Protocol</TableHead>
                      <TableHead>To Addresses</TableHead>
                      <TableHead>To Ports</TableHead>
                      <TableHead>Comment</TableHead>
                      <TableHead className="text-right">Traffic</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {natRules.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                          No NAT rules collected yet. Click "Fetch from Router" to collect data.
                        </TableCell>
                      </TableRow>
                    ) : (
                      natRules.map((rule) => (
                        <TableRow key={rule.id} className={rule.disabled ? "opacity-50" : ""}>
                          <TableCell className="font-mono text-xs">{rule.rule_order}</TableCell>
                          <TableCell><Badge variant="outline">{rule.chain}</Badge></TableCell>
                          <TableCell><Badge variant={getActionColor(rule.action)}>{rule.action}</Badge></TableCell>
                          <TableCell className="font-mono text-xs">{rule.src_address || "any"}</TableCell>
                          <TableCell className="font-mono text-xs">{rule.dst_address || "any"}</TableCell>
                          <TableCell>{rule.protocol || "any"}</TableCell>
                          <TableCell className="font-mono text-xs">{rule.to_addresses || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{rule.to_ports || "—"}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs">{rule.comment || "—"}</TableCell>
                          <TableCell className="text-right text-xs">
                            <div>{formatBytes(rule.bytes)}</div>
                            <div className="text-muted-foreground">{formatNumber(rule.packets)} pkts</div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="connections">
          <Card className="bg-card border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Connection Tracking</CardTitle>
              <CardDescription>Active connection statistics</CardDescription>
            </CardHeader>
            <CardContent>
              {connStats ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  <div className="text-center p-4 rounded-lg bg-muted/30">
                    <p className="text-3xl font-bold">{formatNumber(connStats.total_connections)}</p>
                    <p className="text-sm text-muted-foreground mt-1">Total Connections</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/30">
                    <p className="text-3xl font-bold text-primary">{formatNumber(connStats.tcp_connections || 0)}</p>
                    <p className="text-sm text-muted-foreground mt-1">TCP</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/30">
                    <p className="text-3xl font-bold text-chart-3">{formatNumber(connStats.udp_connections || 0)}</p>
                    <p className="text-sm text-muted-foreground mt-1">UDP</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-muted/30">
                    <p className="text-3xl font-bold text-chart-4">{formatNumber(connStats.icmp_connections || 0)}</p>
                    <p className="text-sm text-muted-foreground mt-1">ICMP</p>
                  </div>
                  <div className="col-span-full text-xs text-muted-foreground">
                    Last collected: {new Date(connStats.collected_at).toLocaleString()}
                  </div>
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No connection data collected yet. Click "Fetch from Router" to collect data.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card className="bg-card border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Firewall Logs</CardTitle>
              <CardDescription>Recent firewall log entries from the router</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Chain</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Protocol</TableHead>
                      <TableHead>Port</TableHead>
                      <TableHead>Message</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {firewallLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                          No firewall logs collected yet.
                        </TableCell>
                      </TableRow>
                    ) : (
                      firewallLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="text-xs whitespace-nowrap">{new Date(log.collected_at).toLocaleString()}</TableCell>
                          <TableCell>{log.chain || "—"}</TableCell>
                          <TableCell>{log.action ? <Badge variant={getActionColor(log.action)}>{log.action}</Badge> : "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{log.src_address || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{log.dst_address || "—"}</TableCell>
                          <TableCell>{log.protocol || "—"}</TableCell>
                          <TableCell className="font-mono text-xs">{log.dst_port || "—"}</TableCell>
                          <TableCell className="max-w-[300px] truncate text-xs">{log.log_message || "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
