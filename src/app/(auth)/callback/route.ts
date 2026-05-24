import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// the magic link lands here. exchange the code for a session, then drop the
// user into the pipeline.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}/pipeline`);
    }
  }

  // no code, or the exchange failed ... back to login.
  return NextResponse.redirect(`${origin}/login`);
}
