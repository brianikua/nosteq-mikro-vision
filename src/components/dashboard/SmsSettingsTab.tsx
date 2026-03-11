import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, MessageSquare, Phone, Key } from "lucide-react";
import { toast } from "sonner";

export const SmsSettingsTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testNumber, setTestNumber] = useState("");
  const [config, setConfig] = useState({
    id: null as string | null,
    webhook_url: "",
    webhook_method: "POST",
    client_number: "",
    sms_user_id: "",
    sms_sender_id: "",
    techra_api_key: "",
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
          sms_user_id: (data as any).sms_user_id ?? "",
          sms_sender_id: (data as any).sms_sender_id ?? "",
          techra_api_key: (data as any).techra_api_key ?? "",
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
      toast.error("SMS Gateway URL is required");
      return;
    }
    if (!config.sms_user_id.trim()) {
      toast.error("SMS User ID is required");
      return;
    }
    if (!config.sms_sender_id.trim()) {
      toast.error("SMS Sender ID is required");
      return;
    }
    if (!config.techra_api_key.trim()) {
      toast.error("Techra API Key is required");
      return;
    }
    if (!config.client_number.trim()) {
      toast.error("Default phone number is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        webhook_url: config.webhook_url.trim(),
        webhook_method: config.webhook_method,
        client_number: config.client_number.trim(),
        sms_user_id: config.sms_user_id.trim(),
        sms_sender_id: config.sms_sender_id.trim(),
        techra_api_key: config.techra_api_key.trim(),
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
    const numberToTest = testNumber.trim() || config.client_number.trim();
    if (!numberToTest) {
      toast.error("Enter a phone number to test");
      return;
    }
    if (!config.webhook_url.trim()) {
      toast.error("Save your SMS gateway settings first");
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-sms", {
        body: {
          message: "🧪 Test SMS from Nosteq IP Monitor — notifications are working!",
          phone_number: numberToTest,
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success(`Test SMS sent to ${numberToTest}!`);
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
      {/* SMS Gateway Setup */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> SMS Gateway Setup
          </CardTitle>
          <CardDescription>
            Configure your Techra SMS gateway credentials for sending SMS alerts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook_url">SMS Gateway URL</Label>
            <Input
              id="webhook_url"
              placeholder="https://api.techra.co.za/v1/sms/send"
              value={config.webhook_url}
              onChange={(e) => setConfig({ ...config, webhook_url: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              The Techra SMS API endpoint URL.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sms_user_id">SMS User ID</Label>
            <Input
              id="sms_user_id"
              placeholder="Your Techra user ID"
              value={config.sms_user_id}
              onChange={(e) => setConfig({ ...config, sms_user_id: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sms_sender_id">SMS Sender ID</Label>
            <Input
              id="sms_sender_id"
              placeholder="NOSTEQ"
              value={config.sms_sender_id}
              onChange={(e) => setConfig({ ...config, sms_sender_id: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              The sender name/number that appears on the SMS (e.g. NOSTEQ, your brand).
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="techra_api_key" className="flex items-center gap-1">
              <Key className="h-3 w-3" /> Techra API Key
            </Label>
            <Input
              id="techra_api_key"
              type="password"
              placeholder="Your Techra API key"
              value={config.techra_api_key}
              onChange={(e) => setConfig({ ...config, techra_api_key: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="client_number">Default Phone Number</Label>
            <Input
              id="client_number"
              placeholder="+27123456789"
              value={config.client_number}
              onChange={(e) => setConfig({ ...config, client_number: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Default number that will receive SMS alerts.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Label>SMS Notifications enabled</Label>
            <Switch checked={config.enabled} onCheckedChange={(v) => setConfig({ ...config, enabled: v })} />
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </CardContent>
      </Card>

      {/* Test SMS + ISP + Events */}
      <div className="space-y-6">
        {/* Test SMS Card */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" /> Test SMS Notification
            </CardTitle>
            <CardDescription>
              Enter a phone number and send a test SMS to verify your gateway is working.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="test_number">Phone Number</Label>
              <Input
                id="test_number"
                placeholder="+27123456789"
                value={testNumber}
                onChange={(e) => setTestNumber(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Leave empty to use the default number above.
              </p>
            </div>
            <Button variant="outline" onClick={handleTest} disabled={testing} className="w-full">
              <Send className="h-4 w-4 mr-2" />
              {testing ? "Sending..." : "Send Test SMS"}
            </Button>
          </CardContent>
        </Card>

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