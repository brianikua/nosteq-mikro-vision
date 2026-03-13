import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Server, Database, Globe, Wifi, Clock, GitCommit, Layers } from "lucide-react";
import { VersionFooter } from "@/components/dashboard/VersionFooter";
import { getFullVersionString, APP_VERSION } from "@/lib/version";
import { useAutoLogout } from "@/hooks/use-auto-logout";
import { format } from "date-fns";

type Status = "healthy" | "degraded" | "down";

interface ServiceStatus {
  name: string;
  status: Status;
  icon: React.ReactNode;
  detail: string;
}

const statusConfig: Record<Status, { color: string; label: string }> = {
  healthy: { color: "bg-[hsl(var(--success))]", label: "Healthy" },
  degraded: { color: "bg-[hsl(var(--warning))]", label: "Degraded" },
  down: { color: "bg-destructive", label: "Down" },
};

const SystemHealth = () => {
  useAutoLogout();
  const navigate = useNavigate();
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [dbLatency, setDbLatency] = useState<number | null>(null);

  useEffect(() => {
    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }

      // Check superadmin
      const { data: role } = await supabase
        .from("user_roles").select("role")
        .eq("user_id", session.user.id).eq("role", "superadmin").maybeSingle();
      if (!role) { navigate("/dashboard"); return; }

      // DB health check
      const dbStart = Date.now();
      const { error: dbErr } = await supabase.from("devices").select("id").limit(1);
      const latency = Date.now() - dbStart;
      setDbLatency(latency);

      // API health check
      const apiStart = Date.now();
      let apiStatus: Status = "healthy";
      try {
        const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/`, {
          headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        });
        apiStatus = resp.ok ? "healthy" : "degraded";
      } catch { apiStatus = "down"; }

      // Auth health
      let authStatus: Status = session ? "healthy" : "down";

      setServices([
        { name: "Application", status: "healthy", icon: <Globe className="h-5 w-5" />, detail: `Running ${getFullVersionString()}` },
        { name: "Database", status: dbErr ? "down" : latency > 2000 ? "degraded" : "healthy", icon: <Database className="h-5 w-5" />, detail: dbErr ? "Connection failed" : `Latency: ${latency}ms` },
        { name: "API Gateway", status: apiStatus, icon: <Server className="h-5 w-5" />, detail: apiStatus === "healthy" ? "Responding normally" : "Connectivity issues" },
        { name: "Authentication", status: authStatus, icon: <Wifi className="h-5 w-5" />, detail: authStatus === "healthy" ? "Active session" : "No session" },
      ]);
      setLoading(false);
    };
    check();
  }, [navigate]);

  const overallStatus: Status = services.some(s => s.status === "down") ? "down"
    : services.some(s => s.status === "degraded") ? "degraded" : "healthy";

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><Server className="h-5 w-5 text-primary" /> System Health</h1>
            <p className="text-xs text-muted-foreground">Infrastructure status & diagnostics</p>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl space-y-6">
        {/* Overall Status */}
        {!loading && (
          <Card className="border-border/50">
            <CardContent className="py-6 flex items-center justify-center gap-3">
              <span className={`h-4 w-4 rounded-full ${statusConfig[overallStatus].color} animate-pulse`} />
              <span className="text-lg font-semibold">
                All Systems {statusConfig[overallStatus].label === "Healthy" ? "Operational" : statusConfig[overallStatus].label}
              </span>
            </CardContent>
          </Card>
        )}

        {/* Service Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-border/50 animate-pulse"><CardContent className="py-8" /></Card>
            ))
          ) : services.map((svc) => (
            <Card key={svc.name} className="border-border/50">
              <CardContent className="py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-muted-foreground">{svc.icon}</div>
                  <div>
                    <p className="font-medium text-sm">{svc.name}</p>
                    <p className="text-xs text-muted-foreground">{svc.detail}</p>
                  </div>
                </div>
                <Badge variant="outline" className="flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${statusConfig[svc.status].color}`} />
                  {statusConfig[svc.status].label}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* System Information */}
        <Card className="border-border/50">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Layers className="h-4 w-4 text-primary" /> System Information</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <InfoRow icon={<GitCommit className="h-4 w-4" />} label="Version" value={getFullVersionString()} />
              <InfoRow icon={<Clock className="h-4 w-4" />} label="Deployed" value={format(new Date(APP_VERSION.deployedAt), "MMM dd, yyyy HH:mm")} />
              <InfoRow icon={<Server className="h-4 w-4" />} label="Environment" value={APP_VERSION.environment} />
              <InfoRow icon={<Database className="h-4 w-4" />} label="DB Latency" value={dbLatency ? `${dbLatency}ms` : "—"} />
            </div>
          </CardContent>
        </Card>
      </main>
      <VersionFooter />
    </div>
  );
};

const InfoRow = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="flex items-center gap-2 text-muted-foreground">
    {icon}
    <span>{label}:</span>
    <span className="text-foreground font-medium">{value}</span>
  </div>
);

export default SystemHealth;
