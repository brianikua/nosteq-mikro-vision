import { useState } from "react";
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
  name: z.string().trim().min(1, "Label is required").max(100, "Label too long"),
  ip_address: z.string().trim().refine((ip) => {
    const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4.test(ip);
  }, "Invalid IPv4 address"),
  check_ports: z.array(z.number().int().min(1).max(65535)).min(1, "At least one port is required").max(10, "Maximum 10 ports"),
});

const phoneRegex = /^\+?[0-9]{7,15}$/;

interface AddIPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddIPDialog = ({ open, onOpenChange }: AddIPDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", ip_address: "" });
  const [ports, setPorts] = useState<number[]>([80, 443]);
  const [portInput, setPortInput] = useState("");
  const [notifyNumbers, setNotifyNumbers] = useState<string[]>([]);
  const [numberInput, setNumberInput] = useState("");

  const addNumber = () => {
    const num = numberInput.trim();
    if (!num) return;
    if (!phoneRegex.test(num)) {
      toast.error("Invalid phone number format (e.g. +1234567890)");
      return;
    }
    if (notifyNumbers.includes(num)) {
      toast.error("Number already added");
      return;
    }
    if (notifyNumbers.length >= 5) {
      toast.error("Maximum 5 numbers allowed");
      return;
    }
    setNotifyNumbers([...notifyNumbers, num]);
    setNumberInput("");
  };

  const removeNumber = (num: string) => {
    setNotifyNumbers(notifyNumbers.filter((n) => n !== num));
  };

  const addPort = (port: number) => {
    if (port < 1 || port > 65535 || ports.includes(port) || ports.length >= 10) return;
    setPorts([...ports, port]);
  };

  const removePort = (port: number) => {
    setPorts(ports.filter((p) => p !== port));
  };

  const handlePortInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const port = parseInt(portInput);
      if (!isNaN(port)) { addPort(port); setPortInput(""); }
    }
  };

  const handleNumberInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addNumber();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const validated = ipSchema.parse({ ...formData, check_ports: ports });
      const { error } = await supabase.from("devices").insert([{
        name: validated.name,
        ip_address: validated.ip_address,
        check_ports: validated.check_ports,
        notify_number: notifyNumbers.length > 0 ? notifyNumbers : null,
      }]);
      if (error) throw error;
      toast.success("IP address added!");
      onOpenChange(false);
      setFormData({ name: "", ip_address: "" });
      setPorts([80, 443]);
      setNotifyNumbers([]);
      window.location.reload();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        console.error("Failed to add IP:", error);
        toast.error("Failed to add IP address");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add IP Address</DialogTitle>
          <DialogDescription>Add an IP to monitor for uptime and blacklist status</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Label</Label>
            <Input id="name" placeholder="Main Server" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ip_address">IP Address</Label>
            <Input id="ip_address" placeholder="192.168.1.1" value={formData.ip_address} onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })} required />
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

          {/* Ports section */}
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
            <Button type="submit" disabled={loading} className="flex-1">{loading ? "Adding..." : "Add IP"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};