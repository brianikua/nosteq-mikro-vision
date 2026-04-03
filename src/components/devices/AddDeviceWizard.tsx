import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, ArrowLeft, Plus, Trash2, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useHostingMode } from "@/hooks/use-hosting-mode";

interface AddDeviceWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const deviceTypes = [
  { value: "OLT", label: "🔌 OLT" },
  { value: "MikroTik_Router", label: "🔧 MikroTik Router" },
  { value: "MikroTik_Switch", label: "🔀 MikroTik Switch" },
  { value: "Linux_Server", label: "🐧 Linux Server" },
  { value: "Windows_Server", label: "🪟 Windows Server" },
  { value: "CPE", label: "📡 CPE" },
  { value: "Access_Point", label: "📶 Access Point" },
  { value: "Other", label: "❓ Other" },
];

const interfaceTypes = ["ethernet", "bridge", "vlan", "wireless", "loopback", "tunnel", "sfp", "lag", "other"];
const ipRoles = ["WAN", "LAN", "Management", "Loopback", "VLAN_Gateway", "Tunnel", "Other"];

interface InterfaceEntry {
  name: string;
  type: string;
  description: string;
  mac_address: string;
  speed: string;
  is_public: boolean;
  ips: IPEntry[];
}

interface IPEntry {
  ip_address: string;
  role: string;
  ip_type: string;
  is_public: boolean;
  monitor_uptime: boolean;
  monitor_blacklist: boolean;
  notes: string;
}

interface VlanEntry {
  vlan_id: string;
  name: string;
  subnet: string;
  gateway: string;
  dhcp_enabled: boolean;
  purpose: string;
}

export function AddDeviceWizard({ open, onOpenChange, onSaved }: AddDeviceWizardProps) {
  const { hostingMode } = useHostingMode();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1: Device basics
  const [basics, setBasics] = useState({
    name: "", type: "MikroTik_Router", model: "", serial_number: "", os_version: "",
    site_name: "", site_address: "", status: "active", noc_notes: "",
  });

  // Step 2: Interfaces
  const [interfaces, setInterfaces] = useState<InterfaceEntry[]>([]);

  // Step 3: VLANs
  const [vlans, setVlans] = useState<VlanEntry[]>([]);

  // Step 4: Routes
  const [routes, setRoutes] = useState<{ destination: string; gateway: string; distance: string; comment: string }[]>([]);

  const addInterface = () => {
    setInterfaces([...interfaces, { name: "", type: "ethernet", description: "", mac_address: "", speed: "", is_public: false, ips: [] }]);
  };

  const addIPToInterface = (ifIdx: number) => {
    const updated = [...interfaces];
    updated[ifIdx].ips.push({ ip_address: "", role: "Other", ip_type: "static", is_public: updated[ifIdx].is_public, monitor_uptime: true, monitor_blacklist: false, notes: "" });
    setInterfaces(updated);
  };

  const totalIPs = interfaces.reduce((sum, iface) => sum + iface.ips.length, 0);
  const monitoredIPs = interfaces.reduce((sum, iface) => sum + iface.ips.filter((ip) => ip.monitor_uptime).length, 0);
  const blacklistIPs = interfaces.reduce((sum, iface) => sum + iface.ips.filter((ip) => ip.monitor_blacklist).length, 0);

  const handleSave = async () => {
    if (!basics.name) { toast.error("Device name is required"); return; }
    setSaving(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Create device
      const { data: device, error: devError } = await supabase.from("devices").insert({
        name: basics.name,
        type: basics.type,
        model: basics.model || null,
        serial_number: basics.serial_number || null,
        os_version: basics.os_version || null,
        site_name: basics.site_name || null,
        site_address: basics.site_address || null,
        status: basics.status,
        noc_notes: basics.noc_notes || null,
        added_by: user?.id || null,
        ip_address: "0.0.0.0", // Legacy field, required by existing schema
      }).select().single();

      if (devError) throw devError;

      // Create interfaces and IPs
      for (const iface of interfaces) {
        if (!iface.name) continue;
        const { data: ifData, error: ifError } = await supabase.from("interfaces").insert({
          device_id: device.id,
          name: iface.name,
          type: iface.type,
          description: iface.description || null,
          mac_address: iface.mac_address || null,
          speed: iface.speed || null,
          is_public: iface.is_public,
        }).select().single();

        if (ifError) throw ifError;

        for (const ip of iface.ips) {
          if (!ip.ip_address) continue;
          const ipOnly = ip.ip_address.split("/")[0];
          const prefix = ip.ip_address.includes("/") ? parseInt(ip.ip_address.split("/")[1]) : null;

          await supabase.from("ip_assignments").insert({
            interface_id: ifData.id,
            device_id: device.id,
            ip_address: ip.ip_address,
            ip_only: ipOnly,
            prefix_length: prefix,
            ip_type: ip.ip_type,
            role: ip.role,
            is_public: ip.is_public,
            monitor_uptime: ip.monitor_uptime,
            monitor_blacklist: ip.monitor_blacklist && ip.is_public,
            reachability_type: ip.is_public ? "public" : (hostingMode === "vpn" ? "vpn" : "local"),
            notes: ip.notes || null,
          });
        }
      }

      // Create VLANs
      for (const vlan of vlans) {
        if (!vlan.vlan_id) continue;
        await supabase.from("vlans").insert({
          device_id: device.id,
          vlan_id: parseInt(vlan.vlan_id),
          name: vlan.name || null,
          subnet: vlan.subnet || null,
          gateway: vlan.gateway || null,
          dhcp_enabled: vlan.dhcp_enabled,
          purpose: vlan.purpose || null,
        });
      }

      // Create routes
      for (const route of routes) {
        if (!route.destination || !route.gateway) continue;
        await supabase.from("static_routes").insert({
          device_id: device.id,
          destination: route.destination,
          gateway: route.gateway,
          distance: parseInt(route.distance) || 1,
          comment: route.comment || null,
        });
      }

      toast.success(`Device ${basics.name} added with ${monitoredIPs} IPs being monitored`);
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message || "Failed to save device");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {step === 1 && "Step 1: Device Basics"}
            {step === 2 && "Step 2: Interfaces & IPs"}
            {step === 3 && "Step 3: VLANs (Optional)"}
            {step === 4 && "Step 4: Static Routes (Optional)"}
            {step === 5 && "Step 5: Review & Save"}
          </DialogTitle>
        </DialogHeader>

        {/* Progress */}
        <div className="flex gap-1 mb-4">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className={cn("h-1.5 flex-1 rounded-full", s <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>

        {/* Step 1: Basics */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs text-muted-foreground">Device Name *</label>
                <Input value={basics.name} onChange={(e) => setBasics({ ...basics, name: e.target.value })} placeholder="e.g. NNL_B_M ROUTER" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Device Type *</label>
                <Select value={basics.type} onValueChange={(v) => setBasics({ ...basics, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {deviceTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Model</label>
                <Input value={basics.model} onChange={(e) => setBasics({ ...basics, model: e.target.value })} placeholder="e.g. CCR2004-1G-12S+2XS" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">OS / RouterOS Version</label>
                <Input value={basics.os_version} onChange={(e) => setBasics({ ...basics, os_version: e.target.value })} placeholder="e.g. 7.14.3" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Serial Number</label>
                <Input value={basics.serial_number} onChange={(e) => setBasics({ ...basics, serial_number: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Site Name *</label>
                <Input value={basics.site_name} onChange={(e) => setBasics({ ...basics, site_name: e.target.value })} placeholder="e.g. Nyeri North Link" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Status</label>
                <Select value={basics.status} onValueChange={(v) => setBasics({ ...basics, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="planned">Planned</SelectItem>
                    <SelectItem value="decommissioned">Decommissioned</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Interfaces */}
        {step === 2 && (
          <div className="space-y-4">
            {interfaces.map((iface, ifIdx) => (
              <div key={ifIdx} className="border border-border rounded-lg p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">Interface {ifIdx + 1}</span>
                  <Button variant="ghost" size="sm" className="h-7 text-destructive" onClick={() => setInterfaces(interfaces.filter((_, i) => i !== ifIdx))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground">Name *</label>
                    <Input className="h-8 text-xs" placeholder="ether1" value={iface.name} onChange={(e) => { const u = [...interfaces]; u[ifIdx].name = e.target.value; setInterfaces(u); }} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Type</label>
                    <Select value={iface.type} onValueChange={(v) => { const u = [...interfaces]; u[ifIdx].type = v; setInterfaces(u); }}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{interfaceTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground">Description</label>
                    <Input className="h-8 text-xs" placeholder="Uplink to ISP" value={iface.description} onChange={(e) => { const u = [...interfaces]; u[ifIdx].description = e.target.value; setInterfaces(u); }} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch checked={iface.is_public} onCheckedChange={(v) => { const u = [...interfaces]; u[ifIdx].is_public = v; setInterfaces(u); }} />
                  <span className="text-xs text-muted-foreground">Public Interface</span>
                </div>

                {/* IPs for this interface */}
                {iface.ips.map((ip, ipIdx) => (
                  <div key={ipIdx} className="ml-4 border-l-2 border-primary/20 pl-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">IP {ipIdx + 1}</span>
                      <Button variant="ghost" size="sm" className="h-6 text-destructive" onClick={() => { const u = [...interfaces]; u[ifIdx].ips = u[ifIdx].ips.filter((_, i) => i !== ipIdx); setInterfaces(u); }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Input className="h-7 text-xs" placeholder="102.204.13.226/28" value={ip.ip_address} onChange={(e) => { const u = [...interfaces]; u[ifIdx].ips[ipIdx].ip_address = e.target.value; setInterfaces(u); }} />
                      </div>
                      <div>
                        <Select value={ip.role} onValueChange={(v) => { const u = [...interfaces]; u[ifIdx].ips[ipIdx].role = v; setInterfaces(u); }}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{ipRoles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={ip.monitor_uptime} onCheckedChange={(v) => { const u = [...interfaces]; u[ifIdx].ips[ipIdx].monitor_uptime = v; setInterfaces(u); }} />
                        <span className="text-[10px] text-muted-foreground">Monitor</span>
                      </div>
                    </div>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="h-7 text-xs ml-4" onClick={() => addIPToInterface(ifIdx)}>
                  <Plus className="h-3 w-3 mr-1" /> Add IP
                </Button>
              </div>
            ))}
            <Button variant="outline" className="w-full" onClick={addInterface}>
              <Plus className="h-4 w-4 mr-2" /> Add Interface
            </Button>
          </div>
        )}

        {/* Step 3: VLANs */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Optional — document VLANs on this device.</p>
            {vlans.map((vlan, vIdx) => (
              <div key={vIdx} className="border border-border rounded-lg p-3 grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">VLAN ID *</label>
                  <Input className="h-8 text-xs" type="number" value={vlan.vlan_id} onChange={(e) => { const u = [...vlans]; u[vIdx].vlan_id = e.target.value; setVlans(u); }} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Name</label>
                  <Input className="h-8 text-xs" value={vlan.name} onChange={(e) => { const u = [...vlans]; u[vIdx].name = e.target.value; setVlans(u); }} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Subnet</label>
                  <Input className="h-8 text-xs" placeholder="192.168.10.0/24" value={vlan.subnet} onChange={(e) => { const u = [...vlans]; u[vIdx].subnet = e.target.value; setVlans(u); }} />
                </div>
                <div className="col-span-2">
                  <label className="text-[10px] text-muted-foreground">Purpose</label>
                  <Input className="h-8 text-xs" value={vlan.purpose} onChange={(e) => { const u = [...vlans]; u[vIdx].purpose = e.target.value; setVlans(u); }} />
                </div>
                <div className="flex items-end">
                  <Button variant="ghost" size="sm" className="h-8 text-destructive" onClick={() => setVlans(vlans.filter((_, i) => i !== vIdx))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" className="w-full" onClick={() => setVlans([...vlans, { vlan_id: "", name: "", subnet: "", gateway: "", dhcp_enabled: false, purpose: "" }])}>
              <Plus className="h-4 w-4 mr-2" /> Add VLAN
            </Button>
          </div>
        )}

        {/* Step 4: Routes */}
        {step === 4 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Optional — document static routes.</p>
            {routes.map((route, rIdx) => (
              <div key={rIdx} className="border border-border rounded-lg p-3 grid grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Destination</label>
                  <Input className="h-8 text-xs" placeholder="0.0.0.0/0" value={route.destination} onChange={(e) => { const u = [...routes]; u[rIdx].destination = e.target.value; setRoutes(u); }} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Gateway</label>
                  <Input className="h-8 text-xs" value={route.gateway} onChange={(e) => { const u = [...routes]; u[rIdx].gateway = e.target.value; setRoutes(u); }} />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Distance</label>
                  <Input className="h-8 text-xs" type="number" value={route.distance} onChange={(e) => { const u = [...routes]; u[rIdx].distance = e.target.value; setRoutes(u); }} />
                </div>
                <div className="flex items-end">
                  <Button variant="ghost" size="sm" className="h-8 text-destructive" onClick={() => setRoutes(routes.filter((_, i) => i !== rIdx))}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
            <Button variant="outline" className="w-full" onClick={() => setRoutes([...routes, { destination: "", gateway: "", distance: "1", comment: "" }])}>
              <Plus className="h-4 w-4 mr-2" /> Add Route
            </Button>
          </div>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-lg p-4 space-y-2">
              <p className="text-sm"><span className="text-muted-foreground">Device:</span> <span className="font-semibold text-foreground">{basics.name}</span> ({basics.type.replace(/_/g, " ")})</p>
              <p className="text-sm"><span className="text-muted-foreground">Site:</span> {basics.site_name || "—"}</p>
              <p className="text-sm"><span className="text-muted-foreground">Interfaces:</span> {interfaces.length}</p>
              <p className="text-sm"><span className="text-muted-foreground">IPs to monitor (uptime):</span> {monitoredIPs}</p>
              <p className="text-sm"><span className="text-muted-foreground">IPs to monitor (blacklist):</span> {blacklistIPs}</p>
              <p className="text-sm"><span className="text-muted-foreground">VLANs:</span> {vlans.length}</p>
              <p className="text-sm"><span className="text-muted-foreground">Static routes:</span> {routes.length}</p>
            </div>
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-4">
          <Button variant="outline" onClick={() => step > 1 ? setStep(step - 1) : onOpenChange(false)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> {step === 1 ? "Cancel" : "Back"}
          </Button>
          {step < 5 ? (
            <Button className="gradient-primary text-primary-foreground" onClick={() => setStep(step + 1)} disabled={step === 1 && !basics.name}>
              Next <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button className="gradient-primary text-primary-foreground" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
              Save Device
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
