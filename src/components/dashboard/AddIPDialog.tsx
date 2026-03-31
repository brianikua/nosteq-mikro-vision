import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { X, Plus, Trash2, Star } from "lucide-react";

const COMMON_PORTS: Record<number, string> = {
  22: "SSH", 53: "DNS", 80: "HTTP", 443: "HTTPS", 3389: "RDP",
  8080: "HTTP-Alt", 8291: "Winbox", 8443: "HTTPS-Alt",
  8728: "MikroTik API", 8729: "MikroTik API-SSL",
};

const SERVER_TYPES = ["OLT", "MikroTik", "CPE", "Linux Server", "Windows Server", "Other"];
const IP_ROLES = ["Management", "WAN", "LAN", "VLAN", "Loopback", "Other"];

const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
const phoneRegex = /^\+?[0-9]{7,15}$/;

interface IPRow {
  label: string;
  ip_address: string;
  role: string;
  is_primary: boolean;
}

interface AddIPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export const AddIPDialog = ({ open, onOpenChange, onSaved }: AddIPDialogProps) => {
  const [mode, setMode] = useState<"single" | "server">("single");
  const [loading, setLoading] = useState(false);

  // Single mode
  const [formData, setFormData] = useState({ name: "", ip_address: "" });
  const [ports, setPorts] = useState<number[]>([80, 443]);
  const [portInput, setPortInput] = useState("");
  const [notifyNumbers, setNotifyNumbers] = useState<string[]>([]);
  const [numberInput, setNumberInput] = useState("");

  // Server mode
  const [serverName, setServerName] = useState("");
  const [serverType, setServerType] = useState("Other");
  const [serverLocation, setServerLocation] = useState("");
  const [serverGroupId, setServerGroupId] = useState("none");
  const [ipRows, setIpRows] = useState<IPRow[]>([{ label: "Management", ip_address: "", role: "Management", is_primary: true }]);
  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [servers, setServers] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (open) {
      supabase.from("ip_groups").select("id, name").order("name").then(({ data }) => setGroups(data || []));
      supabase.from("servers").select("id, name").order("name").then(({ data }) => setServers(data || []));
    }
  }, [open]);

  const resetForm = () => {
    setFormData({ name: "", ip_address: "" });
    setPorts([80, 443]);
    setPortInput("");
    setNotifyNumbers([]);
    setNumberInput("");
    setServerName("");
    setServerType("Other");
    setServerLocation("");
    setServerGroupId("none");
    setIpRows([{ label: "Management", ip_address: "", role: "Management", is_primary: true }]);
  };

  const addNumber = () => {
    const num = numberInput.trim();
    if (!num) return;
    if (!phoneRegex.test(num)) { toast.error("Invalid phone number"); return; }
    if (notifyNumbers.includes(num)) { toast.error("Already added"); return; }
    if (notifyNumbers.length >= 5) { toast.error("Max 5 numbers"); return; }
    setNotifyNumbers([...notifyNumbers, num]);
    setNumberInput("");
  };

  const addPort = (port: number) => {
    if (port < 1 || port > 65535 || ports.includes(port) || ports.length >= 10) return;
    setPorts([...ports, port]);
  };

  const removePort = (port: number) => setPorts(ports.filter(p => p !== port));

  const handlePortInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const port = parseInt(portInput);
      if (!isNaN(port)) { addPort(port); setPortInput(""); }
    }
  };

  const handleNumberInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); addNumber(); }
  };

  // IP rows management for server mode
  const addIpRow = () => {
    if (ipRows.length >= 10) { toast.error("Maximum 10 IPs per server"); return; }
    setIpRows([...ipRows, { label: "", ip_address: "", role: "WAN", is_primary: false }]);
  };

  const updateIpRow = (index: number, field: keyof IPRow, value: any) => {
    setIpRows(prev => prev.map((r, i) => {
      if (i !== index) return field === "is_primary" && value === true ? { ...r, is_primary: false } : r;
      return { ...r, [field]: value };
    }));
  };

  const removeIpRow = (index: number) => {
    if (ipRows.length <= 1) { toast.error("At least 1 IP required"); return; }
    const newRows = ipRows.filter((_, i) => i !== index);
    if (!newRows.some(r => r.is_primary) && newRows.length > 0) newRows[0].is_primary = true;
    setIpRows(newRows);
  };

  const handleSubmitSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!formData.name.trim()) throw new Error("Label is required");
      if (!ipv4Regex.test(formData.ip_address.trim())) throw new Error("Invalid IPv4 address");
      if (ports.length === 0) throw new Error("At least one port required");

      const { error } = await supabase.from("devices").insert([{
        name: formData.name.trim(),
        ip_address: formData.ip_address.trim(),
        check_ports: ports,
        notify_number: notifyNumbers.length > 0 ? notifyNumbers : null,
      }]);
      if (error) throw error;
      toast.success("IP address added!");
      onOpenChange(false);
      resetForm();
      onSaved?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to add IP");
    } finally { setLoading(false); }
  };

  const handleSubmitServer = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (!serverName.trim()) throw new Error("Server name required");
      for (const row of ipRows) {
        if (!row.ip_address.trim()) throw new Error("All IP addresses are required");
        if (!ipv4Regex.test(row.ip_address.trim())) throw new Error(`Invalid IP: ${row.ip_address}`);
      }

      // Create server
      const { data: serverData, error: serverError } = await supabase.from("servers").insert({
        name: serverName.trim(),
        server_type: serverType,
        location: serverLocation.trim() || null,
        group_id: serverGroupId === "none" ? null : serverGroupId,
      }).select("id").single();
      if (serverError) throw serverError;

      // Create devices
      const deviceInserts = ipRows.map(row => ({
        name: row.label.trim() || `${serverName.trim()} - ${row.role}`,
        ip_address: row.ip_address.trim(),
        check_ports: ports,
        notify_number: notifyNumbers.length > 0 ? notifyNumbers : null,
        server_id: serverData.id,
        ip_role: row.role,
        ip_label: row.label.trim() || null,
        is_primary: row.is_primary,
      }));

      const { error: devError } = await supabase.from("devices").insert(deviceInserts);
      if (devError) throw devError;

      toast.success(`Server added with ${ipRows.length} IPs being monitored`);
      onOpenChange(false);
      resetForm();
      onSaved?.();
    } catch (error: any) {
      toast.error(error.message || "Failed to add server");
    } finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add IP Address</DialogTitle>
          <DialogDescription>Add an IP or a server with multiple IPs to monitor</DialogDescription>
        </DialogHeader>

        {/* Mode Toggle */}
        <RadioGroup value={mode} onValueChange={(v) => setMode(v as "single" | "server")} className="flex gap-4 py-1">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="single" id="mode-single" />
            <Label htmlFor="mode-single" className="text-sm cursor-pointer">Single IP</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="server" id="mode-server" />
            <Label htmlFor="mode-server" className="text-sm cursor-pointer">Server with Multiple IPs</Label>
          </div>
        </RadioGroup>

        {mode === "single" ? (
          <form onSubmit={handleSubmitSingle} className="space-y-4">
            <div className="space-y-2">
              <Label>Label</Label>
              <Input placeholder="Main Server" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label>IP Address</Label>
              <Input placeholder="192.168.1.1" value={formData.ip_address} onChange={e => setFormData({ ...formData, ip_address: e.target.value })} required />
            </div>

            {/* SMS Numbers */}
            <div className="space-y-2">
              <Label>SMS Notify Numbers <span className="text-muted-foreground font-normal">(optional, max 5)</span></Label>
              {notifyNumbers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {notifyNumbers.map(num => (
                    <Badge key={num} variant="secondary" className="text-xs gap-1 pr-1">
                      {num}
                      <button type="button" onClick={() => setNotifyNumbers(notifyNumbers.filter(n => n !== num))} className="ml-0.5 hover:text-destructive"><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input placeholder="+1234567890" value={numberInput} onChange={e => setNumberInput(e.target.value)} onKeyDown={handleNumberInputKey} className="flex-1" />
                <Button type="button" variant="outline" size="sm" onClick={addNumber} disabled={notifyNumbers.length >= 5}><Plus className="h-3.5 w-3.5" /></Button>
              </div>
            </div>

            <PortsSection ports={ports} portInput={portInput} setPortInput={setPortInput} addPort={addPort} removePort={removePort} handlePortInputKey={handlePortInputKey} />

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
              <Button type="submit" disabled={loading} className="flex-1">{loading ? "Adding..." : "Add IP"}</Button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleSubmitServer} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Server Name</Label>
                <Input value={serverName} onChange={e => setServerName(e.target.value)} placeholder="KIAMBAA OLT 1" required />
              </div>
              <div className="space-y-1">
                <Label>Device Type</Label>
                <Select value={serverType} onValueChange={setServerType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SERVER_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Location / Site</Label>
                <Input value={serverLocation} onChange={e => setServerLocation(e.target.value)} placeholder="Kiambaa Exchange" />
              </div>
              <div className="space-y-1">
                <Label>Group</Label>
                <Select value={serverGroupId} onValueChange={setServerGroupId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No Group</SelectItem>
                    {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* IP Rows */}
            <div className="space-y-2">
              <Label>IP Addresses</Label>
              <div className="space-y-2">
                {ipRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 rounded-md border border-border/50 bg-card/30">
                    <Input className="w-24 h-8 text-xs" placeholder="Label" value={row.label} onChange={e => updateIpRow(i, "label", e.target.value)} />
                    <Input className="flex-1 h-8 text-xs font-mono" placeholder="IP Address" value={row.ip_address} onChange={e => updateIpRow(i, "ip_address", e.target.value)} />
                    <Select value={row.role} onValueChange={v => updateIpRow(i, "role", v)}>
                      <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {IP_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant={row.is_primary ? "default" : "ghost"} size="icon" className="h-7 w-7 shrink-0" title="Set as primary" onClick={() => updateIpRow(i, "is_primary", true)}>
                      <Star className="h-3 w-3" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7 shrink-0 text-destructive hover:text-destructive" onClick={() => removeIpRow(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={addIpRow} disabled={ipRows.length >= 10}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Another IP
              </Button>
            </div>

            <PortsSection ports={ports} portInput={portInput} setPortInput={setPortInput} addPort={addPort} removePort={removePort} handlePortInputKey={handlePortInputKey} />

            {/* SMS Numbers */}
            <div className="space-y-2">
              <Label>SMS Notify Numbers <span className="text-muted-foreground font-normal">(optional, applies to all IPs)</span></Label>
              {notifyNumbers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {notifyNumbers.map(num => (
                    <Badge key={num} variant="secondary" className="text-xs gap-1 pr-1">
                      {num}
                      <button type="button" onClick={() => setNotifyNumbers(notifyNumbers.filter(n => n !== num))} className="ml-0.5 hover:text-destructive"><X className="h-3 w-3" /></button>
                    </Badge>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input placeholder="+1234567890" value={numberInput} onChange={e => setNumberInput(e.target.value)} onKeyDown={handleNumberInputKey} className="flex-1" />
                <Button type="button" variant="outline" size="sm" onClick={addNumber} disabled={notifyNumbers.length >= 5}><Plus className="h-3.5 w-3.5" /></Button>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
              <Button type="submit" disabled={loading} className="flex-1">{loading ? "Adding..." : `Add Server (${ipRows.length} IPs)`}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};

// Reusable ports section
function PortsSection({ ports, portInput, setPortInput, addPort, removePort, handlePortInputKey }: {
  ports: number[];
  portInput: string;
  setPortInput: (v: string) => void;
  addPort: (p: number) => void;
  removePort: (p: number) => void;
  handlePortInputKey: (e: React.KeyboardEvent) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>Ports to Check</Label>
      <div className="flex flex-wrap gap-1.5 min-h-[32px]">
        {ports.map(port => (
          <Badge key={port} variant="secondary" className="text-xs gap-1 pr-1">
            {port}{COMMON_PORTS[port] && <span className="text-muted-foreground">({COMMON_PORTS[port]})</span>}
            <button type="button" onClick={() => removePort(port)} className="ml-0.5 hover:text-destructive"><X className="h-3 w-3" /></button>
          </Badge>
        ))}
      </div>
      <div className="flex gap-2">
        <Input placeholder="Add port (e.g. 8291)" value={portInput} onChange={e => setPortInput(e.target.value.replace(/\D/g, ""))} onKeyDown={handlePortInputKey} className="flex-1" />
        <Button type="button" variant="outline" size="sm" onClick={() => {
          const port = parseInt(portInput);
          if (!isNaN(port)) { addPort(port); setPortInput(""); }
        }}>Add</Button>
      </div>
      <div className="flex flex-wrap gap-1">
        {Object.entries(COMMON_PORTS).filter(([p]) => !ports.includes(Number(p))).slice(0, 6).map(([port, label]) => (
          <button key={port} type="button" onClick={() => addPort(Number(port))}
            className="text-xs px-2 py-0.5 rounded border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
            +{port} ({label})
          </button>
        ))}
      </div>
    </div>
  );
}
