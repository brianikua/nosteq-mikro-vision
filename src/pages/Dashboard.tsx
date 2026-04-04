import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { SetupWizard } from "@/components/setup/SetupWizard";
import { useHostingMode } from "@/hooks/use-hosting-mode";
import { toast } from "sonner";
import { useAutoLogout } from "@/hooks/use-auto-logout";
import { UpdateBanner } from "@/components/dashboard/UpdateBanner";
import { VersionFooter } from "@/components/dashboard/VersionFooter";
import { cn } from "@/lib/utils";
import {
  Monitor, Wifi, WifiOff, ShieldAlert, ArrowRight, Activity, AlertTriangle, Globe,
  RefreshCw, Clock,
} from "lucide-react";
import {
  AreaChart, Area, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid,
} from "recharts";

const Dashboard = () => {
  useAutoLogout();
  const navigate = useNavigate();
  const { setupComplete, loading: configLoading, refreshConfig, hostingMode } = useHostingMode();
  const [user, setUser] = useState<any>(null);
  const [isAdminOrAbove, setIsAdminOrAbove] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [stats, setStats] = useState({ totalDevices: 0, ipsOnline: 0, ipsOffline: 0, blacklisted: 0 });
  const [recentEvents, setRecentEvents] = useState<any[]>([]);
  const [deviceSummary, setDeviceSummary] = useState<any[]>([]);
  const [ipSummary, setIpSummary] = useState<any>(null);
  const [healthData, setHealthData] = useState<any>(null);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setUser(session.user);
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id).single();
      if (data && (data.role === "admin" || data.role === "superadmin")) setIsAdminOrAbove(true);
    };
    checkAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/auth");
      else setUser(session.user);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!configLoading && !setupComplete && user) setShowSetup(true);
  }, [configLoading, setupComplete, user]);

  useEffect(() => {
    if (!user) return;
    fetchDashboardData();
  }, [user]);

  const fetchDashboardData = async () => {
    const [devRes, ipRes, eventsRes, abuseRes] = await Promise.all([
      supabase.from("devices").select("id, name, type, site_name, status"),
      supabase.from("ip_assignments").select("id, last_status, blacklist_count, monitor_uptime, last_ping_ms"),
      supabase.from("notification_log").select("id, event_type, ip_address, message, sent_at").order("sent_at", { ascending: false }).limit(10),
      supabase.from("abuse_reports").select("id"),
    ]);

    const devices = devRes.data || [];
    const ips = ipRes.data || [];
    const monitored = ips.filter((ip) => ip.monitor_uptime);
    const online = monitored.filter((ip) => ip.last_status === "up").length;
    const offline = monitored.filter((ip) => ip.last_status === "down").length;
    const blacklisted = ips.filter((ip) => (ip.blacklist_count || 0) > 0).length;

    setStats({ totalDevices: devices.length, ipsOnline: online, ipsOffline: offline, blacklisted });
    setRecentEvents(eventsRes.data || []);

    // Device summary: top 5 with issues
    const issueDevices = devices.filter((d) => d.status === "active").slice(0, 5);
    setDeviceSummary(issueDevices);

    // IP Intelligence summary
    setIpSummary({ total: ips.length, listed: blacklisted, clean: ips.length - blacklisted });

    // Health data
    const uptimePct = monitored.length > 0 ? Math.round((online / monitored.length) * 100) : 100;
    setHealthData({ uptimePct, abuseCount: (abuseRes.data || []).length });
  };

  if (!user) return null;
  if (showSetup) return <SetupWizard onComplete={() => { setShowSetup(false); refreshConfig(); }} />;

  const pieData = [
    { name: "UP", value: stats.ipsOnline, color: "hsl(142, 76%, 36%)" },
    { name: "DOWN", value: stats.ipsOffline, color: "hsl(0, 84%, 60%)" },
  ];
  if (stats.ipsOnline === 0 && stats.ipsOffline === 0) {
    pieData.push({ name: "Unknown", value: 1, color: "hsl(var(--muted-foreground))" });
  }

  const eventIcon = (type: string) => {
    if (type.includes("down")) return <WifiOff className="h-3.5 w-3.5 text-destructive" />;
    if (type.includes("up")) return <Wifi className="h-3.5 w-3.5 text-success" />;
    if (type.includes("blacklist")) return <ShieldAlert className="h-3.5 w-3.5 text-warning" />;
    return <Clock className="h-3.5 w-3.5 text-muted-foreground" />;
  };

  const timeAgo = (d: string) => {
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
    return `${Math.floor(mins / 1440)}d ago`;
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar activeTab="dashboard" onTabChange={() => {}} isAdminOrAbove={isAdminOrAbove} userEmail={user?.email} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-[60px] flex items-center justify-between px-4 border-b border-border/50 bg-background/95 backdrop-blur-xl sticky top-0 z-50">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h1 className="text-base font-semibold text-foreground">Dashboard</h1>
                <p className="text-[11px] text-muted-foreground">Network overview & intelligence</p>
              </div>
            </div>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { fetchDashboardData(); toast.info("Refreshing..."); }}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh
            </Button>
          </header>

          <main className="flex-1 p-4 md:p-6 overflow-auto animate-in fade-in duration-200 space-y-6">
            <UpdateBanner />

            {/* ROW 1: Hero Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Total Gadgets", value: stats.totalDevices, icon: Monitor, color: "text-primary" },
                { label: "IPs Online", value: stats.ipsOnline, icon: Wifi, color: "text-success" },
                { label: "IPs Offline", value: stats.ipsOffline, icon: WifiOff, color: "text-destructive" },
                { label: "Blacklisted", value: stats.blacklisted, icon: ShieldAlert, color: "text-warning" },
              ].map((s) => (
                <Card key={s.label} className="border-border/50 hover:-translate-y-0.5 transition-transform">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">{s.label}</p>
                        <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
                      </div>
                      <div className="h-10 w-10 rounded-lg bg-muted/30 flex items-center justify-center">
                        <s.icon className="h-5 w-5 text-muted-foreground/50" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* ROW 3: Module Summary Cards */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Network Devices */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2"><Monitor className="h-4 w-4 text-primary" /> Network Devices</CardTitle>
                    <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => navigate("/devices")}>
                      View All <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                    <span>{stats.totalDevices} total</span>
                    <span className="text-success">{deviceSummary.filter((d) => d.status === "active").length} active</span>
                  </div>
                  {deviceSummary.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No devices yet. Add your first device.</p>
                  ) : (
                    <div className="space-y-1">
                      {deviceSummary.slice(0, 5).map((d) => (
                        <div key={d.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/20 cursor-pointer" onClick={() => navigate(`/devices/${d.id}`)}>
                          <span className="text-xs text-foreground">{d.name}</span>
                          <Badge variant="outline" className="text-[9px]">{(d.type || "Other").replace(/_/g, " ")}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* IP Intelligence */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2"><Globe className="h-4 w-4 text-primary" /> IP Intelligence</CardTitle>
                    <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => navigate("/ip-intelligence")}>
                      View All <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                    <span>{ipSummary?.total || 0} total IPs</span>
                    <span className="text-destructive">{ipSummary?.listed || 0} listed</span>
                    <span className="text-success">{ipSummary?.clean || 0} clean</span>
                  </div>
                  {(ipSummary?.listed || 0) > 0 ? (
                    <p className="text-xs text-warning">🚨 {ipSummary?.listed} IPs have active blacklist listings</p>
                  ) : (
                    <p className="text-xs text-success">✅ All monitored IPs are clean</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ROW 4: Health + Events */}
            <div className="grid md:grid-cols-2 gap-4">
              {/* Network Health */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Network Health</CardTitle>
                    <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => navigate("/network-health")}>
                      View All <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-6">
                    <div>
                      <p className={cn("text-3xl font-bold", (healthData?.uptimePct || 0) >= 99 ? "text-success" : (healthData?.uptimePct || 0) >= 90 ? "text-warning" : "text-destructive")}>
                        {healthData?.uptimePct || 0}%
                      </p>
                      <p className="text-xs text-muted-foreground">Overall Uptime</p>
                    </div>
                    <div>
                      <p className="text-lg font-semibold text-foreground">{healthData?.abuseCount || 0}</p>
                      <p className="text-xs text-muted-foreground">Abuse Reports</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Events */}
              <Card className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> Recent Events</CardTitle>
                </CardHeader>
                <CardContent>
                  {recentEvents.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No events yet.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-[200px] overflow-auto">
                      {recentEvents.map((ev) => (
                        <div key={ev.id} className="flex items-center gap-2 py-1">
                          {eventIcon(ev.event_type)}
                          <span className="text-xs text-foreground flex-1 truncate">{ev.message}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">{ev.sent_at ? timeAgo(ev.sent_at) : ""}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* ROW 5: Charts */}
            <div className="grid md:grid-cols-5 gap-4">
              <Card className="border-border/50 md:col-span-3">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Status Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="h-[200px] flex items-center justify-center">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                          {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center gap-4 text-xs">
                    {pieData.filter((d) => d.value > 0).map((d) => (
                      <div key={d.name} className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: d.color }} />
                        <span className="text-muted-foreground">{d.name}: {d.value}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/50 md:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Quick Navigation</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {[
                    { label: "Network Devices", route: "/devices", icon: Monitor },
                    { label: "IP Intelligence", route: "/ip-intelligence", icon: Globe },
                    { label: "Network Health", route: "/network-health", icon: Activity },
                    { label: "Settings", route: "/settings", icon: AlertTriangle },
                  ].map((item) => (
                    <Button key={item.route} variant="ghost" className="w-full justify-start text-xs h-9" onClick={() => navigate(item.route)}>
                      <item.icon className="h-3.5 w-3.5 mr-2 text-primary" />
                      {item.label}
                      <ArrowRight className="h-3 w-3 ml-auto text-muted-foreground" />
                    </Button>
                  ))}
                </CardContent>
              </Card>
            </div>
          </main>
          <VersionFooter />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Dashboard;
