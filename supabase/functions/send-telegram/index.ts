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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { message, chat_id, event_type, ip_address, route_to_channels } = body;

    const supabase = createClient(supabaseUrl, serviceKey);

    // Get bot token from DB, fallback to env
    const { data: tgConfig } = await supabase
      .from("telegram_config")
      .select("bot_token, enabled")
      .limit(1)
      .maybeSingle();

    const botToken = tgConfig?.bot_token || Deno.env.get("TELEGRAM_BOT_TOKEN");
    if (!botToken) {
      return new Response(JSON.stringify({ error: "Telegram bot token not configured." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tgConfig && tgConfig.enabled === false) {
      return new Response(JSON.stringify({ success: false, error: "Telegram notifications are disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Helper to send to a single chat_id
    const sendToChat = async (targetChatId: string) => {
      const telegramRes = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: targetChatId, text: message, parse_mode: "MarkdownV2" }),
      });
      return await telegramRes.json();
    };

    // If route_to_channels is true, send to all matching active channels
    if (route_to_channels && event_type) {
      const { data: channels } = await supabase
        .from("notification_channels")
        .select("*")
        .eq("is_active", true);

      if (!channels || channels.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "No active notification channels" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Map event_type to alert_types key
      const alertKey = event_type;
      const now = new Date();
      const eatHour = (now.getUTCHours() + 3) % 24;

      const results: { channel: string; success: boolean; error?: string }[] = [];

      for (const ch of channels) {
        const alertTypes = Array.isArray(ch.alert_types) ? ch.alert_types : JSON.parse(ch.alert_types || "[]");
        
        // Check if channel subscribes to this event type
        if (!alertTypes.includes(alertKey)) continue;

        // Check mute schedule
        if (ch.mute_schedule === "business_hours" && (eatHour < 8 || eatHour >= 18)) continue;
        if (ch.mute_schedule === "custom" && ch.mute_start && ch.mute_end) {
          const startH = parseInt(ch.mute_start.split(":")[0]);
          const endH = parseInt(ch.mute_end.split(":")[0]);
          if (startH <= eatHour && eatHour < endH) continue;
        }

        const result = await sendToChat(ch.chat_id);
        results.push({ channel: ch.name, success: result.ok === true, error: result.description });

        // Log per channel
        await supabase.from("notification_log").insert({
          event_type: event_type || "routed",
          ip_address: ip_address || "N/A",
          message: `[${ch.name}] ${message.substring(0, 200)}`,
          success: result.ok === true,
          error_message: result.ok ? null : JSON.stringify(result),
        });
      }

      // Escalation: if event is "critical", also send to NOC and Management channels even if not subscribed
      if (alertKey === "critical") {
        const escalationChannels = channels.filter(
          (c: any) => ["noc", "management"].includes(c.channel_type) && !results.some(r => r.channel === c.name)
        );
        for (const ch of escalationChannels) {
          const result = await sendToChat(ch.chat_id);
          results.push({ channel: ch.name, success: result.ok === true, error: result.description });
        }
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Single chat_id mode (test message or direct send)
    if (!message || !chat_id) {
      return new Response(JSON.stringify({ error: "message and chat_id are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const telegramData = await sendToChat(chat_id);
    const success = telegramData.ok === true;

    await supabase.from("notification_log").insert({
      event_type: event_type || "test",
      ip_address: ip_address || "N/A",
      message,
      success,
      error_message: success ? null : JSON.stringify(telegramData),
    });

    if (!success) {
      return new Response(JSON.stringify({ success: false, error: telegramData.description || "Telegram API error" }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-telegram error:", error);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
