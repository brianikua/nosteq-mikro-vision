import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { VersionFooter } from "@/components/dashboard/VersionFooter";
import { BlacklistAlertPill } from "@/components/dashboard/BlacklistAlertPill";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { X, Plus, ScanLine, AlertTriangle, Network, Trash2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAutoLogout } from "@/hooks/use-auto-logout";
import { toast } from "sonner";
import { isValidIPv4 } from "@/lib/ip-utils";

type Block = {
  id: string; cidr: string; label: string | null; vlan_id: number | null;
  block_type: string | null; gateway: string | null; broadcast: string | null;
  total_ips: number | null; usable_ips: number | null; assigned_ips: number | null;
  status: string | null; blacklisted_count: number | null;
};

type IPRow = {
  id: string; block_id: string | null; ip_address: string; role: string | null;
  status: string | null; is_blacklisted: boolean | null; rbl_lists: string[] | null;
  last_ping_ms: number | null; assigned_to: string | null;
};

const utilColor = (used: number, usable: number) => {
  const pct = usable > 0 ? (used / usable) * 100 : 0;
  if (pct >= 90) return "bg-destructive";
  if (pct >= 70) return "bg-warning";
  return "bg-success";
};

const statusBorder: Record<string, string> = {
  healthy: "border-l-success",
  warning: "border-l-warning",
  critical: "border-l-destructive",
};

const dotColor: Record<string, string> = {
  active: "bg-success",
  idle: "bg-warning",
  reserved: "bg-muted-foreground",
  unassigned: "bg-muted",
};

// Recomputes a block's rollups from the ip_addresses source of truth — always a
// fresh COUNT, never an increment/decrement, so it self-heals after any add/delete.
// "Used" excludes rows explicitly marked unassigned; blacklisted_count/status
// reflect the real RBL state instead of the 'healthy' default that never changed.
async function recomputeBlockStats(blockId: string) {
  const [{ count: usedCount }, { count: blCount }, { data: blockRow }] = await Promise.all([
    supabase.from("ip_addresses").select("id", { count: "exact", head: true }).eq("block_id", blockId).neq("status", "unassigned"),
    supabase.from("ip_addresses").select("id", { count: "exact", head: true }).eq("block_id", blockId).eq("is_blacklisted", true),
    supabase.from("ip_blocks").select("usable_ips").eq("id", blockId).single(),
  ]);
  const usable = blockRow?.usable_ips || 0;
  const pct = usable > 0 ? ((usedCount || 0) / usable) * 100 : 0;
  const status = (blCount || 0) > 0 || pct >= 90 ? "critical" : pct >= 70 ? "warning" : "healthy";
  await supabase.from("ip_blocks").update({ assigned_ips: usedCount || 0, blacklisted_count: blCount || 0, status }).eq("id", blockId);
}

export default function IPBlocks() {
  useAutoLogout();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isAdminOrAbove, setIsAdminOrAbove] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [ips, setIps] = useState<IPRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addBlockOpen, setAddBlockOpen] = useState(false);
  const [addIpOpen, setAddIpOpen] = useState(false);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setUser(session.user);
      const { data: r } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id).single();
      if (r && (r.role === "admin" || r.role === "superadmin")) setIsAdminOrAbove(true);
      fetchAll();
    })();
  }, [navigate]);

  const fetchAll = async () => {
    const [{ data: b }, { data: i }] = await Promise.all([
      supabase.from("ip_blocks").select("*").order("created_at", { ascending: false }),
      supabase.from("ip_addresses").select("*"),
    ]);
    setBlocks(b || []);
    setIps(i || []);
  };

  const selected = useMemo(() => blocks.find(b => b.id === selectedId) || null, [blocks, selectedId]);
  const selectedIps = useMemo(() => ips.filter(i => i.block_id === selectedId), [ips, selectedId]);

  const deleteIp = async (ipId: string, blockId: string) => {
    if (!confirm("Remove this IP from the block?")) return;
    const { error } = await supabase.from("ip_addresses").delete().eq("id", ipId);
    if (error) { toast.error(error.message); return; }
    await recomputeBlockStats(blockId);
    toast.success("IP removed");
    fetchAll();
  };

  const scanBlock = async () => {
    if (!selected) return;
    setScanning(true);
    const { data, error } = await supabase.functions.invoke("check-ip-reputation", {
      body: { block_id: selected.id },
    });
    setScanning(false);
    if (error) { toast.error("Scan failed: " + error.message); return; }
    const flagged = (data?.results || []).filter((r: any) => r.is_blacklisted).length;
    toast.success(`Scanned ${data?.scanned ?? 0} IP(s)${flagged > 0 ? ` — ${flagged} flagged` : ", all clean"}`);
    fetchAll();
  };

  const stats = useMemo(() => {
    const totalBlocks = blocks.length;
    const totalUsable = blocks.reduce((s, b) => s + (b.usable_ips || 0), 0);
    const totalUsed = blocks.reduce((s, b) => s + (b.assigned_ips || 0), 0);
    const util = totalUsable > 0 ? Math.round((totalUsed / totalUsable) * 100) : 0;
    const blCount = ips.filter(i => i.is_blacklisted).length;
    return { totalBlocks, totalUsable, totalUsed, util, blCount };
  }, [blocks, ips]);

  if (!user) return null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar activeTab="devices" isAdminOrAbove={isAdminOrAbove} userEmail={user.email} />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-[60px] flex items-center justify-between px-4 border-b border-border/50 bg-background/95 backdrop-blur-xl sticky top-0 z-50">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h1 className="text-base font-semibold text-foreground">IP Blocks</h1>
                <p className="text-[11px] text-muted-foreground">CIDR allocation, utilization & RBL status</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <BlacklistAlertPill />
              {isAdminOrAbove && (
                <Button size="sm" className="h-8 text-xs gradient-primary text-primary-foreground" onClick={() => setAddBlockOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Add Block
                </Button>
              )}
            </div>
          </header>

          <main className="flex-1 p-4 md:p-6 overflow-auto">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
              <StatTile label="Total Blocks" value={stats.totalBlocks.toString()} />
              <StatTile label="Total Usable IPs" value={`${stats.totalUsed}/${stats.totalUsable}`} />
              <StatTile label="Overall Utilization" value={`${stats.util}%`} />
              <StatTile label="Blacklisted IPs" value={stats.blCount.toString()} accent={stats.blCount > 0 ? "destructive" : "success"} />
            </div>

            <div className="flex flex-col lg:flex-row gap-4">
              {/* LEFT panel */}
              <div className="lg:w-[340px] shrink-0 space-y-2 lg:max-h-[calc(100vh-260px)] overflow-auto pr-1">
                {blocks.length === 0 && (
                  <div className="text-center py-12 border border-dashed border-border rounded-lg">
                    <Network className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground">No IP blocks yet</p>
                    {isAdminOrAbove && (
                      <Button size="sm" className="mt-3 gradient-primary text-primary-foreground" onClick={() => setAddBlockOpen(true)}>
                        <Plus className="h-3.5 w-3.5 mr-1.5" /> Add your first block
                      </Button>
                    )}
                  </div>
                )}
                {blocks.map(b => {
                  const used = b.assigned_ips || 0;
                  const usable = b.usable_ips || 0;
                  const pct = usable > 0 ? Math.round((used / usable) * 100) : 0;
                  const active = selectedId === b.id;
                  return (
                    <button
                      key={b.id}
                      onClick={() => setSelectedId(b.id)}
                      className={cn(
                        "w-full text-left bg-card border border-border rounded-lg p-3 border-l-4 transition-all relative",
                        statusBorder[b.status || "healthy"],
                        active && "ring-1 ring-warning border-warning"
                      )}
                    >
                      {(b.blacklisted_count || 0) > 0 && (
                        <span className="absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30">
                          <AlertTriangle className="h-2.5 w-2.5" /> {b.blacklisted_count} RBL
                        </span>
                      )}
                      <div className="font-mono-ip text-sm text-foreground font-semibold">{b.cidr}</div>
                      {b.label && <div className="text-xs text-muted-foreground mt-0.5">{b.label}</div>}
                      <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                        <span>VLAN {b.vlan_id ?? "—"}</span>
                        <span>•</span>
                        <span>{used}/{usable}</span>
                        {b.block_type && <Badge variant="outline" className="text-[9px] h-4 px-1.5 ml-auto">{b.block_type}</Badge>}
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className={cn("h-full transition-all", utilColor(used, usable))} style={{ width: `${Math.min(pct, 100)}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* RIGHT panel */}
              <div className="flex-1 min-w-0">
                {!selected ? (
                  <div className="h-64 border border-dashed border-border rounded-lg flex items-center justify-center text-sm text-muted-foreground">
                    Select a block to see details
                  </div>
                ) : (
                  <div className="bg-card border border-border rounded-xl p-4 md:p-5">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="font-mono-ip text-lg font-semibold text-foreground">{selected.cidr}</div>
                        {selected.label && <div className="text-sm text-muted-foreground">{selected.label}</div>}
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs mb-4">
                      <Meta k="CIDR" v={<span className="font-mono-ip">{selected.cidr}</span>} />
                      <Meta k="VLAN" v={selected.vlan_id ?? "—"} />
                      <Meta k="Gateway" v={<span className="font-mono-ip">{selected.gateway || "—"}</span>} />
                      <Meta k="Broadcast" v={<span className="font-mono-ip">{selected.broadcast || "—"}</span>} />
                      <Meta k="Total" v={selected.total_ips ?? "—"} />
                      <Meta k="Usable" v={selected.usable_ips ?? "—"} />
                      <Meta k="Used" v={selected.assigned_ips ?? 0} />
                      <Meta k="Free" v={(selected.usable_ips || 0) - (selected.assigned_ips || 0)} />
                    </div>

                    <div className="border-t border-border pt-3 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-foreground">IP Addresses ({selectedIps.length})</h3>
                        {isAdminOrAbove && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setAddIpOpen(true)}>
                            <Plus className="h-3 w-3 mr-1" /> Add IP
                          </Button>
                        )}
                      </div>
                      <div className="space-y-1 max-h-[400px] overflow-auto">
                        {selectedIps.length === 0 && (
                          <p className="text-xs text-muted-foreground py-4 text-center">No IPs in this block yet</p>
                        )}
                        {selectedIps.map(ip => (
                          <div
                            key={ip.id}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1.5 rounded text-xs border border-transparent",
                              ip.is_blacklisted && "bg-destructive/5 border-destructive/20"
                            )}
                          >
                            <span className={cn("h-2 w-2 rounded-full shrink-0", dotColor[ip.status || "unassigned"])} />
                            <span className="font-mono-ip text-foreground min-w-[120px]">{ip.ip_address}</span>
                            {ip.role && <span className="text-muted-foreground text-[10px]">{ip.role}</span>}
                            {ip.last_ping_ms != null && <span className="text-muted-foreground text-[10px]">{ip.last_ping_ms}ms</span>}
                            {ip.assigned_to && <span className="text-muted-foreground text-[10px] truncate">→ {ip.assigned_to}</span>}
                            {ip.is_blacklisted && ip.rbl_lists && ip.rbl_lists.length > 0 && (
                              <span className={cn("inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30", !isAdminOrAbove && "ml-auto")}>
                                <AlertTriangle className="h-2.5 w-2.5" />
                                {ip.rbl_lists.join(", ")}
                              </span>
                            )}
                            {isAdminOrAbove && (
                              <Button
                                variant="ghost" size="icon"
                                className="h-5 w-5 ml-auto shrink-0 text-muted-foreground hover:text-destructive"
                                onClick={() => deleteIp(ip.id, selected!.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2 border-t border-border">
                      <Button size="sm" variant="outline" className="text-xs" onClick={scanBlock} disabled={scanning || selectedIps.length === 0}>
                        {scanning ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <ScanLine className="h-3.5 w-3.5 mr-1.5" />}
                        {scanning ? "Scanning…" : "Scan Block"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
          <VersionFooter />
        </div>
      </div>

      {addBlockOpen && <AddBlockDialog open={addBlockOpen} onOpenChange={setAddBlockOpen} onSaved={fetchAll} />}
      {addIpOpen && selected && (
        <AddIPDialog open={addIpOpen} onOpenChange={setAddIpOpen} blockId={selected.id} onSaved={fetchAll} />
      )}
    </SidebarProvider>
  );
}

function StatTile({ label, value, accent }: { label: string; value: string; accent?: "destructive" | "success" }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("text-2xl font-semibold mt-1",
        accent === "destructive" && "text-destructive",
        accent === "success" && "text-success",
        !accent && "text-foreground"
      )}>{value}</div>
    </div>
  );
}

function Meta({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-2 border-b border-border/50 pb-1">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-foreground">{v}</span>
    </div>
  );
}

function cidrInfo(cidr: string) {
  const m = cidr.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)\/(\d+)$/);
  if (!m) return null;
  const prefix = parseInt(m[5], 10);
  if (prefix < 0 || prefix > 32) return null;
  const octs = [m[1], m[2], m[3], m[4]].map(o => parseInt(o, 10));
  if (octs.some(o => o < 0 || o > 255)) return null;
  const ipNum = (octs[0] << 24 >>> 0) + (octs[1] << 16) + (octs[2] << 8) + octs[3];
  const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
  const network = ipNum & mask;
  const broadcast = network | (~mask >>> 0);
  const total = Math.pow(2, 32 - prefix);
  const usable = prefix >= 31 ? total : Math.max(total - 2, 0);
  const toIp = (n: number) => [24, 16, 8, 0].map(s => (n >>> s) & 255).join(".");
  return {
    total, usable,
    gateway: toIp(network + 1),
    broadcast: toIp(broadcast),
  };
}

function AddBlockDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (b: boolean) => void; onSaved: () => void }) {
  const [cidr, setCidr] = useState("");
  const [label, setLabel] = useState("");
  const [vlan, setVlan] = useState("");
  const [blockType, setBlockType] = useState("Customer");
  const [saving, setSaving] = useState(false);

  const info = cidrInfo(cidr.trim());

  const save = async () => {
    if (!info) { toast.error("Invalid CIDR (e.g. 102.204.13.208/29)"); return; }
    setSaving(true);
    const { error } = await supabase.from("ip_blocks").insert({
      cidr: cidr.trim(), label: label || null,
      vlan_id: vlan ? parseInt(vlan, 10) : null,
      block_type: blockType,
      gateway: info.gateway, broadcast: info.broadcast,
      total_ips: info.total, usable_ips: info.usable,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Block added");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add IP Block</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>CIDR</Label>
            <Input className="font-mono-ip" placeholder="102.204.13.208/29" value={cidr} onChange={e => setCidr(e.target.value)} />
            {info && <p className="text-[11px] text-muted-foreground mt-1">Gateway {info.gateway} • Broadcast {info.broadcast} • {info.usable} usable</p>}
          </div>
          <div>
            <Label>Label</Label>
            <Input placeholder="e.g. Uplink to Liquid" value={label} onChange={e => setLabel(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>VLAN</Label>
              <Input type="number" value={vlan} onChange={e => setVlan(e.target.value)} />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={blockType} onValueChange={setBlockType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Uplink">Uplink</SelectItem>
                  <SelectItem value="Customer">Customer</SelectItem>
                  <SelectItem value="Infrastructure">Infrastructure</SelectItem>
                  <SelectItem value="Management">Management</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving || !info} className="gradient-primary text-primary-foreground">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddIPDialog({ open, onOpenChange, blockId, onSaved }: { open: boolean; onOpenChange: (b: boolean) => void; blockId: string; onSaved: () => void }) {
  const [ip, setIp] = useState("");
  const [role, setRole] = useState("Customer");
  const [status, setStatus] = useState("active");
  const [assignedTo, setAssignedTo] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!isValidIPv4(ip.trim())) { toast.error("Invalid IP"); return; }
    setSaving(true);
    const { error } = await supabase.from("ip_addresses").insert({
      block_id: blockId, ip_address: ip.trim(), role, status,
      assigned_to: assignedTo || null,
    });
    if (!error) {
      await recomputeBlockStats(blockId);
    }
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("IP added");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add IP Address</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>IP Address</Label><Input className="font-mono-ip" value={ip} onChange={e => setIp(e.target.value)} placeholder="102.204.13.209" /></div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Role</Label>
              <Select value={role} onValueChange={setRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Gateway","Uplink","Customer","Management","Broadcast"].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["active","idle","reserved","unassigned"].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>Assigned to</Label><Input value={assignedTo} onChange={e => setAssignedTo(e.target.value)} placeholder="Customer / device label" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving} className="gradient-primary text-primary-foreground">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
