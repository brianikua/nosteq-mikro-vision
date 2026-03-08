import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, MessageSquare, Phone } from "lucide-react";
import { toast } from "sonner";

export const SmsSettingsTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState({
    id: null as string | null,
    webhook_url: "",
    webhook_method: "POST",
    client_number: "",
    isp_contact_name: "",
    isp_contact_number: "",
    enabled: true,
    notify_down: true,
    notify_up: true,
    notify_blacklisted: true,
    notify_delisted: true,
    notify_summary: true,
    message_template:
      "{{status_emoji}} {{device_name}} ({{ip_address}}) is {{status}}. Latency: {{latency}}ms",
  });

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("sms_config")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (data) {
        setConfig({
          id: data.id,
          webhook_url: data.webhook_url,
          webhook_method: data.webhook_method ?? "POST",
          client_number: data.client_number,
          isp_contact_name: data.isp_contact_name ?? "",
          isp_contact_number: data.isp_contact_number ?? "",
          enabled: data.enabled ?? true,
          notify_down: data.notify_down ?? true,
          notify_up: data.notify_up ?? true,
          notify_blacklisted: data.notify_blacklisted ?? true,
          notify_delisted: data.notify_delisted ?? true,
          notify_summary: data.notify_summary ?? true,
          message_template: data.message_template ?? config.message_template,
        });
      }
      setLoading(false);
    };
    load();
  }, []);

  const handleSave = async () => {
    if (!config.webhook_url.trim()) {
      toast.error("Webhook URL is required");
      return;
    }
    if (!config.client_number.trim()) {
      toast.error("Client phone number is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        webhook_url: config.webhook_url.trim(),
        webhook_method: config.webhook_method,
        client_number: config.client_number.trim(),
        isp_contact_name: config.isp_contact_name.trim() || null,
        isp_contact_number: config.isp_contact_number.trim() || null,
        enabled: config.enabled,
        notify_down: config.notify_down,
        notify_up: config.notify_up,
        notify_blacklisted: config.notify_blacklisted,
        notify_delisted: config.notify_delisted,
        notify_summary: config.notify_summary,
        message_template: config.message_template.trim(),
        updated_at: new Date().toISOString(),
      };

      if (config.id) {
        const { error } = await supabase
          .from("sms_config")
          .update(payload)
          .eq("id", config.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("sms_config")
          .insert([payload])
          .select("id")
          .single();
        if (error) throw error;
        setConfig((c) => ({ ...c, id: data.id }));
      }
      toast.success("SMS settings saved!");
    } catch (e) {
      console.error("Save failed:", e);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!config.webhook_url.trim() || !config.client_number.trim()) {
      toast.error("Save your webhook URL and phone number first");
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-sms", {
        body: {
          message: "🧪 Test SMS from Nosteq IP Monitor — notifications are working!",
          phone_number: config.client_number.trim(),
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success("Test SMS sent!");
      } else {
        toast.error(data?.error || "Failed to send test SMS");
      }
    } catch (e) {
      console.error("Test failed:", e);
      toast.error("Failed to send test SMS");
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Webhook & Phone Setup */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> SMS Webhook Setup
          </CardTitle>
          <CardDescription>
            Configure a generic HTTP webhook to send SMS alerts. Works with any SMS gateway API.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook_url">Webhook URL</Label>
            <Input
              id="webhook_url"
              placeholder="https://api.sms-provider.com/send"
              value={config.webhook_url}
              onChange={(e) => setConfig({ ...config, webhook_url: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              The URL that receives SMS requests. The body will include <code className="bg-muted px-1 rounded">phone_number</code> and <code className="bg-muted px-1 rounded">message</code> fields.
            </p>
          </div>

          <div className="space-y-2">
            <Label>HTTP Method</Label>
            <Select
              value={config.webhook_method}
              onValueChange={(v) => setConfig({ ...config, webhook_method: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="GET">GET (query params)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="client_number">Your Phone Number</Label>
            <Input
              id="client_number"
              placeholder="+1234567890"
              value={config.client_number}
              onChange={(e) => setConfig({ ...config, client_number: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              The number that will receive SMS alerts when an IP goes down or comes back up.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Label>SMS Notifications enabled</Label>
            <Switch checked={config.enabled} onCheckedChange={(v) => setConfig({ ...config, enabled: v })} />
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? "Saving..." : "Save Settings"}
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={testing}>
              <Send className="h-4 w-4 mr-2" />
              {testing ? "Sending..." : "Test"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ISP Provider + Events */}
      <div className="space-y-6">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Phone className="h-5 w-5" /> ISP Provider Contact
            </CardTitle>
            <CardDescription>
              Store your ISP or network provider's contact info for quick reference during outages.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="isp_name">Provider Name</Label>
              <Input
                id="isp_name"
                placeholder="e.g. Telkom, MTN, Vodacom"
                value={config.isp_contact_name}
                onChange={(e) => setConfig({ ...config, isp_contact_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="isp_number">Provider Phone Number</Label>
              <Input
                id="isp_number"
                placeholder="+27123456789"
                value={config.isp_contact_number}
                onChange={(e) => setConfig({ ...config, isp_contact_number: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                This number will be shown in alerts so you can quickly contact your ISP.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>SMS Notification Events</CardTitle>
            <CardDescription>Choose which events trigger SMS alerts</CardDescription>
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
                <Switch
                  checked={(config as any)[item.key]}
                  onCheckedChange={(v) => setConfig({ ...config, [item.key]: v })}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Message Template */}
      <Card className="border-border/50 lg:col-span-2">
        <CardHeader>
          <CardTitle>Message Template</CardTitle>
          <CardDescription>
            Customize the SMS message. Available variables: <code className="bg-muted px-1 rounded text-xs">{"{{status_emoji}}"}</code> <code className="bg-muted px-1 rounded text-xs">{"{{device_name}}"}</code> <code className="bg-muted px-1 rounded text-xs">{"{{ip_address}}"}</code> <code className="bg-muted px-1 rounded text-xs">{"{{status}}"}</code> <code className="bg-muted px-1 rounded text-xs">{"{{latency}}"}</code> <code className="bg-muted px-1 rounded text-xs">{"{{isp_name}}"}</code> <code className="bg-muted px-1 rounded text-xs">{"{{isp_number}}"}</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea
            rows={3}
            value={config.message_template}
            onChange={(e) => setConfig({ ...config, message_template: e.target.value })}
            className="font-mono text-sm"
          />
        </CardContent>
      </Card>
    </div>
  );
};
