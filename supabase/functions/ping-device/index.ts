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

    // Try TCP connect to RouterOS API port as a ping proxy
    let reachable = false;
    let latency_ms = 0;

    try {
      const conn = await Deno.connect({ hostname: ip_address, port: 8728 });
      latency_ms = Math.round(performance.now() - start);
      reachable = true;
      conn.close();
    } catch {
      // Try HTTP port 80 as fallback
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        await fetch(`http://${ip_address}/`, { signal: controller.signal, method: "HEAD" });
        latency_ms = Math.round(performance.now() - start);
        reachable = true;
        clearTimeout(timeout);
      } catch {
        latency_ms = Math.round(performance.now() - start);
        reachable = false;
      }
    }

    return new Response(
      JSON.stringify({ reachable, latency_ms, ip_address }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
