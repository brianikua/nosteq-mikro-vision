import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { parseIPv4CIDR } from "@/lib/ip-utils";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  ip: any | null;
  interfaces: { id: string; name: string }[];
  onSaved: () => void;
}

export const EditIPAssignmentDialog = ({ open, onOpenChange, ip, interfaces, onSaved }: Props) => {
  const [ipAddr, setIpAddr] = useState("");
  const [ifaceId, setIfaceId] = useState("");
  const [role, setRole] = useState("Other");
  const [ipType, setIpType] = useState("static");
  const [isPublic, setIsPublic] = useState(false);
  const [monUptime, setMonUptime] = useState(false);
  const [monBlacklist, setMonBlacklist] = useState(false);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (ip && open) {
      setIpAddr(ip.ip_address || "");
      setIfaceId(ip.interface_id || "");
      setRole(ip.role || "Other");
      setIpType(ip.ip_type || "static");
      setIsPublic(!!ip.is_public);
      setMonUptime(!!ip.monitor_uptime);
      setMonBlacklist(!!ip.monitor_blacklist);
      setNotes(ip.notes || "");
    }
  }, [ip, open]);

  const save = async () => {
    if (!ip) return;
    const parsed = parseIPv4CIDR(ipAddr);
    if (!parsed) return toast.error("Invalid IP (e.g. 1.2.3.4 or 1.2.3.4/24)");
    const ip_only = parsed.ip;
    const prefix_length = parsed.prefix ?? ip.prefix_length;

    setSaving(true);
    const { error } = await supabase.from("ip_assignments").update({
      ip_address: ipAddr.trim(),
      ip_only,
      prefix_length,
      interface_id: ifaceId,
      role,
      ip_type: ipType,
      is_public: isPublic,
      monitor_uptime: monUptime,
      monitor_blacklist: monBlacklist && isPublic,
      reachability_type: isPublic ? "public" : "local",
      notes,
    }).eq("id", ip.id);
    setSaving(false);
    if (error) return toast.error(error.message);

    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("change_log").insert({
      table_name: "ip_assignments",
      change_type: "update",
      device_id: ip.device_id,
      record_id: ip.id,
      changed_by: user?.id,
      field_name: "ip_address",
      old_value: ip.ip_address,
      new_value: ipAddr.trim(),
    });

    toast.success("IP updated");
    onSaved();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit IP Assignment</DialogTitle>
          <DialogDescription>Update IP details and monitoring settings.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">IP Address (CIDR)</Label>
            <Input className="font-mono" value={ipAddr} onChange={(e) => setIpAddr(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Interface</Label>
            <Select value={ifaceId} onValueChange={setIfaceId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {interfaces.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
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
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={ipType} onValueChange={setIpType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["static", "dhcp", "pppoe", "loopback"].map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2 pt-1 border-t border-border/40">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isPublic} onCheckedChange={(c) => setIsPublic(!!c)} /> Public
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={monUptime} onCheckedChange={(c) => setMonUptime(!!c)} /> Monitor uptime
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={monBlacklist} onCheckedChange={(c) => setMonBlacklist(!!c)} disabled={!isPublic} /> Monitor blacklist
            </label>
          </div>
          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
