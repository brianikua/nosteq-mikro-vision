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
    // Authenticate
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
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

    // Check admin/superadmin role
    const { data: roles } = await authClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    const isAuthorized = roles?.some(
      (r: any) => r.role === "admin" || r.role === "superadmin"
    );
    if (!isAuthorized) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { name, ip_address, username, password, port, model, routeros_version } = body;

      // Insert device with placeholder password first
      const { data: device, error: insertError } = await supabase
        .from("devices")
        .insert({
          name,
          ip_address,
          username,
          password: "***pending_encryption***",
          port: port || 8728,
          model: model || null,
          routeros_version: routeros_version || null,
        })
        .select("id")
        .single();

      if (insertError) throw insertError;

      // Store password in vault
      const { error: vaultError } = await supabase.rpc("store_device_password", {
        p_device_id: device.id,
        p_password: password,
      });

      if (vaultError) throw vaultError;

      return new Response(
        JSON.stringify({ success: true, device_id: device.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "update") {
      const { device_id, name, ip_address, username, password, port } = body;

      // Update non-password fields
      const updateData: Record<string, unknown> = {};
      if (name !== undefined) updateData.name = name;
      if (ip_address !== undefined) updateData.ip_address = ip_address;
      if (username !== undefined) updateData.username = username;
      if (port !== undefined) updateData.port = port;

      if (Object.keys(updateData).length > 0) {
        const { error: updateError } = await supabase
          .from("devices")
          .update(updateData)
          .eq("id", device_id);
        if (updateError) throw updateError;
      }

      // Update password in vault if provided
      if (password) {
        const { error: vaultError } = await supabase.rpc("store_device_password", {
          p_device_id: device_id,
          p_password: password,
        });
        if (vaultError) throw vaultError;
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("manage-device error:", error);
    return new Response(
      JSON.stringify({ error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
