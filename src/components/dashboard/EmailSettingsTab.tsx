import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Send, Mail, Key } from "lucide-react";
import { toast } from "sonner";

export const EmailSettingsTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [config, setConfig] = useState({
    id: null as string | null,
    smtp_host: "",
    smtp_port: 587,
    smtp_username: "",
    smtp_password: "",
    from_address: "",
    enabled: true,
    notify_down: true,
    notify_up: true,
    notify_blacklisted: true,
    notify_delisted: true,
    notify_summary: true,
  });

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("email_config").select("*").limit(1).maybeSingle();
      if (data) {
        setConfig({
          id: data.id,
          smtp_host: data.smtp_host,
          smtp_port: data.smtp_port ?? 587,
          smtp_username: data.smtp_username,
          smtp_password: data.smtp_password,
          from_address: data.from_address,
          enabled: data.enabled ?? true,
          notify_down: data.notify_down ?? true,
          notify_up: data.notify_up ?? true,
          notify_blacklisted: data.notify_blacklisted ?? true,
          notify_delisted: data.notify_delisted ?? true,
          notify_summary: data.notify_summary ?? true,
        });
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    if (!config.smtp_host.trim()) { toast.error("SMTP host is required"); return; }
    if (!config.smtp_username.trim()) { toast.error("SMTP username is required"); return; }
    if (!config.smtp_password.trim()) { toast.error("SMTP password is required"); return; }
    if (!config.from_address.trim()) { toast.error("From address is required"); return; }
    setSaving(true);
    try {
      const payload = {
        smtp_host: config.smtp_host.trim(),
        smtp_port: config.smtp_port,
        smtp_username: config.smtp_username.trim(),
        smtp_password: config.smtp_password,
        from_address: config.from_address.trim(),
        enabled: config.enabled,
        notify_down: config.notify_down,
        notify_up: config.notify_up,
        notify_blacklisted: config.notify_blacklisted,
        notify_delisted: config.notify_delisted,
        notify_summary: config.notify_summary,
        updated_at: new Date().toISOString(),
      };
      if (config.id) {
        const { error } = await supabase.from("email_config").update(payload).eq("id", config.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("email_config").insert([payload]).select("id").single();
        if (error) throw error;
        setConfig((c) => ({ ...c, id: data.id }));
      }
      toast.success("Email settings saved!");
    } catch (e) {
      console.error("Save failed:", e);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const addressToTest = testEmail.trim();
    if (!addressToTest) { toast.error("Enter an email address to test"); return; }
    if (!config.smtp_host.trim()) { toast.error("Save your SMTP settings first"); return; }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-notification", {
        body: {
          message: "Test email from Nosteq IP Monitor — notifications are working!",
          medium: "email",
          destination: addressToTest,
          event_type: "test",
        },
      });
      if (error) throw error;
      if (data?.success) toast.success(`Test email sent to ${addressToTest}!`);
      else toast.error(data?.error || "Failed to send test email");
    } catch (e) {
      console.error("Test failed:", e);
      toast.error("Failed to send test email");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[200px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> SMTP Setup</CardTitle>
          <CardDescription>Configure the mail server used to send alert emails.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="smtp_host">SMTP Host</Label>
              <Input id="smtp_host" placeholder="smtp.gmail.com" value={config.smtp_host} onChange={(e) => setConfig({ ...config, smtp_host: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp_port">Port</Label>
              <Input id="smtp_port" type="number" value={config.smtp_port} onChange={(e) => setConfig({ ...config, smtp_port: parseInt(e.target.value, 10) || 587 })} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp_username">Username</Label>
            <Input id="smtp_username" placeholder="alerts@yourdomain.com" value={config.smtp_username} onChange={(e) => setConfig({ ...config, smtp_username: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp_password" className="flex items-center gap-1"><Key className="h-3 w-3" /> Password</Label>
            <Input id="smtp_password" type="password" placeholder="App password or SMTP password" value={config.smtp_password} onChange={(e) => setConfig({ ...config, smtp_password: e.target.value })} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="from_address">From Address</Label>
            <Input id="from_address" placeholder="Nosteq Alerts <alerts@yourdomain.com>" value={config.from_address} onChange={(e) => setConfig({ ...config, from_address: e.target.value })} />
          </div>

          <div className="flex items-center justify-between">
            <Label>Email notifications enabled</Label>
            <Switch checked={config.enabled} onCheckedChange={(v) => setConfig({ ...config, enabled: v })} />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">{saving ? "Saving..." : "Save Settings"}</Button>
        </CardContent>
      </Card>

      <div className="space-y-6">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> Test Email Notification</CardTitle>
            <CardDescription>Send a test email to verify your SMTP settings are working.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test_email">Email Address</Label>
              <Input id="test_email" type="email" placeholder="you@example.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
            </div>
            <Button variant="outline" onClick={handleTest} disabled={testing} className="w-full">
              <Send className="h-4 w-4 mr-2" />{testing ? "Sending..." : "Send Test Email"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>Email Notification Events</CardTitle>
            <CardDescription>Choose which events trigger emails</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { key: "notify_down", label: "IP Goes Down", desc: "Alert when a monitored IP becomes unreachable" },
              { key: "notify_up", label: "IP Comes Back Up", desc: "Alert when an IP recovers from downtime" },
              { key: "notify_blacklisted", label: "IP Blacklisted", desc: "Alert when an IP is found on any blacklist" },
              { key: "notify_delisted", label: "IP Delisted", desc: "Alert when an IP is removed from a blacklist" },
              { key: "notify_summary", label: "Periodic Summary", desc: "Daily status summary of all monitored IPs" },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.desc}</p>
                </div>
                <Switch checked={(config as any)[item.key]} onCheckedChange={(v) => setConfig({ ...config, [item.key]: v })} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
