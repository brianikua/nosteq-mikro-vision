import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Globe,
  AlertTriangle,
  Clock,
  Search,
} from "lucide-react";
import { toast } from "sonner";

export const IPReputationTab = () => {
  const queryClient = useQueryClient();
  const [scanning, setScanning] = useState(false);

  // Fetch reputation summaries
  const { data: summaries, isLoading: loadingSummaries } = useQuery({
    queryKey: ["ip-reputation-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ip_reputation_summary")
        .select("*, devices(name, ip_address)")
        .order("reputation_score", { ascending: true });
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  // Fetch recent scans
  const { data: recentScans } = useQuery({
    queryKey: ["recent-blacklist-scans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("blacklist_scans")
        .select("*, devices(name)")
        .order("scanned_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  // Fetch IP history
  const { data: ipHistory } = useQuery({
    queryKey: ["ip-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ip_history")
        .select("*, devices(name)")
        .order("detected_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  // Fetch abuse attributions
  const { data: attributions } = useQuery({
    queryKey: ["abuse-attributions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("abuse_attributions")
        .select("*, devices(name), blacklist_scans(provider, ip_address)")
        .order("attributed_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  // Fetch mitigation actions
  const { data: mitigations } = useQuery({
    queryKey: ["mitigation-actions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mitigation_actions")
        .select("*, devices(name)")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const runScan = async (deviceId?: string) => {
    setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "check-ip-reputation",
        { body: deviceId ? { device_id: deviceId } : {} }
      );
      if (error) throw error;
      toast.success(
        `Scan complete: ${data.results?.length || 0} device(s) checked`
      );
      queryClient.invalidateQueries({ queryKey: ["ip-reputation-summary"] });
      queryClient.invalidateQueries({ queryKey: ["recent-blacklist-scans"] });
      queryClient.invalidateQueries({ queryKey: ["ip-history"] });
    } catch (e: any) {
      toast.error(`Scan failed: ${e.message}`);
    } finally {
      setScanning(false);
    }
  };

  const getScoreBadge = (score: number) => {
    if (score >= 80)
      return (
        <Badge className="bg-success/20 text-success border-success/30">
          <ShieldCheck className="h-3 w-3 mr-1" /> Clean ({score})
        </Badge>
      );
    if (score >= 50)
      return (
        <Badge className="bg-warning/20 text-warning border-warning/30">
          <AlertTriangle className="h-3 w-3 mr-1" /> Warning ({score})
        </Badge>
      );
    return (
      <Badge className="bg-destructive/20 text-destructive border-destructive/30">
        <ShieldAlert className="h-3 w-3 mr-1" /> Critical ({score})
      </Badge>
    );
  };

  const getStatusBadge = (status: string) => {
    if (status === "clean")
      return (
        <Badge variant="outline" className="text-success border-success/30">
          Clean
        </Badge>
      );
    if (status === "listed")
      return (
        <Badge
          variant="outline"
          className="text-destructive border-destructive/30"
        >
          Listed
        </Badge>
      );
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Error
      </Badge>
    );
  };

  const approveMitigation = async (id: string) => {
    const { error } = await supabase
      .from("mitigation_actions")
      .update({
        is_approved: true,
        executed_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (error) {
      toast.error("Failed to approve action");
    } else {
      toast.success("Mitigation approved");
      queryClient.invalidateQueries({ queryKey: ["mitigation-actions"] });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="h-7 w-7 text-primary" />
          <div>
            <h2 className="text-xl font-bold">IP Reputation Intelligence</h2>
            <p className="text-sm text-muted-foreground">
              Public IP blacklist monitoring & abuse attribution
            </p>
          </div>
        </div>
        <Button onClick={() => runScan()} disabled={scanning} size="sm">
          <RefreshCw
            className={`h-4 w-4 mr-2 ${scanning ? "animate-spin" : ""}`}
          />
          {scanning ? "Scanning..." : "Scan All Devices"}
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Globe className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold font-mono">
                  {summaries?.length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Monitored IPs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-8 w-8 text-success" />
              <div>
                <p className="text-2xl font-bold font-mono">
                  {summaries?.filter((s: any) => s.reputation_score >= 80)
                    .length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Clean IPs</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <ShieldAlert className="h-8 w-8 text-destructive" />
              <div>
                <p className="text-2xl font-bold font-mono">
                  {summaries?.filter((s: any) => s.active_listings > 0)
                    .length || 0}
                </p>
                <p className="text-xs text-muted-foreground">Blacklisted</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold font-mono">
                  {summaries?.[0]?.last_scan_at
                    ? new Date(summaries[0].last_scan_at).toLocaleTimeString()
                    : "Never"}
                </p>
                <p className="text-xs text-muted-foreground">Last Scan</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reputation Table */}
      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5" /> Device Reputation Overview
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingSummaries ? (
            <p className="text-muted-foreground text-sm">Loading...</p>
          ) : summaries && summaries.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Public IP</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Listings</TableHead>
                  <TableHead>Last Scan</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summaries.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">
                      {(s.devices as any)?.name || "Unknown"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {s.ip_address}
                    </TableCell>
                    <TableCell>{getScoreBadge(s.reputation_score)}</TableCell>
                    <TableCell>
                      <span className="font-mono">
                        {s.active_listings}/{s.total_listings}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {s.last_scan_at
                        ? new Date(s.last_scan_at).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runScan(s.device_id)}
                        disabled={scanning}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" /> Rescan
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>No reputation data yet. Run your first scan.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Scans */}
      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Recent Blacklist Scans</CardTitle>
        </CardHeader>
        <CardContent>
          {recentScans && recentScans.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentScans.map((scan: any) => (
                  <TableRow key={scan.id}>
                    <TableCell>{(scan.devices as any)?.name}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {scan.ip_address}
                    </TableCell>
                    <TableCell>{scan.provider}</TableCell>
                    <TableCell>{getStatusBadge(scan.status)}</TableCell>
                    <TableCell>
                      {scan.abuse_category ? (
                        <Badge variant="secondary">
                          {scan.abuse_category}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="font-mono">
                      {scan.confidence_score}%
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(scan.scanned_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-4">
              No scans yet
            </p>
          )}
        </CardContent>
      </Card>

      {/* Abuse Attributions */}
      {attributions && attributions.length > 0 && (
        <Card className="bg-card border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" /> Abuse
              Attributions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>PPPoE User</TableHead>
                  <TableHead>Private IP</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {attributions.map((a: any) => (
                  <TableRow key={a.id}>
                    <TableCell>{(a.devices as any)?.name}</TableCell>
                    <TableCell className="font-mono">
                      {a.pppoe_username || "Unknown"}
                    </TableCell>
                    <TableCell className="font-mono">
                      {a.private_ip || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{a.abuse_category}</Badge>
                    </TableCell>
                    <TableCell>{getScoreBadge(100 - a.severity_score)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(a.attributed_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Mitigation Actions */}
      {mitigations && mitigations.length > 0 && (
        <Card className="bg-card border-border/50">
          <CardHeader>
            <CardTitle className="text-lg">Mitigation Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Approve</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mitigations.map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell>{(m.devices as any)?.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{m.action_type}</Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-xs truncate">
                      {m.description}
                    </TableCell>
                    <TableCell>
                      {m.is_approved ? (
                        <Badge className="bg-success/20 text-success">
                          Approved
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Pending</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {!m.is_approved && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => approveMitigation(m.id)}
                        >
                          Approve
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* IP Change History */}
      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">IP Change History</CardTitle>
        </CardHeader>
        <CardContent>
          {ipHistory && ipHistory.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Device</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Current</TableHead>
                  <TableHead>Detected</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ipHistory.map((h: any) => (
                  <TableRow key={h.id}>
                    <TableCell>{(h.devices as any)?.name}</TableCell>
                    <TableCell className="font-mono">{h.ip_address}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{h.source}</Badge>
                    </TableCell>
                    <TableCell>
                      {h.is_current ? (
                        <Badge className="bg-success/20 text-success">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline">Previous</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(h.detected_at).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-sm text-center py-4">
              No IP history recorded
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
