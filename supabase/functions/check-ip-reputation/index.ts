import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const res = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,country,isp,org,as,proxy,hosting,mobile`);
    if (!res.ok) throw new Error(`ip-api HTTP ${res.status}`);
    const d = await res.json();
    const listed = d.proxy === true || d.hosting === true;
    return { provider: "IP-API (Proxy/Hosting)", listed, category: listed ? "other" : null, confidence: listed ? 60 : 0, raw: d, check_type: "web" };
  } catch (e) {
    console.error("ip-api error:", e);
    return { provider: "IP-API (Proxy/Hosting)", listed: false, category: null, confidence: 0, raw: { error: String(e) }, check_type: "web" };
  }
}

// ── Blocklist.de check ──
async function checkBlocklistDe(ip: string): Promise<BlacklistResult> {
  try {
    const res = await fetch(`http://api.blocklist.de/api.php?ip=${encodeURIComponent(ip)}&start=1`);
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ── Authentication: Verify JWT and check role ──
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

    // Verify the user's JWT
    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
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

    // ── Use service role for DB operations ──
    const abuseIPDBKey = Deno.env.get("ABUSEIPDB_API_KEY");
    const virusTotalKey = Deno.env.get("VIRUSTOTAL_API_KEY");
    const ipqsKey = Deno.env.get("IPQUALITYSCORE_API_KEY");

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const deviceId = body.device_id;
    const manualIp = body.ip_address;

    // Validate input
    if (manualIp && !/^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(manualIp)) {
      return new Response(
        JSON.stringify({ error: "Invalid IP address format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let devices: any[] = [];
    if (deviceId) {
      const { data } = await supabase.from("devices").select("id, name, ip_address").eq("id", deviceId);
      devices = data || [];
    } else {
      const { data } = await supabase.from("devices").select("id, name, ip_address");
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
