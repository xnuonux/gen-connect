"use client";

import { useState } from "react";
import { sendMagicLink } from "@/app/actions/auth";

type Status = "idle" | "sending" | "sent" | "error";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;

    setStatus("sending");
    setError("");

    const result = await sendMagicLink(email);
    if (result.ok) {
      setStatus("sent");
    } else {
      setStatus("error");
      setError(result.error);
    }
  }

  if (status === "sent") {
    return (
      <div className="rounded-md border border-lunari-surface-elevated bg-lunari-surface p-4">
        <p className="text-sm font-medium text-lunari-cream">
          check your inbox
        </p>
        <p className="mt-1 text-sm text-lunari-neutral-400">
          we sent a link to {email} ... click it and you are in.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="email"
        name="email"
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="you@example.com"
        required
        autoComplete="email"
        className="w-full rounded-md border border-lunari-surface-elevated bg-lunari-surface px-3 py-2 text-sm text-lunari-cream outline-none placeholder:text-lunari-neutral-500 focus-visible:ring-1 focus-visible:ring-gen-accent"
      />

      <button
        type="submit"
        disabled={status === "sending"}
        className="planetarium w-full rounded-md bg-gen-accent px-3 py-2 text-sm font-medium text-lunari-cream hover:bg-gen-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "sending" ? "sending ..." : "send magic link"}
      </button>

      {status === "error" ? (
        <p className="text-sm text-lunari-crimson">{error}</p>
      ) : null}
    </form>
  );
}
