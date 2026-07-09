// Severity classification for blacklist providers
export type Severity = "critical" | "high" | "medium" | "low";

// Keep in sync with the public.abuse_category Postgres enum:
// 'spam', 'ddos', 'port_scanning', 'botnet', 'malware', 'open_relay',
// 'brute_force', 'dns_amplification', 'smtp_abuse', 'other'
// Also accepts the legacy slash-form categories used by the hardcoded
// per-provider insight map (e.g. "spam/malware", "botnet/exploit") so both
// the DB-driven and provider-driven callers classify consistently.
const CRITICAL_CATEGORIES = ["spam", "malware", "botnet", "ddos", "dns_amplification", "botnet/exploit", "spam/malware"];
const HIGH_CATEGORIES = ["brute_force", "brute force", "smtp_abuse", "open_relay", "general abuse", "network abuse", "botnet/proxy"];
const MEDIUM_CATEGORIES = ["port_scanning", "spam/proxy", "proxy/fraud", "reputation"];

export const getSeverity = (category: string): Severity => {
  if (CRITICAL_CATEGORIES.includes(category)) return "critical";
  if (HIGH_CATEGORIES.includes(category)) return "high";
  if (MEDIUM_CATEGORIES.includes(category)) return "medium";
  return "low";
};

export const severityConfig: Record<Severity, { label: string; color: string; badgeVariant: "destructive" | "default" | "secondary" | "outline" }> = {
  critical: { label: "CRITICAL", color: "text-destructive", badgeVariant: "destructive" },
  high: { label: "HIGH", color: "text-[hsl(var(--warning))]", badgeVariant: "default" },
  medium: { label: "MEDIUM", color: "text-muted-foreground", badgeVariant: "secondary" },
  low: { label: "LOW", color: "text-muted-foreground", badgeVariant: "outline" },
};

// Remediation checklists per category
export const REMEDIATION_STEPS: Record<string, string[]> = {
  spam: [
    "Block outbound port 25 on OLT/router",
    "Identify customer sending spam (check logs)",
    "Suspend offending customer account",
    "Submit delisting request",
    "Monitor for 48h after delisting",
  ],
  "spam/malware": [
    "Block outbound port 25 on OLT/router",
    "Scan for malware-infected hosts on the subnet",
    "Identify and isolate compromised device",
    "Submit delisting request",
    "Monitor for 48h after delisting",
  ],
  malware: [
    "Block known C&C ports and malware traffic",
    "Scan for infected hosts using flow analysis",
    "Isolate compromised device(s)",
    "Submit delisting request",
    "Monitor for 72h after cleanup",
  ],
  botnet: [
    "Block port 25 outbound immediately",
    "Rate-limit new TCP connections per subscriber",
    "Identify compromised CPE/device via connection tracking",
    "Clean or replace infected device",
    "Submit delisting request",
  ],
  "botnet/exploit": [
    "Block port 25 and rate-limit connections",
    "Scan for exploited systems sending spam",
    "Patch/update affected systems",
    "Submit delisting request",
    "Monitor for 48h after delisting",
  ],
  "botnet/proxy": [
    "Block proxy ports (1080, 3128, 8080)",
    "Rate-limit IRC port 6667",
    "Block port 25 outbound",
    "Check for compromised CPE devices",
    "Submit delisting request",
  ],
  "brute force": [
    "Enable Port Scan Detection (PSD) on MikroTik",
    "Rate-limit new TCP connections per IP",
    "Block ports: 22, 3389, 5900, 23 from WAN",
    "Check for compromised CPE devices on that subnet",
    "Submit delisting request",
  ],
  "ddos": [
    "Engage upstream/DDoS scrubbing if available",
    "Rate-limit and null-route the offending source where possible",
    "Check for compromised CPE participating in the attack",
    "Submit delisting request",
    "Monitor for recurrence",
  ],
  "port_scanning": [
    "Enable Port Scan Detection (PSD) on MikroTik",
    "Rate-limit new connections per subscriber",
    "Check for compromised CPE devices on that subnet",
    "Submit delisting request",
  ],
  "open_relay": [
    "Disable SMTP open relay / require authentication",
    "Block port 25 outbound for non-mail hosts",
    "Submit delisting request",
    "Monitor for 48h after delisting",
  ],
  "dns_amplification": [
    "Disable open DNS recursion on affected resolvers",
    "Rate-limit outbound UDP/53 traffic",
    "Identify and patch misconfigured DNS servers on the subnet",
    "Submit delisting request",
  ],
  "smtp_abuse": [
    "Block outbound port 25 for non-mail hosts",
    "Configure SPF, DKIM, DMARC for mail domains",
    "Identify customer/device sending abusive mail",
    "Submit delisting request",
    "Monitor for 48h after delisting",
  ],
  "general abuse": [
    "Rate-limit connections (100/min per subscriber)",
    "Enable port scan detection",
    "Block port 25 outbound",
    "Drop bogon traffic",
    "Submit delisting request after resolving",
  ],
  "network abuse": [
    "Apply subnet-wide SMTP blocking",
    "Implement aggressive rate limiting",
    "Contact upstream provider",
    "Enable BCP38/uRPF",
    "Submit delisting request",
  ],
  "spam/proxy": [
    "Block open relay ports (25, 587)",
    "Block proxy ports (1080, 3128, 8080)",
    "Check for open proxies on the network",
    "Submit delisting request",
    "Monitor for recurrence",
  ],
  "proxy/fraud": [
    "Block proxy ports (1080, 3128, 8080)",
    "Block tor exit traffic",
    "Rate-limit outbound connections",
    "Submit delisting request",
    "Monitor for recurrence",
  ],
  reputation: [
    "Ensure proper rDNS (PTR records) are set",
    "Configure SPF, DKIM, DMARC for mail domains",
    "Block port 25 for non-mail hosts",
    "Implement rate limiting",
    "Submit delisting request",
  ],
  policy: [
    "Configure mail to relay through authorized SMTP server",
    "Set up proper rDNS for mail-sending IPs",
    "Submit PBL removal request if this IP should send email",
    "Document authorized mail server IPs",
  ],
  informational: [
    "Ensure proper rDNS is configured",
    "Review if this is expected (hosting IPs are commonly flagged)",
    "No immediate action needed unless affecting deliverability",
  ],
};

// DB enum uses underscores ("brute_force"); the provider-insight map uses spaces
// ("brute force"). Normalize so a lookup with either form resolves the same steps.
REMEDIATION_STEPS["brute_force"] = REMEDIATION_STEPS["brute force"];

export const getRemediationSteps = (category: string): string[] => {
  return REMEDIATION_STEPS[category] || REMEDIATION_STEPS["general abuse"] || [
    "Investigate the root cause",
    "Apply appropriate firewall rules",
    "Submit delisting request",
    "Monitor for 48h",
  ];
};
