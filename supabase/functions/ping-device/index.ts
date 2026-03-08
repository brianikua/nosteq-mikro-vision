import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Uses check-host.net free API to perform real ICMP pings from multiple locations.
 * Falls back to TCP probing if the external API fails.
 */
async function pingViaCheckHost(ip: string): Promise<{ reachable: boolean; latency_ms: number }> {
  try {
    // Step 1: Request a ping check
    const checkRes = await fetch(`https://check-host.net/check-ping?host=${ip}&max_nodes=3`, {
      headers: { "Accept": "application/json" },
    });

    if (!checkRes.ok) {
      console.log(`check-host.net returned ${checkRes.status}, falling back to TCP`);
      return tcpProbe(ip);
    }

    const checkData = await checkRes.json();
    const requestId = checkData.request_id;

    if (!requestId) {
      console.log("No request_id from check-host.net, falling back to TCP");
      return tcpProbe(ip);
    }

    // Step 2: Poll for results (wait a few seconds for ICMP results)
    await new Promise((r) => setTimeout(r, 4000));

    const resultRes = await fetch(`https://check-host.net/check-result/${requestId}`, {
      headers: { "Accept": "application/json" },
    });

    if (!resultRes.ok) {
      console.log(`check-host.net result returned ${resultRes.status}, falling back to TCP`);
      return tcpProbe(ip);
    }

    const resultData = await resultRes.json();
    console.log("check-host.net raw result:", JSON.stringify(resultData));

    // Parse results: each node returns array of [status, latency, ...] entries
    // status: "OK" means reachable, latency is in seconds
    let totalLatency = 0;
    let successCount = 0;
    let totalNodes = 0;

    for (const [_node, nodeResult] of Object.entries(resultData)) {
      if (!Array.isArray(nodeResult) || nodeResult.length === 0) continue;
      totalNodes++;

      // Results are double-nested: [[["OK", latency, ip], ["OK", latency], ...]]
      const pings = Array.isArray(nodeResult[0]) ? nodeResult[0] : nodeResult;

      for (const ping of pings as any[]) {
        if (Array.isArray(ping) && ping[0] === "OK") {
          successCount++;
          totalLatency += ping[1] * 1000; // Convert seconds to ms
        }
      }
    }

    if (totalNodes === 0) {
      console.log("No results from any node yet, falling back to TCP");
      return tcpProbe(ip);
    }

    const reachable = successCount > 0;
    const latency_ms = successCount > 0 ? Math.round(totalLatency / successCount) : 0;

    console.log(`ICMP result: ${successCount} successful pings from ${totalNodes} nodes, avg latency: ${latency_ms}ms`);
    return { reachable, latency_ms };
  } catch (e) {
    console.error("check-host.net error:", e);
    return tcpProbe(ip);
  }
}

/**
 * Fallback: TCP probe on common ports
 */
async function tcpProbe(ip: string): Promise<{ reachable: boolean; latency_ms: number }> {
  const ports = [443, 80, 22, 53, 8080];
  const start = performance.now();
  const timeoutMs = 3000;

  const probes = ports.map(async (port) => {
    try {
      const conn = await (Deno as any).connect({ hostname: ip, port, transport: "tcp" });
      conn.close();
      return true;
    } catch (e) {
      const msg = e?.message || String(e);
      if (msg.includes("onnection refused")) return true; // host is up
      return false;
    }
  });

  // Also try HTTP/HTTPS fetch
  const httpProbes = [80, 443].map(async (port) => {
    try {
      const proto = port === 443 ? "https" : "http";
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      await fetch(`${proto}://${ip}:${port}/`, {
        signal: controller.signal,
        method: "HEAD",
        redirect: "manual",
      });
      clearTimeout(timer);
      return true;
    } catch (e) {
      const msg = e?.message || String(e);
      if (
        msg.includes("onnection refused") ||
        msg.includes("certificate") ||
        msg.includes("SSL") ||
        msg.includes("tls")
      ) {
        return true;
      }
      return false;
    }
  });

  const allProbes = [...probes, ...httpProbes];
  const results = await Promise.allSettled(allProbes);
  const reachable = results.some((r) => r.status === "fulfilled" && r.value === true);
  const latency_ms = Math.round(performance.now() - start);

  return { reachable, latency_ms };
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

    console.log(`Pinging ${ip_address} via check-host.net ICMP + TCP fallback...`);
    const { reachable, latency_ms } = await pingViaCheckHost(ip_address);
    console.log(`Result for ${ip_address}: reachable=${reachable}, latency=${latency_ms}ms`);

    return new Response(
      JSON.stringify({ reachable, latency_ms, ip_address }),
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
