import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RefreshCw, Plus, LogOut, Activity, Users, Shield, Flame } from "lucide-react";
import { DeviceGrid } from "@/components/dashboard/DeviceGrid";
import { AddDeviceDialog } from "@/components/dashboard/AddDeviceDialog";
import { IPReputationTab } from "@/components/dashboard/IPReputationTab";
import { FirewallNATTab } from "@/components/dashboard/FirewallNATTab";
import { toast } from "sonner";

const Dashboard = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
      } else {
        setUser(session.user);
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
    if (!autoRefreshEnabled) return;
    const interval = setInterval(() => {
      handleRefresh();
    }, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [autoRefreshEnabled]);

  const handleRefresh = async () => {
    setRefreshing(true);
    toast.info("Refreshing device status...");
    setTimeout(() => setRefreshing(false), 1000);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Nosteq Networks</h1>
                <p className="text-sm text-muted-foreground">MikroTik Monitoring Dashboard</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button variant="default" size="sm" onClick={() => setShowAddDevice(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Device
              </Button>
              <Button variant="outline" size="sm" onClick={() => navigate("/users")}>
                <Users className="h-4 w-4 mr-2" />
                Users
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="devices" className="space-y-6">
          <TabsList className="bg-card border border-border/50">
            <TabsTrigger value="devices" className="flex items-center gap-2">
              <Activity className="h-4 w-4" /> Devices
            </TabsTrigger>
            <TabsTrigger value="firewall" className="flex items-center gap-2">
              <Flame className="h-4 w-4" /> Firewall & NAT
            </TabsTrigger>
            <TabsTrigger value="ip-reputation" className="flex items-center gap-2">
              <Shield className="h-4 w-4" /> IP Reputation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="devices">
            <DeviceGrid refreshTrigger={refreshing} />
          </TabsContent>

          <TabsContent value="firewall">
            <FirewallNATTab />
          </TabsContent>

          <TabsContent value="ip-reputation">
            <IPReputationTab />
          </TabsContent>
        </Tabs>
      </main>

      <AddDeviceDialog open={showAddDevice} onOpenChange={setShowAddDevice} />
    </div>
  );
};

export default Dashboard;
