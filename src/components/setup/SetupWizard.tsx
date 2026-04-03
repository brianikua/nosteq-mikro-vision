import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Globe, Server, Wifi, ArrowRight, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface SetupWizardProps {
  onComplete: () => void;
}

export function SetupWizard({ onComplete }: SetupWizardProps) {
  const [step, setStep] = useState(1);
  const [hostingMode, setHostingMode] = useState<"local" | "vpn" | null>(null);
  const [vpnForm, setVpnForm] = useState({ site_name: "", vpn_gateway_ip: "", vpn_type: "WireGuard", tunnel_interface: "" });
  const [saving, setSaving] = useState(false);

  const handleFinish = async () => {
    setSaving(true);
    try {
      // Update hosting mode
      await supabase.from("system_config").upsert({ key: "hosting_mode", value: hostingMode!, updated_at: new Date().toISOString() });

      // If VPN mode, save VPN site
      if (hostingMode === "vpn" && vpnForm.site_name && vpnForm.vpn_gateway_ip) {
        await supabase.from("vpn_sites").insert({
          site_name: vpnForm.site_name,
          vpn_gateway_ip: vpnForm.vpn_gateway_ip,
          vpn_type: vpnForm.vpn_type,
          tunnel_interface: vpnForm.tunnel_interface,
        });
      }

      // Mark setup complete
      await supabase.from("system_config").upsert({ key: "setup_complete", value: "true", updated_at: new Date().toISOString() });

      toast.success("Setup complete!");
      onComplete();
    } catch (e) {
      toast.error("Setup failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2, 3].map((s) => (
            <div key={s} className={cn("h-2 rounded-full transition-all", s <= step ? "w-12 bg-primary" : "w-8 bg-muted")} />
          ))}
        </div>

        {/* Step 1: Welcome */}
        {step === 1 && (
          <div className="glass-card p-8 rounded-2xl text-center space-y-6 animate-in fade-in">
            <div className="h-16 w-16 rounded-2xl gradient-primary flex items-center justify-center mx-auto">
              <Globe className="h-8 w-8 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Welcome to Nosteq IP Monitor</h1>
              <p className="text-muted-foreground mt-2">Network Intelligence Platform</p>
            </div>
            <p className="text-sm text-muted-foreground">Let's configure your monitoring environment. This takes about 30 seconds.</p>
            <Button className="gradient-primary text-primary-foreground w-full" onClick={() => setStep(2)}>
              Get Started <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* Step 2: Choose Hosting Mode */}
        {step === 2 && (
          <div className="space-y-4 animate-in fade-in">
            <h2 className="text-xl font-bold text-foreground text-center">Choose Hosting Mode</h2>
            <p className="text-sm text-muted-foreground text-center">How is this application deployed?</p>

            <div className="grid gap-4 mt-6">
              <button
                onClick={() => setHostingMode("local")}
                className={cn(
                  "p-6 rounded-xl border text-left transition-all",
                  hostingMode === "local" ? "border-primary bg-primary/10 shadow-[var(--shadow-glow)]" : "border-border bg-card hover:border-primary/30"
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                    <Server className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">🏠 Local Server</p>
                    <p className="text-sm text-muted-foreground mt-1">App runs inside your network. All IPs — public and private — monitored directly. Best coverage.</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => setHostingMode("vpn")}
                className={cn(
                  "p-6 rounded-xl border text-left transition-all",
                  hostingMode === "vpn" ? "border-primary bg-primary/10 shadow-[var(--shadow-glow)]" : "border-border bg-card hover:border-primary/30"
                )}
              >
                <div className="flex items-start gap-4">
                  <div className="h-10 w-10 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                    <Wifi className="h-5 w-5 text-accent" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">☁️ VPS + VPN</p>
                    <p className="text-sm text-muted-foreground mt-1">App runs on cloud VPS. Private IPs monitored via VPN tunnel. VPN must stay active.</p>
                  </div>
                </div>
              </button>
            </div>

            <Button className="gradient-primary text-primary-foreground w-full mt-4" disabled={!hostingMode} onClick={() => setStep(3)}>
              Continue <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        )}

        {/* Step 3: Mode-specific config or finish */}
        {step === 3 && (
          <div className="glass-card p-8 rounded-2xl space-y-6 animate-in fade-in">
            {hostingMode === "local" ? (
              <>
                <div className="text-center space-y-3">
                  <div className="h-14 w-14 rounded-2xl bg-success/20 flex items-center justify-center mx-auto">
                    <Check className="h-7 w-7 text-success" />
                  </div>
                  <h2 className="text-xl font-bold text-foreground">🏠 Local Mode Enabled</h2>
                  <p className="text-sm text-muted-foreground">All IPs are directly reachable. Full monitoring active with no VPN dependencies.</p>
                </div>
                <Button className="gradient-primary text-primary-foreground w-full" onClick={handleFinish} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Continue to Dashboard
                </Button>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-foreground">Add VPN Site</h2>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Site Name *</label>
                    <Input placeholder="e.g. Main Office" value={vpnForm.site_name} onChange={(e) => setVpnForm({ ...vpnForm, site_name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">VPN Gateway IP *</label>
                    <Input placeholder="e.g. 10.0.0.1" value={vpnForm.vpn_gateway_ip} onChange={(e) => setVpnForm({ ...vpnForm, vpn_gateway_ip: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">VPN Type</label>
                    <Select value={vpnForm.vpn_type} onValueChange={(v) => setVpnForm({ ...vpnForm, vpn_type: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["WireGuard", "OpenVPN", "IPSec", "SSTP", "L2TP", "Other"].map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Tunnel Interface</label>
                    <Input placeholder="e.g. wg0, tun0" value={vpnForm.tunnel_interface} onChange={(e) => setVpnForm({ ...vpnForm, tunnel_interface: e.target.value })} />
                  </div>
                </div>
                <Button className="gradient-primary text-primary-foreground w-full" onClick={handleFinish} disabled={saving || !vpnForm.site_name || !vpnForm.vpn_gateway_ip}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save & Continue to Dashboard
                </Button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
