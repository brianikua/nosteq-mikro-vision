import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Try to reach a host by attempting TCP connections to common ports.
 * A host is "up" if ANY port responds (even with connection refused — 
 * that means the OS replied, so the host is reachable).
 */
async function probeHost(ip: string, timeoutMs = 4000): Promise<{ reachable: boolean; latency_ms: number }> {
  const ports = [443, 80, 22, 53, 8080, 8443];
  const start = performance.now();

  // Try all ports in parallel — first success wins
  const probes = ports.flatMap((port) => {
    // HTTPS probe
    const httpsProbe = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        await fetch(`https://${ip}:${port}/`, {
          signal: controller.signal,
          method: "HEAD",
          redirect: "manual",
        });
        clearTimeout(timer);
        return true;
      } catch (e) {
        const msg = e?.message || String(e);
        // Connection refused = host is up, port just closed
        // SSL/TLS errors = host is up, just not serving valid HTTPS
        if (
          msg.includes("onnection refused") ||
          msg.includes("certificate") ||
          msg.includes("SSL") ||
          msg.includes("tls") ||
          msg.includes("CERT") ||
          msg.includes("handshake") ||
          msg.includes("alert")
        ) {
          return true;
        }
        return false;
      }
    })();

    // HTTP probe
    const httpProbe = (async () => {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        await fetch(`http://${ip}:${port}/`, {
          signal: controller.signal,
          method: "HEAD",
          redirect: "manual",
        });
        clearTimeout(timer);
        return true;
      } catch (e) {
        const msg = e?.message || String(e);
        if (msg.includes("onnection refused")) {
          return true;
        }
        return false;
      }
    })();

    return [httpsProbe, httpProbe];
  });

  // Also try a DNS-style probe on port 53 via TCP with raw fetch
  // And a plain TCP connect via Deno.connect if available
  const tcpProbes = ports.map(async (port) => {
    try {
      const conn = await (Deno as any).connect({ hostname: ip, port, transport: "tcp" });
      conn.close();
      return true;
    } catch (e) {
      const msg = e?.message || String(e);
      // Connection refused = host responded (it's up!)
      if (msg.includes("onnection refused") || msg.includes("Connection refused")) {
        return true;
      }
      return false;
    }
  });

  const allProbes = [...probes, ...tcpProbes];

  // Race: resolve as soon as any probe returns true, or wait for all
  const result = await new Promise<boolean>((resolve) => {
    let pending = allProbes.length;
    let resolved = false;

    for (const probe of allProbes) {
      probe.then((up) => {
        if (up && !resolved) {
          resolved = true;
          resolve(true);
        }
        pending--;
        if (pending === 0 && !resolved) {
          resolve(false);
        }
      }).catch(() => {
        pending--;
        if (pending === 0 && !resolved) {
          resolve(false);
        }
      });
    }

    // Overall timeout
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(false);
      }
    }, timeoutMs + 500);
  });

  const latency_ms = Math.round(performance.now() - start);
  return { reachable: result, latency_ms };
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

    console.log(`Probing ${ip_address} with multi-port/protocol scan...`);
    const { reachable, latency_ms } = await probeHost(ip_address);
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
