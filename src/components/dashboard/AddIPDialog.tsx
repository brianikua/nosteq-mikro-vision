import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";

const ipSchema = z.object({
  name: z.string().trim().min(1, "Label is required").max(100, "Label too long"),
  ip_address: z.string().trim().refine((ip) => {
    const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4.test(ip);
  }, "Invalid IPv4 address"),
});

interface AddIPDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AddIPDialog = ({ open, onOpenChange }: AddIPDialogProps) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ name: "", ip_address: "" });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const validated = ipSchema.parse(formData);
      const { error } = await supabase.from("devices").insert([{
        name: validated.name,
        ip_address: validated.ip_address,
      }]);
      if (error) throw error;
      toast.success("IP address added!");
      onOpenChange(false);
      setFormData({ name: "", ip_address: "" });
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
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add IP Address</DialogTitle>
          <DialogDescription>Add an IP to monitor for uptime and blacklist status</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Label</Label>
            <Input
              id="name"
              placeholder="Main Server"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ip_address">IP Address</Label>
            <Input
              id="ip_address"
              placeholder="192.168.1.1"
              value={formData.ip_address}
              onChange={(e) => setFormData({ ...formData, ip_address: e.target.value })}
              required
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={loading} className="flex-1">
              {loading ? "Adding..." : "Add IP"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
