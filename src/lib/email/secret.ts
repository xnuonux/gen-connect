// shared signing-secret posture for the email token families (thread routing +
// one-click unsubscribe). a hardcoded fallback is fine in dev, but in PRODUCTION
// an unset env var is a real hole: the fallback is in the repo, so anyone could
// forge a token and (for unsubscribe) suppress another user's leads through the
// service-role admin client. so verify() rejects when the secret is the public
// fallback under NODE_ENV=production ... the same fail-closed stance the resend
// webhook secret takes. provision GEN_THREAD_SECRET + GEN_UNSUB_SECRET in prod.

export function signingSecret(
  envValue: string | undefined,
  fallback: string,
): string {
  return envValue && envValue.length > 0 ? envValue : fallback;
}

// true when a real secret is provisioned, or we are not in production. read at
// CALL time (not import) so it reflects the live env and is testable.
export function secretIsTrustworthy(envValue: string | undefined): boolean {
  if (envValue && envValue.length > 0) return true;
  return process.env.NODE_ENV !== "production";
}
