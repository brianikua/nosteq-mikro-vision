import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { RefreshCw, Plus, List, Monitor, Bell } from "lucide-react";
import { IPMonitorList } from "@/components/dashboard/IPMonitorList";
import { IPServerView } from "@/components/dashboard/IPServerView";
import { AddIPDialog } from "@/components/dashboard/AddIPDialog";
import { IPReputationTab } from "@/components/dashboard/IPReputationTab";
import { TelegramSettingsTab } from "@/components/dashboard/TelegramSettingsTab";
import { SmsSettingsTab } from "@/components/dashboard/SmsSettingsTab";
import { NotificationLogTab } from "@/components/dashboard/NotificationLogTab";
import { UptimeReportTab } from "@/components/dashboard/UptimeReportTab";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { SetupWizard } from "@/components/setup/SetupWizard";
import { useHostingMode } from "@/hooks/use-hosting-mode";
import { toast } from "sonner";
import { useAutoLogout } from "@/hooks/use-auto-logout";
import { UpdateBanner } from "@/components/dashboard/UpdateBanner";
import { VersionFooter } from "@/components/dashboard/VersionFooter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  monitor: { title: "Dashboard", subtitle: "Real-time IP monitoring & status" },
  "ip-space": { title: "IP Space", subtitle: "All monitored IPs across devices" },
  reputation: { title: "Blacklist Center", subtitle: "IP reputation & blacklist intelligence" },
  uptime: { title: "Uptime Report", subtitle: "Historical uptime analytics & trends" },
  notifications: { title: "Notifications", subtitle: "Alert channels & notification settings" },
};

const Dashboard = () => {
  useAutoLogout();
  const navigate = useNavigate();
  const { setupComplete, loading: configLoading, refreshConfig } = useHostingMode();
  const [user, setUser] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(false);
  const [showAddIP, setShowAddIP] = useState(false);
  const [isAdminOrAbove, setIsAdminOrAbove] = useState(false);
  const [viewMode, setViewMode] = useState<"flat" | "server">("flat");
  const [activeTab, setActiveTab] = useState("monitor");
  const [showSetup, setShowSetup] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id)
          .single();
        if (data && (data.role === "admin" || data.role === "superadmin")) {
          setIsAdminOrAbove(true);
        }
      }
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (!configLoading && !setupComplete && user) {
      setShowSetup(true);
    }
  }, [configLoading, setupComplete, user]);

  const handleRefresh = () => {
    setRefreshTrigger((prev) => !prev);
    toast.info("Refreshing...");
  };

  if (!user) return null;

  if (showSetup) {
    return <SetupWizard onComplete={() => { setShowSetup(false); refreshConfig(); }} />;
  }

  const currentPage = pageTitles[activeTab] || pageTitles.monitor;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          isAdminOrAbove={isAdminOrAbove}
          userEmail={user.email}
        />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-[60px] flex items-center justify-between px-4 border-b border-border/50 bg-background/95 backdrop-blur-xl sticky top-0 z-50">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h1 className="text-base font-semibold text-foreground">{currentPage.title}</h1>
                <p className="text-[11px] text-muted-foreground">{currentPage.subtitle}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs border-border/50 hover:border-primary/50" onClick={handleRefresh}>
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                Refresh
              </Button>
              {activeTab === "monitor" && (
                <Button size="sm" className="h-8 text-xs gradient-primary text-primary-foreground hover:opacity-90" onClick={() => setShowAddIP(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Add IP
                </Button>
              )}
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 overflow-auto animate-in fade-in duration-200">
            <UpdateBanner />

            {activeTab === "monitor" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Button
                    variant={viewMode === "flat" ? "default" : "outline"}
                    size="sm"
                    className={cn("h-8 text-xs gap-1.5", viewMode === "flat" && "gradient-primary text-primary-foreground")}
                    onClick={() => setViewMode("flat")}
                  >
                    <List className="h-3.5 w-3.5" /> Flat List
                  </Button>
                  <Button
                    variant={viewMode === "server" ? "default" : "outline"}
                    size="sm"
                    className={cn("h-8 text-xs gap-1.5", viewMode === "server" && "gradient-primary text-primary-foreground")}
                    onClick={() => setViewMode("server")}
                  >
                    <Monitor className="h-3.5 w-3.5" /> Server View
                  </Button>
                </div>
                {viewMode === "flat" ? (
                  <IPMonitorList refreshTrigger={refreshTrigger} />
                ) : (
                  <IPServerView refreshTrigger={refreshTrigger} />
                )}
              </div>
            )}

            {activeTab === "ip-space" && (
              <div className="text-center py-16">
                <p className="text-muted-foreground">IP Space view coming soon — use Devices page for full IP documentation</p>
                <Button className="mt-4" variant="outline" onClick={() => navigate("/devices")}>Go to Devices</Button>
              </div>
            )}

            {activeTab === "reputation" && <IPReputationTab />}
            {activeTab === "uptime" && <UptimeReportTab />}

            {activeTab === "notifications" && (
              <Tabs defaultValue="telegram" className="space-y-4">
                <TabsList className="glass">
                  <TabsTrigger value="telegram">Telegram</TabsTrigger>
                  <TabsTrigger value="sms">SMS</TabsTrigger>
                  <TabsTrigger value="log">Notification Log</TabsTrigger>
                </TabsList>
                <TabsContent value="telegram"><TelegramSettingsTab /></TabsContent>
                <TabsContent value="sms"><SmsSettingsTab /></TabsContent>
                <TabsContent value="log"><NotificationLogTab /></TabsContent>
              </Tabs>
            )}
          </main>

          <VersionFooter />
        </div>
      </div>
      <AddIPDialog open={showAddIP} onOpenChange={setShowAddIP} onSaved={handleRefresh} />
    </SidebarProvider>
  );
};

export default Dashboard;
