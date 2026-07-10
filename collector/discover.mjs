// On-prem network discovery: sweeps configured CIDR ranges for live hosts,
// attempts SNMP identification on each, and reports them to Supabase for
// auto-add into monitoring. Single-shot script, run on a schedule alongside
// index.mjs (SNMP polling) — must run inside the LAN it's scanning, same
// reachability constraint as everything else in this collector.
import net from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import snmp from "net-snmp";
import { loadDotEnv } from "./env.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotEnv(join(__dirname, ".env"));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SNMP_COLLECTOR_TOKEN = process.env.SNMP_COLLECTOR_TOKEN;

if (!SUPABASE_URL || !SNMP_COLLECTOR_TOKEN) {
  console.error("Missing SUPABASE_URL or SNMP_COLLECTOR_TOKEN. Copy .env.example to .env and fill it in.");
  process.exit(1);
}

const FUNCTION_URL = `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/network-discovery`;
const PROBE_PORTS = [22, 23, 80, 443, 161];
const PROBE_TIMEOUT_MS = Number(process.env.DISCOVERY_PROBE_TIMEOUT_MS || 800);
const CONCURRENCY = Number(process.env.DISCOVERY_CONCURRENCY || 50);
const MAX_HOSTS_PER_RANGE = Number(process.env.DISCOVERY_MAX_HOSTS || 4096);
const SNMP_COMMUNITIES = (process.env.DISCOVERY_SNMP_COMMUNITIES || "public,private").split(",").map((c) => c.trim()).filter(Boolean);

function cidrToHosts(cidr) {
  const [base, prefixStr] = (cidr || "").split("/");
  const prefix = parseInt(prefixStr, 10);
  if (!base || Number.isNaN(prefix) || prefix < 0 || prefix > 32) return [];
  const octets = base.split(".").map(Number);
  if (octets.length !== 4 || octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return [];

  const ipNum = ((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
  const hostBits = 32 - prefix;
  const total = hostBits >= 32 ? 0xffffffff : (1 << hostBits) >>> 0;
  const mask = prefix === 0 ? 0 : (~0 << hostBits) >>> 0;
  const network = ipNum & mask;
  // /31 and /32 have no network/broadcast to exclude; everything else does.
  const usableStart = prefix >= 31 ? 0 : 1;
  const usableEnd = prefix >= 31 ? total : total - 1;
  const toIp = (n) => [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");

  const hosts = [];
  for (let i = usableStart; i <= usableEnd && hosts.length < MAX_HOSTS_PER_RANGE; i++) {
    hosts.push(toIp((network + i) >>> 0));
  }
  return hosts;
}

function probeTcp(ip, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(port, ip);
  });
}

async function isHostAlive(ip) {
  const results = await Promise.all(PROBE_PORTS.map((p) => probeTcp(ip, p, PROBE_TIMEOUT_MS)));
  return results.some(Boolean);
}

function snmpSysDescr(ip, community) {
  return new Promise((resolve) => {
    const session = snmp.createSession(ip, community, { port: 161, version: snmp.Version2c, timeout: 1000, retries: 0 });
    session.get(["1.3.6.1.2.1.1.1.0"], (error, varbinds) => {
      session.close();
      if (error || !varbinds?.[0] || snmp.isVarbindError(varbinds[0])) return resolve(null);
      resolve(String(varbinds[0].value));
    });
  });
}

async function trySnmp(ip) {
  for (const community of SNMP_COMMUNITIES) {
    const sysDescr = await snmpSysDescr(ip, community).catch(() => null);
    if (sysDescr) return { sys_descr: sysDescr, community };
  }
  return null;
}

// Bounded-concurrency worker pool — a /24 sweep is 254 hosts x 5 ports;
// running them all at once would flood the local network stack.
async function runPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let idx = 0;
  async function next() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await worker(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, next));
  return results;
}

async function main() {
  const rangesRes = await fetch(FUNCTION_URL, { headers: { Authorization: `Bearer ${SNMP_COLLECTOR_TOKEN}` } });
  if (!rangesRes.ok) {
    console.error(`Failed to fetch scan ranges: HTTP ${rangesRes.status} ${await rangesRes.text()}`);
    process.exit(1);
  }
  const { ranges } = await rangesRes.json();
  if (!ranges || ranges.length === 0) {
    console.log("No enabled scan ranges configured. Add one in Admin Settings first.");
    return;
  }

  const discovered = [];
  const scannedRangeIds = [];

  for (const range of ranges) {
    const hosts = cidrToHosts(range.cidr);
    if (hosts.length === 0) {
      console.error(`Invalid CIDR, skipping: ${range.cidr}`);
      continue;
    }
    console.log(`Scanning ${range.cidr} (${range.description || "no description"}) — ${hosts.length} address(es)...`);

    const aliveFlags = await runPool(hosts, isHostAlive, CONCURRENCY);
    const aliveHosts = hosts.filter((_, i) => aliveFlags[i]);
    console.log(`  ${aliveHosts.length} host(s) responding`);

    for (const ip of aliveHosts) {
      const snmpResult = await trySnmp(ip);
      discovered.push({
        ip_address: ip,
        snmp_identified: !!snmpResult,
        sys_descr: snmpResult?.sys_descr || null,
        community: snmpResult?.community || null,
      });
      console.log(`    ${ip}: alive${snmpResult ? ` — SNMP: ${snmpResult.sys_descr.slice(0, 60)}` : ""}`);
    }

    scannedRangeIds.push(range.id);
  }

  const postRes = await fetch(FUNCTION_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${SNMP_COLLECTOR_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ discovered, scanned_range_ids: scannedRangeIds }),
  });
  if (!postRes.ok) {
    console.error(`Failed to report discovery results: HTTP ${postRes.status} ${await postRes.text()}`);
    process.exit(1);
  }
  const summary = await postRes.json();
  console.log(`Done. ${summary.added} new device(s) added, ${summary.skipped} already known.`);
}

main().catch((err) => {
  console.error("Discovery run failed:", err);
  process.exit(1);
});
