import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// next 16 renamed the middleware entrypoint to proxy. same job ... refresh the
// supabase auth cookie on every request and gate the (app) routes.
export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // run on everything except next internals and static asset files.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
