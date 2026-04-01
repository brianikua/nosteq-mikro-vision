import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Globe, Shield, Network, TrendingUp } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/50 bg-background/95 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
                <Globe className="h-4 w-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-foreground">Nosteq Networks</h1>
                <p className="text-[11px] text-muted-foreground">MikroTik Monitoring</p>
              </div>
            </div>
            <Button
              onClick={() => navigate("/auth")}
              className="gradient-primary text-primary-foreground hover:opacity-90 rounded-xl"
            >
              Get Started
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-4xl mx-auto text-center space-y-8">
          <div className="space-y-4">
            <h2 className="text-5xl font-bold tracking-tight text-foreground">
              Centralized MikroTik
              <br />
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
                Network Monitoring
              </span>
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Monitor all your MikroTik routers and switches from one powerful dashboard.
              Real-time metrics, instant alerts, and complete visibility.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 mt-12">
            {[
              { icon: Network, title: "Real-Time Status", desc: "Monitor CPU, memory, uptime, and traffic across all devices" },
              { icon: Shield, title: "Secure Access", desc: "Enterprise-grade security with encrypted connections" },
              { icon: TrendingUp, title: "Smart Alerts", desc: "Get notified instantly when devices go offline or CPU spikes" },
            ].map((item) => (
              <div key={item.title} className="group p-6 rounded-2xl glass shadow-card hover:-translate-y-1 transition-all duration-300 hover:shadow-lg">
                <item.icon className="h-10 w-10 text-primary mb-4 mx-auto" />
                <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>

          <div className="pt-8">
            <Button
              size="lg"
              onClick={() => navigate("/auth")}
              className="text-lg px-8 gradient-primary text-primary-foreground hover:opacity-90 rounded-xl hover:scale-[1.02] transition-all duration-200"
            >
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
