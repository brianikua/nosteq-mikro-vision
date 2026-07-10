// Shared by cron-monitor and check-ip-reputation: both used to carry their
// own copy-pasted sendTelegram/sendSmsWebhook/sendToChannels implementations,
// each only reaching Telegram, and check-ip-reputation's copy didn't even
// use notification_channels at all (it alerted a single hardcoded chat_id).
// Everything now routes through the single send-notification edge function,
// which fans out to whichever medium (Telegram/SMS/email) each active
// channel is configured for.

export function escMd(text: string): string {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, "\\$1");
}

// Security audit HIGH-1: sms_config.webhook_url (and email_config.smtp_host)
// are admin-configured DB values that get fetched/connected to directly. If
// either were ever pointed at an internal/metadata address, the edge function
// — which runs with SUPABASE_SERVICE_ROLE_KEY in its own environment — would
// reach it server-side. Same private-IP guard ping-device already used for
// its own IP input, reused here as the one place both checks now happen.
const PRIVATE_HOST_RE = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|0\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.|198\.1[89]\.|224\.|24[0-9]\.|25[0-5]\.)/;

export function isSafeWebhookUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.hostname === "localhost" || u.hostname === "0.0.0.0") return false;
    if (PRIVATE_HOST_RE.test(u.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function isSafeSmtpHost(host: string | null | undefined): boolean {
  if (!host) return false;
  if (host === "localhost" || host === "0.0.0.0") return false;
  return !PRIVATE_HOST_RE.test(host);
}

/** Fan out an alert to every active notification_channels row that matches event_type. */
export async function routeToChannels(
  supabase: any,
  eventType: string,
  message: string,
  ipAddress: string,
  channelTypes?: string[]
): Promise<void> {
  await supabase.functions.invoke("send-notification", {
    body: { message, route_to_channels: true, event_type: eventType, ip_address: ipAddress, channel_types: channelTypes },
  });
}

/** Direct send to one destination (e.g. customer SMS), bypassing channel routing. */
export async function sendDirect(
  supabase: any,
  medium: string,
  destination: string,
  message: string,
  eventType: string,
  ipAddress: string
): Promise<void> {
  await supabase.functions.invoke("send-notification", {
    body: { message, medium, destination, event_type: eventType, ip_address: ipAddress },
  });
}
