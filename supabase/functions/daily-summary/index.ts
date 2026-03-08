import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function escMd(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

async function sendTelegram(botToken: string, chatId: string, message: string): Promise<boolean> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "MarkdownV2" }),
    });
    const data = await res.json();
    return data.ok === true;
  } catch {
    return false;
  }
}

async function sendSmsWebhook(config: any, phone: string, message: string): Promise<boolean> {
  try {
    let res: Response;
    if (config.webhook_method === "GET") {
      const url = new URL(config.webhook_url);
      url.searchParams.set("phone_number", phone);
      url.searchParams.set("message", message);
      res = await fetch(url.toString());
    } else {
      res = await fetch(config.webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: phone, message }),
      });
    }
    return res.ok;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Auth: accept project keys (cron) or user JWT ──
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : null;
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!bearerToken || (bearerToken !== anonKey && bearerToken !== serviceKey)) {
      // Try JWT auth for manual triggers
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

    // ── Send Telegram summary ──
    const { data: tgConfig } = await supabase.from("telegram_config").select("*").limit(1).maybeSingle();
    const telegramEnabled = tgConfig?.enabled && tgConfig?.chat_id && botToken && tgConfig?.notify_summary;

    if (telegramEnabled) {
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
      const sent = await sendTelegram(botToken!, tgConfig!.chat_id, msg);

      await supabase.from("notification_log").insert({
        event_type: "daily_summary",
        ip_address: "all",
        message: `Daily summary: ${devicesUp}/${totalDevices} up, ${totalListings} listings, ${newBlacklistings} new`,
        success: sent,
        error_message: sent ? null : "Telegram send failed",
      });

      console.log(`Telegram daily summary sent: ${sent}`);
    }

    // ── Send SMS summary ──
    const { data: smsConfig } = await supabase.from("sms_config").select("*").limit(1).maybeSingle();
    const smsEnabled = smsConfig?.enabled && smsConfig?.webhook_url && smsConfig?.client_number && smsConfig?.notify_summary;

    if (smsEnabled) {
      const smsMessage = [
        `📊 DAILY SUMMARY (${now})`,
        `Devices: ${devicesUp}/${totalDevices} online`,
        `Reputation: avg ${avgReputation ?? "N/A"}/100`,
        `Listings: ${totalListings} active`,
        newBlacklistings > 0 ? `🚨 ${newBlacklistings} NEW blacklistings!` : `✅ No new blacklistings`,
        totalDelistings > 0 ? `✅ ${totalDelistings} delistings` : "",
        worstDevice && worstDevice.reputation_score < 80
          ? `⚠️ Worst: ${worstDevice.name} (${worstDevice.reputation_score}/100)`
          : "",
      ].filter(Boolean).join("\n");

      const sent = await sendSmsWebhook(smsConfig, smsConfig.client_number, smsMessage);
      await supabase.from("notification_log").insert({
        event_type: "sms_daily_summary",
        ip_address: "all",
        message: `SMS daily summary sent to ${smsConfig.client_number}`,
        success: sent,
        error_message: sent ? null : "SMS webhook failed",
      });

      console.log(`SMS daily summary sent: ${sent}`);
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
        telegram_sent: telegramEnabled,
        sms_sent: smsEnabled,
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
