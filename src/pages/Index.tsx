import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Activity, Shield, Network, TrendingUp } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="h-8 w-8 text-primary" />
              <div>
                <h1 className="text-xl font-bold">Nosteq Networks</h1>
                <p className="text-xs text-muted-foreground">MikroTik Monitoring</p>
              </div>
            </div>
            <Button onClick={() => navigate("/auth")}>
              Get Started
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-5xl font-bold tracking-tight">
              Centralized MikroTik
              <br />
              <span className="text-primary">Network Monitoring</span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Monitor all your MikroTik routers and switches from one powerful dashboard.
              Real-time metrics, instant alerts, and complete visibility.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-12">
            <div className="p-6 rounded-lg border border-border/50 bg-card/30 backdrop-blur-sm">
              <Network className="h-10 w-10 text-primary mb-4 mx-auto" />
              <h3 className="font-semibold mb-2">Real-Time Status</h3>
              <p className="text-sm text-muted-foreground">
                Monitor CPU, memory, uptime, and traffic across all devices
              </p>
            </div>
            <div className="p-6 rounded-lg border border-border/50 bg-card/30 backdrop-blur-sm">
              <Shield className="h-10 w-10 text-primary mb-4 mx-auto" />
              <h3 className="font-semibold mb-2">Secure Access</h3>
              <p className="text-sm text-muted-foreground">
                Enterprise-grade security with encrypted connections
              </p>
            </div>
            <div className="p-6 rounded-lg border border-border/50 bg-card/30 backdrop-blur-sm">
              <TrendingUp className="h-10 w-10 text-primary mb-4 mx-auto" />
              <h3 className="font-semibold mb-2">Smart Alerts</h3>
              <p className="text-sm text-muted-foreground">
                Get notified instantly when devices go offline or CPU spikes
              </p>
            </div>
          </div>

          <div className="pt-8">
            <Button size="lg" onClick={() => navigate("/auth")} className="text-lg px-8">
              Access Dashboard
            </Button>
          </div>
        </div>
      </main>

      <footer className="border-t border-border/50 py-6 text-center text-sm text-muted-foreground">
        <p>&copy; 2025 Nosteq Networks. All rights reserved.</p>
      </footer>
    </div>
  );
};

export default Index;
