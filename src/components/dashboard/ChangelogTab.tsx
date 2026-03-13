import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, Tag, Calendar } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface ReleaseNote {
  id: string;
  version: string;
  build_number: number;
  release_date: string;
  category: string;
  title: string;
  description: string;
  is_major: boolean;
}

const categoryColors: Record<string, string> = {
  Feature: "bg-primary/20 text-primary border-primary/30",
  Improvement: "bg-[hsl(var(--success))]/20 text-[hsl(var(--success))] border-[hsl(var(--success))]/30",
  Fix: "bg-[hsl(var(--warning))]/20 text-[hsl(var(--warning))] border-[hsl(var(--warning))]/30",
  Security: "bg-destructive/20 text-destructive border-destructive/30",
};

export function ChangelogTab({ isSuperadmin }: { isSuperadmin: boolean }) {
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({
    version: "", build_number: 1, category: "Feature", title: "", description: "", is_major: false,
  });

  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    const { data } = await supabase
      .from("release_notes")
      .select("*")
      .order("release_date", { ascending: false });
    setNotes((data as ReleaseNote[]) || []);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!form.version || !form.title || !form.description) {
      toast.error("Fill all required fields"); return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    const { error } = await supabase.from("release_notes").insert({
      ...form, created_by: session?.user.id,
    });
    if (error) { toast.error("Failed to add release note"); return; }
    toast.success("Release note added!");
    setShowAdd(false);
    setForm({ version: "", build_number: 1, category: "Feature", title: "", description: "", is_major: false });
    fetchNotes();
  };

  return (
    <div className="space-y-4">
      {isSuperadmin && (
        <div className="flex justify-end">
          <Dialog open={showAdd} onOpenChange={setShowAdd}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4 mr-1" /> Add Release</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Release Note</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Version</Label><Input placeholder="2.4.0" value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} /></div>
                  <div><Label>Build #</Label><Input type="number" value={form.build_number} onChange={e => setForm({ ...form, build_number: parseInt(e.target.value) || 1 })} /></div>
                </div>
                <div><Label>Category</Label>
                  <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Feature", "Improvement", "Fix", "Security"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Title</Label><Input placeholder="What changed?" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
                <div><Label>Description</Label><Textarea placeholder="Detailed description..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={4} /></div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="is_major" checked={form.is_major} onChange={e => setForm({ ...form, is_major: e.target.checked })} className="rounded" />
                  <Label htmlFor="is_major">Major release</Label>
                </div>
                <Button className="w-full" onClick={handleAdd}>Publish Release Note</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      )}

      {loading ? (
        <p className="text-center text-muted-foreground py-12">Loading changelog...</p>
      ) : notes.length === 0 ? (
        <Card className="border-border/50"><CardContent className="py-12 text-center text-muted-foreground">No release notes yet.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {notes.map((note) => (
            <Card
              key={note.id}
              className="border-border/50 cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => setExpanded(expanded === note.id ? null : note.id)}
            >
              <CardHeader className="pb-2 px-4 pt-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Tag className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm">
                      v{note.version}
                      <span className="text-xs text-muted-foreground ml-1">(Build {note.build_number})</span>
                    </CardTitle>
                    {note.is_major && <Badge variant="outline" className="text-[10px] border-primary/50 text-primary">MAJOR</Badge>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={categoryColors[note.category] || ""}>{note.category}</Badge>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {format(new Date(note.release_date), "MMM dd, yyyy")}
                    </span>
                  </div>
                </div>
                <p className="text-sm font-medium mt-1">{note.title}</p>
              </CardHeader>
              {expanded === note.id && (
                <CardContent className="pt-0 px-4 pb-4">
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{note.description}</p>
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
