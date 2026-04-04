import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { VersionFooter } from "@/components/dashboard/VersionFooter";
import { AddDeviceWizard } from "@/components/devices/AddDeviceWizard";
import { Plus, Search, LayoutGrid, List, Server, Wifi, Monitor, Router, Radio, HardDrive, Cpu, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAutoLogout } from "@/hooks/use-auto-logout";
import { useHostingMode } from "@/hooks/use-hosting-mode";

const typeIcons: Record<string, any> = {
  OLT: Router,
  MikroTik_Router: Router,
  MikroTik_Switch: Monitor,
  Linux_Server: HardDrive,
  Windows_Server: HardDrive,
  CPE: Radio,
  Access_Point: Wifi,
  Other: Cpu,
};

const Devices = () => {
  useAutoLogout();
  const navigate = useNavigate();
  const { hostingMode } = useHostingMode();
  const [user, setUser] = useState<any>(null);
  const [isAdminOrAbove, setIsAdminOrAbove] = useState(false);
  const [devices, setDevices] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setUser(session.user);
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id).single();
      if (roleData && (roleData.role === "admin" || roleData.role === "superadmin")) setIsAdminOrAbove(true);
      fetchDevices();
    };
    init();
  }, [navigate]);

  const fetchDevices = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("devices")
      .select("*, ip_assignments:ip_assignments(id, ip_address, last_status, is_public, monitor_uptime, last_ping_ms, role, blacklist_count), interfaces:interfaces(id), vlans:vlans(id)")
      .order("name");
    setDevices(data || []);
    setLoading(false);
  };

  const filtered = devices.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase()) ||
    d.ip_address?.toLowerCase().includes(search.toLowerCase()) ||
    d.site_name?.toLowerCase().includes(search.toLowerCase())
  );

  if (!user) return null;

  const getDeviceStatus = (device: any) => {
    const ips = device.ip_assignments || [];
    const monitored = ips.filter((ip: any) => ip.monitor_uptime);
    if (monitored.length === 0) return "unknown";
    const up = monitored.filter((ip: any) => ip.last_status === "up").length;
    if (up === monitored.length) return "up";
    if (up === 0) return "down";
    return "partial";
  };

  const statusColors: Record<string, string> = {
    up: "border-l-[hsl(var(--success))]",
    down: "border-l-destructive",
    partial: "border-l-[hsl(var(--warning))]",
    unknown: "border-l-muted-foreground",
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar activeTab="devices" onTabChange={(tab) => {
          if (tab === "monitor") navigate("/dashboard");
          else if (tab === "devices") {}
          else if (tab === "ip-space") navigate("/ip-space");
          else if (tab === "reputation") navigate("/dashboard");
          else if (tab === "uptime") navigate("/dashboard");
          else if (tab === "abuse") navigate("/abuse");
          else if (tab === "notifications") navigate("/dashboard");
          else if (tab === "settings") navigate("/settings");
        }} isAdminOrAbove={isAdminOrAbove} userEmail={user.email} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-[60px] flex items-center justify-between px-4 border-b border-border/50 bg-background/95 backdrop-blur-xl sticky top-0 z-50">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h1 className="text-base font-semibold text-foreground">Network Devices</h1>
                <p className="text-[11px] text-muted-foreground">Gadget documentation & monitoring</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" className="h-8 text-xs gradient-primary text-primary-foreground" onClick={() => setShowAddDevice(true)}>
                <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Gadget
              </Button>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 overflow-auto animate-in fade-in duration-200">
            {/* Filters */}
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search devices..." className="pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="flex items-center gap-1">
                <Button variant={viewMode === "cards" ? "default" : "outline"} size="sm" className={cn("h-8", viewMode === "cards" && "gradient-primary text-primary-foreground")} onClick={() => setViewMode("cards")}>
                  <LayoutGrid className="h-3.5 w-3.5" />
                </Button>
                <Button variant={viewMode === "table" ? "default" : "outline"} size="sm" className={cn("h-8", viewMode === "table" && "gradient-primary text-primary-foreground")} onClick={() => setViewMode("table")}>
                  <List className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>

            {/* Device Cards */}
            {loading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-48 rounded-xl bg-card animate-pulse" />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <Server className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground">No gadgets yet</h3>
                <p className="text-sm text-muted-foreground mt-1">Add your first network gadget to start monitoring</p>
                <Button className="mt-4 gradient-primary text-primary-foreground" onClick={() => setShowAddDevice(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Add Gadget
                </Button>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filtered.map((device) => {
                  const status = getDeviceStatus(device);
                  const Icon = typeIcons[device.type] || Cpu;
                  const monitoredIps = (device.ip_assignments || []).filter((ip: any) => ip.monitor_uptime);
                  const blacklistCount = (device.ip_assignments || []).reduce((sum: number, ip: any) => sum + (ip.blacklist_count || 0), 0);

                  return (
                    <div
                      key={device.id}
                      className={cn("bg-card border border-border rounded-xl p-4 cursor-pointer hover:-translate-y-0.5 transition-all border-l-4", statusColors[status])}
                      onClick={() => navigate(`/devices/${device.id}`)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Icon className="h-5 w-5 text-primary" />
                          <div>
                            <p className="font-semibold text-foreground text-sm">{device.name}</p>
                            {device.site_name && <p className="text-[11px] text-muted-foreground">📍 {device.site_name}</p>}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-[10px]">{(device.type || "Other").replace(/_/g, " ")}</Badge>
                      </div>

                      {device.model && <p className="text-xs text-muted-foreground mb-2">Model: {device.model} {device.os_version ? `| ${device.os_version}` : ""}</p>}

                      <div className="flex items-center gap-3 text-xs text-muted-foreground mb-3">
                        <span>Interfaces: {(device.interfaces || []).length}</span>
                        <span>IPs: {(device.ip_assignments || []).length}</span>
                        <span>VLANs: {(device.vlans || []).length}</span>
                      </div>

                      {monitoredIps.length > 0 && (
                        <div className="space-y-1 border-t border-border/50 pt-2">
                          {monitoredIps.slice(0, 4).map((ip: any) => (
                            <div key={ip.id} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-1.5">
                                <div className={cn("h-1.5 w-1.5 rounded-full", ip.last_status === "up" ? "bg-success" : ip.last_status === "down" ? "bg-destructive animate-pulse" : "bg-muted-foreground")} />
                                <span className="font-mono text-foreground">{ip.ip_address}</span>
                                <span className="text-muted-foreground">{ip.role}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                {ip.last_ping_ms != null && <span className="text-muted-foreground">{ip.last_ping_ms}ms</span>}
                                {ip.blacklist_count > 0 && <span className="text-destructive">🛡{ip.blacklist_count}</span>}
                                {ip.is_public ? <span className="text-primary text-[9px]">🌐</span> : <span className="text-[9px]">🏠</span>}
                              </div>
                            </div>
                          ))}
                          {monitoredIps.length > 4 && <p className="text-[10px] text-muted-foreground">+{monitoredIps.length - 4} more</p>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </main>
          <VersionFooter />
        </div>
      </div>
      {showAddDevice && <AddDeviceWizard open={showAddDevice} onOpenChange={setShowAddDevice} onSaved={fetchDevices} />}
    </SidebarProvider>
  );
};

export default Devices;
