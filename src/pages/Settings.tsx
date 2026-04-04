import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { VersionFooter } from "@/components/dashboard/VersionFooter";
import { TelegramSettingsTab } from "@/components/dashboard/TelegramSettingsTab";
import { SmsSettingsTab } from "@/components/dashboard/SmsSettingsTab";
import { NotificationLogTab } from "@/components/dashboard/NotificationLogTab";
import { AdminSettingsTab } from "@/components/dashboard/AdminSettingsTab";
import { ServerManagement } from "@/components/dashboard/ServerManagement";
import { useAutoLogout } from "@/hooks/use-auto-logout";
import { useHostingMode } from "@/hooks/use-hosting-mode";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bell, Settings, Wifi, Shield, SlidersHorizontal, Server } from "lucide-react";

const SettingsPage = () => {
  useAutoLogout();
  const navigate = useNavigate();
  const { hostingMode } = useHostingMode();
  const [user, setUser] = useState<any>(null);
  const [isAdminOrAbove, setIsAdminOrAbove] = useState(false);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setUser(session.user);
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id).single();
      if (roleData && (roleData.role === "admin" || roleData.role === "superadmin")) setIsAdminOrAbove(true);
    };
    init();
  }, [navigate]);

  if (!user) return null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar activeTab="settings" onTabChange={() => {}} isAdminOrAbove={isAdminOrAbove} userEmail={user.email} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-[60px] flex items-center justify-between px-4 border-b border-border/50 bg-background/95 backdrop-blur-xl sticky top-0 z-50">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h1 className="text-base font-semibold text-foreground">Settings</h1>
                <p className="text-[11px] text-muted-foreground">Notifications, monitoring, and system configuration</p>
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 overflow-auto space-y-6 animate-in fade-in duration-200">
            {/* Card 1: Notifications */}
            <Card className="border-border/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Bell className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle>Notification Configuration</CardTitle>
                    <CardDescription>Configure Telegram, SMS, and notification channels</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>

            {/* Card 2: Hosting Mode */}
            <Card className="border-border/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Wifi className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle>Hosting Mode</CardTitle>
                    <CardDescription>Current deployment configuration</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Badge className="text-sm px-3 py-1" variant={hostingMode === "local" ? "default" : "secondary"}>
                    {hostingMode === "local" ? "🏠 LOCAL MODE — All IPs monitored directly" : "🔐 VPN MODE — Private IPs via VPN tunnel"}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            {/* Card 3: Monitoring Settings + Alert Thresholds */}
            <Card className="border-border/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle>Monitoring & Alert Settings</CardTitle>
                    <CardDescription>Configure intervals, thresholds, and escalation</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <AdminSettingsTab />
              </CardContent>
            </Card>

            {/* Card 4: IP Groups / Servers */}
            <Card className="border-border/50">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Server className="h-5 w-5 text-primary" />
                  <div>
                    <CardTitle>IP Groups & Servers</CardTitle>
                    <CardDescription>Manage server groups and color-coded IP grouping</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ServerManagement />
              </CardContent>
            </Card>
          </main>
          <VersionFooter />
        </div>
      </div>
    </SidebarProvider>
  );
};

export default SettingsPage;
