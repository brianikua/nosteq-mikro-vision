// On-prem SNMP collector for LAN MikroTik switches/routers.
// Single-shot script: fetch poll targets, SNMP-poll each one, push results, exit.
// Intended to be run on a schedule (cron / Task Scheduler) from a machine already
// inside the LAN — Supabase's cloud infrastructure cannot reach private-IP switches.
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import snmp from "net-snmp";
import { loadDotEnv } from "./env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotEnv(join(__dirname, ".env"));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SNMP_COLLECTOR_TOKEN = process.env.SNMP_COLLECTOR_TOKEN;
const SNMP_TIMEOUT_MS = Number(process.env.SNMP_TIMEOUT_MS || 5000);
const SNMP_RETRIES = Number(process.env.SNMP_RETRIES || 1);

if (!SUPABASE_URL || !SNMP_COLLECTOR_TOKEN) {
  console.error("Missing SUPABASE_URL or SNMP_COLLECTOR_TOKEN. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const FUNCTION_URL = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/snmp-collector`;

// Standard IF-MIB OIDs — stable across vendors, not MikroTik-specific.
const SYS_UPTIME_OID = "1.3.6.1.2.1.1.3.0";
const MTXR_CPU_LOAD_OID = "1.3.6.1.4.1.14988.1.1.3.14.0"; // MikroTik enterprise MIB, best-effort
const IF_TABLE_OID = "1.3.6.1.2.1.2.2"; // ifDescr(2) ifSpeed(5) ifAdminStatus(7) ifOperStatus(8) ifInOctets(10) ifInErrors(14) ifOutOctets(16) ifOutErrors(20)
const IFX_TABLE_OID = "1.3.6.1.2.1.31.1.1"; // ifAlias(18) ifHCInOctets(6) ifHCOutOctets(10) ifHighSpeed(15) — 64-bit counters, preferred when available

function versionFor(v) {
  return v === "v1" ? snmp.Version1 : snmp.Version2c;
}

function openSession(target) {
  return snmp.createSession(target.ip_address, target.snmp_community || "public", {
    port: target.snmp_port || 161,
    version: versionFor(target.snmp_version),
    timeout: SNMP_TIMEOUT_MS,
    retries: SNMP_RETRIES,
  });
}

function sessionGet(session, oids) {
  return new Promise((resolve) => {
    session.get(oids, (error, varbinds) => resolve(error ? null : varbinds));
  });
}

function sessionTable(session, oid) {
  return new Promise((resolve) => {
    session.table(oid, 20, (error, table) => resolve(error ? {} : table || {}));
  });
}

function statusName(n) {
  if (n === 1) return "up";
  if (n === 2) return "down";
  return "unknown";
}

function toNumber(v) {
  if (v == null) return null;
  const n = typeof v === "object" ? Number(v.toString()) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function varbindValue(varbind) {
  if (!varbind || snmp.isVarbindError(varbind)) return null;
  return varbind.value;
}

async function pollSwitch(target) {
  const session = openSession(target);
  try {
    const sysVarbinds = await sessionGet(session, [SYS_UPTIME_OID, MTXR_CPU_LOAD_OID]);
    if (!sysVarbinds) {
      return { device_id: target.id, reachable: false, interfaces: [] };
    }

    const sysUptimeRaw = toNumber(varbindValue(sysVarbinds[0])); // hundredths of a second
    const cpuRaw = toNumber(varbindValue(sysVarbinds[1]));

    const [ifTable, ifxTable] = await Promise.all([
      sessionTable(session, IF_TABLE_OID),
      sessionTable(session, IFX_TABLE_OID),
    ]);

    const interfaces = Object.keys(ifTable).map((index) => {
      const row = ifTable[index] || {};
      const xrow = ifxTable[index] || {};
      const hcIn = toNumber(xrow[6]);
      const hcOut = toNumber(xrow[10]);
      const highSpeedMbps = toNumber(xrow[15]);
      const legacySpeedBps = toNumber(row[5]);

      return {
        if_index: Number(index),
        if_descr: row[2] != null ? String(row[2]) : null,
        if_alias: xrow[18] != null ? String(xrow[18]) : null,
        oper_status: statusName(toNumber(row[8])),
        admin_status: statusName(toNumber(row[7])),
        speed_mbps: highSpeedMbps ?? (legacySpeedBps != null ? Math.round(legacySpeedBps / 1_000_000) : null),
        // Prefer 64-bit HC counters (won't wrap for years even on 10G links);
        // fall back to the 32-bit ifTable counters if ifXTable isn't supported.
        in_octets: hcIn ?? toNumber(row[10]),
        out_octets: hcOut ?? toNumber(row[16]),
        in_errors: toNumber(row[14]),
        out_errors: toNumber(row[20]),
      };
    });

    return {
      device_id: target.id,
      reachable: true,
      sys_uptime_seconds: sysUptimeRaw != null ? Math.round(sysUptimeRaw / 100) : null,
      cpu_load_pct: cpuRaw,
      interfaces,
    };
  } finally {
    session.close();
  }
}

async function main() {
  const targetsRes = await fetch(FUNCTION_URL, {
    headers: { Authorization: `Bearer ${SNMP_COLLECTOR_TOKEN}` },
  });
  if (!targetsRes.ok) {
    console.error(`Failed to fetch targets: HTTP ${targetsRes.status} ${await targetsRes.text()}`);
    process.exit(1);
  }
  const { targets } = await targetsRes.json();
  if (!targets || targets.length === 0) {
    console.log("No SNMP-enabled devices found. Enable SNMP on a device in the dashboard first.");
    return;
  }

  console.log(`Polling ${targets.length} device(s)...`);
  const results = [];
  for (const target of targets) {
    try {
      const result = await pollSwitch(target);
      results.push(result);
      console.log(`  ${target.ip_address}: ${result.reachable ? `ok (${result.interfaces.length} interfaces)` : "unreachable"}`);
    } catch (err) {
      console.error(`  ${target.ip_address}: error — ${err.message}`);
      results.push({ device_id: target.id, reachable: false, interfaces: [] });
    }
  }

  const ingestRes = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SNMP_COLLECTOR_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ devices: results }),
  });

  if (!ingestRes.ok) {
    console.error(`Failed to push results: HTTP ${ingestRes.status} ${await ingestRes.text()}`);
    process.exit(1);
  }
  const summary = await ingestRes.json();
  console.log(`Done. ${summary.devices_processed} device(s) processed.`);
}

main().catch((err) => {
  console.error("Collector run failed:", err);
  process.exit(1);
});
