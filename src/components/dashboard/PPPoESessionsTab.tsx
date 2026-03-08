import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { RefreshCw, Users, Clock, Wifi } from "lucide-react";
import { toast } from "sonner";

interface Device {
  id: string;
  name: string;
  ip_address: string;
}

interface PPPoESession {
  id: string;
  username: string;
  service: string | null;
  caller_id: string | null;
  address: string | null;
  uptime: string | null;
  encoding: string | null;
  collected_at: string;
}

export const PPPoESessionsTab = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [sessions, setSessions] = useState<PPPoESession[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchDevices();
  }, []);

  useEffect(() => {
    if (selectedDevice) fetchSessions();
  }, [selectedDevice]);

  const fetchDevices = async () => {
    const { data } = await supabase.from("devices").select("id, name, ip_address").order("name");
    if (data && data.length > 0) {
      setDevices(data);
      setSelectedDevice(data[0].id);
    }
  };

  const fetchSessions = async () => {
    if (!selectedDevice) return;
    setLoading(true);
    const { data } = await supabase
      .from("pppoe_sessions")
      .select("*")
      .eq("device_id", selectedDevice)
      .order("username");
    setSessions((data as PPPoESession[]) || []);
    setLoading(false);
  };

  const handleScan = async () => {
    setScanning(true);
    toast.info("Fetching PPPoE & DHCP data from router...");
    try {
      const { data, error } = await supabase.functions.invoke("fetch-pppoe-dhcp", {
        body: { device_id: selectedDevice },
      });
      if (error) throw error;
      if (data?.results?.[0]?.success) {
        toast.success(`Collected ${data.results[0].pppoe_sessions} PPPoE sessions, ${data.results[0].dhcp_leases} DHCP leases, ${data.results[0].arp_entries} ARP entries`);
        await fetchSessions();
      } else {
        toast.error(data?.results?.[0]?.error || "Failed to fetch data from router");
      }
    } catch (err: any) {
      console.error("Scan error:", err);
      toast.error("Failed to connect to router. Check device credentials.");
    } finally {
      setScanning(false);
    }
  };

  const filtered = sessions.filter(s =>
    s.username.toLowerCase().includes(search.toLowerCase()) ||
    (s.address || "").includes(search) ||
    (s.caller_id || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Select value={selectedDevice} onValueChange={setSelectedDevice}>
          <SelectTrigger className="w-[280px] bg-card border-border/50">
            <SelectValue placeholder="Select a device" />
          </SelectTrigger>
          <SelectContent>
            {devices.map(d => (
              <SelectItem key={d.id} value={d.id}>{d.name} ({d.ip_address})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={handleScan} disabled={scanning || !selectedDevice} variant="default" size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Fetching..." : "Fetch from Router"}
        </Button>
        <Input
          placeholder="Search by username, IP, or MAC..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-[280px] bg-card border-border/50"
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Users className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{sessions.length}</p>
                <p className="text-sm text-muted-foreground">Active Sessions</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Wifi className="h-8 w-8 text-chart-3" />
              <div>
                <p className="text-2xl font-bold">
                  {new Set(sessions.map(s => s.service).filter(Boolean)).size}
                </p>
                <p className="text-sm text-muted-foreground">Unique Services</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Clock className="h-8 w-8 text-chart-4" />
              <div>
                <p className="text-2xl font-bold">{filtered.length}</p>
                <p className="text-sm text-muted-foreground">Filtered Results</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sessions table */}
      <Card className="bg-card border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">PPPoE Active Sessions</CardTitle>
          <CardDescription>Currently connected PPPoE clients</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Username</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Caller ID (MAC)</TableHead>
                  <TableHead>Uptime</TableHead>
                  <TableHead>Encoding</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {sessions.length === 0
                        ? 'No PPPoE sessions collected yet. Click "Fetch from Router" to collect data.'
                        : "No sessions match your search."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(session => (
                    <TableRow key={session.id}>
                      <TableCell className="font-medium">{session.username}</TableCell>
                      <TableCell><Badge variant="outline">{session.service || "—"}</Badge></TableCell>
                      <TableCell className="font-mono text-xs">{session.address || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{session.caller_id || "—"}</TableCell>
                      <TableCell className="text-xs">{session.uptime || "—"}</TableCell>
                      <TableCell className="text-xs">{session.encoding || "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
};
