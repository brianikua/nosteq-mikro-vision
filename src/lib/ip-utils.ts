// Shared, byte-range-correct IPv4/CIDR validation. Previously six different
// call sites each had their own regex, all of them just `\d{1,3}` per octet
// with no 0-255 range check — "999.999.999.999" would have passed every one.

const OCTET = "(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)";
const IPV4_RE = new RegExp(`^${OCTET}(?:\\.${OCTET}){3}$`);
const PREFIX = "(?:[0-9]|[12][0-9]|3[0-2])";
const CIDR_RE = new RegExp(`^${OCTET}(?:\\.${OCTET}){3}/${PREFIX}$`);
const IPV4_OR_CIDR_RE = new RegExp(`^${OCTET}(?:\\.${OCTET}){3}(?:/${PREFIX})?$`);

export function isValidIPv4(value: string): boolean {
  return IPV4_RE.test(value.trim());
}

export function isValidCIDR(value: string): boolean {
  return CIDR_RE.test(value.trim());
}

/** Accepts a plain IPv4 address or IPv4/prefix CIDR (e.g. ip_assignments' ip_address column). */
export function isValidIPv4OrCIDR(value: string): boolean {
  return IPV4_OR_CIDR_RE.test(value.trim());
}

/** Splits "1.2.3.4/24" (or plain "1.2.3.4") into its parts, or null if invalid. */
export function parseIPv4CIDR(value: string): { ip: string; prefix: number | null } | null {
  const trimmed = value.trim();
  const m = trimmed.match(new RegExp(`^(${OCTET}(?:\\.${OCTET}){3})(?:/(${PREFIX}))?$`));
  if (!m) return null;
  return { ip: m[1], prefix: m[2] !== undefined ? parseInt(m[2], 10) : null };
}
