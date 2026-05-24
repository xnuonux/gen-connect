import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// the magic link lands here. exchange the code for a session, ensure the
// shared user_profiles row exists with our flags, then drop the user into
// the pipeline.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // mark the user as gen-connect-only on first signup. upsert with
  // ignoreDuplicates so a returning user (or one already minted by LUNARI)
  // keeps whatever flags the substrate set ... we never overwrite what isn't
  // ours. column-ownership convention from the shared-substrate brief: gen
  // connect owns is_gen_connect_only + signup_surface on the gc side; it
  // does not touch is_lunari_user, is_nova_press_only, or is_lunari_company.
  const profileUpsert = await supabase
    .from("user_profiles")
    .upsert(
      {
        user_id: data.user.id,
        is_gen_connect_only: true,
        signup_surface: "gen_connect",
        signup_at: new Date().toISOString(),
      },
      { onConflict: "user_id", ignoreDuplicates: true },
    );

  if (profileUpsert.error) {
    // not fatal ... the row may already exist with someone else's flags, in
    // which case ignoreDuplicates already protected it. log and continue.
    console.warn("user_profiles upsert warning ...", profileUpsert.error);
  }

  return NextResponse.redirect(`${origin}/pipeline`);
}
