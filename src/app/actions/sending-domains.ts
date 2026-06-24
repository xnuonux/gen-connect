"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  listSendingDomains,
  addSendingDomain,
  saveDomainVerification,
  type SendingDomain,
} from "@/lib/supabase/sending-domains";
import { verifyDomainDns, type DnsCheck } from "@/lib/deliverability/dns-verify";
import { fetchResendDomain, resendVerified } from "@/lib/deliverability/resend-domains";

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export type DomainsResult =
  | { ok: true; domains: SendingDomain[] }
  | { ok: false; error: string };

export type CheckResult =
  | { ok: true; check: DnsCheck; domains: SendingDomain[] }
  | { ok: false; error: string };

export async function addDomainAction(raw: unknown): Promise<DomainsResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "sign in first ..." };
  const parsed = z.object({ domain: z.string().min(3).max(253) }).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "that domain didn't look right ... try yourdomain.com." };

  const r = await addSendingDomain(parsed.data.domain);
  if (!r.ok) return { ok: false, error: r.error ?? "couldn't add it." };
  revalidatePath("/deliverability");
  return { ok: true, domains: await listSendingDomains() };
}

export async function checkDomainAction(raw: unknown): Promise<CheckResult> {
  const user = await requireUser();
  if (!user) return { ok: false, error: "sign in first ..." };
  const parsed = z
    .object({ id: z.string().uuid(), domain: z.string().min(3).max(253) })
    .safeParse(raw);
  if (!parsed.success) return { ok: false, error: "that domain didn't look right ..." };

  // the doh self-serve check + the authoritative resend status (when a key is
  // configured). resend 'verified' confirms spf + dkim + mx all resolve to its
  // real records, so it trumps the doh presence check ... 'verified' then means
  // the real dkim key is published, not just "something is there".
  const [dohCheck, resend] = await Promise.all([
    verifyDomainDns(parsed.data.domain),
    fetchResendDomain(parsed.data.domain),
  ]);
  const check: DnsCheck =
    resend && resendVerified(resend)
      ? { ...dohCheck, spf: true, dkim: true, mx: true }
      : dohCheck;
  await saveDomainVerification(parsed.data.id, check, resend?.id ?? null);
  revalidatePath("/deliverability");
  return { ok: true, check, domains: await listSendingDomains() };
}
