import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { RefreshCw, Server, Network, Globe } from "lucide-react";
import { toast } from "sonner";

interface Device { id: string; name: string; ip_address: string; }

interface DHCPLease {
  id: string;
  address: string;
  mac_address: string | null;
  host_name: string | null;
  server: string | null;
  status: string | null;
  expires_after: string | null;
  last_seen: string | null;
  collected_at: string;
}

interface ARPEntry {
  id: string;
  address: string;
  mac_address: string | null;
  interface: string | null;
  is_dynamic: boolean;
  is_complete: boolean;
  collected_at: string;
}

export const DHCPARPTab = () => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [leases, setLeases] = useState<DHCPLease[]>([]);
  const [arpEntries, setArpEntries] = useState<ARPEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => { fetchDevices(); }, []);
  useEffect(() => { if (selectedDevice) fetchData(); }, [selectedDevice]);

  const fetchDevices = async () => {
    const { data } = await supabase.from("devices").select("id, name, ip_address").order("name");
    if (data && data.length > 0) {
      setDevices(data);
      setSelectedDevice(data[0].id);
    }
  };

  const fetchData = async () => {
    if (!selectedDevice) return;
    setLoading(true);
    const [dhcpRes, arpRes] = await Promise.all([
      supabase.from("dhcp_leases").select("*").eq("device_id", selectedDevice).order("address"),
      supabase.from("arp_entries").select("*").eq("device_id", selectedDevice).order("address"),
    ]);
    setLeases((dhcpRes.data as DHCPLease[]) || []);
    setArpEntries((arpRes.data as ARPEntry[]) || []);
    setLoading(false);
  };

  const handleScan = async () => {
    setScanning(true);
    toast.info("Fetching DHCP & ARP data from router...");
    try {
      const { data, error } = await supabase.functions.invoke("fetch-pppoe-dhcp", {
        body: { device_id: selectedDevice },
      });
      if (error) throw error;
      if (data?.results?.[0]?.success) {
        toast.success(`Collected ${data.results[0].dhcp_leases} DHCP leases, ${data.results[0].arp_entries} ARP entries`);
        await fetchData();
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

  const filteredLeases = leases.filter(l =>
    l.address.includes(search) ||
    (l.mac_address || "").toLowerCase().includes(search.toLowerCase()) ||
    (l.host_name || "").toLowerCase().includes(search.toLowerCase())
  );

  const filteredArp = arpEntries.filter(a =>
    a.address.includes(search) ||
    (a.mac_address || "").toLowerCase().includes(search.toLowerCase()) ||
    (a.interface || "").toLowerCase().includes(search.toLowerCase())
  );

  const boundLeases = leases.filter(l => l.status === "bound").length;
  const waitingLeases = leases.filter(l => l.status === "waiting").length;
  const dynamicArp = arpEntries.filter(a => a.is_dynamic).length;

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
          placeholder="Search by IP, MAC, or hostname..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-[280px] bg-card border-border/50"
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Server className="h-8 w-8 text-primary" />
              <div>
                <p className="text-2xl font-bold">{leases.length}</p>
                <p className="text-sm text-muted-foreground">DHCP Leases</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Globe className="h-8 w-8 text-chart-3" />
              <div>
                <p className="text-2xl font-bold">{boundLeases}</p>
                <p className="text-sm text-muted-foreground">Bound</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{waitingLeases} waiting</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Network className="h-8 w-8 text-chart-4" />
              <div>
                <p className="text-2xl font-bold">{arpEntries.length}</p>
                <p className="text-sm text-muted-foreground">ARP Entries</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">{dynamicArp} dynamic, {arpEntries.length - dynamicArp} static</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <Server className="h-8 w-8 text-chart-5" />
              <div>
                <p className="text-2xl font-bold">
                  {new Set(leases.map(l => l.server).filter(Boolean)).size}
                </p>
                <p className="text-sm text-muted-foreground">DHCP Servers</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="dhcp" className="space-y-4">
        <TabsList className="bg-card border border-border/50">
          <TabsTrigger value="dhcp">DHCP Leases</TabsTrigger>
          <TabsTrigger value="arp">ARP Table</TabsTrigger>
        </TabsList>

        <TabsContent value="dhcp">
          <Card className="bg-card border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">DHCP Leases</CardTitle>
              <CardDescription>Active DHCP server leases</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IP Address</TableHead>
                      <TableHead>MAC Address</TableHead>
                      <TableHead>Hostname</TableHead>
                      <TableHead>Server</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expires After</TableHead>
                      <TableHead>Last Seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredLeases.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                          {leases.length === 0
                            ? 'No DHCP leases collected yet. Click "Fetch from Router" to collect data.'
                            : "No leases match your search."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLeases.map(lease => (
                        <TableRow key={lease.id}>
                          <TableCell className="font-mono text-xs">{lease.address}</TableCell>
                          <TableCell className="font-mono text-xs">{lease.mac_address || "—"}</TableCell>
                          <TableCell className="text-xs">{lease.host_name || "—"}</TableCell>
                          <TableCell><Badge variant="outline">{lease.server || "—"}</Badge></TableCell>
                          <TableCell>
                            <Badge variant={lease.status === "bound" ? "default" : "secondary"}>
                              {lease.status || "unknown"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">{lease.expires_after || "—"}</TableCell>
                          <TableCell className="text-xs">{lease.last_seen || "—"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="arp">
          <Card className="bg-card border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">ARP Table</CardTitle>
              <CardDescription>IP to MAC address mappings</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>IP Address</TableHead>
                      <TableHead>MAC Address</TableHead>
                      <TableHead>Interface</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Complete</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredArp.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                          {arpEntries.length === 0
                            ? 'No ARP entries collected yet. Click "Fetch from Router" to collect data.'
                            : "No entries match your search."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredArp.map(entry => (
                        <TableRow key={entry.id}>
                          <TableCell className="font-mono text-xs">{entry.address}</TableCell>
                          <TableCell className="font-mono text-xs">{entry.mac_address || "—"}</TableCell>
                          <TableCell><Badge variant="outline">{entry.interface || "—"}</Badge></TableCell>
                          <TableCell>
                            <Badge variant={entry.is_dynamic ? "secondary" : "default"}>
                              {entry.is_dynamic ? "Dynamic" : "Static"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={entry.is_complete ? "default" : "destructive"}>
                              {entry.is_complete ? "Yes" : "No"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
