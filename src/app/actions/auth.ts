"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().trim().email();

export type MagicLinkResult = { ok: true } | { ok: false; error: string };

// send a magic link to the given email. supabase mints the user on the first
// link if they do not exist yet.
export async function sendMagicLink(email: string): Promise<MagicLinkResult> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return {
      ok: false,
      error: "that email didn't look right ... check it and try again.",
    };
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3001";
  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: `${siteUrl}/callback` },
  });

  if (error) {
    return {
      ok: false,
      error: "couldn't send the link ... give it another shot.",
    };
  }

  return { ok: true };
}
