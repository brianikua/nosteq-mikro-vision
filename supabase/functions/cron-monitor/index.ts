import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function pollCheckHost(requestId: string, maxAttempts = 3): Promise<Record<string, any>> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, i === 0 ? 3000 : 2000));
    try {
      const res = await fetch(`https://check-host.net/check-result/${requestId}`, {
        headers: { Accept: "application/json" },
      });
      if (!res.ok) continue;
      const data = await res.json();
      const hasResults = Object.values(data).some((v: any) => v !== null);
      if (hasResults) return data;
    } catch {}
  }
  return {};
}

async function probeHost(ip: string, ports: number[] = [80, 443]): Promise<{ reachable: boolean; latency_ms: number; method: string; open_ports: number[] }> {
  const open_ports: number[] = [];

  const pingReq = await fetch(`https://check-host.net/check-ping?host=${ip}&max_nodes=3`, {
    headers: { Accept: "application/json" },
  }).catch(() => null);

  const pingId = pingReq?.ok ? (await pingReq.json()).request_id : null;

  const tcpChecks = await Promise.all(
    ports.slice(0, 5).map(async (port) => {
      try {
        const res = await fetch(`https://check-host.net/check-tcp?host=${ip}:${port}&max_nodes=2`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return { port, requestId: null };
        const data = await res.json();
        return { port, requestId: data.request_id || null };
      } catch {
        return { port, requestId: null };
      }
    })
  );

  const [pingData, ...tcpResults] = await Promise.all([
    pingId ? pollCheckHost(pingId) : Promise.resolve({}),
    ...tcpChecks.map(async (tc) => {
      if (!tc.requestId) return { port: tc.port, data: {} };
      const data = await pollCheckHost(tc.requestId);
      return { port: tc.port, data };
    }),
  ]);

  let pingSuccess = 0;
  let totalLatency = 0;

  for (const [, nodeResult] of Object.entries(pingData)) {
    if (!Array.isArray(nodeResult) || nodeResult.length === 0) continue;
    const pings = Array.isArray(nodeResult[0]) ? nodeResult[0] : nodeResult;
    for (const ping of pings as any[]) {
      if (Array.isArray(ping) && ping[0] === "OK") {
        pingSuccess++;
        totalLatency += ping[1] * 1000;
      }
    }
  }

  let bestTcpLatency = Infinity;
  for (const tcpResult of tcpResults) {
    const { port, data } = tcpResult as { port: number; data: Record<string, any> };
    for (const [, nodeResult] of Object.entries(data)) {
      if (!Array.isArray(nodeResult) || nodeResult.length === 0) continue;
      const result = nodeResult[0];
      if (result && typeof result === "object" && result.time !== undefined && !result.error) {
        open_ports.push(port);
        const latency = result.time * 1000;
        if (latency < bestTcpLatency) bestTcpLatency = latency;
        break;
      }
    }
  }

  if (pingSuccess > 0) {
    return { reachable: true, latency_ms: Math.round(totalLatency / pingSuccess), method: "icmp", open_ports: [...new Set(open_ports)] };
  }
  if (open_ports.length > 0) {
    return { reachable: true, latency_ms: Math.round(bestTcpLatency), method: `tcp-${open_ports[0]}`, open_ports: [...new Set(open_ports)] };
  }
  return { reachable: false, latency_ms: 0, method: "none", open_ports: [] };
}

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

function applyTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

/**
 * Send alert to matching notification channels
 */
async function sendToChannels(
  supabase: any,
  botToken: string,
  eventType: string,
  message: string,
  ipAddress: string,
  deviceName: string,
  channelFilter?: (ch: any) => boolean
): Promise<void> {
  const { data: channels } = await supabase
    .from("notification_channels")
    .select("*")
    .eq("is_active", true);

  if (!channels || channels.length === 0) return;

  for (const ch of channels) {
    // Check alert type subscription
    const alertTypes = Array.isArray(ch.alert_types) ? ch.alert_types : [];
    if (!alertTypes.includes(eventType) && !alertTypes.includes("critical")) continue;

    // Apply optional filter (e.g. for escalation only NOC/Management)
    if (channelFilter && !channelFilter(ch)) continue;

    // Check mute schedule
    if (ch.mute_schedule === "custom" && ch.mute_start && ch.mute_end) {
      const now = new Date();
      const hours = now.getUTCHours() + 3; // EAT = UTC+3
      const minutes = now.getUTCMinutes();
      const currentTime = `${String(hours % 24).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
      if (currentTime >= ch.mute_start && currentTime <= ch.mute_end) continue;
    }

    const sent = await sendTelegram(botToken, ch.chat_id, message);
    await supabase.from("notification_log").insert({
      event_type: eventType,
      ip_address: ipAddress,
      message: `[${ch.name}] ${deviceName} - ${eventType}`,
      success: sent,
      error_message: sent ? null : `Failed to send to channel ${ch.name}`,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : null;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!bearerToken || (bearerToken !== anonKey && bearerToken !== serviceKey)) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch system settings
    const { data: sysSettings } = await supabase
      .from("system_settings")
      .select("*")
      .eq("id", 1)
      .single();

    const downConfirmCount = sysSettings?.down_confirmation_count ?? 3;
    const escalationMinutes = sysSettings?.escalation_timer_minutes ?? 30;

    // Fetch all devices including escalation tracking fields
    const { data: devices, error: devError } = await supabase
      .from("devices")
      .select("id, name, ip_address, is_up, check_ports, notify_number, consecutive_failures, down_since, escalation_sent")
      .order("name");

    if (devError) throw devError;
    if (!devices || devices.length === 0) {
      return new Response(JSON.stringify({ message: "No devices to monitor" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch Telegram config
    const { data: tgConfig } = await supabase
      .from("telegram_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    // Fetch SMS config
    const { data: smsConfig } = await supabase
      .from("sms_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    const telegramEnabled = tgConfig?.enabled && botToken;
    const smsEnabled = smsConfig?.enabled && smsConfig?.webhook_url && smsConfig?.client_number;

    console.log(`Cron: Checking ${devices.length} devices, downConfirm=${downConfirmCount}, escalation=${escalationMinutes}min`);

    const results: any[] = [];

    for (const device of devices) {
      const ports = Array.isArray(device.check_ports) && device.check_ports.length > 0
        ? device.check_ports
        : [80, 443];

      console.log(`Checking ${device.name} (${device.ip_address})...`);

      const { reachable, latency_ms, method, open_ports } = await probeHost(device.ip_address, ports);

      const wasUp = device.is_up;
      let newConsecutiveFailures = device.consecutive_failures || 0;
      let downSince = device.down_since;
      let escalationSent = device.escalation_sent || false;
      let confirmedDown = false;
      let statusChanged = false;

      if (!reachable) {
        // Increment failure counter
        newConsecutiveFailures++;

        if (newConsecutiveFailures >= downConfirmCount) {
          // Confirmed DOWN
          confirmedDown = true;
          if (wasUp !== false) {
            // Transition from UP to confirmed DOWN
            statusChanged = true;
            downSince = new Date().toISOString();
            escalationSent = false;
          }
        }
        // If not yet confirmed, don't change is_up status
      } else {
        // Device is reachable — reset everything
        if (wasUp === false) {
          statusChanged = true; // recovering from DOWN
        }
        newConsecutiveFailures = 0;
        downSince = null;
        escalationSent = false;
      }

      // Determine final is_up: only change when confirmed
      const finalIsUp = reachable ? true : (newConsecutiveFailures >= downConfirmCount ? false : (wasUp ?? true));

      // Update device
      await supabase.from("devices").update({
        is_up: finalIsUp,
        last_ping_at: new Date().toISOString(),
        last_latency_ms: reachable ? latency_ms : (wasUp === false ? device.last_latency_ms : latency_ms),
        consecutive_failures: newConsecutiveFailures,
        down_since: downSince,
        escalation_sent: escalationSent,
      }).eq("id", device.id);

      // ── Send alerts on confirmed status change ──
      if (statusChanged && telegramEnabled && botToken) {
        const isDown = !reachable;
        const emoji = isDown ? "🔴" : "🟢";
        const status = isDown ? "DOWN" : "RECOVERED";
        const eventType = isDown ? "down" : "up";

        const msg = [
          `${emoji} *${escMd(device.name)}* is now *${escMd(status)}*`,
          ``,
          `📍 IP: \`${escMd(device.ip_address)}\``,
          isDown
            ? `⚠️ Failed ${escMd(String(downConfirmCount))} consecutive checks`
            : `⏱ Latency: ${escMd(String(latency_ms))}ms`,
          reachable && open_ports.length > 0 ? `🔓 Open ports: ${escMd(open_ports.join(", "))}` : "",
          `🔍 Method: ${escMd(method)}`,
        ].filter(Boolean).join("\n");

        await sendToChannels(supabase, botToken, eventType, msg, device.ip_address, device.name);
      }

      // ── Smart Escalation: check if device has been down too long ──
      if (finalIsUp === false && downSince && !escalationSent && telegramEnabled && botToken) {
        const downDuration = (Date.now() - new Date(downSince).getTime()) / 60000;
        if (downDuration >= escalationMinutes) {
          const escMsg = [
            `🚨 *ESCALATION* \\- *${escMd(device.name)}* still DOWN`,
            ``,
            `📍 IP: \`${escMd(device.ip_address)}\``,
            `⏱ Down for: ${escMd(String(Math.round(downDuration)))} minutes`,
            `🔺 Auto\\-escalated after ${escMd(String(escalationMinutes))}min threshold`,
          ].join("\n");

          // Send only to NOC and Management channels
          await sendToChannels(
            supabase, botToken, "critical", escMsg, device.ip_address, device.name,
            (ch) => ch.channel_type === "noc" || ch.channel_type === "management"
          );

          // Mark escalation as sent
          await supabase.from("devices").update({ escalation_sent: true }).eq("id", device.id);
          escalationSent = true;
        }
      }

      // ── SMS alerts on confirmed status change ──
      if (statusChanged && smsEnabled) {
        const isDown = !reachable;
        const shouldNotify = isDown ? smsConfig.notify_down : smsConfig.notify_up;

        if (shouldNotify) {
          const deviceNumbers: string[] = Array.isArray(device.notify_number) && device.notify_number.length > 0
            ? device.notify_number
            : [smsConfig.client_number];

          const emoji = isDown ? "🔴" : "🟢";
          const status = isDown ? "DOWN" : "UP";
          const template = smsConfig.message_template || "{{status_emoji}} {{device_name}} ({{ip_address}}) is {{status}}. Latency: {{latency}}ms";
          const smsMessage = applyTemplate(template, {
            status_emoji: emoji,
            device_name: device.name,
            ip_address: device.ip_address,
            status,
            latency: String(latency_ms),
            isp_name: smsConfig.isp_contact_name || "N/A",
            isp_number: smsConfig.isp_contact_number || "N/A",
          });

          for (const smsNumber of deviceNumbers) {
            if (!smsNumber) continue;
            const sent = await sendSmsWebhook(smsConfig, smsNumber, smsMessage);
            await supabase.from("notification_log").insert({
              event_type: isDown ? "sms_ip_down" : "sms_ip_up",
              ip_address: device.ip_address,
              message: `SMS to ${smsNumber}: ${device.name} is ${status}`,
              success: sent,
              error_message: sent ? null : "SMS webhook failed",
            });
          }
        }
      }

      results.push({
        name: device.name,
        ip: device.ip_address,
        reachable,
        latency_ms,
        method,
        open_ports,
        status_changed: statusChanged,
        consecutive_failures: newConsecutiveFailures,
        escalation_sent: escalationSent,
      });

      if (devices.indexOf(device) < devices.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return new Response(
      JSON.stringify({ checked: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Cron monitor error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
