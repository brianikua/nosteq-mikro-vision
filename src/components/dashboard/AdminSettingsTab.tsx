import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Settings2, Timer, Shield, Activity, Save, Loader2, RotateCcw, Radar, Plus, Trash2, Lock } from "lucide-react";
import { isValidCIDR } from "@/lib/ip-utils";

interface SystemSettings {
  default_check_interval: number;
  down_confirmation_count: number;
  escalation_timer_minutes: number;
  alert_threshold_latency_ms: number;
  alert_threshold_packet_loss: number;
}

const defaultSettings: SystemSettings = {
  default_check_interval: 5,
  down_confirmation_count: 3,
  escalation_timer_minutes: 30,
  alert_threshold_latency_ms: 500,
  alert_threshold_packet_loss: 50,
};

type ScanRange = { id: string; cidr: string; description: string | null; enabled: boolean; last_scanned_at: string | null };
type VpnSite = { id: string; site_name: string; vpn_gateway_ip: string; vpn_type: string; tunnel_interface: string | null; is_active: boolean | null; last_status: string | null };

export const AdminSettingsTab = () => {
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [original, setOriginal] = useState<SystemSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [vpnSites, setVpnSites] = useState<VpnSite[]>([]);
  const [scanRanges, setScanRanges] = useState<ScanRange[]>([]);
  const [newRange, setNewRange] = useState({ cidr: "", description: "" });
  const [addingRange, setAddingRange] = useState(false);

  const fetchScanRanges = async () => {
    const { data } = await supabase.from("scan_ranges").select("*").order("created_at", { ascending: true });
    setScanRanges(data || []);
  };

  const handleAddRange = async () => {
    if (!isValidCIDR(newRange.cidr.trim())) {
      toast.error("Enter a valid CIDR, e.g. 192.168.1.0/24");
      return;
    }
    setAddingRange(true);
    const { error } = await supabase.from("scan_ranges").insert({
      cidr: newRange.cidr.trim(),
      description: newRange.description.trim() || null,
    });
    setAddingRange(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Scan range added");
    setNewRange({ cidr: "", description: "" });
    fetchScanRanges();
  };

  const handleToggleRange = async (range: ScanRange) => {
    const { error } = await supabase.from("scan_ranges").update({ enabled: !range.enabled }).eq("id", range.id);
    if (error) { toast.error("Failed to update"); return; }
    setScanRanges((rs) => rs.map((r) => (r.id === range.id ? { ...r, enabled: !r.enabled } : r)));
  };

  const handleDeleteRange = async (id: string) => {
    if (!confirm("Remove this scan range?")) return;
    const { error } = await supabase.from("scan_ranges").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    setScanRanges((rs) => rs.filter((r) => r.id !== id));
  };

  const fetchVpnSites = async () => {
    const { data } = await supabase.from("vpn_sites").select("*").order("site_name");
    setVpnSites(data || []);
  };

  const fetchSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("system_settings")
      .select("*")
      .eq("id", 1)
      .single();
    if (data && !error) {
      const s: SystemSettings = {
        default_check_interval: data.default_check_interval,
        down_confirmation_count: data.down_confirmation_count,
        escalation_timer_minutes: data.escalation_timer_minutes,
        alert_threshold_latency_ms: data.alert_threshold_latency_ms,
        alert_threshold_packet_loss: data.alert_threshold_packet_loss,
      };
      setSettings(s);
      setOriginal(s);
    }
    setLoading(false);
  };

  useEffect(() => { fetchSettings(); fetchScanRanges(); fetchVpnSites(); }, []);

  const hasChanges = JSON.stringify(settings) !== JSON.stringify(original);

  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("system_settings")
      .update({
        ...settings,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1);
    if (error) {
      toast.error("Failed to save settings");
    } else {
      toast.success("Settings saved");
      setOriginal(settings);
    }
    setSaving(false);
  };

  const handleReset = () => setSettings(original);

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">System Settings</h2>
          <p className="text-sm text-muted-foreground">Configure monitoring behavior, alert thresholds, and escalation rules</p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="outline" className="text-warning border-warning/50 animate-pulse">
              Unsaved changes
            </Badge>
          )}
          <Button variant="outline" size="sm" onClick={handleReset} disabled={!hasChanges}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
          </Button>
          <Button size="sm" onClick={handleSave} disabled={!hasChanges || saving} className="gradient-primary text-primary-foreground">
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
            Save
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Monitoring Interval */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Timer className="h-4 w-4 text-primary" /> Monitoring Interval
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Default check interval (minutes)</Label>
              <Input
                type="number"
                min={1}
                max={60}
                value={settings.default_check_interval}
                onChange={e => setSettings(s => ({ ...s, default_check_interval: parseInt(e.target.value) || 5 }))}
              />
              <p className="text-[11px] text-muted-foreground">How often each IP is pinged. Individual devices can override.</p>
            </div>
          </CardContent>
        </Card>

        {/* Down Confirmation */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Shield className="h-4 w-4 text-warning" /> Down Confirmation
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Consecutive failures before marking down</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={settings.down_confirmation_count}
                onChange={e => setSettings(s => ({ ...s, down_confirmation_count: parseInt(e.target.value) || 3 }))}
              />
              <p className="text-[11px] text-muted-foreground">Prevents false alerts from single packet drops. Device must fail {settings.down_confirmation_count} consecutive checks.</p>
            </div>
          </CardContent>
        </Card>

        {/* Smart Escalation */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Activity className="h-4 w-4 text-destructive" /> Smart Escalation
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Escalation timer (minutes)</Label>
              <Input
                type="number"
                min={5}
                max={240}
                value={settings.escalation_timer_minutes}
                onChange={e => setSettings(s => ({ ...s, escalation_timer_minutes: parseInt(e.target.value) || 30 }))}
              />
              <p className="text-[11px] text-muted-foreground">Unresolved outages auto-escalate to NOC/Management channels after {settings.escalation_timer_minutes} minutes.</p>
            </div>
          </CardContent>
        </Card>

        {/* Alert Thresholds */}
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-accent" /> Alert Thresholds
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Latency alert threshold (ms)</Label>
              <Input
                type="number"
                min={50}
                max={5000}
                value={settings.alert_threshold_latency_ms}
                onChange={e => setSettings(s => ({ ...s, alert_threshold_latency_ms: parseInt(e.target.value) || 500 }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Packet loss threshold (%)</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={settings.alert_threshold_packet_loss}
                onChange={e => setSettings(s => ({ ...s, alert_threshold_packet_loss: parseInt(e.target.value) || 50 }))}
              />
              <p className="text-[11px] text-muted-foreground">Trigger critical alerts when latency exceeds {settings.alert_threshold_latency_ms}ms or loss exceeds {settings.alert_threshold_packet_loss}%.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Network Discovery */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Radar className="h-4 w-4 text-accent" /> Network Discovery
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          <p className="text-[11px] text-muted-foreground">
            The on-prem collector sweeps these ranges and auto-adds whatever it finds — new devices are added and monitoring-enabled immediately, no approval step. SNMP-identified hosts get SNMP monitoring turned on too. Requires <code className="bg-muted px-1 rounded">collector/discover.mjs</code> running on a schedule inside your LAN.
          </p>

          <div className="flex gap-2 flex-wrap items-end">
            <div className="space-y-1 flex-1 min-w-[160px]">
              <Label className="text-xs text-muted-foreground">CIDR range</Label>
              <Input placeholder="192.168.1.0/24" value={newRange.cidr} onChange={(e) => setNewRange({ ...newRange, cidr: e.target.value })} className="font-mono text-xs" />
            </div>
            <div className="space-y-1 flex-1 min-w-[160px]">
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Input placeholder="e.g. Core switch VLAN" value={newRange.description} onChange={(e) => setNewRange({ ...newRange, description: e.target.value })} />
            </div>
            <Button size="sm" onClick={handleAddRange} disabled={addingRange}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Add
            </Button>
          </div>

          {scanRanges.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">No scan ranges configured yet.</p>
          ) : (
            <div className="space-y-1.5">
              {scanRanges.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <span className="font-mono text-foreground">{r.cidr}</span>
                    {r.description && <span className="text-muted-foreground ml-2">{r.description}</span>}
                    <p className="text-[10px] text-muted-foreground">
                      {r.last_scanned_at ? `Last scanned ${new Date(r.last_scanned_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}` : "Never scanned yet"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch checked={r.enabled} onCheckedChange={() => handleToggleRange(r)} />
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteRange(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* VPN Sites — configured during onboarding (Setup Wizard, VPN hosting mode) but
          previously had no page anywhere that displayed them. Read-only reference here;
          editing still happens wherever the site was originally created. */}
      {vpnSites.length > 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" /> VPN Sites
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-1.5">
            {vpnSites.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 px-3 py-2 text-xs">
                <div className="min-w-0">
                  <span className="font-medium text-foreground">{v.site_name}</span>
                  <span className="text-muted-foreground ml-2 font-mono">{v.vpn_gateway_ip}</span>
                  <span className="text-muted-foreground ml-2">{v.vpn_type}{v.tunnel_interface ? ` · ${v.tunnel_interface}` : ""}</span>
                </div>
                <Badge variant={v.is_active ? "default" : "secondary"} className="text-[10px] shrink-0">
                  {v.is_active ? "Active" : "Inactive"}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-4 px-4">
          <div className="flex items-start gap-3">
            <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">How Down Confirmation & Escalation Work</p>
              <ul className="text-xs text-muted-foreground mt-1 space-y-1 list-disc ml-4">
                <li><strong>Down Confirmation:</strong> A device must fail {settings.down_confirmation_count} consecutive pings before it's marked as DOWN and alerts are sent. This prevents false alarms from transient network issues.</li>
                <li><strong>Smart Escalation:</strong> If a device remains DOWN for {settings.escalation_timer_minutes} minutes without recovery, an escalation alert is automatically sent to NOC and Management notification channels.</li>
                <li><strong>Auto-Recovery:</strong> When a device comes back up, failure counters reset and escalation flags clear automatically.</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
