import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Plus, LogOut, Globe, Shield, Bell, Settings } from "lucide-react";
import { IPMonitorList } from "@/components/dashboard/IPMonitorList";
import { AddIPDialog } from "@/components/dashboard/AddIPDialog";
import { IPReputationTab } from "@/components/dashboard/IPReputationTab";
import { TelegramSettingsTab } from "@/components/dashboard/TelegramSettingsTab";
import { SmsSettingsTab } from "@/components/dashboard/SmsSettingsTab";
import { NotificationLogTab } from "@/components/dashboard/NotificationLogTab";
import { toast } from "sonner";
import { useAutoLogout } from "@/hooks/use-auto-logout";
import { UpdateBanner } from "@/components/dashboard/UpdateBanner";
import { VersionFooter } from "@/components/dashboard/VersionFooter";

const Dashboard = () => {
  useAutoLogout();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(false);
  const [showAddIP, setShowAddIP] = useState(false);
  const [isAdminOrAbove, setIsAdminOrAbove] = useState(false);

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

  const handleRefresh = () => {
    setRefreshTrigger((prev) => !prev);
    toast.info("Refreshing...");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Globe className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Nosteq IP Monitor</h1>
                <p className="text-sm text-muted-foreground">Uptime & Blacklist Intelligence</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button variant="default" size="sm" onClick={() => setShowAddIP(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add IP
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate("/admin")}>
                <Settings className="h-4 w-4 mr-2" />
                Admin
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        <UpdateBanner />
        <Tabs defaultValue="monitor" className="space-y-6">
          <div className="flex items-center justify-between">
            <TabsList className="bg-card border border-border/50">
              <TabsTrigger value="monitor" className="flex items-center gap-2">
                <Globe className="h-4 w-4" /> IP Monitor
              </TabsTrigger>
              <TabsTrigger value="reputation" className="flex items-center gap-2">
                <Shield className="h-4 w-4" /> Blacklist Check
              </TabsTrigger>
              <TabsTrigger value="notifications" className="flex items-center gap-2">
                <Bell className="h-4 w-4" /> Notifications
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="monitor">
            <IPMonitorList refreshTrigger={refreshTrigger} />
          </TabsContent>

          <TabsContent value="reputation">
            <IPReputationTab />
          </TabsContent>

          <TabsContent value="notifications">
            <Tabs defaultValue="telegram" className="space-y-4">
              <TabsList className="bg-secondary/50">
                <TabsTrigger value="telegram">Telegram</TabsTrigger>
                <TabsTrigger value="sms">SMS</TabsTrigger>
                <TabsTrigger value="log">Notification Log</TabsTrigger>
              </TabsList>
              <TabsContent value="telegram">
                <TelegramSettingsTab />
              </TabsContent>
              <TabsContent value="sms">
                <SmsSettingsTab />
              </TabsContent>
              <TabsContent value="log">
                <NotificationLogTab />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </main>

      <AddIPDialog open={showAddIP} onOpenChange={setShowAddIP} onSaved={handleRefresh} />
      <VersionFooter />
    </div>
  );
};

export default Dashboard;
