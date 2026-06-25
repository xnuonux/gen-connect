// next 16 dropped `next lint`. eslint-config-next 16 ships native flat configs
// ... import them straight in, no FlatCompat shim (the shim trips a circular
// json error loading next's plugin objects under eslint 9).
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  {
    // docs/ holds handoff artifacts (e.g. the lunari port templates) that target
    // ANOTHER repo's paths ... never linted/compiled here.
    ignores: [".next/**", "node_modules/**", "next-env.d.ts", "docs/**"],
  },
  ...nextCoreWebVitals,
  ...nextTypescript,
];

export default eslintConfig;
