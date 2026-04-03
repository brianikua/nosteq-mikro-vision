import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { VersionFooter } from "@/components/dashboard/VersionFooter";
import { Plus, AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";
import { useAutoLogout } from "@/hooks/use-auto-logout";

const abuseTypes = ["Botnet", "PortScan", "WebScraping", "SMTPSpam", "BruteForce", "DDoS", "Malware"];
const statusOptions = ["new", "investigating", "notified", "resolved", "repeat"];

const AbuseReports = () => {
  useAutoLogout();
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);
  const [isAdminOrAbove, setIsAdminOrAbove] = useState(false);
  const [reports, setReports] = useState<any[]>([]);
  const [devices, setDevices] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState({
    device_id: "", source_ip: "", abuse_type: "SMTPSpam", provider: "",
    strike_number: "1", raw_email_text: "", action_taken: "",
  });

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }
      setUser(session.user);
      const { data: roleData } = await supabase.from("user_roles").select("role").eq("user_id", session.user.id).single();
      if (roleData && (roleData.role === "admin" || roleData.role === "superadmin")) setIsAdminOrAbove(true);
      fetchData();
    };
    init();
  }, [navigate]);

  const fetchData = async () => {
    setLoading(true);
    const [reportsRes, devicesRes] = await Promise.all([
      supabase.from("abuse_reports").select("*, devices(name)").order("created_at", { ascending: false }),
      supabase.from("devices").select("id, name").order("name"),
    ]);
    setReports(reportsRes.data || []);
    setDevices(devicesRes.data || []);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!form.device_id || !form.abuse_type) { toast.error("Device and abuse type required"); return; }
    const { error } = await supabase.from("abuse_reports").insert({
      device_id: form.device_id,
      source_ip: form.source_ip || null,
      abuse_type: form.abuse_type,
      provider: form.provider || null,
      strike_number: parseInt(form.strike_number) || 1,
      raw_email_text: form.raw_email_text || null,
      action_taken: form.action_taken || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Abuse report logged");
    setShowAdd(false);
    setForm({ device_id: "", source_ip: "", abuse_type: "SMTPSpam", provider: "", strike_number: "1", raw_email_text: "", action_taken: "" });
    fetchData();
  };

  const filtered = reports.filter((r) =>
    r.source_ip?.includes(search) || r.abuse_type?.toLowerCase().includes(search.toLowerCase()) || r.devices?.name?.toLowerCase().includes(search.toLowerCase())
  );

  if (!user) return null;

  const statusColors: Record<string, string> = {
    new: "bg-primary/20 text-primary",
    investigating: "bg-warning/20 text-warning",
    notified: "bg-accent/20 text-accent",
    resolved: "bg-success/20 text-success",
    repeat: "bg-destructive/20 text-destructive",
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar activeTab="abuse" onTabChange={(tab) => {
          if (tab === "monitor") navigate("/dashboard");
          else if (tab === "devices") navigate("/devices");
          else if (tab === "abuse") {}
        }} isAdminOrAbove={isAdminOrAbove} userEmail={user.email} />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-[60px] flex items-center justify-between px-4 border-b border-border/50 bg-background/95 backdrop-blur-xl sticky top-0 z-50">
            <div className="flex items-center gap-3">
              <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
              <div>
                <h1 className="text-base font-semibold text-foreground">Abuse Reports</h1>
                <p className="text-[11px] text-muted-foreground">Track and manage abuse complaints</p>
              </div>
            </div>
            <Button size="sm" className="h-8 text-xs gradient-primary text-primary-foreground" onClick={() => setShowAdd(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" /> Log Report
            </Button>
          </header>

          <main className="flex-1 p-4 md:p-6 overflow-auto animate-in fade-in duration-200">
            <div className="relative max-w-sm mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search reports..." className="pl-9 h-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            {loading ? (
              <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-card animate-pulse rounded-xl" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-16">
                <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-foreground">No abuse reports</h3>
                <p className="text-sm text-muted-foreground mt-1">Log abuse complaints when received from providers</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((r) => (
                  <div key={r.id} className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{r.devices?.name || "Unknown"}</span>
                        <Badge variant="outline" className="text-[10px]">{r.abuse_type}</Badge>
                        <Badge className={`text-[10px] border-0 ${statusColors[r.status] || ""}`}>{r.status}</Badge>
                        {r.strike_number >= 2 && <Badge className="text-[10px] bg-destructive/20 text-destructive border-0">Repeat #{r.strike_number}</Badge>}
                      </div>
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        {r.source_ip && <span>Source: {r.source_ip}</span>}
                        {r.provider && <span>Provider: {r.provider}</span>}
                        <span>{new Date(r.created_at).toLocaleString("en-KE", { timeZone: "Africa/Nairobi" })}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </main>
          <VersionFooter />
        </div>
      </div>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Abuse Report</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Device *</label>
              <Select value={form.device_id} onValueChange={(v) => setForm({ ...form, device_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select device" /></SelectTrigger>
                <SelectContent>{devices.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-muted-foreground">Source IP</label>
                <Input value={form.source_ip} onChange={(e) => setForm({ ...form, source_ip: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Abuse Type *</label>
                <Select value={form.abuse_type} onValueChange={(v) => setForm({ ...form, abuse_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{abuseTypes.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Provider</label>
                <Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Strike #</label>
                <Input type="number" value={form.strike_number} onChange={(e) => setForm({ ...form, strike_number: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Raw Abuse Email</label>
              <Textarea value={form.raw_email_text} onChange={(e) => setForm({ ...form, raw_email_text: e.target.value })} placeholder="Paste the abuse email text..." />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Action Taken</label>
              <Input value={form.action_taken} onChange={(e) => setForm({ ...form, action_taken: e.target.value })} />
            </div>
            <Button className="w-full gradient-primary text-primary-foreground" onClick={handleAdd}>Log Report</Button>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
};

export default AbuseReports;
