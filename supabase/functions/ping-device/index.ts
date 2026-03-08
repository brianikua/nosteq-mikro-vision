import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ip_address } = await req.json();

    if (!ip_address) {
      return new Response(
        JSON.stringify({ error: "ip_address is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const start = performance.now();
    let reachable = false;
    let latency_ms = 0;

    // Try HTTP HEAD request with short timeout (edge functions can't do raw TCP)
    const ports = [80, 443, 8291];
    
    for (const port of ports) {
      if (reachable) break;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        const protocol = port === 443 ? "https" : "http";
        await fetch(`${protocol}://${ip_address}:${port}/`, {
          signal: controller.signal,
          method: "HEAD",
          // @ts-ignore - Deno supports this
          redirect: "manual",
        });
        latency_ms = Math.round(performance.now() - start);
        reachable = true;
        clearTimeout(timeout);
      } catch (e) {
        // Connection refused also means host is reachable
        if (e.message && (e.message.includes("Connection refused") || e.message.includes("connection refused"))) {
          latency_ms = Math.round(performance.now() - start);
          reachable = true;
        }
      }
    }

    if (!reachable) {
      latency_ms = Math.round(performance.now() - start);
    }

    console.log(`Ping ${ip_address}: reachable=${reachable}, latency=${latency_ms}ms`);

    return new Response(
      JSON.stringify({ reachable, latency_ms, ip_address }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Ping error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
