import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Poll check-host.net for results with retries.
 */
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

/**
 * Probe host using check-host.net ICMP ping + TCP checks.
 */
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

/**
 * Escape MarkdownV2 special characters for Telegram
 */
function escMd(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

/**
 * Send a Telegram message
 */
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

/**
 * Send SMS via configured webhook
 */
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

/**
 * Apply SMS message template
 */
function applyTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, "g"), value);
  }
  return result;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch all devices
    const { data: devices, error: devError } = await supabase
      .from("devices")
      .select("id, name, ip_address, is_up, check_ports")
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

    const telegramEnabled = tgConfig?.enabled && tgConfig?.chat_id && botToken;
    const smsEnabled = smsConfig?.enabled && smsConfig?.webhook_url && smsConfig?.client_number;

    console.log(`Cron: Checking ${devices.length} devices, Telegram: ${telegramEnabled ? "enabled" : "disabled"}, SMS: ${smsEnabled ? "enabled" : "disabled"}`);

    const results: any[] = [];

    // Process devices sequentially to avoid rate limiting check-host.net
    for (const device of devices) {
      const ports = Array.isArray(device.check_ports) && device.check_ports.length > 0
        ? device.check_ports
        : [80, 443];

      console.log(`Checking ${device.name} (${device.ip_address}) on ports [${ports.join(",")}]...`);

      const { reachable, latency_ms, method, open_ports } = await probeHost(device.ip_address, ports);
      const previouslyUp = device.is_up;
      const statusChanged = previouslyUp !== reachable;

      // Update device status
      await supabase.from("devices").update({
        is_up: reachable,
        last_ping_at: new Date().toISOString(),
        last_latency_ms: latency_ms,
      }).eq("id", device.id);

      console.log(`${device.name}: reachable=${reachable}, latency=${latency_ms}ms, method=${method}, changed=${statusChanged}`);

      // Send Telegram alert on status change
      if (statusChanged && telegramEnabled) {
        const isDown = !reachable;
        const shouldNotify = isDown ? tgConfig.notify_down : tgConfig.notify_up;

        if (shouldNotify) {
          const emoji = isDown ? "🔴" : "🟢";
          const status = isDown ? "DOWN" : "UP";
          const msg = [
            `${emoji} *${escMd(device.name)}* is now *${escMd(status)}*`,
            ``,
            `📍 IP: \`${escMd(device.ip_address)}\``,
            isDown ? `⏱ Last seen: ${escMd(new Date().toLocaleString())}` : `⏱ Latency: ${escMd(String(latency_ms))}ms`,
            reachable && open_ports.length > 0 ? `🔓 Open ports: ${escMd(open_ports.join(", "))}` : "",
            `🔍 Method: ${escMd(method)}`,
          ].filter(Boolean).join("\n");

          const sent = await sendTelegram(botToken!, tgConfig.chat_id, msg);

          // Log notification
          await supabase.from("notification_log").insert({
            event_type: isDown ? "ip_down" : "ip_up",
            ip_address: device.ip_address,
            message: `${device.name} is ${status}`,
            success: sent,
            error_message: sent ? null : "Telegram send failed",
          });
        }
      }

      // Send SMS alert on status change
      if (statusChanged && smsEnabled) {
        const isDown = !reachable;
        const shouldNotify = isDown ? smsConfig.notify_down : smsConfig.notify_up;

        if (shouldNotify) {
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

          const sent = await sendSmsWebhook(smsConfig, smsConfig.client_number, smsMessage);

          await supabase.from("notification_log").insert({
            event_type: isDown ? "sms_ip_down" : "sms_ip_up",
            ip_address: device.ip_address,
            message: `SMS: ${device.name} is ${status}`,
            success: sent,
            error_message: sent ? null : "SMS webhook failed",
          });
        }

      results.push({
        name: device.name,
        ip: device.ip_address,
        reachable,
        latency_ms,
        method,
        open_ports,
        status_changed: statusChanged,
      });

      // Small delay between devices to avoid rate limiting
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
