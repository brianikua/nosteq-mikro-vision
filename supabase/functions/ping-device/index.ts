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

    // Use a single HTTP request with a 3 second timeout
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(`http://${ip_address}/`, {
        signal: controller.signal,
        method: "GET",
        redirect: "manual",
      });
      latency_ms = Math.round(performance.now() - start);
      reachable = true;
      clearTimeout(timeout);
      console.log(`Ping ${ip_address}: HTTP status=${response.status}, latency=${latency_ms}ms`);
    } catch (e) {
      latency_ms = Math.round(performance.now() - start);
      const msg = e?.message || String(e);
      console.log(`Ping ${ip_address}: error="${msg}", latency=${latency_ms}ms`);
      // "Connection refused" means host is up but port closed - still reachable
      if (msg.includes("onnection refused")) {
        reachable = true;
      }
    }

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
