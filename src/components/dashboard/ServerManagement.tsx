import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Server, MapPin, Monitor, Loader2 } from "lucide-react";

const SERVER_TYPES = ["OLT", "MikroTik", "CPE", "Linux Server", "Windows Server", "Other"];

interface ServerRow {
  id: string;
  name: string;
  location: string | null;
  server_type: string;
  description: string | null;
  group_id: string | null;
  created_at: string;
  ip_count?: number;
  primary_ip?: string;
  group_name?: string;
}

interface IPGroup {
  id: string;
  name: string;
  color: string;
}

export const ServerManagement = () => {
  const [servers, setServers] = useState<ServerRow[]>([]);
  const [groups, setGroups] = useState<IPGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editServer, setEditServer] = useState<ServerRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServerRow | null>(null);

  // Group management
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("#00d4ff");

  const fetchData = async () => {
    setLoading(true);
    try {
      const [serversRes, groupsRes, devicesRes] = await Promise.all([
        supabase.from("servers").select("*").order("name"),
        supabase.from("ip_groups").select("*").order("name"),
        supabase.from("devices").select("id, ip_address, server_id, is_primary"),
      ]);

      const groupMap: Record<string, string> = {};
      (groupsRes.data || []).forEach((g: any) => { groupMap[g.id] = g.name; });
      setGroups(groupsRes.data || []);

      const devices = devicesRes.data || [];
      const enriched = (serversRes.data || []).map((s: any) => {
        const serverDevices = devices.filter((d: any) => d.server_id === s.id);
        const primary = serverDevices.find((d: any) => d.is_primary);
        return {
          ...s,
          ip_count: serverDevices.length,
          primary_ip: primary?.ip_address || serverDevices[0]?.ip_address || "—",
          group_name: s.group_id ? groupMap[s.group_id] : null,
        };
      });
      setServers(enriched);
    } catch (e) {
      console.error("Error fetching servers:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleAddGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const { error } = await supabase.from("ip_groups").insert({ name: newGroupName.trim(), color: newGroupColor });
      if (error) throw error;
      toast.success("Group created");
      setShowAddGroup(false);
      setNewGroupName("");
      fetchData();
    } catch { toast.error("Failed to create group"); }
  };

  const handleDeleteServer = async () => {
    if (!deleteTarget) return;
    try {
      // Unlink devices first
      await supabase.from("devices").update({ server_id: null }).eq("server_id", deleteTarget.id);
      const { error } = await supabase.from("servers").delete().eq("id", deleteTarget.id);
      if (error) throw error;
      toast.success("Server deleted (IPs unlinked, not deleted)");
      setDeleteTarget(null);
      fetchData();
    } catch { toast.error("Failed to delete server"); }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      {/* IP Groups Section */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
          <CardTitle className="text-sm font-medium">IP Groups</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowAddGroup(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Group
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No groups yet. Create groups to organize your servers.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {groups.map(g => (
                <Badge key={g.id} variant="outline" className="gap-1.5 py-1 px-3">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                  {g.name}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Servers Section */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="flex flex-row items-center justify-between py-3 px-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Server className="h-4 w-4" /> Servers ({servers.length})
          </CardTitle>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Server
          </Button>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {servers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No servers configured. Add a server to group multiple IPs under one node.</p>
          ) : (
            <div className="space-y-2">
              {servers.map(s => (
                <div key={s.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card/30">
                  <Monitor className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{s.name}</span>
                      <Badge variant="secondary" className="text-[10px]">{s.server_type}</Badge>
                      {s.group_name && <Badge variant="outline" className="text-[10px]">{s.group_name}</Badge>}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {s.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{s.location}</span>}
                      <span>{s.ip_count} IP{s.ip_count !== 1 ? "s" : ""}</span>
                      <span className="font-mono">{s.primary_ip}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditServer(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(s)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Server Dialog */}
      <ServerFormDialog
        open={showAdd || !!editServer}
        onOpenChange={(open) => { if (!open) { setShowAdd(false); setEditServer(null); } }}
        server={editServer}
        groups={groups}
        onSaved={() => { setShowAdd(false); setEditServer(null); fetchData(); }}
      />

      {/* Add Group Dialog */}
      <Dialog open={showAddGroup} onOpenChange={setShowAddGroup}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add IP Group</DialogTitle>
            <DialogDescription>Create a group to organize servers</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Group Name</Label>
              <Input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="e.g. Core Backbone" />
            </div>
            <div className="space-y-1">
              <Label>Color</Label>
              <div className="flex gap-2 items-center">
                <input type="color" value={newGroupColor} onChange={e => setNewGroupColor(e.target.value)} className="h-8 w-10 rounded cursor-pointer" />
                <Input value={newGroupColor} onChange={e => setNewGroupColor(e.target.value)} className="flex-1" />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowAddGroup(false)}>Cancel</Button>
              <Button className="flex-1" onClick={handleAddGroup}>Create</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Server?</DialogTitle>
            <DialogDescription>
              This will delete "{deleteTarget?.name}" but will NOT delete its IPs — they will be unlinked.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={handleDeleteServer}>Delete</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Server Add/Edit Form
function ServerFormDialog({ open, onOpenChange, server, groups, onSaved }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  server: ServerRow | null;
  groups: IPGroup[];
  onSaved: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [serverType, setServerType] = useState("Other");
  const [description, setDescription] = useState("");
  const [groupId, setGroupId] = useState<string>("none");

  useEffect(() => {
    if (server) {
      setName(server.name);
      setLocation(server.location || "");
      setServerType(server.server_type);
      setDescription(server.description || "");
      setGroupId(server.group_id || "none");
    } else {
      setName(""); setLocation(""); setServerType("Other"); setDescription(""); setGroupId("none");
    }
  }, [server, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Server name is required"); return; }
    setLoading(true);
    try {
      const payload = {
        name: name.trim(),
        location: location.trim() || null,
        server_type: serverType,
        description: description.trim() || null,
        group_id: groupId === "none" ? null : groupId,
      };
      if (server) {
        const { error } = await supabase.from("servers").update(payload).eq("id", server.id);
        if (error) throw error;
        toast.success("Server updated");
      } else {
        const { error } = await supabase.from("servers").insert(payload);
        if (error) throw error;
        toast.success("Server created");
      }
      onSaved();
    } catch { toast.error("Failed to save server"); }
    finally { setLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{server ? "Edit Server" : "Add Server"}</DialogTitle>
          <DialogDescription>{server ? "Update server details" : "Create a new server to group IPs"}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <Label>Server Name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. KIAMBAA OLT 1" required />
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
          <div className="space-y-1">
            <Label>Location / Site</Label>
            <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Kiambaa Exchange" />
          </div>
          <div className="space-y-1">
            <Label>Group</Label>
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No Group</SelectItem>
                {groups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Description / Notes</Label>
            <Textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Optional notes" />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1">{loading ? "Saving..." : server ? "Save" : "Create"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
