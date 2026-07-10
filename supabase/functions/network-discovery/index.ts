import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DiscoveredHost {
  ip_address: string;
  snmp_identified: boolean;
  sys_descr?: string | null;
  community?: string | null;
}

function guessDeviceType(sysDescr: string | null | undefined): string {
  const d = (sysDescr || "").toLowerCase();
  if (d.includes("routeros") || d.includes("mikrotik")) {
    return d.includes("switch") ? "MikroTik_Switch" : "MikroTik_Router";
  }
  return "Other";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Same trust boundary as the SNMP collector — this is the same on-prem
  // agent, running inside the LAN it's discovering, so it reuses that
  // dedicated secret rather than adding a second one to manage.
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : null;
  const collectorToken = Deno.env.get("SNMP_COLLECTOR_TOKEN");

  if (!collectorToken || !token || token !== collectorToken) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // ── GET: enabled scan ranges to sweep ──
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("scan_ranges")
        .select("id, cidr, description")
        .eq("enabled", true);
      if (error) throw error;
      return new Response(JSON.stringify({ ranges: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── POST: ingest discovered hosts, auto-add + auto-monitor ──
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const discovered: DiscoveredHost[] = Array.isArray(body.discovered) ? body.discovered : [];
      const scannedRangeIds: string[] = Array.isArray(body.scanned_range_ids) ? body.scanned_range_ids : [];

      const added: string[] = [];
      const skipped: string[] = [];

      for (const host of discovered) {
        if (!host.ip_address) continue;

        // .limit(1) array check, not .maybeSingle() — devices.ip_address has
        // no uniqueness constraint (intentionally dropped earlier so the
        // inventory wizard's legacy placeholder rows don't collide), so more
        // than one existing row is possible and .maybeSingle() would throw.
        const { data: existingRows } = await supabase
          .from("devices")
          .select("id")
          .eq("ip_address", host.ip_address)
          .limit(1);

        if (existingRows && existingRows.length > 0) {
          skipped.push(host.ip_address);
          continue;
        }

        // Auto-added and monitored immediately (no approval queue) — the
        // operator's chosen behavior. SNMP interface discovery/polling
        // happens on its own via snmp-collector once snmp_enabled is set;
        // this function doesn't need to pre-create interface rows.
        const { error: insertError } = await supabase.from("devices").insert({
          name: host.ip_address,
          ip_address: host.ip_address,
          type: guessDeviceType(host.sys_descr),
          status: "active",
          discovery_source: "discovery",
          monitor_enabled: true,
          snmp_enabled: host.snmp_identified,
          snmp_community: host.snmp_identified ? (host.community || "public") : null,
          noc_notes: host.sys_descr ? `Auto-discovered. SNMP sysDescr: ${host.sys_descr.slice(0, 200)}` : "Auto-discovered via network scan.",
        });

        if (insertError) {
          console.error(`Failed to add discovered host ${host.ip_address}:`, insertError);
          continue;
        }
        added.push(host.ip_address);
      }

      if (scannedRangeIds.length > 0) {
        await supabase.from("scan_ranges").update({ last_scanned_at: new Date().toISOString() }).in("id", scannedRangeIds);
      }

      return new Response(JSON.stringify({ success: true, added: added.length, skipped: skipped.length, added_ips: added }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("network-discovery error:", error);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
