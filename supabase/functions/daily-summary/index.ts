import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escMd, routeToChannels } from "../_shared/notify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth: accept a dedicated cron secret or service-role key (scheduled
    // calls), or a real admin/superadmin JWT (manual trigger). Security audit
    // CRIT-3: the anon key must never satisfy this — it's public, shipped in
    // every browser bundle, so it was never actually restricting access.
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : null;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronToken = Deno.env.get("CRON_TRIGGER_TOKEN");

    const isScheduledCall = bearerToken === serviceKey || (!!cronToken && bearerToken === cronToken);

    if (!isScheduledCall) {
      if (!bearerToken) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader! } },
      });
      const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(bearerToken);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = claimsData.claims.sub;
      const { data: roles } = await authClient.from("user_roles").select("role").eq("user_id", userId);
      const isAdmin = roles?.some((r: any) => r.role === "admin" || r.role === "superadmin");
      if (!isAdmin) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Gather data from last 24 hours ──
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Fetch all devices
    const { data: devices } = await supabase
      .from("devices")
      .select("id, name, ip_address, is_up, last_latency_ms, last_ping_at, notify_number")
      .order("name");

    if (!devices || devices.length === 0) {
      return new Response(JSON.stringify({ message: "No devices to summarize" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch reputation summaries
    const { data: reputations } = await supabase
      .from("ip_reputation_summary")
      .select("device_id, reputation_score, active_listings, total_listings, last_scan_at");

    const repMap = new Map((reputations || []).map((r: any) => [r.device_id, r]));

    // Fetch notification log from last 24h
    const { data: notifications } = await supabase
      .from("notification_log")
      .select("event_type, ip_address, message, success, sent_at")
      .gte("sent_at", since)
      .order("sent_at", { ascending: false });

    // Fetch recent blacklist scans from last 24h
    const { data: recentScans } = await supabase
      .from("blacklist_scans")
      .select("device_id, provider, confidence_score, scanned_at")
      .gte("scanned_at", since)
      .gt("confidence_score", 0);

    // ── Aggregate per device ──
    const deviceSummaries = devices.map((device: any) => {
      const rep = repMap.get(device.id);
      const deviceScans = (recentScans || []).filter((s: any) => s.device_id === device.id);
      const listedProviders = [...new Set(deviceScans.map((s: any) => s.provider))];
      const deviceNotifs = (notifications || []).filter((n: any) => n.ip_address === device.ip_address);
      const blacklistEvents = deviceNotifs.filter((n: any) =>
        n.event_type === "ip_blacklisted" || n.event_type === "sms_ip_blacklisted"
      );
      const delistEvents = deviceNotifs.filter((n: any) =>
        n.event_type === "ip_delisted" || n.event_type === "sms_ip_delisted"
      );
      const downEvents = deviceNotifs.filter((n: any) =>
        n.event_type === "ip_down" || n.event_type === "sms_ip_down"
      );

      return {
        name: device.name,
        ip: device.ip_address,
        is_up: device.is_up,
        latency: device.last_latency_ms,
        reputation_score: rep?.reputation_score ?? null,
        active_listings: rep?.active_listings ?? 0,
        new_blacklistings_24h: blacklistEvents.length,
        delistings_24h: delistEvents.length,
        downtime_events_24h: downEvents.length,
        listed_providers: listedProviders,
        notify_number: device.notify_number,
      };
    });

    // ── Build summary stats ──
    const totalDevices = deviceSummaries.length;
    const devicesUp = deviceSummaries.filter((d: any) => d.is_up).length;
    const devicesDown = totalDevices - devicesUp;
    const totalListings = deviceSummaries.reduce((sum: number, d: any) => sum + d.active_listings, 0);
    const newBlacklistings = deviceSummaries.reduce((sum: number, d: any) => sum + d.new_blacklistings_24h, 0);
    const totalDelistings = deviceSummaries.reduce((sum: number, d: any) => sum + d.delistings_24h, 0);
    const totalDownEvents = deviceSummaries.reduce((sum: number, d: any) => sum + d.downtime_events_24h, 0);
    const avgReputation = deviceSummaries.filter((d: any) => d.reputation_score !== null).length > 0
      ? Math.round(
          deviceSummaries
            .filter((d: any) => d.reputation_score !== null)
            .reduce((sum: number, d: any) => sum + d.reputation_score, 0) /
          deviceSummaries.filter((d: any) => d.reputation_score !== null).length
        )
      : null;
    const worstDevice = deviceSummaries
      .filter((d: any) => d.reputation_score !== null)
      .sort((a: any, b: any) => a.reputation_score - b.reputation_score)[0];

    const now = new Date().toLocaleString("en-US", { timeZone: "Africa/Nairobi" });

    // ── Build and route the summary — one message, fanned out to every
    // Telegram/SMS/email channel subscribed to "summary" alerts. Replaces
    // this function's own separate Telegram/SMS builders and senders. ──
    {
      const statusEmoji = devicesDown > 0 ? "🔴" : "🟢";
      const repEmoji = (avgReputation ?? 100) >= 80 ? "🟢" : (avgReputation ?? 100) >= 50 ? "🟡" : "🔴";

      const lines = [
        `📊 *DAILY SECURITY SUMMARY*`,
        `📅 ${escMd(now)}`,
        ``,
        `*── Device Status ──*`,
        `${statusEmoji} ${escMd(String(devicesUp))}/${escMd(String(totalDevices))} devices online`,
        devicesDown > 0 ? `🔴 ${escMd(String(devicesDown))} device${devicesDown > 1 ? "s" : ""} offline` : "",
        totalDownEvents > 0 ? `⚠️ ${escMd(String(totalDownEvents))} downtime event${totalDownEvents > 1 ? "s" : ""} in 24h` : "",
        ``,
        `*── IP Reputation ──*`,
        `${repEmoji} Avg reputation: ${escMd(String(avgReputation ?? "N/A"))}/100`,
        `📋 Active listings: ${escMd(String(totalListings))}`,
        newBlacklistings > 0 ? `🚨 New blacklistings: ${escMd(String(newBlacklistings))}` : `✅ No new blacklistings`,
        totalDelistings > 0 ? `✅ Delistings: ${escMd(String(totalDelistings))}` : "",
      ];

      // Per-device breakdown for devices with issues
      const problemDevices = deviceSummaries.filter(
        (d: any) => d.active_listings > 0 || !d.is_up || d.new_blacklistings_24h > 0
      );
      if (problemDevices.length > 0) {
        lines.push("", `*── Devices Needing Attention ──*`);
        for (const d of problemDevices) {
          const status = d.is_up ? "🟢" : "🔴";
          lines.push(
            `${status} *${escMd(d.name)}* \\(${escMd(d.ip)}\\)`,
            `   Score: ${escMd(String(d.reputation_score ?? "N/A"))}/100 \\| Listings: ${escMd(String(d.active_listings))}`,
          );
          if (d.listed_providers.length > 0) {
            lines.push(`   Listed on: ${escMd(d.listed_providers.slice(0, 5).join(", "))}${d.listed_providers.length > 5 ? escMd(` +${d.listed_providers.length - 5} more`) : ""}`);
          }
        }
      }

      if (worstDevice && worstDevice.reputation_score < 80) {
        lines.push("", `⚠️ Worst: *${escMd(worstDevice.name)}* at ${escMd(String(worstDevice.reputation_score))}/100`);
      }

      const msg = lines.filter(Boolean).join("\n");
      await routeToChannels(supabase, "summary", msg, "all");
      console.log(`Daily summary routed: ${devicesUp}/${totalDevices} up, ${totalListings} listings, ${newBlacklistings} new`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: {
          total_devices: totalDevices,
          devices_up: devicesUp,
          devices_down: devicesDown,
          avg_reputation: avgReputation,
          total_active_listings: totalListings,
          new_blacklistings_24h: newBlacklistings,
          delistings_24h: totalDelistings,
          downtime_events_24h: totalDownEvents,
          worst_device: worstDevice ? { name: worstDevice.name, score: worstDevice.reputation_score } : null,
          devices: deviceSummaries,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Daily summary error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
