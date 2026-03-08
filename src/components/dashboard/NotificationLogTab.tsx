import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";

interface LogEntry {
  id: string;
  event_type: string;
  ip_address: string;
  message: string;
  sent_at: string;
  success: boolean;
  error_message: string | null;
}

export const NotificationLogTab = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("notification_log")
        .select("*")
        .order("sent_at", { ascending: false })
        .limit(100);
      setLogs((data as LogEntry[]) || []);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No notifications sent yet.</p>
      </div>
    );
  }

  const eventBadge = (type: string) => {
    switch (type) {
      case "ip_down": return <Badge variant="destructive" className="text-xs">Down</Badge>;
      case "ip_up": return <Badge className="text-xs bg-[hsl(var(--success))] text-[hsl(var(--success-foreground))]">Up</Badge>;
      case "blacklisted": return <Badge variant="destructive" className="text-xs">Blacklisted</Badge>;
      case "delisted": return <Badge className="text-xs">Delisted</Badge>;
      case "summary": return <Badge variant="secondary" className="text-xs">Summary</Badge>;
      default: return <Badge variant="secondary" className="text-xs">{type}</Badge>;
    }
  };

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-card/50">
            <TableHead>Time</TableHead>
            <TableHead>Event</TableHead>
            <TableHead>IP</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                {new Date(log.sent_at).toLocaleString()}
              </TableCell>
              <TableCell>{eventBadge(log.event_type)}</TableCell>
              <TableCell className="font-mono text-sm">{log.ip_address}</TableCell>
              <TableCell className="text-sm max-w-xs truncate">{log.message}</TableCell>
              <TableCell>
                {log.success ? (
                  <Badge variant="secondary" className="text-xs">Sent</Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">Failed</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};
