import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { VersionFooter } from "@/components/dashboard/VersionFooter";
import { IPDetailDrawer } from "@/components/dashboard/IPDetailDrawer";
import { IPReputationTab } from "@/components/dashboard/IPReputationTab";
import { Globe, Shield, Search, Wifi, WifiOff, ShieldAlert, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAutoLogout } from "@/hooks/use-auto-logout";

const IPIntelligence = () => {
  useAutoLogout();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isAdminOrAbove, setIsAdminOrAbove] = useState(false);
  const [ipAssignments, setIpAssignments] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedIP, setSelectedIP] = useState<any>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setUser(session.user);
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id).single();
      if (roleData && (roleData.role === "admin" || roleData.role === "superadmin")) setIsAdminOrAbove(true);
      fetchData();
    };
    init();
  }, [navigate]);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ip_assignments")
      .select("*, devices:devices(id, name, site_name, type), interfaces:interfaces(id, name, description)")
      .order("ip_address");
    setIpAssignments(data || []);
    setLoading(false);
  };

  if (!user) return null;

  const filtered = ipAssignments.filter((ip) =>
    ip.ip_address?.toLowerCase().includes(search.toLowerCase()) ||
    ip.devices?.name?.toLowerCase().includes(search.toLowerCase()) ||
    ip.interfaces?.name?.toLowerCase().includes(search.toLowerCase())
  );

  const publicIPs = filtered.filter((ip) => ip.monitor_blacklist);
  const totalIPs = ipAssignments.length;
  const listedIPs = ipAssignments.filter((ip) => (ip.blacklist_count || 0) > 0).length;
  const onlineIPs = ipAssignments.filter((ip) => ip.last_status === "up").length;
  const offlineIPs = ipAssignments.filter((ip) => ip.last_status === "down").length;

  const handleRowClick = (ip: any) => {
    setSelectedIP(ip);
    setDrawerOpen(true);
  };

  const formatDate = (d: string) => d ? new Date(d).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" }) : "—";

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar activeTab="ip-intelligence" onTabChange={() => {}} isAdminOrAbove={isAdminOrAbove} userEmail={user.email} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-[60px] flex items-center justify-between px-4 border-b border-border/50 bg-background/95 backdrop-blur-xl sticky top-0 z-50">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h1 className="text-base font-semibold text-foreground">IP Intelligence</h1>
                <p className="text-[11px] text-muted-foreground">Unified IP monitoring & blacklist center</p>
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 overflow-auto animate-in fade-in duration-200">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {[
                { label: "Total IPs", value: totalIPs, icon: Globe, color: "text-primary" },
                { label: "Online", value: onlineIPs, icon: Wifi, color: "text-success" },
                { label: "Offline", value: offlineIPs, icon: WifiOff, color: "text-destructive" },
                { label: "Blacklisted", value: listedIPs, icon: ShieldAlert, color: "text-warning" },
              ].map((s) => (
                <Card key={s.label} className="border-border/50">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                        <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
                      </div>
                      <s.icon className="h-6 w-6 text-muted-foreground/30" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Tabs defaultValue="all-ips" className="space-y-4">
              <TabsList className="glass">
                <TabsTrigger value="all-ips" className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" /> All IPs
                </TabsTrigger>
                <TabsTrigger value="blacklist" className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5" /> Blacklist
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all-ips">
                <div className="relative max-w-sm mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search by IP, device, or interface..." className="pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>

                {loading ? (
                  <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-12 bg-card animate-pulse rounded-lg" />)}</div>
                ) : filtered.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">No IP assignments found.</div>
                ) : (
                  <div className="border border-border rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/30">
                          <tr>
                            <th className="text-left p-3 text-muted-foreground font-medium">IP Address</th>
                            <th className="text-left p-3 text-muted-foreground font-medium hidden sm:table-cell">Device</th>
                            <th className="text-left p-3 text-muted-foreground font-medium hidden md:table-cell">Interface</th>
                            <th className="text-left p-3 text-muted-foreground font-medium hidden lg:table-cell">Role</th>
                            <th className="text-center p-3 text-muted-foreground font-medium">Status</th>
                            <th className="text-right p-3 text-muted-foreground font-medium hidden sm:table-cell">Latency</th>
                            <th className="text-right p-3 text-muted-foreground font-medium hidden md:table-cell">Blacklists</th>
                            <th className="text-right p-3 text-muted-foreground font-medium hidden lg:table-cell">Last Checked</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filtered.map((ip) => (
                            <tr key={ip.id} className="border-t border-border/30 hover:bg-muted/20 cursor-pointer transition" onClick={() => handleRowClick(ip)}>
                              <td className="p-3 font-mono text-foreground text-xs">{ip.ip_address}</td>
                              <td className="p-3 text-xs hidden sm:table-cell">{ip.devices?.name || "—"}</td>
                              <td className="p-3 text-xs text-muted-foreground hidden md:table-cell">{ip.interfaces?.name || "—"}</td>
                              <td className="p-3 hidden lg:table-cell"><Badge variant="outline" className="text-[10px]">{ip.role}</Badge></td>
                              <td className="p-3 text-center">
                                <div className={cn("inline-flex h-2 w-2 rounded-full", ip.last_status === "up" ? "bg-success" : ip.last_status === "down" ? "bg-destructive animate-pulse" : "bg-muted-foreground")} />
                              </td>
                              <td className="p-3 text-right text-xs text-muted-foreground hidden sm:table-cell">{ip.last_ping_ms != null ? `${ip.last_ping_ms}ms` : "—"}</td>
                              <td className="p-3 text-right hidden md:table-cell">{(ip.blacklist_count || 0) > 0 ? <Badge variant="destructive" className="text-[9px]">{ip.blacklist_count}</Badge> : <span className="text-xs text-muted-foreground">0</span>}</td>
                              <td className="p-3 text-right text-[10px] text-muted-foreground hidden lg:table-cell">{ip.last_ping_at ? formatDate(ip.last_ping_at) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="blacklist">
                <IPReputationTab />
              </TabsContent>
            </Tabs>
          </main>
          <VersionFooter />
        </div>
      </div>

      <IPDetailDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        ipAssignment={selectedIP}
        deviceName={selectedIP?.devices?.name}
        interfaceName={selectedIP?.interfaces?.name}
        siteName={selectedIP?.devices?.site_name}
      />
    </SidebarProvider>
  );
};

export default IPIntelligence;
