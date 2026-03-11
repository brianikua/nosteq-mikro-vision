import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claimsData.claims.sub;
    const { data: roles } = await authClient.from("user_roles").select("role").eq("user_id", userId);
    const isAuthorized = roles?.some((r: any) => ["admin", "superadmin", "viewer"].includes(r.role));
    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { message, phone_number } = await req.json();

    if (!message || !phone_number) {
      return new Response(JSON.stringify({ error: "message and phone_number are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch SMS config
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: smsConfig } = await adminClient
      .from("sms_config")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (!smsConfig?.webhook_url) {
      return new Response(JSON.stringify({ error: "SMS gateway not configured" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const gatewayUrl = smsConfig.webhook_url;
    const userId2 = smsConfig.sms_user_id || "";
    const senderId = smsConfig.sms_sender_id || "";
    const apiKey = smsConfig.techra_api_key || "";

    // Send via Techra SMS gateway - use GET with query params
    const url = new URL(gatewayUrl);
    url.searchParams.set("userid", userId2);
    url.searchParams.set("senderid", senderId);
    url.searchParams.set("apiKey", apiKey);
    url.searchParams.set("mobile", phone_number);
    url.searchParams.set("msg", message);

    console.log(`SMS gateway request URL: ${url.toString()}`);

    const res = await fetch(url.toString(), { method: "GET" });

    const success = res.ok;
    const responseText = await res.text().catch(() => "");

    console.log(`SMS gateway response: ${res.status} - ${responseText.substring(0, 200)}`);

    // Log notification
    await adminClient.from("notification_log").insert({
      event_type: "sms_test",
      ip_address: "N/A",
      message,
      success,
      error_message: success ? null : responseText.substring(0, 500),
    });

    return new Response(
      JSON.stringify({ success, status: res.status, response: responseText.substring(0, 500) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Send SMS error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});