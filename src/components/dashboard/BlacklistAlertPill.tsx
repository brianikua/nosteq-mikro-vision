import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";

export function BlacklistAlertPill() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;
    const fetchCount = async () => {
      const { count: c } = await supabase
        .from("ip_addresses")
        .select("id", { count: "exact", head: true })
        .eq("is_blacklisted", true);
      if (mounted) setCount(c || 0);
    };
    fetchCount();
    const t = setInterval(fetchCount, 30000);
    const ch = supabase
      .channel("ip_addresses-bl")
      .on("postgres_changes", { event: "*", schema: "public", table: "ip_addresses" }, fetchCount)
      .subscribe();
    return () => { mounted = false; clearInterval(t); supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="flex items-center gap-2">
      {count > 0 && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-destructive/15 border border-destructive/30 text-destructive text-[11px] font-medium">
          <AlertTriangle className="h-3 w-3" />
          <span>{count} Active RBL Listing{count === 1 ? "" : "s"}</span>
        </div>
      )}
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-success/10 border border-success/30 text-success text-[11px] font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
        <span>Live</span>
      </div>
    </div>
  );
}
