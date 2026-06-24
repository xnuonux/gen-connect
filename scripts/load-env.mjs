// pre-import .env.local into process.env BEFORE the module graph loads, so source
// modules that capture a secret at import time (e.g. thread-token's GEN_THREAD_SECRET)
// see the same values the running next server does. used as a `node --import` hook:
//   node --import ./scripts/load-env.mjs --import ./test/register-alias.mjs <script>
// never echoes any value.
import { readFileSync } from "node:fs";

try {
  const txt = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let v = m[2] ?? "";
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (!(m[1] in process.env)) process.env[m[1]] = v;
  }
} catch {
  // no .env.local ... fall through to whatever is already in the environment.
}
