"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { loadLeads, type LeadInput } from "@/lib/supabase/leads";

export type ImportResult =
  | { ok: true; loaded: number; skipped: number }
  | { ok: false; error: string };

// loose ... the client maps columns and may include junk rows; we filter to the
// valid ones server-side rather than rejecting the whole batch.
const Input = z.object({
  rows: z
    .array(
      z.object({
        name: z.string().nullish(),
        email: z.string().nullish(),
        company_name: z.string().nullish(),
        title: z.string().nullish(),
      }),
    )
    .min(1)
    .max(5000),
});

const EMAIL = /^\S+@\S+\.\S+$/;

// import the user's OWN list (free path): lands as COLD, unverified, no synthetic
// hook ... so verify / enrich / draft stay the paid moves. loadLeads dedupes
// against the pipeline + by email. rows missing a name or a usable email are
// dropped (counted into skipped), never failing the whole import.
export async function importContactsAction(raw: unknown): Promise<ImportResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "sign in to import a list ..." };

  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "that didn't parse ... try the file again." };
  }

  const valid: LeadInput[] = parsed.data.rows
    .map((r) => ({
      name: (r.name ?? "").trim(),
      email: (r.email ?? "").trim(),
      company_name: (r.company_name ?? "").trim() || null,
      title: (r.title ?? "").trim() || null,
    }))
    .filter((r) => r.name.length > 0 && EMAIL.test(r.email));

  const invalid = parsed.data.rows.length - valid.length;
  if (valid.length === 0) {
    return {
      ok: false,
      error: "none of those rows had a name + a usable email ... check the column mapping.",
    };
  }

  const res = await loadLeads(auth.user.id, valid, {
    source: "import",
    stage: "cold",
    verified: false,
    syntheticHook: false,
  });
  if (res.error) return { ok: false, error: res.error };

  revalidatePath("/pipeline");
  return { ok: true, loaded: res.loaded, skipped: res.skipped + invalid };
}
