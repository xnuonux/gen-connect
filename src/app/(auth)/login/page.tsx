import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "sign in ... gen connect",
};

// the magic-link entry point. server-rendered ... LoginForm is the client
// island that talks to the auth action.
export default function LoginPage() {
  return (
    <div className="w-full max-w-sm">
      <div className="mb-8">
        <div className="font-serif text-xl tracking-tight text-lunari-cream">
          gen
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.25em] text-lunari-neutral-500">
          connect
        </div>
      </div>

      <h1 className="text-xl font-medium tracking-tight text-lunari-cream">
        sign in
      </h1>
      <p className="mt-1 text-sm text-lunari-neutral-400">
        we send a magic link ... no passwords to forget.
      </p>

      <div className="mt-6">
        <LoginForm />
      </div>
    </div>
  );
}
