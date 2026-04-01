import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Server, Plus } from "lucide-react";

interface LinkToServerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deviceId: string;
  deviceName: string;
  onLinked: () => void;
}

interface ServerOption {
  id: string;
  name: string;
  server_type: string;
  location: string | null;
}

const SERVER_TYPES = ["OLT", "MikroTik", "CPE", "Linux Server", "Windows Server", "Other"];

export const LinkToServerDialog = ({ open, onOpenChange, deviceId, deviceName, onLinked }: LinkToServerDialogProps) => {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [servers, setServers] = useState<ServerOption[]>([]);
  const [selectedServerId, setSelectedServerId] = useState("");
  const [loading, setLoading] = useState(false);

  // New server fields
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("Other");
  const [newLocation, setNewLocation] = useState("");

  // IP role/label
  const [ipRole, setIpRole] = useState("Other");
  const [ipLabel, setIpLabel] = useState("");

  useEffect(() => {
    if (open) {
      supabase.from("servers").select("id, name, server_type, location").order("name").then(({ data }) => {
        setServers(data || []);
        if (data && data.length > 0) {
          setSelectedServerId(data[0].id);
          setMode("existing");
        } else {
          setMode("new");
        }
      });
      setNewName("");
      setNewType("Other");
      setNewLocation("");
      setIpRole("Other");
      setIpLabel("");
    }
  }, [open]);

  const handleLink = async () => {
    setLoading(true);
    try {
      let serverId = selectedServerId;

      if (mode === "new") {
        if (!newName.trim()) { toast.error("Server name required"); setLoading(false); return; }
        const { data, error } = await supabase.from("servers").insert({ name: newName.trim(), server_type: newType, location: newLocation.trim() || null }).select("id").single();
        if (error) throw error;
        serverId = data.id;
      }

      const { error } = await supabase.from("devices").update({
        server_id: serverId,
        ip_role: ipRole,
        ip_label: ipLabel.trim() || null,
      }).eq("id", deviceId);

      if (error) throw error;
      toast.success(`${deviceName} linked to server`);
      onLinked();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Server className="h-5 w-5" /> Link to Server</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">Assign <strong>{deviceName}</strong> to a server.</p>

        <RadioGroup value={mode} onValueChange={(v) => setMode(v as "existing" | "new")} className="flex gap-4">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="existing" id="existing" disabled={servers.length === 0} />
            <Label htmlFor="existing">Existing Server</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="new" id="new" />
            <Label htmlFor="new" className="flex items-center gap-1"><Plus className="h-3 w-3" /> New Server</Label>
          </div>
        </RadioGroup>

        {mode === "existing" && servers.length > 0 && (
          <Select value={selectedServerId} onValueChange={setSelectedServerId}>
            <SelectTrigger><SelectValue placeholder="Select server" /></SelectTrigger>
            <SelectContent>
              {servers.map(s => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} ({s.server_type}){s.location ? ` — ${s.location}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {mode === "new" && (
          <div className="space-y-3">
            <div>
              <Label>Server Name</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. KIAMBAA OLT 1" />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={newType} onValueChange={setNewType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Location</Label>
              <Input value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="Optional" />
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
          <div>
            <Label>IP Role</Label>
            <Select value={ipRole} onValueChange={setIpRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Management", "WAN", "LAN", "VLAN", "Loopback", "Other"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>IP Label</Label>
            <Input value={ipLabel} onChange={e => setIpLabel(e.target.value)} placeholder="e.g. WAN 1" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleLink} disabled={loading || (mode === "existing" && !selectedServerId)}>
            {loading ? "Linking..." : "Link to Server"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
