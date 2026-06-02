import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Network } from "lucide-react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  deviceId: string;
  interfaces: { id: string; name: string }[];
  onCreated: () => void;
}

const NEW_IF = "__new__";

function ipToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) throw new Error("Invalid IP");
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}
function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

function expandCIDR(cidr: string, skipNetBroadcast: boolean): string[] {
  const [base, prefixStr] = cidr.trim().split("/");
  const prefix = parseInt(prefixStr, 10);
  if (isNaN(prefix) || prefix < 0 || prefix > 32) throw new Error("Invalid prefix");
  const baseInt = ipToInt(base);
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = (baseInt & mask) >>> 0;
  const size = prefix === 32 ? 1 : 2 ** (32 - prefix);
  const ips: string[] = [];
  let start = 0, end = size;
  if (skipNetBroadcast && prefix <= 30) { start = 1; end = size - 1; }
  for (let i = start; i < end; i++) ips.push(intToIp((network + i) >>> 0));
  return ips;
}

export const BulkAddIPsDialog = ({ open, onOpenChange, deviceId, interfaces, onCreated }: Props) => {
  const [cidr, setCidr] = useState("");
  const [interfaceId, setInterfaceId] = useState<string>(interfaces[0]?.id || NEW_IF);
  const [newIfName, setNewIfName] = useState("ether1");
  const [role, setRole] = useState("Uplink");
  const [skipNetBcast, setSkipNetBcast] = useState(true);
  const [isPublic, setIsPublic] = useState(true);
  const [monitorUptime, setMonitorUptime] = useState(true);
  const [monitorBlacklist, setMonitorBlacklist] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setInterfaceId(interfaces[0]?.id || NEW_IF);
  }, [open, interfaces]);

  const preview = useMemo(() => {
    if (!cidr.includes("/")) return { ips: [] as string[], error: "" };
    try {
      return { ips: expandCIDR(cidr, skipNetBcast), error: "" };
    } catch (e: any) {
      return { ips: [], error: e.message };
    }
  }, [cidr, skipNetBcast]);

  const prefix = parseInt(cidr.split("/")[1] || "0", 10);

  const handleSubmit = async () => {
    if (preview.error || preview.ips.length === 0) return toast.error("Invalid CIDR");
    if (preview.ips.length > 1024) return toast.error("Too many IPs (max 1024)");

    setSaving(true);

    let ifaceId = interfaceId;
    if (ifaceId === NEW_IF) {
      if (!newIfName.trim()) { setSaving(false); return toast.error("Interface name required"); }
      const { data: created, error: ifErr } = await supabase
        .from("interfaces")
        .insert({ device_id: deviceId, name: newIfName.trim(), type: "ethernet", is_public: isPublic })
        .select("id")
        .single();
      if (ifErr || !created) { setSaving(false); return toast.error(ifErr?.message || "Failed to create interface"); }
      ifaceId = created.id;
    }

    const rows = preview.ips.map((ip) => ({
      device_id: deviceId,
      interface_id: ifaceId,
      ip_address: `${ip}/${prefix}`,
      ip_only: ip,
      prefix_length: prefix,
      ip_type: "static",
      role,
      is_public: isPublic,
      monitor_uptime: monitorUptime,
      monitor_blacklist: monitorBlacklist && isPublic,
      reachability_type: isPublic ? "public" : "local",
      last_status: "unknown",
    }));

    const { error, data } = await supabase.from("ip_assignments").insert(rows).select("id");
    if (error) {
      setSaving(false);
      return toast.error(error.message);
    }

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("change_log").insert({
      table_name: "ip_assignments",
      change_type: "bulk_create",
      device_id: deviceId,
      changed_by: user?.id,
      field_name: "cidr",
      new_value: `${cidr} (${data?.length || rows.length} IPs)`,
    });

    setSaving(false);
    toast.success(`Added ${data?.length || rows.length} IPs`);
    setCidr("");
    onCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Network className="h-4 w-4" /> Bulk Add IPs from CIDR</DialogTitle>
          <DialogDescription>Expand a CIDR block into individual monitored IP assignments.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs">CIDR Block</Label>
            <Input placeholder="e.g. 102.135.20.0/29" value={cidr} onChange={(e) => setCidr(e.target.value)} className="font-mono" />
            {preview.error && <p className="text-xs text-destructive mt-1">{preview.error}</p>}
            {!preview.error && preview.ips.length > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1">
                {preview.ips.length} IPs: {preview.ips.slice(0, 3).join(", ")}{preview.ips.length > 3 ? ` … ${preview.ips[preview.ips.length - 1]}` : ""}
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Attach to Interface</Label>
            <Select value={interfaceId} onValueChange={setInterfaceId}>
              <SelectTrigger><SelectValue placeholder="Select interface" /></SelectTrigger>
              <SelectContent>
                {interfaces.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
                <SelectItem value={NEW_IF}>+ Create new interface…</SelectItem>
              </SelectContent>
            </Select>
            {interfaceId === NEW_IF && (
              <Input
                className="mt-2 font-mono"
                placeholder="Interface name (e.g. ether1, bridge-wan)"
                value={newIfName}
                onChange={(e) => setNewIfName(e.target.value)}
              />
            )}
          </div>

          <div>
            <Label className="text-xs">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Uplink", "WAN", "LAN", "Management", "Loopback", "Other"].map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 pt-2 border-t border-border/40">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={skipNetBcast} onCheckedChange={(c) => setSkipNetBcast(!!c)} />
              Skip network & broadcast addresses
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isPublic} onCheckedChange={(c) => setIsPublic(!!c)} />
              Mark as Public
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={monitorUptime} onCheckedChange={(c) => setMonitorUptime(!!c)} />
              Enable uptime monitoring
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={monitorBlacklist} onCheckedChange={(c) => setMonitorBlacklist(!!c)} disabled={!isPublic} />
              Enable blacklist monitoring {!isPublic && <span className="text-[10px] text-muted-foreground">(requires Public)</span>}
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || preview.ips.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
            Add {preview.ips.length > 0 ? `${preview.ips.length} IPs` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
