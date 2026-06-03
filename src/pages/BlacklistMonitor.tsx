import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { VersionFooter } from "@/components/dashboard/VersionFooter";
import { BlacklistAlertPill } from "@/components/dashboard/BlacklistAlertPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAutoLogout } from "@/hooks/use-auto-logout";
import { toast } from "sonner";

type Event = {
  id: string; ip_address: string; rbl_lists: string[] | null;
  updated_at: string; block_id: string | null;
  cidr?: string | null;
};

const severityFromLists = (lists: string[] | null) => {
  const n = lists?.length || 0;
  if (n >= 3) return "high";
  if (n === 2) return "medium";
  return "low";
};
const sevColor: Record<string, string> = {
  high: "bg-destructive/15 text-destructive border-destructive/30",
  medium: "bg-warning/15 text-warning border-warning/30",
  low: "bg-success/15 text-success border-success/30",
};
const actionColor: Record<string, string> = {
  Pending: "bg-warning/15 text-warning border-warning/30",
  Submitted: "bg-primary/15 text-primary border-primary/30",
  Delisted: "bg-success/15 text-success border-success/30",
};

export default function BlacklistMonitor() {
  useAutoLogout();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isAdminOrAbove, setIsAdminOrAbove] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [ip, setIp] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setUser(session.user);
      const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id).single();
      if (r && (r.role === "admin" || r.role === "superadmin")) setIsAdminOrAbove(true);
      fetchEvents();
    })();
  }, [navigate]);

  const fetchEvents = async () => {
    const { data } = await supabase
      .from("ip_addresses")
      .select("id, ip_address, rbl_lists, updated_at, block_id, ip_blocks(cidr)")
      .eq("is_blacklisted", true)
      .order("updated_at", { ascending: false })
      .limit(200);
    setEvents(((data || []) as any[]).map(d => ({ ...d, cidr: d.ip_blocks?.cidr })));
  };

  const formatEAT = (iso: string) => {
    try {
      return new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Nairobi", hour12: false });
    } catch { return iso; }
  };

  const runCheck = async () => {
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip.trim())) { toast.error("Invalid IP"); return; }
    setChecking(true);
    setResult(null);
    setTimeout(() => {
      setChecking(false);
      setResult(`No live RBL check is wired yet for ${ip.trim()}. Hook the check-ip-reputation edge function here to populate this panel.`);
    }, 500);
  };

  if (!user) return null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar activeTab="blacklist-monitor" isAdminOrAbove={isAdminOrAbove} userEmail={user.email} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-[60px] flex items-center justify-between px-4 border-b border-border/50 bg-background/95 backdrop-blur-xl sticky top-0 z-50">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h1 className="text-base font-semibold text-foreground">Blacklist Monitor</h1>
                <p className="text-[11px] text-muted-foreground">Active RBL listings & remediation</p>
              </div>
            </div>
            <BlacklistAlertPill />
          </header>

          <main className="flex-1 p-4 md:p-6 overflow-auto space-y-4">
            <div className="bg-card border border-border rounded-xl">
              <div className="p-4 border-b border-border flex items-center gap-2">
                <Shield className="h-4 w-4 text-destructive" />
                <h2 className="text-sm font-semibold text-foreground">Active RBL Events</h2>
                <Badge variant="outline" className="ml-2 text-[10px]">{events.length}</Badge>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Time (EAT)</TableHead>
                      <TableHead>IP Address</TableHead>
                      <TableHead>RBL List</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Action Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-8">
                          No active blacklist events. All IPs are clean.
                        </TableCell>
                      </TableRow>
                    )}
                    {events.map(e => {
                      const sev = severityFromLists(e.rbl_lists);
                      return (
                        <TableRow key={e.id}>
                          <TableCell className="text-xs font-mono-ip">{formatEAT(e.updated_at)}</TableCell>
                          <TableCell className="font-mono-ip text-sm">{e.ip_address}{e.cidr && <span className="text-muted-foreground text-[10px] ml-1">({e.cidr})</span>}</TableCell>
                          <TableCell className="text-xs">{(e.rbl_lists || []).join(", ") || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-[10px] capitalize", sevColor[sev])}>{sev}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={cn("text-[10px]", actionColor.Pending)}>Pending</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl p-4 max-w-2xl">
              <div className="flex items-center gap-2 mb-3">
                <Search className="h-4 w-4 text-warning" />
                <h2 className="text-sm font-semibold text-foreground">RBL Checker</h2>
              </div>
              <div className="flex gap-2">
                <Input
                  className="font-mono-ip"
                  placeholder="Enter IP address..."
                  value={ip}
                  onChange={e => setIp(e.target.value)}
                />
                <Button
                  onClick={runCheck}
                  disabled={checking}
                  className="text-foreground"
                  style={{ background: "linear-gradient(135deg, hsl(38 92% 50%), hsl(32 95% 44%))" }}
                >
                  {checking ? "Checking..." : "Check RBL"}
                </Button>
              </div>
              {result && (
                <div className="mt-3 p-3 rounded-lg bg-muted/40 border border-border text-xs text-muted-foreground">
                  {result}
                </div>
              )}
            </div>
          </main>
          <VersionFooter />
        </div>
      </div>
    </SidebarProvider>
  );
}
