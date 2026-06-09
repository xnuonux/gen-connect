"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { recordOutcome, OUTCOME_TYPES } from "@/lib/supabase/outcomes";

export type LogOutcomeResult = { ok: true } | { ok: false; error: string };

const Input = z.object({
  contactId: z.string().uuid().nullish(),
  eventType: z.enum(OUTCOME_TYPES),
  dollarValue: z.number().min(0).max(100_000_000),
  note: z.string().max(500).nullish(),
});

// log a win to the opportunity ledger. only the session user is trusted (RLS +
// server-set user_id). on success, revalidate the app layout so the "$X in
// opportunities" hero climbs immediately.
export async function logOutcomeAction(
  raw: unknown,
): Promise<LogOutcomeResult> {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, error: "sign in to log a win ..." };

  const parsed = Input.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: "that win didn't look right ... check the amount + type.",
    };
  }

  const r = await recordOutcome(auth.user.id, {
    contactId: parsed.data.contactId ?? null,
    eventType: parsed.data.eventType,
    dollarValue: parsed.data.dollarValue,
    note: parsed.data.note ?? null,
  });
  if (!r.ok) {
    return { ok: false, error: "couldn't log that win ... try again in a moment." };
  }

  // the hero stat lives in the (app) layout ... revalidate it so the number moves.
  revalidatePath("/", "layout");
  return { ok: true };
}
