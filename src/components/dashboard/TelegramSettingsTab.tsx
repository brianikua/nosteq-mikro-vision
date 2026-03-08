import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Send, Bot } from "lucide-react";
import { toast } from "sonner";

export const TelegramSettingsTab = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState({
    id: null as string | null,
    chat_id: "",
    enabled: true,
    notify_down: true,
    notify_up: true,
    notify_blacklisted: true,
    notify_delisted: true,
    notify_summary: true,
  });

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("telegram_config")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (data) {
        setConfig({
          id: data.id,
          chat_id: data.chat_id,
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
    if (!config.chat_id.trim()) {
      toast.error("Chat ID is required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        chat_id: config.chat_id.trim(),
        enabled: config.enabled,
        notify_down: config.notify_down,
        notify_up: config.notify_up,
        notify_blacklisted: config.notify_blacklisted,
        notify_delisted: config.notify_delisted,
        notify_summary: config.notify_summary,
        updated_at: new Date().toISOString(),
      };

      if (config.id) {
        const { error } = await supabase
          .from("telegram_config")
          .update(payload)
          .eq("id", config.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("telegram_config")
          .insert([payload])
          .select("id")
          .single();
        if (error) throw error;
        setConfig((c) => ({ ...c, id: data.id }));
      }
      toast.success("Telegram settings saved!");
    } catch (e) {
      console.error("Save failed:", e);
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    if (!config.chat_id.trim()) {
      toast.error("Save your Chat ID first");
      return;
    }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-telegram", {
        body: {
          message: "🧪 *Test Notification*\n\nNosteq IP Monitor is connected and working\\!",
          chat_id: config.chat_id.trim(),
        },
      });
      if (error) throw error;
      if (data?.success) {
        toast.success("Test message sent to Telegram!");
      } else {
        toast.error(data?.error || "Failed to send test message");
      }
    } catch (e) {
      console.error("Test failed:", e);
      toast.error("Failed to send test message");
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
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" /> Telegram Bot Setup
          </CardTitle>
          <CardDescription>
            Connect a Telegram bot to receive real-time alerts about IP status changes and blacklist events.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="chat_id">Chat ID</Label>
            <Input
              id="chat_id"
              placeholder="-1001234567890"
              value={config.chat_id}
              onChange={(e) => setConfig({ ...config, chat_id: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              Get your Chat ID by messaging @userinfobot on Telegram. For groups, use the group chat ID.
            </p>
          </div>

          <div className="flex items-center justify-between">
            <Label>Notifications enabled</Label>
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

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Notification Events</CardTitle>
          <CardDescription>Choose which events trigger Telegram notifications</CardDescription>
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
  );
};
