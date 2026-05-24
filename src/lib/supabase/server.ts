import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// the server-side supabase client. reads the session from request cookies and,
// wherever it can (route handlers, server actions, middleware), refreshes it.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // server components cannot set cookies ... middleware refreshes the
            // session, so this is safe to ignore.
          }
        },
      },
    },
  );
}
