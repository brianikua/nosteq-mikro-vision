import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Settings2, Timer, Shield, Activity, Save, Loader2, RotateCcw } from "lucide-react";

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

export const AdminSettingsTab = () => {
  const [settings, setSettings] = useState<SystemSettings>(defaultSettings);
  const [original, setOriginal] = useState<SystemSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => { fetchSettings(); }, []);

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
