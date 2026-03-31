import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, LogOut, Settings, Users, FileText, Server, KeyRound, Monitor } from "lucide-react";
import { UserManagement } from "@/components/dashboard/UserManagement";
import { ChangelogTab } from "@/components/dashboard/ChangelogTab";
import { SystemHealthTab } from "@/components/dashboard/SystemHealthTab";
import { ServerManagement } from "@/components/dashboard/ServerManagement";
import { VersionFooter } from "@/components/dashboard/VersionFooter";
import { useAutoLogout } from "@/hooks/use-auto-logout";

const AdminPanel = () => {
  useAutoLogout();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isSuperadmin, setIsSuperadmin] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setUser(session.user);

      const { data } = await supabase
        .from("user_roles").select("role")
        .eq("user_id", session.user.id).eq("role", "superadmin").maybeSingle();
      setIsSuperadmin(!!data);
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/auth");
      else setUser(session.user);
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

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
              <Settings className="h-7 w-7 text-primary" />
              <div>
                <h1 className="text-xl font-bold">Admin Panel</h1>
                <p className="text-xs text-muted-foreground">System Management & Administration</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => navigate("/dashboard")}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6">
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="bg-card border border-border/50 flex-wrap">
            {isSuperadmin && (
              <TabsTrigger value="users" className="flex items-center gap-1.5">
                <Users className="h-4 w-4" /> Users
              </TabsTrigger>
            )}
            <TabsTrigger value="changelog" className="flex items-center gap-1.5">
              <FileText className="h-4 w-4" /> Changelog
            </TabsTrigger>
            {isSuperadmin && (
              <TabsTrigger value="system" className="flex items-center gap-1.5">
                <Server className="h-4 w-4" /> System Health
              </TabsTrigger>
            )}
            {isSuperadmin && (
              <TabsTrigger value="servers" className="flex items-center gap-1.5">
                <Monitor className="h-4 w-4" /> Servers
              </TabsTrigger>
            )}
          </TabsList>

          {isSuperadmin && (
            <TabsContent value="users">
              <UserManagement />
            </TabsContent>
          )}

          <TabsContent value="changelog">
            <ChangelogTab isSuperadmin={isSuperadmin} />
          </TabsContent>

          {isSuperadmin && (
            <TabsContent value="system">
              <SystemHealthTab />
            </TabsContent>
          )}

          {isSuperadmin && (
            <TabsContent value="servers">
              <ServerManagement />
            </TabsContent>
          )}
        </Tabs>
      </main>

      <VersionFooter />
    </div>
  );
};

export default AdminPanel;
