import { createClient } from "@/lib/supabase/server";
import { normalizeDomain } from "@/lib/deliverability/dns";
import type { DnsCheck } from "@/lib/deliverability/dns-verify";

export type SendingDomain = {
  id: string;
  domain: string;
  spfVerified: boolean;
  dkimVerified: boolean;
  dmarcVerified: boolean;
  dmarcPolicy: string | null;
  status: string;
  lastCheckedAt: string | null;
};

type Row = {
  id: string;
  domain: string;
  spf_verified: boolean;
  dkim_verified: boolean;
  dmarc_verified: boolean;
  dmarc_policy: string | null;
  status: string;
  last_checked_at: string | null;
};

function mapRow(r: Row): SendingDomain {
  return {
    id: r.id,
    domain: r.domain,
    spfVerified: r.spf_verified,
    dkimVerified: r.dkim_verified,
    dmarcVerified: r.dmarc_verified,
    dmarcPolicy: r.dmarc_policy,
    status: r.status,
    lastCheckedAt: r.last_checked_at,
  };
}

const COLS =
  "id, domain, spf_verified, dkim_verified, dmarc_verified, dmarc_policy, status, last_checked_at";

// the user's sending domains, oldest first. RLS scopes the read.
export async function listSendingDomains(): Promise<SendingDomain[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("gc_sending_domains")
    .select(COLS)
    .order("created_at", { ascending: true });
  if (error) return [];
  return ((data ?? []) as Row[]).map(mapRow);
}

// add a domain (normalized). idempotent-ish ... the unique index rejects a dup.
export async function addSendingDomain(
  raw: string,
): Promise<{ ok: boolean; error?: string }> {
  const domain = normalizeDomain(raw);
  if (!domain) {
    return { ok: false, error: "that doesn't look like a domain ... try yourdomain.com." };
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return { ok: false, error: "sign in first ..." };

  const { error } = await supabase
    .from("gc_sending_domains")
    .insert({ user_id: userId, domain });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "you already added that one." };
    return { ok: false, error: "couldn't add that domain ... try again." };
  }
  return { ok: true };
}

// is this domain verified (spf + dkim + mx) for the current user? the live-send
// gate reads this so a real send never leaves an unauthenticated domain. rls
// scopes the read to the user.
export async function isDomainVerified(rawDomain: string): Promise<boolean> {
  const domain = normalizeDomain(rawDomain) ?? rawDomain.trim().toLowerCase();
  const supabase = await createClient();
  const { data } = await supabase
    .from("gc_sending_domains")
    .select("id")
    .eq("domain", domain)
    .eq("status", "verified")
    .limit(1)
    .maybeSingle();
  return !!data;
}

// persist a dns check. a domain is send-ready when spf + dkim + mx all pass
// (resend's required three); dmarc is tracked as a recommended extra.
export async function saveDomainVerification(
  domainId: string,
  check: DnsCheck,
  resendDomainId?: string | null,
): Promise<void> {
  const supabase = await createClient();
  const ready = check.spf && check.dkim && check.mx;
  await supabase
    .from("gc_sending_domains")
    .update({
      spf_verified: check.spf,
      dkim_verified: check.dkim,
      dmarc_verified: check.dmarc,
      dmarc_policy: check.dmarcPolicy,
      status: ready ? "verified" : "failed",
      last_checked_at: check.checkedAt,
      ...(resendDomainId ? { resend_domain_id: resendDomainId } : {}),
    })
    .eq("id", domainId);
}
