import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, LogOut, Settings, Users, FileText, Server, Monitor, SlidersHorizontal } from "lucide-react";
import { UserManagement } from "@/components/dashboard/UserManagement";
import { ChangelogTab } from "@/components/dashboard/ChangelogTab";
import { SystemHealthTab } from "@/components/dashboard/SystemHealthTab";
import { ServerManagement } from "@/components/dashboard/ServerManagement";
import { AdminSettingsTab } from "@/components/dashboard/AdminSettingsTab";
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
      <header className="h-[60px] flex items-center justify-between px-6 border-b border-border/50 bg-background/95 backdrop-blur-xl sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-primary" />
          <div>
            <h1 className="text-base font-semibold text-foreground">Admin Panel</h1>
            <p className="text-[11px] text-muted-foreground">System Management & Administration</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs border-border/50" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            Dashboard
          </Button>
          <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground hover:text-destructive" onClick={handleSignOut}>
            <LogOut className="h-3.5 w-3.5 mr-1.5" />
            Sign Out
          </Button>
        </div>
      </header>

      <main className="flex-1 p-4 md:p-6">
        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="glass">
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
            {isSuperadmin && (
              <TabsTrigger value="settings" className="flex items-center gap-1.5">
                <SlidersHorizontal className="h-4 w-4" /> Settings
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

          {isSuperadmin && (
            <TabsContent value="settings">
              <AdminSettingsTab />
            </TabsContent>
          )}
        </Tabs>
      </main>

      <VersionFooter />
    </div>
  );
};

export default AdminPanel;
