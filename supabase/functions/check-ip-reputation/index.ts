import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escMd, routeToChannels, sendDirect } from "../_shared/notify.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BlacklistResult {
  provider: string;
  listed: boolean;
  category: string | null;
  confidence: number;
  raw: unknown;
  check_type: string;
}

// ── DNS-based RBL check (no API keys needed) ──
async function checkDNSBL(ip: string, rblHost: string, providerName: string): Promise<BlacklistResult> {
  try {
    const reversed = ip.split(".").reverse().join(".");
    const lookupHost = `${reversed}.${rblHost}`;
    const res = await fetch(`https://dns.google/resolve?name=${lookupHost}&type=A`);
    const data = await res.json();
    const listed = data.Status === 0 && data.Answer && data.Answer.length > 0;
    
    let category: string | null = listed ? "other" : null;
    if (listed && data.Answer?.[0]?.data) {
      const returnCode = data.Answer[0].data;
      if (returnCode.includes("127.0.0.2")) category = "spam";
      else if (returnCode.includes("127.0.0.4")) category = "malware";
      else if (returnCode.includes("127.0.0.9")) category = "botnet";
      else if (returnCode.includes("127.0.0.10")) category = "ddos";
    }
    
    return { provider: providerName, listed: !!listed, category, confidence: listed ? 80 : 0, raw: data, check_type: "dnsbl" };
  } catch (e) {
    console.error(`${providerName} error:`, e);
    return { provider: providerName, listed: false, category: null, confidence: 0, raw: { error: String(e) }, check_type: "dnsbl" };
  }
}

// ── AbuseIPDB check ──
async function checkAbuseIPDB(ip: string, apiKey: string): Promise<BlacklistResult> {
  try {
    const res = await fetch(`https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90&verbose`, {
      headers: { Key: apiKey, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`AbuseIPDB HTTP ${res.status}`);
    const data = await res.json();
    const d = data.data;
    const listed = d.abuseConfidenceScore > 25;
    let category: string | null = null;
    if (d.usageType?.toLowerCase().includes("spam")) category = "spam";
    else if (d.totalReports > 0) category = "other";
    return { provider: "AbuseIPDB", listed, category, confidence: d.abuseConfidenceScore, raw: d, check_type: "api" };
  } catch (e) {
    console.error("AbuseIPDB error:", e);
    return { provider: "AbuseIPDB", listed: false, category: null, confidence: 0, raw: { error: String(e) }, check_type: "api" };
  }
}

// ── VirusTotal check ──
async function checkVirusTotal(ip: string, apiKey: string): Promise<BlacklistResult> {
  try {
    const res = await fetch(`https://www.virustotal.com/api/v3/ip_addresses/${encodeURIComponent(ip)}`, {
      headers: { "x-apikey": apiKey, Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`VirusTotal HTTP ${res.status}`);
    const data = await res.json();
    const stats = data.data?.attributes?.last_analysis_stats || {};
    const malicious = stats.malicious || 0;
    const suspicious = stats.suspicious || 0;
    const total = (stats.harmless || 0) + (stats.undetected || 0) + malicious + suspicious;
    const listed = malicious + suspicious > 0;
    const confidence = total > 0 ? Math.round(((malicious + suspicious) / total) * 100) : 0;
    let category: string | null = null;
    if (malicious > 3) category = "malware";
    else if (malicious > 0 || suspicious > 0) category = "other";
    return { provider: "VirusTotal", listed, category, confidence, raw: { malicious, suspicious, harmless: stats.harmless, undetected: stats.undetected, reputation: data.data?.attributes?.reputation }, check_type: "api" };
  } catch (e) {
    console.error("VirusTotal error:", e);
    return { provider: "VirusTotal", listed: false, category: null, confidence: 0, raw: { error: String(e) }, check_type: "api" };
  }
}

// ── IPQualityScore check ──
async function checkIPQualityScore(ip: string, apiKey: string): Promise<BlacklistResult> {
  try {
    const res = await fetch(`https://ipqualityscore.com/api/json/ip/${apiKey}/${encodeURIComponent(ip)}?strictness=1&allow_public_access_points=true`);
    if (!res.ok) throw new Error(`IPQS HTTP ${res.status}`);
    const d = await res.json();
    const fraudScore = d.fraud_score || 0;
    const listed = fraudScore > 75 || d.proxy || d.vpn || d.tor || d.bot_status;
    let category: string | null = null;
    if (d.bot_status) category = "botnet";
    else if (d.tor) category = "other";
    else if (fraudScore > 85) category = "brute_force";
    else if (listed) category = "other";
    return { provider: "IPQualityScore", listed: !!listed, category, confidence: fraudScore, raw: { fraud_score: fraudScore, proxy: d.proxy, vpn: d.vpn, tor: d.tor, bot: d.bot_status, isp: d.ISP, country: d.country_code }, check_type: "api" };
  } catch (e) {
    console.error("IPQS error:", e);
    return { provider: "IPQualityScore", listed: false, category: null, confidence: 0, raw: { error: String(e) }, check_type: "api" };
  }
}

// ── ip-api.com geo & proxy check ──
async function checkIPApi(ip: string): Promise<BlacklistResult> {
  try {
    const res = await fetch(`https://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,isp,org,as,proxy,hosting,mobile`);
    if (!res.ok) throw new Error(`ip-api HTTP ${res.status}`);
    const d = await res.json();
    const listed = d.proxy === true || d.hosting === true;
    return { provider: "IP-API (Proxy/Hosting)", listed, category: listed ? "other" : null, confidence: listed ? 60 : 0, raw: d, check_type: "web" };
  } catch (e) {
    console.error("ip-api error:", e);
    return { provider: "IP-API (Proxy/Hosting)", listed: false, category: null, confidence: 0, raw: { error: String(e) }, check_type: "web" };
  }
}

async function checkBlocklistDe(ip: string): Promise<BlacklistResult> {
  try {
    const res = await fetch(`https://api.blocklist.de/api.php?ip=${encodeURIComponent(ip)}&start=1`);
    const text = await res.text();
    const listed = text.trim() !== "" && !text.includes("not found") && text.includes("attacks");
    return { provider: "Blocklist.de", listed, category: listed ? "brute_force" : null, confidence: listed ? 75 : 0, raw: { response: text.substring(0, 500) }, check_type: "web" };
  } catch (e) {
    console.error("Blocklist.de error:", e);
    return { provider: "Blocklist.de", listed: false, category: null, confidence: 0, raw: { error: String(e) }, check_type: "web" };
  }
}

const DNSBL_PROVIDERS = [
  { host: "zen.spamhaus.org", name: "Spamhaus ZEN" },
  { host: "sbl.spamhaus.org", name: "Spamhaus SBL" },
  { host: "xbl.spamhaus.org", name: "Spamhaus XBL" },
  { host: "pbl.spamhaus.org", name: "Spamhaus PBL" },
  { host: "b.barracudacentral.org", name: "Barracuda" },
  { host: "bl.spamcop.net", name: "SpamCop" },
  { host: "dnsbl.sorbs.net", name: "SORBS Combined" },
  { host: "spam.dnsbl.sorbs.net", name: "SORBS Spam" },
  { host: "new.spam.dnsbl.sorbs.net", name: "SORBS New Spam" },
  { host: "recent.spam.dnsbl.sorbs.net", name: "SORBS Recent Spam" },
  { host: "dnsbl-1.uceprotect.net", name: "UCEProtect L1" },
  { host: "dnsbl-2.uceprotect.net", name: "UCEProtect L2" },
  { host: "dnsbl-3.uceprotect.net", name: "UCEProtect L3" },
  { host: "cbl.abuseat.org", name: "CBL (Abuseat)" },
  { host: "psbl.surriel.com", name: "PSBL" },
  { host: "dnsbl.dronebl.org", name: "DroneBL" },
  { host: "db.wpbl.info", name: "WPBL" },
  { host: "bl.mailspike.net", name: "Mailspike" },
  { host: "ix.dnsbl.manitu.net", name: "NiX Spam" },
  { host: "truncate.gbudb.net", name: "TruncateGBUDB" },
  { host: "spam.abuse.ch", name: "abuse.ch Spam" },
  { host: "rbl.interserver.net", name: "InterServer" },
  { host: "bl.0spam.org", name: "0spam" },
  { host: "all.s5h.net", name: "s5h.net" },
  { host: "dnsbl.inps.de", name: "INPS" },
  { host: "bl.blocklist.de", name: "Blocklist.de DNSBL" },
  { host: "dnsrbl.org", name: "DNSRBL" },
  { host: "hostkarma.junkemailfilter.com", name: "HostKarma" },
  { host: "ubl.unsubscore.com", name: "UBL Unsubscore" },
];

const IP_V4_REGEX = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

async function runAllChecks(
  ip: string,
  keys: { abuseIPDBKey?: string; virusTotalKey?: string; ipqsKey?: string }
): Promise<BlacklistResult[]> {
  const checks: Promise<BlacklistResult>[] = [];
  for (const p of DNSBL_PROVIDERS) checks.push(checkDNSBL(ip, p.host, p.name));
  checks.push(checkIPApi(ip));
  checks.push(checkBlocklistDe(ip));
  if (keys.abuseIPDBKey) checks.push(checkAbuseIPDB(ip, keys.abuseIPDBKey));
  if (keys.virusTotalKey) checks.push(checkVirusTotal(ip, keys.virusTotalKey));
  if (keys.ipqsKey) checks.push(checkIPQualityScore(ip, keys.ipqsKey));
  return Promise.all(checks);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Authentication: Accept service role key (for cron) or JWT (for users) ──
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const cronToken = Deno.env.get("CRON_TRIGGER_TOKEN");
    const token = authHeader.replace("Bearer ", "");

    // Security audit CRIT-3: the anon key is public (shipped in every browser
    // bundle) — it must never satisfy "this is an authorized scheduled call."
    // Only the service-role key or a dedicated cron secret count as automated.
    const isCronCall = token === serviceKey || (!!cronToken && token === cronToken);

    if (!isCronCall) {
      // Verify the user's JWT for manual calls
      const authClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });

      const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(token);
      if (claimsError || !claimsData?.claims) {
        return new Response(
          JSON.stringify({ error: "Unauthorized" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const userId = claimsData.claims.sub;

      // Check user has admin or superadmin role
      const { data: roles } = await authClient
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      const isAuthorized = roles?.some(
        (r: any) => r.role === "admin" || r.role === "superadmin"
      );
      if (!isAuthorized) {
        return new Response(
          JSON.stringify({ error: "Forbidden: Admin role required" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    console.log(`check-ip-reputation called (cron: ${isCronCall})`);

    // ── Use service role for DB operations ──
    const abuseIPDBKey = Deno.env.get("ABUSEIPDB_API_KEY");
    const virusTotalKey = Deno.env.get("VIRUSTOTAL_API_KEY");
    const ipqsKey = Deno.env.get("IPQUALITYSCORE_API_KEY");

    const supabase = createClient(supabaseUrl, serviceKey);

    // Only needed for the direct-to-customer SMS path below (device.notify_number) —
    // ops-channel routing now goes entirely through notification_channels'
    // own alert_types subscriptions via routeToChannels(), not these flags.
    const { data: smsConfig } = await supabase.from("sms_config").select("*").limit(1).maybeSingle();
    const smsDirectEnabled = smsConfig?.enabled;

    const body = await req.json().catch(() => ({}));
    const deviceId = body.device_id;
    const manualIp = body.ip_address;

    // Validate input
    if (manualIp && !IP_V4_REGEX.test(manualIp)) {
      return new Response(
        JSON.stringify({ error: "Invalid IP address format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── IP Blocks inventory scan (ip_addresses / ip_blocks) ──
    // Separate from the device-monitoring path below: these rows have no
    // device_id and must never be written into blacklist_scans, whose
    // device_id column is NOT NULL. This is what actually powers the
    // "Blacklisted IPs" counters and RBL badges on the IP Blocks and
    // Blacklist Monitor pages — previously nothing wrote to
    // ip_addresses.is_blacklisted/rbl_lists at all, so those pages always
    // showed "0 / all clean" regardless of real status.
    if (body.block_id || body.ip_address_id || body.check_ip) {
      if (body.check_ip && !IP_V4_REGEX.test(body.check_ip)) {
        return new Response(
          JSON.stringify({ error: "Invalid IP address format" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Ad-hoc lookup (Blacklist Monitor's "RBL Checker") — not tied to
      // inventory, nothing persisted.
      if (body.check_ip && !body.block_id && !body.ip_address_id) {
        const scanResults = await runAllChecks(body.check_ip, { abuseIPDBKey, virusTotalKey, ipqsKey });
        const listed = scanResults.filter((r) => r.listed);
        return new Response(JSON.stringify({
          success: true,
          ip: body.check_ip,
          listed_count: listed.length,
          providers: listed.map((r) => ({ provider: r.provider, category: r.category, confidence: r.confidence })),
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      let rows: { id: string; ip_address: string; block_id: string | null; is_blacklisted: boolean | null }[] = [];
      if (body.ip_address_id) {
        const { data } = await supabase.from("ip_addresses").select("id, ip_address, block_id, is_blacklisted").eq("id", body.ip_address_id);
        rows = data || [];
      } else {
        const { data } = await supabase.from("ip_addresses").select("id, ip_address, block_id, is_blacklisted").eq("block_id", body.block_id);
        rows = data || [];
      }

      const scanned: any[] = [];
      for (const row of rows) {
        const scanResults = await runAllChecks(row.ip_address, { abuseIPDBKey, virusTotalKey, ipqsKey });
        const listedProviders = scanResults.filter((r) => r.listed).map((r) => r.provider);
        const isNowBlacklisted = listedProviders.length > 0;
        const wasBlacklisted = row.is_blacklisted === true;

        await supabase.from("ip_addresses").update({
          is_blacklisted: isNowBlacklisted,
          rbl_lists: listedProviders,
        }).eq("id", row.id);

        // Alert only on a clean → listed transition, mirroring the device-monitoring path.
        if (isNowBlacklisted && !wasBlacklisted) {
          const msg = [
            `🚨 *BLACKLIST ALERT*`,
            ``,
            `📍 IP: \`${escMd(row.ip_address)}\``,
            `🔴 Newly listed on *${escMd(String(listedProviders.length))}* provider${listedProviders.length > 1 ? "s" : ""}:`,
            ...listedProviders.map((p) => `  • ${escMd(p)}`),
          ].join("\n");
          await routeToChannels(supabase, "blacklisted", msg, row.ip_address);
        }

        scanned.push({ ip: row.ip_address, is_blacklisted: isNowBlacklisted, rbl_lists: listedProviders });
      }

      // Recompute block-level rollups from the source of truth (never increment/decrement in place).
      const affectedBlockIds = [...new Set(rows.map((r) => r.block_id).filter((v): v is string => !!v))];
      for (const bId of affectedBlockIds) {
        const { count: blCount } = await supabase.from("ip_addresses").select("id", { count: "exact", head: true }).eq("block_id", bId).eq("is_blacklisted", true);
        const { count: usedCount } = await supabase.from("ip_addresses").select("id", { count: "exact", head: true }).eq("block_id", bId).neq("status", "unassigned");
        const { data: blockRow } = await supabase.from("ip_blocks").select("usable_ips").eq("id", bId).single();
        const usable = blockRow?.usable_ips || 0;
        const pct = usable > 0 ? ((usedCount || 0) / usable) * 100 : 0;
        const status = (blCount || 0) > 0 || pct >= 90 ? "critical" : pct >= 70 ? "warning" : "healthy";
        await supabase.from("ip_blocks").update({ blacklisted_count: blCount || 0, assigned_ips: usedCount || 0, status }).eq("id", bId);
      }

      return new Response(JSON.stringify({ success: true, scanned: scanned.length, results: scanned }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── ip_assignments blacklist scan (Network Devices inventory) ──
    // Separate from both branches above: these rows have no device-scoped
    // blacklist_scans history (that table's device_id is device-inventory-specific
    // and unrelated to per-IP-assignment tracking) — this only maintains the
    // blacklist_count snapshot that Dashboard/NetworkHealth/IPIntelligence read.
    if (body.scan_ip_assignments === true) {
      let assignmentRows: { id: string; ip_address: string; ip_only: string | null; blacklist_count: number | null }[] = [];
      if (body.ip_assignment_id) {
        const { data } = await supabase.from("ip_assignments").select("id, ip_address, ip_only, blacklist_count").eq("id", body.ip_assignment_id).eq("monitor_blacklist", true);
        assignmentRows = data || [];
      } else {
        const { data } = await supabase.from("ip_assignments").select("id, ip_address, ip_only, blacklist_count").eq("monitor_blacklist", true);
        assignmentRows = data || [];
      }

      const scanned: any[] = [];
      for (const row of assignmentRows) {
        const ipToCheck = row.ip_only || row.ip_address.split("/")[0];
        const scanResults = await runAllChecks(ipToCheck, { abuseIPDBKey, virusTotalKey, ipqsKey });
        const listedProviders = scanResults.filter((r) => r.listed).map((r) => r.provider);
        const wasListed = (row.blacklist_count || 0) > 0;
        const isNowListed = listedProviders.length > 0;

        await supabase.from("ip_assignments").update({ blacklist_count: listedProviders.length }).eq("id", row.id);

        if (isNowListed && !wasListed) {
          const msg = [
            `🚨 *BLACKLIST ALERT*`,
            ``,
            `📍 IP: \`${escMd(ipToCheck)}\``,
            `🔴 Newly listed on *${escMd(String(listedProviders.length))}* provider${listedProviders.length > 1 ? "s" : ""}:`,
            ...listedProviders.map((p) => `  • ${escMd(p)}`),
          ].join("\n");
          await routeToChannels(supabase, "blacklisted", msg, ipToCheck);
        }

        scanned.push({ ip: ipToCheck, blacklist_count: listedProviders.length });
      }

      return new Response(JSON.stringify({ success: true, scanned: scanned.length, results: scanned }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let devices: any[] = [];
    if (deviceId) {
      const { data } = await supabase.from("devices").select("id, name, ip_address, notify_number").eq("id", deviceId);
      devices = data || [];
    } else {
      const { data } = await supabase.from("devices").select("id, name, ip_address, notify_number");
      devices = data || [];
    }

    const results: any[] = [];

    for (const device of devices) {
      const ipToCheck = manualIp || device.ip_address;

      // ── Record IP history ──
      await supabase
        .from("ip_history")
        .update({ is_current: false })
        .eq("device_id", device.id)
        .eq("is_current", true)
        .neq("ip_address", ipToCheck);

      const { data: existing } = await supabase
        .from("ip_history")
        .select("id")
        .eq("device_id", device.id)
        .eq("ip_address", ipToCheck)
        .eq("is_current", true)
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from("ip_history").insert({
          device_id: device.id,
          ip_address: ipToCheck,
          is_current: true,
          source: manualIp ? "manual" : "mikrotik_api",
        });
      }

      // ── Run ALL blacklist checks in parallel ──
      const checks: Promise<BlacklistResult>[] = [];

      for (const p of DNSBL_PROVIDERS) {
        checks.push(checkDNSBL(ipToCheck, p.host, p.name));
      }

      checks.push(checkIPApi(ipToCheck));
      checks.push(checkBlocklistDe(ipToCheck));

      if (abuseIPDBKey) checks.push(checkAbuseIPDB(ipToCheck, abuseIPDBKey));
      if (virusTotalKey) checks.push(checkVirusTotal(ipToCheck, virusTotalKey));
      if (ipqsKey) checks.push(checkIPQualityScore(ipToCheck, ipqsKey));

      // Fetch previous listed providers for comparison (before storing new results)
      const { data: prevScans } = await supabase
        .from("blacklist_scans")
        .select("provider, confidence_score")
        .eq("device_id", device.id)
        .gt("confidence_score", 0)
        .order("scanned_at", { ascending: false })
        .limit(100);
      const previouslyListed = new Set((prevScans || []).map((s: any) => s.provider));

      const scanResults = await Promise.all(checks);

      // ── Store results ──
      const insertPromises = scanResults.map((result) =>
        supabase.from("blacklist_scans").insert({
          device_id: device.id,
          ip_address: ipToCheck,
          provider: result.provider,
          status: result.listed ? "listed" : "clean",
          abuse_category: result.listed ? (result.category || "other") : null,
          confidence_score: result.confidence,
          raw_response: result.raw,
        })
      );
      await Promise.all(insertPromises);

      // ── Detect NEW blacklistings ──
      const newListings = scanResults.filter((r) => r.listed && !previouslyListed.has(r.provider));
      const delistings = [...previouslyListed].filter(
        (provider) => !scanResults.find((r) => r.provider === provider && r.listed)
      );

      // ── Send notifications for new blacklistings ──
      if (newListings.length > 0) {
        const providerNames = newListings.map((r) => r.provider).join(", ");
        console.log(`🚨 ${device.name} newly blacklisted on: ${providerNames}`);

        // Ops-channel alert (Telegram/SMS/email, whichever channels are configured)
        const categories = [...new Set(newListings.map((r) => r.category).filter(Boolean))].join(", ") || "unknown";
        const msg = [
          `🚨 *BLACKLIST ALERT*`,
          ``,
          `📍 *${escMd(device.name)}* \\(${escMd(ipToCheck)}\\)`,
          `🔴 Newly listed on *${escMd(String(newListings.length))}* provider${newListings.length > 1 ? "s" : ""}:`,
          ...newListings.map((r) => `  • ${escMd(r.provider)} \\(${escMd(String(r.confidence))}% confidence\\)`),
          ``,
          `📂 Categories: ${escMd(categories)}`,
          `⚠️ Action recommended: Review firewall rules and check for compromised subscribers`,
        ].join("\n");
        await routeToChannels(supabase, "blacklisted", msg, ipToCheck);

        // Direct-to-customer SMS (device.notify_number), separate from ops-channel routing above
        if (smsDirectEnabled && smsConfig?.notify_blacklisted) {
          const smsMessage = `🚨 BLACKLIST: ${device.name} (${ipToCheck}) listed on ${newListings.length} new provider(s): ${providerNames}. Check dashboard for details.`;
          const smsNumbers = Array.isArray(device.notify_number) && device.notify_number.length > 0
            ? device.notify_number : [smsConfig!.client_number];

          for (const num of smsNumbers) {
            if (!num) continue;
            await sendDirect(supabase, "sms", num, smsMessage, "sms_ip_blacklisted", ipToCheck);
          }
        }
      }

      // ── Send notifications for delistings ──
      if (delistings.length > 0) {
        const delistedNames = delistings.join(", ");
        console.log(`✅ ${device.name} delisted from: ${delistedNames}`);

        const msg = [
          `✅ *DELISTING NOTICE*`,
          ``,
          `📍 *${escMd(device.name)}* \\(${escMd(ipToCheck)}\\)`,
          `🟢 Removed from *${escMd(String(delistings.length))}* provider${delistings.length > 1 ? "s" : ""}:`,
          ...delistings.map((p) => `  • ${escMd(p)}`),
        ].join("\n");
        await routeToChannels(supabase, "delisted", msg, ipToCheck);

        if (smsDirectEnabled && smsConfig?.notify_delisted) {
          const smsMessage = `✅ DELISTED: ${device.name} (${ipToCheck}) removed from ${delistings.length} provider(s): ${delistedNames}`;
          const smsNumbers = Array.isArray(device.notify_number) && device.notify_number.length > 0
            ? device.notify_number : [smsConfig!.client_number];

          for (const num of smsNumbers) {
            if (!num) continue;
            await sendDirect(supabase, "sms", num, smsMessage, "sms_ip_delisted", ipToCheck);
          }
        }
      }

      // ── Calculate reputation ──
      const listedCount = scanResults.filter((r) => r.listed).length;
      const totalChecks = scanResults.length;
      const maxConfidence = Math.max(...scanResults.map((r) => r.confidence), 0);
      const apiListings = scanResults.filter((r) => r.listed && r.check_type === "api").length;
      const dnsblListings = scanResults.filter((r) => r.listed && r.check_type === "dnsbl").length;
      const webListings = scanResults.filter((r) => r.listed && r.check_type === "web").length;

      const reputationScore = Math.max(
        0,
        100 - (apiListings * 20) - (dnsblListings * 8) - (webListings * 10) - Math.floor(maxConfidence * 0.2)
      );

      // ── Upsert reputation summary ──
      const { data: existingSummary } = await supabase
        .from("ip_reputation_summary")
        .select("id")
        .eq("device_id", device.id)
        .limit(1);

      const summaryData = {
        ip_address: ipToCheck,
        reputation_score: reputationScore,
        total_listings: listedCount,
        active_listings: listedCount,
        last_scan_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (existingSummary && existingSummary.length > 0) {
        await supabase.from("ip_reputation_summary").update(summaryData).eq("device_id", device.id);
      } else {
        await supabase.from("ip_reputation_summary").insert({ device_id: device.id, ...summaryData });
      }

      // ── Record reputation history for trend tracking ──
      await supabase.from("reputation_history").insert({
        device_id: device.id,
        ip_address: ipToCheck,
        reputation_score: reputationScore,
        active_listings: listedCount,
      });

      results.push({
        device: device.name,
        ip: ipToCheck,
        reputation_score: reputationScore,
        listings: listedCount,
        total_checks: totalChecks,
        by_type: {
          dnsbl: { checked: scanResults.filter((r) => r.check_type === "dnsbl").length, listed: dnsblListings },
          api: { checked: scanResults.filter((r) => r.check_type === "api").length, listed: apiListings },
          web: { checked: scanResults.filter((r) => r.check_type === "web").length, listed: webListings },
        },
        details: scanResults.map((r) => ({
          provider: r.provider,
          listed: r.listed,
          confidence: r.confidence,
          type: r.check_type,
          category: r.category,
        })),
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in check-ip-reputation:", error);
    return new Response(
      JSON.stringify({ success: false, error: "An internal error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
