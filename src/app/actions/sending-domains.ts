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

  const check = await verifyDomainDns(parsed.data.domain);
  await saveDomainVerification(parsed.data.id, check);
  revalidatePath("/deliverability");
  return { ok: true, check, domains: await listSendingDomains() };
}
