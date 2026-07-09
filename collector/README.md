# SNMP Collector

Polls LAN MikroTik switches/routers via SNMP and pushes results to the
`snmp-collector` Supabase edge function. Runs as a single-shot script on a
schedule — it is **not** a long-running daemon.

This exists because Supabase Edge Functions run in Supabase's cloud and cannot
reach devices on a private (RFC1918) network. This script must run on a
machine that's already inside the same LAN as the switches.

## Setup

1. `npm install`
2. `cp .env.example .env` and fill in:
   - `SUPABASE_URL` — your project URL (already pre-filled with the current
     project's URL).
   - `SNMP_COLLECTOR_TOKEN` — set via `supabase secrets set SNMP_COLLECTOR_TOKEN=<random-value>`
     against the Supabase project, then put the same value here. Generate one with e.g.
     `openssl rand -hex 32`.
3. In the dashboard, edit a device (type `MikroTik_Switch` or `MikroTik_Router`),
   enable SNMP, and set its community string/version/port. The collector only
   polls devices with `snmp_enabled = true`.
4. Run once by hand to confirm it works: `npm start`

## Scheduling

**Linux (cron)** — every 5 minutes:
```
*/5 * * * * cd /path/to/collector && /usr/bin/node index.mjs >> /var/log/snmp-collector.log 2>&1
```

**Windows (Task Scheduler)**:
- Program: `node`
- Arguments: `index.mjs`
- Start in: the `collector` folder
- Trigger: repeat every 5 minutes

## Notes

- SNMPv1/v2c only for now (community-string auth). SNMPv3 isn't wired up yet.
- The collector never receives the Supabase service-role key — it only holds
  the narrow `SNMP_COLLECTOR_TOKEN`, which the edge function checks against a
  matching secret.
- If a switch doesn't respond to the MikroTik-specific CPU-load OID (e.g. it's
  not RouterOS), CPU load is just reported as `null` — everything else still
  works.
