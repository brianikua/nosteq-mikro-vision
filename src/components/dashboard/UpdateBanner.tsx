import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getVersionString } from "@/lib/version";
import { X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

export const UpdateBanner = () => {
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchLatest = async () => {
      const { data } = await supabase
        .from("release_notes")
        .select("version")
        .order("release_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data && data.version !== getVersionString().replace("v", "")) {
        setLatestVersion(data.version);
      }
    };
    fetchLatest();
  }, []);

  if (!latestVersion || dismissed) return null;

  return (
    <div className="bg-primary/10 border border-primary/30 rounded-lg px-4 py-3 flex items-center justify-between mb-6">
      <div className="flex items-center gap-2 text-sm">
        <Sparkles className="h-4 w-4 text-primary" />
        <span>
          System updated to <span className="font-semibold text-primary">v{latestVersion}</span> —{" "}
          <button
            onClick={() => navigate("/admin")}
            className="underline text-primary hover:text-primary/80"
          >
            View Release Notes
          </button>
        </span>
      </div>
      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setDismissed(true)}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};
