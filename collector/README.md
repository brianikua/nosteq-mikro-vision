# Network Collector

On-prem agent with two jobs, each a single-shot script run on a schedule —
neither is a long-running daemon:

- **`index.mjs`** — polls SNMP-enabled devices (interface status, bandwidth,
  CPU, uptime) and pushes results to the `snmp-collector` edge function.
- **`discover.mjs`** — sweeps configured CIDR ranges for live hosts, attempts
  SNMP identification on each, and reports them to the `network-discovery`
  edge function, which auto-adds new ones as monitored devices.

Both exist because Supabase Edge Functions run in Supabase's cloud and cannot
reach devices — or scan subnets — on a private (RFC1918) network. These
scripts must run on a machine that's already inside the same LAN.

## Setup

1. `npm install`
2. `cp .env.example .env` and fill in:
   - `SUPABASE_URL` — your project URL (already pre-filled with the current
     project's URL).
   - `SNMP_COLLECTOR_TOKEN` — set via `supabase secrets set SNMP_COLLECTOR_TOKEN=<random-value>`
     against the Supabase project, then put the same value here. Generate one with e.g.
     `openssl rand -hex 32`. Used by both scripts — discovery reuses the same
     trust boundary as SNMP polling since it's the same local agent.
3. For SNMP polling: in the dashboard, edit a device (type `MikroTik_Switch`
   or `MikroTik_Router`), enable SNMP, and set its community string/version/port.
4. For discovery: in Admin Settings, add a scan range (e.g. `192.168.1.0/24`).
   Discovered hosts are added and monitoring-enabled immediately — no
   approval step. SNMP-identified hosts (tried against `public`/`private` by
   default; override with `DISCOVERY_SNMP_COMMUNITIES=comma,separated,list`
   in `.env`) get `snmp_enabled` turned on automatically too.
5. Run once by hand to confirm each works: `npm start` / `npm run discover`

## Scheduling

**Linux (cron)** — SNMP poll every 5 minutes, discovery once an hour:
```
*/5 * * * * cd /path/to/collector && /usr/bin/node index.mjs >> /var/log/collector.log 2>&1
0 * * * *   cd /path/to/collector && /usr/bin/node discover.mjs >> /var/log/collector.log 2>&1
```

**Windows (Task Scheduler)**: two tasks, same pattern as above —
Program `node`, Arguments `index.mjs` or `discover.mjs`, Start in the
`collector` folder, on their respective intervals.

## Notes

- SNMPv1/v2c only for now (community-string auth). SNMPv3 isn't wired up yet.
- The collector never receives the Supabase service-role key — it only holds
  the narrow `SNMP_COLLECTOR_TOKEN`, which the edge functions check against a
  matching secret.
- If a switch doesn't respond to the MikroTik-specific CPU-load OID (e.g. it's
  not RouterOS), CPU load is just reported as `null` — everything else still
  works.
- Discovery sweeps are capped at 4096 addresses per range by default
  (`DISCOVERY_MAX_HOSTS`) — a typo'd `/8` won't scan the whole range.
- Discovered device names default to their IP address; rename them from the
  Devices page once you know what they are.
