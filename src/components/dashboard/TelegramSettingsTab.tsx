import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Send, Bot, Plus, Pencil, Trash2, Volume2, VolumeX, TestTube } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ALERT_TYPES = [
  { key: "down", label: "IP Down" },
  { key: "up", label: "IP Recovered" },
  { key: "blacklisted", label: "New Blacklist" },
  { key: "delisted", label: "Delisted" },
  { key: "summary", label: "Daily Summary" },
  { key: "critical", label: "Critical (≥5 down)" },
];

const CHANNEL_TYPES = [
  { value: "personal", label: "Personal Agent" },
  { value: "group", label: "IT Group" },
  { value: "noc", label: "NOC Channel" },
  { value: "management", label: "Management" },
];

const MUTE_OPTIONS = [
  { value: "always_active", label: "Always Active" },
  { value: "business_hours", label: "Business Hours (8AM-6PM EAT)" },
  { value: "custom", label: "Custom Hours" },
];

type Channel = {
  id: string;
  name: string;
  chat_id: string;
  channel_type: string;
  alert_types: string[];
  mute_schedule: string;
  mute_start: string | null;
  mute_end: string | null;
  is_active: boolean;
};

const emptyChannel: Omit<Channel, "id"> = {
  name: "",
  chat_id: "",
  channel_type: "personal",
  alert_types: ["down", "up", "blacklisted", "delisted", "summary", "critical"],
  mute_schedule: "always_active",
  mute_start: null,
  mute_end: null,
  is_active: true,
};

export const TelegramSettingsTab = () => {
  const [loading, setLoading] = useState(true);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [botConfig, setBotConfig] = useState({ id: null as string | null, bot_token: "", enabled: true });
  const [savingBot, setSavingBot] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editChannel, setEditChannel] = useState<(Omit<Channel, "id"> & { id?: string }) | null>(null);
  const [savingChannel, setSavingChannel] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);

  const loadData = async () => {
    const [tgRes, chRes] = await Promise.all([
      supabase.from("telegram_config").select("*").limit(1).maybeSingle(),
      supabase.from("notification_channels").select("*").order("created_at", { ascending: true }),
    ]);
    if (tgRes.data) {
      setBotConfig({
        id: tgRes.data.id,
        bot_token: (tgRes.data as any).bot_token || "",
        enabled: tgRes.data.enabled ?? true,
      });
    }
    if (chRes.data) {
      setChannels(chRes.data.map((c: any) => ({
        ...c,
        alert_types: Array.isArray(c.alert_types) ? c.alert_types : JSON.parse(c.alert_types || "[]"),
      })));
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleSaveBot = async () => {
    if (!botConfig.bot_token.trim()) { toast.error("Bot Token is required"); return; }
    setSavingBot(true);
    try {
      const payload = { bot_token: botConfig.bot_token.trim(), enabled: botConfig.enabled, chat_id: "global", updated_at: new Date().toISOString() };
      if (botConfig.id) {
        const { error } = await supabase.from("telegram_config").update(payload).eq("id", botConfig.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("telegram_config").insert([payload]).select("id").single();
        if (error) throw error;
        setBotConfig(c => ({ ...c, id: data.id }));
      }
      toast.success("Bot token saved!");
    } catch { toast.error("Failed to save bot token"); }
    finally { setSavingBot(false); }
  };

  const openAddChannel = () => {
    setEditChannel({ ...emptyChannel });
    setDialogOpen(true);
  };

  const openEditChannel = (ch: Channel) => {
    setEditChannel({ ...ch });
    setDialogOpen(true);
  };

  const handleSaveChannel = async () => {
    if (!editChannel) return;
    if (!editChannel.name.trim()) { toast.error("Channel name is required"); return; }
    if (!editChannel.chat_id.trim()) { toast.error("Chat ID is required"); return; }
    if (editChannel.alert_types.length === 0) { toast.error("Select at least one alert type"); return; }
    setSavingChannel(true);
    try {
      const payload = {
        name: editChannel.name.trim(),
        chat_id: editChannel.chat_id.trim(),
        channel_type: editChannel.channel_type,
        alert_types: editChannel.alert_types,
        mute_schedule: editChannel.mute_schedule,
        mute_start: editChannel.mute_schedule === "custom" ? editChannel.mute_start : null,
        mute_end: editChannel.mute_schedule === "custom" ? editChannel.mute_end : null,
        is_active: editChannel.is_active,
        updated_at: new Date().toISOString(),
      };
      if (editChannel.id) {
        const { error } = await supabase.from("notification_channels").update(payload).eq("id", editChannel.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("notification_channels").insert([payload]);
        if (error) throw error;
      }
      toast.success(editChannel.id ? "Channel updated!" : "Channel added!");
      setDialogOpen(false);
      setEditChannel(null);
      await loadData();
    } catch { toast.error("Failed to save channel"); }
    finally { setSavingChannel(false); }
  };

  const handleDeleteChannel = async (id: string) => {
    if (!confirm("Delete this notification channel?")) return;
    const { error } = await supabase.from("notification_channels").delete().eq("id", id);
    if (error) { toast.error("Failed to delete"); return; }
    toast.success("Channel deleted");
    setChannels(c => c.filter(ch => ch.id !== id));
  };

  const handleToggleActive = async (ch: Channel) => {
    const { error } = await supabase.from("notification_channels").update({ is_active: !ch.is_active }).eq("id", ch.id);
    if (error) { toast.error("Failed to update"); return; }
    setChannels(cs => cs.map(c => c.id === ch.id ? { ...c, is_active: !c.is_active } : c));
  };

  const handleTestChannel = async (ch: Channel) => {
    setTestingId(ch.id);
    try {
      const { data, error } = await supabase.functions.invoke("send-telegram", {
        body: {
          message: `🧪 *Test Notification*\n\nNosteq IP Monitor → Channel: ${ch.name}\nType: ${ch.channel_type}\nStatus: Working\\!`,
          chat_id: ch.chat_id,
        },
      });
      if (error) throw error;
      if (data?.success) toast.success(`Test sent to "${ch.name}"!`);
      else toast.error(data?.error || "Failed to send test");
    } catch { toast.error("Failed to send test"); }
    finally { setTestingId(null); }
  };

  const handleTestAll = async () => {
    const active = channels.filter(c => c.is_active);
    if (active.length === 0) { toast.error("No active channels to test"); return; }
    setTestingAll(true);
    let success = 0;
    for (const ch of active) {
      try {
        const { data } = await supabase.functions.invoke("send-telegram", {
          body: {
            message: `🧪 *Test All Channels*\n\nNosteq IP Monitor → ${ch.name}\nStatus: Working\\!`,
            chat_id: ch.chat_id,
          },
        });
        if (data?.success) success++;
      } catch { /* skip */ }
    }
    toast.success(`Test sent to ${success}/${active.length} channels`);
    setTestingAll(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[200px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* Global Bot Token */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5" /> Telegram Bot Token</CardTitle>
          <CardDescription>Configure the bot token once — all channels use the same bot.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="bot_token">Bot Token</Label>
              <Input id="bot_token" type="password" placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" value={botConfig.bot_token} onChange={e => setBotConfig({ ...botConfig, bot_token: e.target.value })} />
              <p className="text-xs text-muted-foreground">
                Create a bot via <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="underline text-primary">@BotFather</a>.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label>Telegram Notifications Enabled</Label>
            <Switch checked={botConfig.enabled} onCheckedChange={v => setBotConfig({ ...botConfig, enabled: v })} />
          </div>
          <Button onClick={handleSaveBot} disabled={savingBot} className="w-full">{savingBot ? "Saving..." : "Save Bot Token"}</Button>
        </CardContent>
      </Card>

      {/* Notification Channels Table */}
      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2"><Send className="h-5 w-5" /> Notification Channels</CardTitle>
              <CardDescription>Configure multiple recipients with different alert subscriptions and routing.</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleTestAll} disabled={testingAll}>
                <TestTube className="h-4 w-4 mr-1" />{testingAll ? "Testing..." : "Test All"}
              </Button>
              <Button size="sm" onClick={openAddChannel}>
                <Plus className="h-4 w-4 mr-1" /> Add Channel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {channels.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Send className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>No notification channels configured yet.</p>
              <Button variant="link" onClick={openAddChannel}>Add your first channel</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Channel Name</TableHead>
                    <TableHead className="hidden sm:table-cell">Chat ID</TableHead>
                    <TableHead className="hidden md:table-cell">Type</TableHead>
                    <TableHead className="hidden lg:table-cell">Alert Types</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {channels.map(ch => (
                    <TableRow key={ch.id}>
                      <TableCell className="font-medium">{ch.name}</TableCell>
                      <TableCell className="hidden sm:table-cell font-mono text-xs">{ch.chat_id}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="secondary" className="capitalize">{ch.channel_type}</Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {ch.alert_types.slice(0, 3).map(t => (
                            <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                          ))}
                          {ch.alert_types.length > 3 && <Badge variant="outline" className="text-xs">+{ch.alert_types.length - 3}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={ch.is_active ? "default" : "secondary"} className="cursor-pointer" onClick={() => handleToggleActive(ch)}>
                          {ch.is_active ? <><Volume2 className="h-3 w-3 mr-1" />Active</> : <><VolumeX className="h-3 w-3 mr-1" />Muted</>}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleTestChannel(ch)} disabled={testingId === ch.id}>
                            {testingId === ch.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditChannel(ch)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteChannel(ch.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Channel Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { if (!v) { setDialogOpen(false); setEditChannel(null); } }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editChannel?.id ? "Edit Channel" : "Add Notification Channel"}</DialogTitle>
          </DialogHeader>
          {editChannel && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Channel Name</Label>
                <Input placeholder='e.g. "NOC Group", "IT Agent - John"' value={editChannel.name} onChange={e => setEditChannel({ ...editChannel, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Chat ID</Label>
                <Input placeholder="-1001234567890" value={editChannel.chat_id} onChange={e => setEditChannel({ ...editChannel, chat_id: e.target.value })} />
                <p className="text-xs text-muted-foreground">Numeric ID. Use negative IDs for groups/channels.</p>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={editChannel.channel_type} onValueChange={v => setEditChannel({ ...editChannel, channel_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CHANNEL_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Alert Types</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ALERT_TYPES.map(at => (
                    <label key={at.key} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={editChannel.alert_types.includes(at.key)}
                        onCheckedChange={checked => {
                          setEditChannel({
                            ...editChannel,
                            alert_types: checked
                              ? [...editChannel.alert_types, at.key]
                              : editChannel.alert_types.filter(a => a !== at.key),
                          });
                        }}
                      />
                      {at.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Mute Schedule</Label>
                <Select value={editChannel.mute_schedule} onValueChange={v => setEditChannel({ ...editChannel, mute_schedule: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MUTE_OPTIONS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {editChannel.mute_schedule === "custom" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Mute Start</Label>
                    <Input type="time" value={editChannel.mute_start || ""} onChange={e => setEditChannel({ ...editChannel, mute_start: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Mute End</Label>
                    <Input type="time" value={editChannel.mute_end || ""} onChange={e => setEditChannel({ ...editChannel, mute_end: e.target.value })} />
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between">
                <Label>Active</Label>
                <Switch checked={editChannel.is_active} onCheckedChange={v => setEditChannel({ ...editChannel, is_active: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditChannel(null); }}>Cancel</Button>
            <Button onClick={handleSaveChannel} disabled={savingChannel}>{savingChannel ? "Saving..." : "Save Channel"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
