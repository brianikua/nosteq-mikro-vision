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
async function probeHost(ip: string, ports: number[] = [80, 443]): Promise<{ reachable: boolean; latency_ms: number; method: string; open_ports: number[] }> {
  const open_ports: number[] = [];

  // Launch ICMP ping
  const pingReq = await fetch(`https://check-host.net/check-ping?host=${ip}&max_nodes=3`, {
    headers: { Accept: "application/json" },
  }).catch(() => null);

  const pingId = pingReq?.ok ? (await pingReq.json()).request_id : null;

  // Launch TCP checks for all specified ports in parallel (max 3 to avoid rate limits)
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

  console.log(`Check IDs - ping: ${pingId}, tcp ports: ${tcpChecks.map(t => `${t.port}:${t.requestId}`).join(", ")}`);

  // Poll all in parallel
  const [pingData, ...tcpResults] = await Promise.all([
    pingId ? pollCheckHost(pingId) : Promise.resolve({}),
    ...tcpChecks.map(async (tc) => {
      if (!tc.requestId) return { port: tc.port, data: {} };
      const data = await pollCheckHost(tc.requestId);
      return { port: tc.port, data };
    }),
  ]);

  console.log("Ping results:", JSON.stringify(pingData));

  // Parse ICMP results
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

  // Parse TCP results
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
        break; // One successful node per port is enough
      }
    }
    console.log(`TCP ${port} results:`, JSON.stringify(data));
  }

  // Return best result
  if (pingSuccess > 0) {
    return {
      reachable: true,
      latency_ms: Math.round(totalLatency / pingSuccess),
      method: "icmp",
      open_ports: [...new Set(open_ports)],
    };
  }

  if (open_ports.length > 0) {
    return {
      reachable: true,
      latency_ms: Math.round(bestTcpLatency),
      method: `tcp-${open_ports[0]}`,
      open_ports: [...new Set(open_ports)],
    };
  }

  return { reachable: false, latency_ms: 0, method: "none", open_ports: [] };
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
