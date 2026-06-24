import { pathToFileURL } from "node:url";
import path from "node:path";

// resolve "@/x" -> "<cwd>/src/x.ts" so the real source modules run under node
// type-stripping without a bundler. test-only.
const SRC = path.resolve(process.cwd(), "src");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    let abs = path.join(SRC, specifier.slice(2));
    if (!abs.endsWith(".ts")) abs += ".ts";
    return nextResolve(pathToFileURL(abs).href, context);
  }
  return nextResolve(specifier, context);
}
