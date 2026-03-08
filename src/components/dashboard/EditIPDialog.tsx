import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { X, Plus } from "lucide-react";

const COMMON_PORTS: Record<number, string> = {
  22: "SSH", 53: "DNS", 80: "HTTP", 443: "HTTPS", 3389: "RDP",
  8080: "HTTP-Alt", 8291: "Winbox", 8443: "HTTPS-Alt",
  8728: "MikroTik API", 8729: "MikroTik API-SSL",
};

const ipSchema = z.object({
  name: z.string().trim().min(1, "Label is required").max(100),
  ip_address: z.string().trim().regex(/^(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)$/, "Invalid IPv4"),
  check_ports: z.array(z.number().int().min(1).max(65535)).min(1).max(10),
  check_interval_minutes: z.number().int().min(1).max(1440),
});

const phoneRegex = /^\+?[0-9]{7,15}$/;

interface Device {
  id: string;
  name: string;
  ip_address: string;
  check_ports: number[] | null;
  check_interval_minutes: number | null;
  notify_number: string[] | null;
}

interface EditIPDialogProps {
  device: Device | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export const EditIPDialog = ({ device, open, onOpenChange, onSaved }: EditIPDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [interval, setInterval] = useState(5);
  const [ports, setPorts] = useState<number[]>([80, 443]);
  const [portInput, setPortInput] = useState("");
  const [notifyNumbers, setNotifyNumbers] = useState<string[]>([]);
  const [numberInput, setNumberInput] = useState("");

  useEffect(() => {
    if (device) {
      setName(device.name);
      setIpAddress(device.ip_address);
      setPorts(device.check_ports ?? [80, 443]);
      setInterval(device.check_interval_minutes ?? 5);
      setNotifyNumbers(device.notify_number ?? []);
      setNumberInput("");
    }
  }, [device]);

  const addNumber = () => {
    const num = numberInput.trim();
    if (!num) return;
    if (!phoneRegex.test(num)) { toast.error("Invalid phone number format"); return; }
    if (notifyNumbers.includes(num)) { toast.error("Number already added"); return; }
    if (notifyNumbers.length >= 5) { toast.error("Maximum 5 numbers"); return; }
    setNotifyNumbers([...notifyNumbers, num]);
    setNumberInput("");
  };

  const removeNumber = (num: string) => setNotifyNumbers(notifyNumbers.filter((n) => n !== num));

  const addPort = (port: number) => {
    if (port < 1 || port > 65535 || ports.includes(port) || ports.length >= 10) return;
    setPorts([...ports, port]);
  };

  const removePort = (port: number) => setPorts(ports.filter((p) => p !== port));

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!device) return;
    setLoading(true);
    try {
      const validated = ipSchema.parse({ name, ip_address: ipAddress, check_ports: ports, check_interval_minutes: interval });
      const { error } = await supabase.from("devices").update({
        name: validated.name,
        ip_address: validated.ip_address,
        check_ports: validated.check_ports,
        check_interval_minutes: validated.check_interval_minutes,
        notify_number: notifyNumbers.length > 0 ? notifyNumbers : null,
      }).eq("id", device.id);
      if (error) throw error;
      toast.success("Device updated!");
      onOpenChange(false);
      onSaved();
    } catch (error: any) {
      if (error instanceof z.ZodError) toast.error(error.errors[0].message);
      else toast.error("Failed to update device");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Device</DialogTitle>
          <DialogDescription>Update monitoring settings for this device</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto flex-1 pr-2">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Label</Label>
            <Input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-ip">IP Address</Label>
            <Input id="edit-ip" value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-interval">Check Interval (minutes)</Label>
            <Input id="edit-interval" type="number" min={1} max={1440} value={interval} onChange={(e) => setInterval(Number(e.target.value))} />
          </div>

          {/* SMS Notify Numbers */}
          <div className="space-y-2">
            <Label>SMS Notify Numbers <span className="text-muted-foreground font-normal">(optional, max 5)</span></Label>
            {notifyNumbers.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {notifyNumbers.map((num) => (
                  <Badge key={num} variant="secondary" className="text-xs gap-1 pr-1">
                    {num}
                    <button type="button" onClick={() => removeNumber(num)} className="ml-0.5 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <Input
                placeholder="+1234567890"
                value={numberInput}
                onChange={(e) => setNumberInput(e.target.value)}
                onKeyDown={handleNumberInputKey}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={addNumber} disabled={notifyNumbers.length >= 5}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Phone numbers to receive SMS when this IP goes down.</p>
          </div>

          <div className="space-y-2">
            <Label>Ports to Check</Label>
            <div className="flex flex-wrap gap-1.5 min-h-[32px]">
              {ports.map((port) => (
                <Badge key={port} variant="secondary" className="text-xs gap-1 pr-1">
                  {port}
                  {COMMON_PORTS[port] && <span className="text-muted-foreground">({COMMON_PORTS[port]})</span>}
                  <button type="button" onClick={() => removePort(port)} className="ml-0.5 hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Add port (e.g. 8291)"
                value={portInput}
                onChange={(e) => setPortInput(e.target.value.replace(/\D/g, ""))}
                onKeyDown={handlePortInputKey}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => {
                const port = parseInt(portInput);
                if (!isNaN(port)) { addPort(port); setPortInput(""); }
              }}>Add</Button>
            </div>
            <div className="flex flex-wrap gap-1">
              {Object.entries(COMMON_PORTS)
                .filter(([p]) => !ports.includes(Number(p)))
                .slice(0, 6)
                .map(([port, label]) => (
                  <button key={port} type="button" onClick={() => addPort(Number(port))}
                    className="text-xs px-2 py-0.5 rounded border border-border/50 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors">
                    +{port} ({label})
                  </button>
                ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={loading} className="flex-1">{loading ? "Saving..." : "Save Changes"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};