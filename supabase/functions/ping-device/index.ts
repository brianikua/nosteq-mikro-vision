import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
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
 * Tries ping first, falls back to TCP port check.
 */
async function probeHost(ip: string): Promise<{ reachable: boolean; latency_ms: number; method: string }> {
  // Launch both ICMP and TCP checks in parallel
  const [pingReq, tcpReq] = await Promise.all([
    fetch(`https://check-host.net/check-ping?host=${ip}&max_nodes=3`, {
      headers: { Accept: "application/json" },
    }).catch(() => null),
    fetch(`https://check-host.net/check-tcp?host=${ip}:80&max_nodes=3`, {
      headers: { Accept: "application/json" },
    }).catch(() => null),
  ]);

  const pingId = pingReq?.ok ? (await pingReq.json()).request_id : null;
  const tcpId = tcpReq?.ok ? (await tcpReq.json()).request_id : null;

  console.log(`Check IDs - ping: ${pingId}, tcp: ${tcpId}`);

  // Poll both in parallel
  const [pingData, tcpData] = await Promise.all([
    pingId ? pollCheckHost(pingId) : Promise.resolve({}),
    tcpId ? pollCheckHost(tcpId) : Promise.resolve({}),
  ]);

  console.log("Ping results:", JSON.stringify(pingData));
  console.log("TCP results:", JSON.stringify(tcpData));

  // Parse ICMP ping results
  let pingSuccess = 0;
  let pingTotal = 0;
  let totalLatency = 0;

  for (const [, nodeResult] of Object.entries(pingData)) {
    if (!Array.isArray(nodeResult) || nodeResult.length === 0) continue;
    const pings = Array.isArray(nodeResult[0]) ? nodeResult[0] : nodeResult;
    for (const ping of pings as any[]) {
      pingTotal++;
      if (Array.isArray(ping) && ping[0] === "OK") {
        pingSuccess++;
        totalLatency += ping[1] * 1000;
      }
    }
  }

  if (pingSuccess > 0) {
    return {
      reachable: true,
      latency_ms: Math.round(totalLatency / pingSuccess),
      method: "icmp",
    };
  }

  // Parse TCP results: each node returns {"address":"ip","time":0.123} or {"error":"..."}
  for (const [, nodeResult] of Object.entries(tcpData)) {
    if (!Array.isArray(nodeResult) || nodeResult.length === 0) continue;
    const result = nodeResult[0];
    if (result && typeof result === "object" && result.time !== undefined && !result.error) {
      return {
        reachable: true,
        latency_ms: Math.round(result.time * 1000),
        method: "tcp",
      };
    }
  }

  // Also try TCP on port 443 and 8291 (common MikroTik/Winbox port)
  try {
    const extraTcp = await fetch(`https://check-host.net/check-tcp?host=${ip}:443&max_nodes=2`, {
      headers: { Accept: "application/json" },
    });
    if (extraTcp.ok) {
      const extraData = await extraTcp.json();
      if (extraData.request_id) {
        const extraResults = await pollCheckHost(extraData.request_id, 2);
        console.log("TCP 443 results:", JSON.stringify(extraResults));
        for (const [, nodeResult] of Object.entries(extraResults)) {
          if (!Array.isArray(nodeResult) || nodeResult.length === 0) continue;
          const result = nodeResult[0];
          if (result && typeof result === "object" && result.time !== undefined && !result.error) {
            return {
              reachable: true,
              latency_ms: Math.round(result.time * 1000),
              method: "tcp-443",
            };
          }
        }
      }
    }
  } catch {}

  return { reachable: false, latency_ms: 0, method: "none" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Authentication ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    const { data: roles } = await authClient.from("user_roles").select("role").eq("user_id", userId);
    const isAuthorized = roles?.some(
      (r: any) => r.role === "admin" || r.role === "superadmin" || r.role === "viewer"
    );
    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ error: "Forbidden" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Ping logic ──
    const { ip_address } = await req.json();

    if (!ip_address || !/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ip_address)) {
      return new Response(
        JSON.stringify({ error: "Valid ip_address is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Probing ${ip_address} via ICMP + TCP checks...`);
    const { reachable, latency_ms, method } = await probeHost(ip_address);
    console.log(`Result for ${ip_address}: reachable=${reachable}, latency=${latency_ms}ms, method=${method}`);

    return new Response(
      JSON.stringify({ reachable, latency_ms, ip_address, method }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Ping error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
