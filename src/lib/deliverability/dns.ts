// the dns records a domain needs for authenticated sending through resend (which
// sends via SES). spf + mx live on the `send.<domain>` subdomain (resend's
// envelope-from), dkim on `resend._domainkey.<domain>`, dmarc on
// `_dmarc.<domain>`. spf + dmarc are generated exactly; the dkim public key and
// the region-specific mx target come from the resend dashboard, so we give the
// host + a clear note rather than a confidently-wrong value. pure, testable.

export type DnsRecordKind = "SPF" | "MX" | "DKIM" | "DMARC";

export type DnsRecord = {
  kind: DnsRecordKind;
  type: "TXT" | "MX";
  host: string;
  value: string;
  priority?: number;
  note?: string;
};

// strip protocol / path / port / leading www, lowercase. returns null when it
// doesn't look like a real domain (so the wizard never builds records for junk).
export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.trim().toLowerCase();
  d = d
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
  const ok =
    /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/.test(d);
  return ok ? d : null;
}

// the records the user must add for `domain`. spf + dmarc are exact; mx + dkim
// carry the host + a note (the values are resend-account-specific).
export function expectedRecords(domain: string): DnsRecord[] {
  const d = normalizeDomain(domain) ?? domain.trim().toLowerCase();
  return [
    {
      kind: "SPF",
      type: "TXT",
      host: `send.${d}`,
      value: "v=spf1 include:amazonses.com ~all",
    },
    {
      kind: "MX",
      type: "MX",
      host: `send.${d}`,
      value: "feedback-smtp.us-east-1.amazonses.com",
      priority: 10,
      note: "use the region resend shows you (e.g. us-east-1)",
    },
    {
      kind: "DKIM",
      type: "TXT",
      host: `resend._domainkey.${d}`,
      value: "(copy the unique key from your resend dashboard)",
      note: "the public key is generated per-domain by resend",
    },
    {
      kind: "DMARC",
      type: "TXT",
      host: `_dmarc.${d}`,
      value: `v=DMARC1; p=none; rua=mailto:dmarc@${d}`,
    },
  ];
}
