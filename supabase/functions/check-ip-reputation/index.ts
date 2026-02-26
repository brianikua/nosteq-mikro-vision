import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface BlacklistResult {
  provider: string;
  listed: boolean;
  category: string | null;
  confidence: number;
  raw: unknown;
}

// AbuseIPDB check
async function checkAbuseIPDB(
  ip: string,
  apiKey: string
): Promise<BlacklistResult> {
  try {
    const res = await fetch(
      `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(ip)}&maxAgeInDays=90`,
      {
        headers: {
          Key: apiKey,
          Accept: "application/json",
        },
      }
    );
    if (!res.ok) throw new Error(`AbuseIPDB HTTP ${res.status}`);
    const data = await res.json();
    const d = data.data;
    const listed = d.abuseConfidenceScore > 25;
    let category: string | null = null;
    if (d.usageType?.toLowerCase().includes("spam")) category = "spam";
    else if (d.totalReports > 0) category = "other";

    return {
      provider: "AbuseIPDB",
      listed,
      category,
      confidence: d.abuseConfidenceScore,
      raw: d,
    };
  } catch (e) {
    console.error("AbuseIPDB error:", e);
    return { provider: "AbuseIPDB", listed: false, category: null, confidence: 0, raw: { error: String(e) } };
  }
}

// DNS-based RBL check (works without API keys)
async function checkDNSBL(
  ip: string,
  rblHost: string,
  providerName: string
): Promise<BlacklistResult> {
  try {
    const reversed = ip.split(".").reverse().join(".");
    const lookupHost = `${reversed}.${rblHost}`;
    // Use DNS over HTTPS for lookup
    const res = await fetch(
      `https://dns.google/resolve?name=${lookupHost}&type=A`
    );
    const data = await res.json();
    const listed = data.Status === 0 && data.Answer && data.Answer.length > 0;
    return {
      provider: providerName,
      listed: !!listed,
      category: listed ? "other" : null,
      confidence: listed ? 80 : 0,
      raw: data,
    };
  } catch (e) {
    console.error(`${providerName} error:`, e);
    return { provider: providerName, listed: false, category: null, confidence: 0, raw: { error: String(e) } };
  }
}

// Get WAN IP from external service for validation
async function getExternalIP(): Promise<string | null> {
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const data = await res.json();
    return data.ip;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const abuseIPDBKey = Deno.env.get("ABUSEIPDB_API_KEY");

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({}));
    const deviceId = body.device_id;
    const manualIp = body.ip_address;

    // Get devices to scan
    let devices: any[] = [];
    if (deviceId) {
      const { data } = await supabase
        .from("devices")
        .select("id, name, ip_address")
        .eq("id", deviceId);
      devices = data || [];
    } else {
      const { data } = await supabase
        .from("devices")
        .select("id, name, ip_address");
      devices = data || [];
    }

    const results: any[] = [];

    for (const device of devices) {
      const ipToCheck = manualIp || device.ip_address;

      // Record IP history
      // Mark previous IPs as not current
      await supabase
        .from("ip_history")
        .update({ is_current: false })
        .eq("device_id", device.id)
        .eq("is_current", true)
        .neq("ip_address", ipToCheck);

      // Insert current IP if new
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

      // Run blacklist checks
      const checks: Promise<BlacklistResult>[] = [];

      // DNS-based RBLs (no API key needed)
      checks.push(checkDNSBL(ipToCheck, "zen.spamhaus.org", "Spamhaus"));
      checks.push(checkDNSBL(ipToCheck, "b.barracudacentral.org", "Barracuda"));
      checks.push(checkDNSBL(ipToCheck, "dnsbl.sorbs.net", "SORBS"));
      checks.push(checkDNSBL(ipToCheck, "bl.spamcop.net", "SpamCop"));
      checks.push(checkDNSBL(ipToCheck, "dnsbl-1.uceprotect.net", "UCEProtect"));

      // AbuseIPDB (requires API key)
      if (abuseIPDBKey) {
        checks.push(checkAbuseIPDB(ipToCheck, abuseIPDBKey));
      }

      const scanResults = await Promise.all(checks);

      // Store results
      for (const result of scanResults) {
        await supabase.from("blacklist_scans").insert({
          device_id: device.id,
          ip_address: ipToCheck,
          provider: result.provider,
          status: result.listed ? "listed" : "clean",
          abuse_category: result.listed ? (result.category || "other") : null,
          confidence_score: result.confidence,
          raw_response: result.raw,
        });
      }

      // Calculate reputation
      const listedCount = scanResults.filter((r) => r.listed).length;
      const totalChecks = scanResults.length;
      const maxConfidence = Math.max(...scanResults.map((r) => r.confidence), 0);
      const reputationScore = Math.max(
        0,
        100 - listedCount * 15 - Math.floor(maxConfidence * 0.3)
      );

      // Upsert reputation summary
      const { data: existingSummary } = await supabase
        .from("ip_reputation_summary")
        .select("id")
        .eq("device_id", device.id)
        .limit(1);

      if (existingSummary && existingSummary.length > 0) {
        await supabase
          .from("ip_reputation_summary")
          .update({
            ip_address: ipToCheck,
            reputation_score: reputationScore,
            total_listings: listedCount,
            active_listings: listedCount,
            last_scan_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("device_id", device.id);
      } else {
        await supabase.from("ip_reputation_summary").insert({
          device_id: device.id,
          ip_address: ipToCheck,
          reputation_score: reputationScore,
          total_listings: listedCount,
          active_listings: listedCount,
          last_scan_at: new Date().toISOString(),
        });
      }

      results.push({
        device: device.name,
        ip: ipToCheck,
        reputation_score: reputationScore,
        listings: listedCount,
        total_checks: totalChecks,
        details: scanResults.map((r) => ({
          provider: r.provider,
          listed: r.listed,
          confidence: r.confidence,
        })),
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in check-ip-reputation:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
