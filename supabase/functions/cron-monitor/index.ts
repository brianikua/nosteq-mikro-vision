import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escMd, routeToChannels, sendDirect } from "../_shared/notify.ts";

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
    const authHeader = req.headers.get("Authorization");
    const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : null;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronToken = Deno.env.get("CRON_TRIGGER_TOKEN");

    // Security audit CRIT-3: the anon key is public (shipped in every browser
    // bundle) and must never satisfy "this is an authorized scheduled call."
    // Only the service-role key or a dedicated cron secret count.
    if (!bearerToken || (bearerToken !== serviceKey && bearerToken !== cronToken)) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
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
      .select("id, name, ip_address, is_up, check_ports, notify_number, consecutive_failures, down_since, escalation_sent, monitor_enabled")
      .order("name");

    if (devError) throw devError;
    // monitor_enabled defaults to null on rows created before this column
    // existed — treat null as "monitored" (opt-out, not opt-in) so existing
    // devices don't silently stop being polled. Only an explicit false skips.
    const monitoredDevices = (devices || []).filter((d: any) => d.monitor_enabled !== false);
    if (monitoredDevices.length === 0) {
      return new Response(JSON.stringify({ message: "No devices to monitor" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch SMS config — still needed here for message templating and the
    // notify_down/notify_up/notify flags; the actual send mechanics now live
    // entirely inside send-notification.
    const { data: smsConfig } = await supabase
      .from("sms_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    const smsEnabled = smsConfig?.enabled;

    console.log(`Cron: Checking ${monitoredDevices.length} devices, downConfirm=${downConfirmCount}, escalation=${escalationMinutes}min`);

    const results: any[] = [];

    for (const device of monitoredDevices) {
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
      if (statusChanged) {
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

        await routeToChannels(supabase, eventType, msg, device.ip_address);
      }

      // ── Smart Escalation: check if device has been down too long ──
      if (finalIsUp === false && downSince && !escalationSent) {
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
          await routeToChannels(supabase, "critical", escMsg, device.ip_address, ["noc", "management"]);

          // Mark escalation as sent
          await supabase.from("devices").update({ escalation_sent: true }).eq("id", device.id);
          escalationSent = true;
        }
      }

      // ── Direct-to-customer SMS on confirmed status change ──
      // (Separate from channel routing above — this notifies the customer
      // whose device it is, not the ops/NOC channels.)
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
            await sendDirect(supabase, "sms", smsNumber, smsMessage, isDown ? "sms_ip_down" : "sms_ip_up", device.ip_address);
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

      if (monitoredDevices.indexOf(device) < monitoredDevices.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    // ── IP-level uptime monitoring (ip_assignments) ──
    // Separate from the devices loop above: a single device can have multiple
    // monitored IPs (WAN, backup uplink, etc.) that need independent up/down
    // tracking. Only public IPs are probed — check-host.net can't reach
    // private LAN addresses, same constraint as the SNMP collector.
    const { data: ipRows, error: ipError } = await supabase
      .from("ip_assignments")
      .select("id, device_id, ip_address, ip_only, last_status, consecutive_failures, devices(name)")
      .eq("monitor_uptime", true)
      .eq("is_public", true);

    if (ipError) console.error("Failed to fetch ip_assignments:", ipError);

    const ipResults: any[] = [];

    for (const ip of ipRows || []) {
      const targetIp = ip.ip_only || ip.ip_address.split("/")[0];
      const deviceName = (ip as any).devices?.name || "Unknown device";
      const { reachable, latency_ms } = await probeHost(targetIp, [80, 443]);

      const prevStatus = ip.last_status;
      let newConsecutiveFailures = ip.consecutive_failures || 0;
      let newStatus = prevStatus;

      if (!reachable) {
        newConsecutiveFailures++;
        if (newConsecutiveFailures >= downConfirmCount) newStatus = "down";
        // Not yet confirmed down — leave last_status as-is, same as the devices loop.
      } else {
        newConsecutiveFailures = 0;
        newStatus = "up";
      }

      const statusChanged = newStatus !== prevStatus && (newStatus === "up" || newStatus === "down");

      await supabase.from("ip_assignments").update({
        last_status: newStatus,
        last_ping_at: new Date().toISOString(),
        last_ping_ms: reachable ? latency_ms : null,
        consecutive_failures: newConsecutiveFailures,
      }).eq("id", ip.id);

      if (statusChanged) {
        if (newStatus === "down") {
          await supabase.from("ip_downtime_events").insert({
            ip_assignment_id: ip.id,
            device_id: ip.device_id,
            down_at: new Date().toISOString(),
          });
        } else {
          const { data: openEvent } = await supabase
            .from("ip_downtime_events")
            .select("id, down_at")
            .eq("ip_assignment_id", ip.id)
            .is("recovered_at", null)
            .order("down_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (openEvent) {
            const durationMinutes = Math.round((Date.now() - new Date(openEvent.down_at).getTime()) / 60000);
            await supabase.from("ip_downtime_events").update({
              recovered_at: new Date().toISOString(),
              duration_minutes: durationMinutes,
            }).eq("id", openEvent.id);
          }
        }

        const emoji = newStatus === "down" ? "🔴" : "🟢";
        const msg = [
          `${emoji} *${escMd(deviceName)}* IP is now *${escMd(newStatus.toUpperCase())}*`,
          ``,
          `📍 IP: \`${escMd(targetIp)}\``,
          newStatus === "down"
            ? `⚠️ Failed ${escMd(String(downConfirmCount))} consecutive checks`
            : `⏱ Latency: ${escMd(String(latency_ms))}ms`,
        ].join("\n");

        await routeToChannels(supabase, newStatus === "down" ? "down" : "up", msg, targetIp);
      }

      ipResults.push({ ip: targetIp, device: deviceName, reachable, status: newStatus, status_changed: statusChanged });

      if (ipRows && ipRows.indexOf(ip) < ipRows.length - 1) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return new Response(
      JSON.stringify({ checked: results.length, results, ip_checked: ipResults.length, ip_results: ipResults }),
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
