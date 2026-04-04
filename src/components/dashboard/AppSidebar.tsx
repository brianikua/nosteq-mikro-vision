import { useNavigate, useLocation } from "react-router-dom";
import {
  Globe, Settings, LogOut, User,
  Monitor, Layout, Shield, Activity,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarFooter,
  SidebarHeader, useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  isAdminOrAbove: boolean;
  userEmail?: string;
}

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: Layout, route: "/dashboard" },
  { id: "devices", label: "Network Devices", icon: Monitor, route: "/devices" },
  { id: "ip-intelligence", label: "IP Intelligence", icon: Globe, route: "/ip-intelligence" },
  { id: "network-health", label: "Network Health", icon: Activity, route: "/network-health" },
  { id: "settings", label: "Settings", icon: Settings, route: "/settings" },
];

export function AppSidebar({ activeTab, onTabChange, isAdminOrAbove, userEmail }: AppSidebarProps) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const getActiveId = () => {
    const path = location.pathname;
    const match = navItems.find((item) => path.startsWith(item.route));
    return match?.id || activeTab || "dashboard";
  };

  const currentActive = getActiveId();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center shrink-0">
            <Globe className="h-4 w-4 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <p className="text-sm font-bold text-foreground truncate">NOSTEQ</p>
              <p className="text-[11px] text-muted-foreground truncate">IP Monitor</p>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                // Settings only visible to admin/superadmin
                if (item.id === "settings" && !isAdminOrAbove) return null;
                const isActive = currentActive === item.id;
                return (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      onClick={() => {
                        navigate(item.route);
                        onTabChange?.(item.id);
                      }}
                      tooltip={item.label}
                      className={cn(
                        "h-10 gap-3 rounded-lg transition-all duration-200",
                        isActive
                          ? "bg-primary/10 text-primary border-l-[3px] border-primary"
                          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                      )}
                    >
                      <item.icon className={cn("h-4 w-4 shrink-0", isActive && "text-primary")} />
                      {!collapsed && <span className="text-sm">{item.label}</span>}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}

              {isAdminOrAbove && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => navigate("/admin")}
                    tooltip="Admin Panel"
                    className="h-10 gap-3 rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-all duration-200"
                  >
                    <Shield className="h-4 w-4 shrink-0" />
                    {!collapsed && <span className="text-sm">Admin Panel</span>}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          {!collapsed && userEmail && (
            <SidebarMenuItem>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg">
                <div className="h-7 w-7 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                  <User className="h-3.5 w-3.5 text-primary" />
                </div>
                <span className="text-xs text-muted-foreground truncate">{userEmail}</span>
              </div>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={handleSignOut}
              tooltip="Sign Out"
              className="h-10 gap-3 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-all duration-200"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="text-sm">Sign Out</span>}
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
