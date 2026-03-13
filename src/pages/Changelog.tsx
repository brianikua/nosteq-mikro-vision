import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, FileText, Tag, Calendar } from "lucide-react";
import { toast } from "sonner";
import { VersionFooter } from "@/components/dashboard/VersionFooter";
import { useAutoLogout } from "@/hooks/use-auto-logout";
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

const Changelog = () => {
  useAutoLogout();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [form, setForm] = useState({
    version: "", build_number: 1, category: "Feature", title: "", description: "", is_major: false,
  });

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate("/auth"); return; }

      const { data: role } = await supabase
        .from("user_roles").select("role")
        .eq("user_id", session.user.id).eq("role", "superadmin").maybeSingle();
      setIsSuperadmin(!!role);

      const { data } = await supabase
        .from("release_notes")
        .select("*")
        .order("release_date", { ascending: false });
      setNotes((data as ReleaseNote[]) || []);
      setLoading(false);
    };
    init();
  }, [navigate]);

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
    const { data } = await supabase.from("release_notes").select("*").order("release_date", { ascending: false });
    setNotes((data as ReleaseNote[]) || []);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" /> System Changelog
              </h1>
              <p className="text-xs text-muted-foreground">Release history & version notes</p>
            </div>
          </div>
          {isSuperadmin && (
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
          )}
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8 max-w-3xl">
        {loading ? (
          <p className="text-center text-muted-foreground py-12">Loading changelog...</p>
        ) : notes.length === 0 ? (
          <Card className="border-border/50"><CardContent className="py-12 text-center text-muted-foreground">No release notes yet.</CardContent></Card>
        ) : (
          <div className="space-y-4">
            {notes.map((note) => (
              <Card
                key={note.id}
                className="border-border/50 cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => setExpanded(expanded === note.id ? null : note.id)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-primary" />
                      <CardTitle className="text-base">
                        v{note.version}
                        <span className="text-xs text-muted-foreground ml-2">(Build {note.build_number})</span>
                      </CardTitle>
                      {note.is_major && <Badge variant="outline" className="text-[10px] border-primary/50 text-primary">MAJOR</Badge>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={categoryColors[note.category] || ""}>
                        {note.category}
                      </Badge>
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(note.release_date), "MMM dd, yyyy")}
                      </span>
                    </div>
                  </div>
                  <p className="text-sm font-medium mt-1">{note.title}</p>
                </CardHeader>
                {expanded === note.id && (
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{note.description}</p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>
      <VersionFooter />
    </div>
  );
};

export default Changelog;
