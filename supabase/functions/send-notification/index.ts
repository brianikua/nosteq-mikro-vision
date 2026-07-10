import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";
import { isSafeWebhookUrl, isSafeSmtpHost } from "../_shared/notify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type SendResult = { ok: boolean; detail?: string };

function stripMarkdown(text: string): string {
  // escMd()-style MarkdownV2 escaping is Telegram-specific; SMS/email shouldn't carry backslash-escapes.
  return text.replace(/\\([_*\[\]()~`>#+\-=|{}.!])/g, "$1");
}

async function sendTelegramMessage(botToken: string, chatId: string, message: string): Promise<SendResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: "MarkdownV2" }),
    });
    const data = await res.json();
    return { ok: data.ok === true, detail: data.ok ? undefined : JSON.stringify(data).slice(0, 300) };
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

// Techra SMS gateway — same integration send-sms/index.ts already uses; kept
// as the one canonical SMS sender instead of the generic webhook format that
// used to be duplicated (and drifted) inside cron-monitor/check-ip-reputation.
async function sendSmsMessage(smsConfig: any, phone: string, message: string): Promise<SendResult> {
  try {
    if (!isSafeWebhookUrl(smsConfig?.webhook_url)) return { ok: false, detail: "SMS gateway not configured or webhook URL not allowed" };
    const params = new URLSearchParams({
      userid: smsConfig.sms_user_id || "",
      senderid: smsConfig.sms_sender_id || "",
      apiKey: smsConfig.techra_api_key || "",
      mobile: phone,
      msg: message,
    });
    const cleanUrl = String(smsConfig.webhook_url).replace(/\/+$/, "");
    const res = await fetch(cleanUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    const text = await res.text().catch(() => "");
    return { ok: res.ok, detail: res.ok ? undefined : text.slice(0, 300) };
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

async function sendEmailMessage(emailConfig: any, to: string, subject: string, message: string): Promise<SendResult> {
  if (!isSafeSmtpHost(emailConfig?.smtp_host)) return { ok: false, detail: "Email (SMTP) not configured or host not allowed" };
  try {
    const client = new SMTPClient({
      connection: {
        hostname: emailConfig.smtp_host,
        port: emailConfig.smtp_port || 587,
        tls: (emailConfig.smtp_port || 587) === 465,
        auth: { username: emailConfig.smtp_username, password: emailConfig.smtp_password },
      },
    });
    await client.send({
      from: emailConfig.from_address,
      to,
      subject,
      content: message,
    });
    await client.close();
    return { ok: true };
  } catch (e) {
    return { ok: false, detail: String(e) };
  }
}

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
    const token = authHeader.replace("Bearer ", "");

    // Accept the service-role key (genuinely secret — only other edge
    // functions have it, used for cron-monitor/check-ip-reputation calling
    // in server-to-server) or a real authenticated user JWT+role. Never the
    // anon key alone — that's public, shipped in every browser bundle.
    const isServiceCall = token === serviceKey;
    if (!isServiceCall) {
      const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const userId = claimsData.claims.sub;
      const { data: roles } = await authClient.from("user_roles").select("role").eq("user_id", userId);
      if (!roles?.some((r: any) => ["admin", "superadmin", "viewer"].includes(r.role))) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    const body = await req.json().catch(() => ({}));
    const { message, event_type, ip_address, channel_types } = body;
    if (!message) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const dispatch = async (medium: string, destination: string, msg: string): Promise<SendResult> => {
      if (medium === "telegram") {
        if (!botToken) return { ok: false, detail: "TELEGRAM_BOT_TOKEN not configured" };
        return sendTelegramMessage(botToken, destination, msg);
      }
      if (medium === "sms") {
        const { data: smsConfig } = await supabase.from("sms_config").select("*").limit(1).maybeSingle();
        return sendSmsMessage(smsConfig, destination, stripMarkdown(msg));
      }
      if (medium === "email") {
        const { data: emailConfig } = await supabase.from("email_config").select("*").limit(1).maybeSingle();
        return sendEmailMessage(emailConfig, destination, `Nosteq Alert — ${event_type || "notification"}`, stripMarkdown(msg));
      }
      return { ok: false, detail: `Unknown medium: ${medium}` };
    };

    // ── Mode A: direct single-destination send ──
    // Legacy shape { message, chat_id } is treated as Telegram (backward
    // compatible with the old send-telegram callers); new callers pass
    // { medium, destination } to target any of the three media directly.
    if (body.chat_id || (body.medium && body.destination)) {
      const medium = body.medium || "telegram";
      const destination = body.destination || body.chat_id;
      const result = await dispatch(medium, destination, message);

      await supabase.from("notification_log").insert({
        event_type: event_type || "test",
        ip_address: ip_address || "N/A",
        message,
        success: result.ok,
        error_message: result.ok ? null : result.detail || "Send failed",
      });

      return new Response(JSON.stringify({ success: result.ok, error: result.ok ? undefined : result.detail }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Mode B: fan out to every active notification_channels row that
    // matches, regardless of medium — this is what makes "choose Telegram,
    // SMS, or email" actually work: each channel just declares its medium. ──
    if (body.route_to_channels && event_type) {
      const { data: channels } = await supabase.from("notification_channels").select("*").eq("is_active", true);
      if (!channels || channels.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "No active notification channels" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const now = new Date();
      const eatHour = (now.getUTCHours() + 3) % 24; // EAT = UTC+3

      const matches = (ch: any) => {
        const alertTypes = Array.isArray(ch.alert_types) ? ch.alert_types : JSON.parse(ch.alert_types || "[]");
        if (!alertTypes.includes(event_type) && !alertTypes.includes("critical")) return false;
        if (Array.isArray(channel_types) && channel_types.length > 0 && !channel_types.includes(ch.channel_type)) return false;
        if (ch.mute_schedule === "business_hours" && (eatHour < 8 || eatHour >= 18)) return false;
        if (ch.mute_schedule === "custom" && ch.mute_start && ch.mute_end) {
          const startH = parseInt(ch.mute_start.split(":")[0]);
          const endH = parseInt(ch.mute_end.split(":")[0]);
          if (startH <= eatHour && eatHour < endH) return false;
        }
        return true;
      };

      const results: { channel: string; medium: string; success: boolean; error?: string }[] = [];
      for (const ch of channels.filter(matches)) {
        const result = await dispatch(ch.medium || "telegram", ch.destination || ch.chat_id, message);
        results.push({ channel: ch.name, medium: ch.medium || "telegram", success: result.ok, error: result.detail });
        await supabase.from("notification_log").insert({
          event_type,
          ip_address: ip_address || "N/A",
          message: `[${ch.name}] ${message.substring(0, 200)}`,
          success: result.ok,
          error_message: result.ok ? null : result.detail || null,
        });
      }

      // Escalation: "critical" events also reach NOC/management channels even if not explicitly subscribed.
      if (event_type === "critical") {
        const already = new Set(results.map((r) => r.channel));
        for (const ch of channels.filter((c: any) => ["noc", "management"].includes(c.channel_type) && !already.has(c.name))) {
          const result = await dispatch(ch.medium || "telegram", ch.destination || ch.chat_id, message);
          results.push({ channel: ch.name, medium: ch.medium || "telegram", success: result.ok, error: result.detail });
        }
      }

      return new Response(JSON.stringify({ success: true, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      error: "Specify { chat_id } or { medium, destination } for a direct send, or { route_to_channels: true, event_type } to fan out to channels.",
    }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("send-notification error:", error);
    return new Response(JSON.stringify({ error: "An internal error occurred" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
