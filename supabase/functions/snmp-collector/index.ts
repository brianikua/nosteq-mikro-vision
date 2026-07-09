import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface IngestInterface {
  if_index: number;
  if_descr?: string | null;
  if_alias?: string | null;
  oper_status: "up" | "down" | "unknown";
  admin_status?: "up" | "down" | "unknown" | null;
  speed_mbps?: number | null;
  in_octets?: number | null;
  out_octets?: number | null;
  in_errors?: number | null;
  out_errors?: number | null;
}

interface IngestDevice {
  device_id: string;
  reachable: boolean;
  sys_uptime_seconds?: number | null;
  cpu_load_pct?: number | null;
  interfaces?: IngestInterface[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Dedicated collector secret, not the anon/service key or a user JWT — the on-prem
  // collector only ever needs "read SNMP targets, write SNMP results," so it never
  // touches the Supabase service-role key.
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : null;
  const collectorToken = Deno.env.get("SNMP_COLLECTOR_TOKEN");

  if (!collectorToken || !token || token !== collectorToken) {
    return new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    // ── GET: poll target list ──
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("devices")
        .select("id, ip_address, snmp_version, snmp_community, snmp_port")
        .eq("snmp_enabled", true);
      if (error) throw error;
      return new Response(JSON.stringify({ targets: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── POST: ingest a batch of poll results ──
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      const devices: IngestDevice[] = Array.isArray(body.devices) ? body.devices : [];
      const nowIso = new Date().toISOString();
      const results: any[] = [];

      for (const d of devices) {
        if (!d.device_id) continue;

        const { data: existingDevice } = await supabase
          .from("devices")
          .select("sys_uptime_seconds")
          .eq("id", d.device_id)
          .maybeSingle();

        // A lower uptime than last poll means the device rebooted — its interface
        // counters reset to zero, so a raw delta against the old baseline would look
        // like a huge (or negative) traffic spike. Skip the bps calc this cycle and
        // just re-baseline.
        const rebooted = existingDevice?.sys_uptime_seconds != null
          && d.sys_uptime_seconds != null
          && d.sys_uptime_seconds < existingDevice.sys_uptime_seconds;

        // snmp_reachable/last_snmp_poll_at are intentionally separate from the
        // ping-based is_up/last_ping_at columns owned by cron-monitor.
        await supabase.from("devices").update({
          snmp_reachable: d.reachable,
          sys_uptime_seconds: d.sys_uptime_seconds ?? null,
          cpu_load_pct: d.cpu_load_pct ?? null,
          last_snmp_poll_at: nowIso,
        }).eq("id", d.device_id);

        let interfacesUpdated = 0;

        for (const iface of d.interfaces || []) {
          const { data: existingIface } = await supabase
            .from("interfaces")
            .select("id, last_in_octets, last_out_octets, last_snmp_poll_at")
            .eq("device_id", d.device_id)
            .eq("if_index", iface.if_index)
            .maybeSingle();

          let inBps: number | null = null;
          let outBps: number | null = null;

          if (
            existingIface && !rebooted && existingIface.last_snmp_poll_at &&
            iface.in_octets != null && iface.out_octets != null &&
            existingIface.last_in_octets != null && existingIface.last_out_octets != null
          ) {
            const elapsedSec = (Date.now() - new Date(existingIface.last_snmp_poll_at).getTime()) / 1000;
            if (elapsedSec > 0) {
              const inDelta = iface.in_octets - existingIface.last_in_octets;
              const outDelta = iface.out_octets - existingIface.last_out_octets;
              // Negative delta = counter wrapped/reset — discard the sample, keep the new baseline.
              if (inDelta >= 0) inBps = Math.round((inDelta * 8) / elapsedSec);
              if (outDelta >= 0) outBps = Math.round((outDelta * 8) / elapsedSec);
            }
          }

          // Live/polled fields only — never touches name/description, which are
          // human-managed inventory fields set via AddDeviceWizard.
          const liveFields = {
            link_status: iface.oper_status,
            admin_status: iface.admin_status ?? null,
            speed_mbps: iface.speed_mbps ?? null,
            last_in_octets: iface.in_octets ?? null,
            last_out_octets: iface.out_octets ?? null,
            in_bps: inBps,
            out_bps: outBps,
            last_snmp_poll_at: nowIso,
          };

          let interfaceId: string;
          if (existingIface) {
            await supabase.from("interfaces").update(liveFields).eq("id", existingIface.id);
            interfaceId = existingIface.id;
          } else {
            // A port SNMP discovered that wasn't manually entered in inventory yet —
            // seed name/description from SNMP, but only on first creation.
            const { data: inserted, error: insertErr } = await supabase
              .from("interfaces")
              .insert({
                ...liveFields,
                device_id: d.device_id,
                if_index: iface.if_index,
                name: iface.if_descr || iface.if_alias || `if${iface.if_index}`,
                description: iface.if_alias ?? null,
                type: "ethernet",
              })
              .select("id")
              .single();
            if (insertErr || !inserted) continue;
            interfaceId = inserted.id;
          }

          await supabase.from("interface_metrics").insert({
            interface_id: interfaceId,
            recorded_at: nowIso,
            in_bps: inBps,
            out_bps: outBps,
            in_octets: iface.in_octets ?? null,
            out_octets: iface.out_octets ?? null,
            in_errors: iface.in_errors ?? null,
            out_errors: iface.out_errors ?? null,
          });

          interfacesUpdated++;
        }

        results.push({ device_id: d.device_id, reachable: d.reachable, interfaces_updated: interfacesUpdated });
      }

      return new Response(JSON.stringify({ success: true, devices_processed: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("snmp-collector error:", error);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
