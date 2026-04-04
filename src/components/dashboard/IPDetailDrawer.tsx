import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { X, ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip,
} from "recharts";

interface IPDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ipAssignment: any;
  deviceName?: string;
  interfaceName?: string;
  siteName?: string;
}

export const IPDetailDrawer = ({ open, onOpenChange, ipAssignment, deviceName, interfaceName, siteName }: IPDetailDrawerProps) => {
  const navigate = useNavigate();
  const [downtimeEvents, setDowntimeEvents] = useState<any[]>([]);
  const [blacklistHistory, setBlacklistHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !ipAssignment?.id) return;
    const load = async () => {
      setLoading(true);
      const [dtRes, blRes] = await Promise.all([
        supabase.from("ip_downtime_events").select("*").eq("ip_assignment_id", ipAssignment.id).order("down_at", { ascending: false }).limit(20),
        supabase.from("blacklist_history").select("*").eq("ip_address", ipAssignment.ip_only || ipAssignment.ip_address?.split("/")[0]).order("listed_at", { ascending: false }).limit(20),
      ]);
      setDowntimeEvents(dtRes.data || []);
      setBlacklistHistory(blRes.data || []);
      setLoading(false);
    };
    load();
  }, [open, ipAssignment?.id]);

  if (!ipAssignment) return null;

  const ip = ipAssignment;
  const formatDate = (d: string) => new Date(d).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="font-mono text-lg">{ip.ip_address}</SheetTitle>
        </SheetHeader>

        <div className="space-y-6 mt-4">
          {/* Summary */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className={cn("h-2.5 w-2.5 rounded-full", ip.last_status === "up" ? "bg-success" : ip.last_status === "down" ? "bg-destructive animate-pulse" : "bg-muted-foreground")} />
              <span className="text-sm font-medium">{ip.last_status === "up" ? "UP" : ip.last_status === "down" ? "DOWN" : "Unknown"}</span>
              {ip.last_ping_ms != null && <span className="text-xs text-muted-foreground">{ip.last_ping_ms}ms</span>}
            </div>
            {deviceName && (
              <p className="text-sm text-muted-foreground">
                Device: <button className="text-primary underline" onClick={() => { onOpenChange(false); navigate(`/devices/${ip.device_id}`); }}>{deviceName}</button>
              </p>
            )}
            {interfaceName && <p className="text-sm text-muted-foreground">Interface: {interfaceName} ({ip.role})</p>}
            {siteName && <p className="text-sm text-muted-foreground">Site: {siteName}</p>}
            <div className="flex gap-2 flex-wrap">
              <Badge variant="outline" className="text-[10px]">{ip.ip_type || "static"}</Badge>
              {ip.is_public ? <Badge className="text-[10px] bg-primary/20 text-primary border-0">🌐 Public</Badge> : <Badge variant="outline" className="text-[10px]">🏠 Local</Badge>}
              {ip.blacklist_count > 0 && <Badge className="text-[10px] bg-destructive/20 text-destructive border-0">🛡 {ip.blacklist_count} listings</Badge>}
            </div>
            {ip.uptime_7d != null && <p className="text-xs text-muted-foreground">7d Uptime: {ip.uptime_7d}%</p>}
            {ip.last_ping_at && <p className="text-xs text-muted-foreground">Last checked: {formatDate(ip.last_ping_at)}</p>}
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="text-xs" onClick={() => toast.info("Ping triggered")}>Ping Now</Button>
            {ip.is_public && <Button size="sm" variant="outline" className="text-xs" onClick={() => toast.info("Blacklist check triggered")}>Run Blacklist Check</Button>}
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              {/* Downtime Events */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Downtime Events</h3>
                {downtimeEvents.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No downtime events recorded.</p>
                ) : (
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/30">
                        <tr>
                          <th className="text-left p-2 text-muted-foreground">Down At</th>
                          <th className="text-left p-2 text-muted-foreground">Recovered</th>
                          <th className="text-right p-2 text-muted-foreground">Duration</th>
                        </tr>
                      </thead>
                      <tbody>
                        {downtimeEvents.slice(0, 10).map((e) => (
                          <tr key={e.id} className="border-t border-border/30">
                            <td className="p-2">{formatDate(e.down_at)}</td>
                            <td className="p-2">{e.recovered_at ? formatDate(e.recovered_at) : <Badge variant="destructive" className="text-[9px]">Ongoing</Badge>}</td>
                            <td className="p-2 text-right">{e.duration_minutes ? `${e.duration_minutes}m` : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Blacklist History */}
              <div>
                <h3 className="text-sm font-semibold text-foreground mb-2">Blacklist History</h3>
                {blacklistHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No blacklist history.</p>
                ) : (
                  <div className="space-y-2">
                    {blacklistHistory.map((b) => (
                      <div key={b.id} className="bg-muted/20 rounded-lg p-3 border border-border/50 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-foreground">{b.provider}</span>
                          <Badge variant={b.delisted_at ? "secondary" : "destructive"} className="text-[9px]">
                            {b.delisted_at ? "Delisted" : "Active"}
                          </Badge>
                        </div>
                        {b.reason && <p className="text-[10px] text-muted-foreground">{b.reason}</p>}
                        <p className="text-[10px] text-muted-foreground">
                          Listed: {formatDate(b.listed_at)}
                          {b.delisted_at && ` → Delisted: ${formatDate(b.delisted_at)}`}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
