import { normalizeDomain } from "@/lib/deliverability/dns";

// the AUTHORITATIVE domain check: resend's own verification status. resend will
// not mark a domain 'verified' until spf + dkim + mx actually resolve to its real
// records (the unique dkim public key included), so this is stronger than a dns
// presence check ... 'verified' here means truly send-ready, dkim and all. it is
// read-only (GET /domains) and graceful (null on no-key / error / timeout), so
// the dns-over-https check stays the self-serve fallback when no resend key is
// configured or the domain is not in the resend account.

const RESEND_API = "https://api.resend.com/domains";

export type ResendDomain = { id: string; status: string };

type ListJson = {
  data?: { id?: unknown; name?: unknown; status?: unknown }[];
};

// pure: find the domain (case-insensitive) in a resend list response.
export function parseResendDomain(
  json: unknown,
  domain: string,
): ResendDomain | null {
  const want = (normalizeDomain(domain) ?? domain).toLowerCase();
  const data = (json as ListJson)?.data;
  if (!Array.isArray(data)) return null;
  const match = data.find(
    (x) => typeof x?.name === "string" && x.name.toLowerCase() === want,
  );
  if (!match || typeof match.id !== "string") return null;
  return {
    id: match.id,
    status: typeof match.status === "string" ? match.status : "unknown",
  };
}

// resend marks a domain verified only when every required record is live.
export function resendVerified(d: ResendDomain | null): boolean {
  return d?.status === "verified";
}

function withTimeout<T>(p: Promise<T>, ms = 5000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("resend timeout")), ms);
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

export async function fetchResendDomain(
  domain: string,
): Promise<ResendDomain | null> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  try {
    const res = await withTimeout(
      fetch(RESEND_API, { headers: { authorization: `Bearer ${key}` } }),
    );
    if (!res.ok) return null;
    return parseResendDomain(await res.json(), domain);
  } catch {
    return null;
  }
}
