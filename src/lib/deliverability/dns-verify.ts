import { normalizeDomain } from "@/lib/deliverability/dns";

// the live dns check behind the wizard. uses dns-over-https (google) rather than
// node:dns so it works in serverless / edge runtimes (netlify, vercel) where raw
// udp:53 is commonly blocked. every query is raced against a timeout and any
// error is treated as "not found" (the honest default), so a slow or unreachable
// resolver degrades to all-false, never a hang.

export type DnsCheck = {
  domain: string;
  spf: boolean;
  mx: boolean;
  dkim: boolean;
  dmarc: boolean;
  dmarcPolicy: string | null;
  checkedAt: string;
};

const DOH = "https://dns.google/resolve";

function withTimeout<T>(p: Promise<T>, ms = 5000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("dns timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

type DohJson = {
  Status?: number;
  Answer?: { name: string; type: number; data: string }[];
};

// query one record type, returning each answer's data with txt quoting stripped.
async function query(name: string, type: "TXT" | "MX"): Promise<string[]> {
  try {
    const res = await withTimeout(
      fetch(`${DOH}?name=${encodeURIComponent(name)}&type=${type}`, {
        headers: { accept: "application/dns-json" },
      }),
    );
    if (!res.ok) return [];
    const json = (await res.json()) as DohJson;
    if (json.Status !== 0 || !json.Answer) return [];
    return json.Answer.map((a) =>
      a.data
        .replace(/"\s+"/g, "")
        .replace(/^"|"$/g, "")
        .trim(),
    );
  } catch {
    return [];
  }
}

export async function verifyDomainDns(rawDomain: string): Promise<DnsCheck> {
  const domain = normalizeDomain(rawDomain) ?? rawDomain.trim().toLowerCase();
  const checkedAt = new Date().toISOString();

  const [spfTxt, mxRecs, dkimTxt, dmarcTxt] = await Promise.all([
    query(`send.${domain}`, "TXT"),
    query(`send.${domain}`, "MX"),
    query(`resend._domainkey.${domain}`, "TXT"),
    query(`_dmarc.${domain}`, "TXT"),
  ]);

  const spf = spfTxt.some((r) => /v=spf1/i.test(r) && /amazonses\.com/i.test(r));
  // a DoH MX answer looks like "10 feedback-smtp.us-east-1.amazonses.com."
  const mx = mxRecs.some((r) => /amazonses\.com/i.test(r));
  // dkim: a txt on resend._domainkey carrying a public key. presence is the best
  // we can confirm without storing resend's per-domain key.
  const dkim = dkimTxt.some((r) => /p=/i.test(r) && r.length > 16);
  const dmarcRecord = dmarcTxt.find((r) => /v=DMARC1/i.test(r)) ?? null;
  const dmarc = !!dmarcRecord;
  const dmarcPolicy = dmarcRecord
    ? (/p=([a-z]+)/i.exec(dmarcRecord)?.[1] ?? null)
    : null;

  return { domain, spf, mx, dkim, dmarc, dmarcPolicy, checkedAt };
}
