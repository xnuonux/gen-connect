import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// the workspace tabs sit behind auth. everything else (landing, login,
// callback) stays public.
const PROTECTED_PREFIXES = [
  "/pipeline",
  "/unibox",
  "/signals",
  "/campaigns",
  "/triggers",
  "/sequences",
  "/deliverability",
  "/gen",
  "/draft",
  "/onboarding",
  "/billing",
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

// refreshes the supabase session on every request and gates the workspace.
// returns the response carrying the refreshed auth cookies.
export async function updateSession(
  request: NextRequest,
): Promise<NextResponse> {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // getUser revalidates the token against supabase ... do not gate on the
  // unverified getSession.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // not signed in, reaching for the workspace ... bounce to login.
  if (!user && isProtected(pathname)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // already signed in, sitting on login ... drop them into the pipeline.
  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/pipeline", request.url));
  }

  return response;
}
