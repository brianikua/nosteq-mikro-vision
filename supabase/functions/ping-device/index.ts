import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  console.log("Handler called, method:", req.method);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ip_address } = await req.json();
    console.log("Pinging IP:", ip_address);

    if (!ip_address) {
      return new Response(
        JSON.stringify({ error: "ip_address is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const start = performance.now();
    let reachable = false;
    let latency_ms = 0;

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
      console.log(`HTTP response status: ${response.status}`);
    } catch (e) {
      latency_ms = Math.round(performance.now() - start);
      const msg = e?.message || String(e);
      console.log(`Fetch error: ${msg}`);
      if (msg.includes("onnection refused")) {
        reachable = true;
      }
    }

    const result = { reachable, latency_ms, ip_address };
    console.log("Result:", JSON.stringify(result));

    return new Response(
      JSON.stringify(result),
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
