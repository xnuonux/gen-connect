/* ───────────────────────────────────────────────────────────────────────────
 * gen connect -> lunari ... the styling bridge
 *
 * gen's components are tailwind-class styled with `lunari-*` / `gen-accent`
 * tokens; lunari's tailwind config uses bare names (surface, cream, gen) and its
 * sectors use inline var() styles. this file makes gen's components render
 * UNCHANGED inside the lunari SPA, with zero edits to gen's className strings.
 *
 * the css var VALUES already match ... both are the one lunari design system, and
 * `--gen` (#2d5f3f forest green) is already a live token. this is pure aliasing.
 *
 * TWO parts. you need both:
 *   PART A -> paste into lunari/frontend/tailwind.config.js (so the utility
 *             CLASSES like `bg-lunari-surface` get generated)
 *   PART B -> paste into lunari/frontend/src/styles/global.css (so the custom
 *             classes + arbitrary `var(--gen-accent)` refs RESOLVE)
 * ─────────────────────────────────────────────────────────────────────────── */

// ╔═══════════════════════════════════════════════════════════════════════════
// ║ PART A ... merge into tailwind.config.js `theme.colors` (it REPLACES, not
// ║ extends, so add these keys alongside the existing ones). these alias gen's
// ║ class names onto lunari's live css vars.
// ╚═══════════════════════════════════════════════════════════════════════════
export const genConnectColorAliases = {
  // surfaces
  'lunari-black': 'var(--black)',
  'lunari-surface': 'var(--surface)',
  'lunari-surface-elevated': 'var(--surface-hover)', // gen's "elevated" == lunari's hover plate
  // ink (gen adopts lunari's moon-silver cream, not its own warm cream ... one design language)
  'lunari-cream': 'var(--cream)',
  'lunari-neutral-400': 'var(--muted)',
  'lunari-neutral-500': 'var(--dim)',
  // accents
  'lunari-gold': 'var(--gold)',
  'lunari-crimson': 'var(--crimson)', // destructive; use var(--danger) instead if you prefer the semantic token
  // gen's signature ... already a live lunari token
  'gen-accent': 'var(--gen)',
  'gen-accent-soft': 'color-mix(in srgb, var(--gen) 20%, transparent)',
};

/* ╔═══════════════════════════════════════════════════════════════════════════
 * ║ PART B ... paste into lunari/frontend/src/styles/global.css
 * ║ (the LIVE :root is global.css; design-system/tokens.css is stale + not imported)
 * ║
 * ║ this does two things: (1) defines gen's namespaced css vars in terms of
 * ║ lunari's, so gen's arbitrary values like
 * ║ `shadow-[0_0_28px_-12px_var(--gen-accent)]` and the custom classes below
 * ║ resolve; (2) ports gen's custom utility classes + keyframes verbatim.
 * ╚═══════════════════════════════════════════════════════════════════════════
 *
 * :root {
 *   --lunari-black: var(--black);
 *   --lunari-surface: var(--surface);
 *   --lunari-surface-elevated: var(--surface-hover);
 *   --lunari-cream: var(--cream);
 *   --lunari-gold: var(--gold);
 *   --lunari-crimson: var(--crimson);
 *   --lunari-neutral-400: var(--muted);
 *   --lunari-neutral-500: var(--dim);
 *   --gen-accent: var(--gen);
 *   --gen-accent-soft: color-mix(in srgb, var(--gen) 20%, transparent);
 *   --motion-duration: 300ms;
 *   --motion-easing: cubic-bezier(0.22, 0.68, 0.12, 1);
 * }
 *
 * @layer utilities {
 *   .planetarium {
 *     transition-duration: var(--motion-duration);
 *     transition-timing-function: var(--motion-easing);
 *   }
 *   .reveal-up {
 *     animation: gen-reveal-up var(--motion-duration) var(--motion-easing) both;
 *   }
 *   .lunari-canvas {
 *     background-color: var(--lunari-black);
 *     background-image:
 *       radial-gradient(115% 75% at 50% -10%, color-mix(in srgb, var(--gen-accent) 13%, transparent), transparent 55%),
 *       radial-gradient(85% 55% at 94% 2%, color-mix(in srgb, var(--lunari-gold) 6%, transparent), transparent 48%),
 *       radial-gradient(125% 95% at 50% 118%, color-mix(in srgb, var(--lunari-surface) 75%, transparent), transparent 60%);
 *     background-attachment: fixed;
 *     background-repeat: no-repeat;
 *   }
 *   .surface-raised {
 *     box-shadow:
 *       0 1px 0 0 color-mix(in srgb, var(--lunari-cream) 5%, transparent) inset,
 *       0 12px 32px -16px color-mix(in srgb, var(--lunari-black) 88%, transparent);
 *   }
 *   .text-glow-gold {
 *     text-shadow: 0 0 20px color-mix(in srgb, var(--lunari-gold) 32%, transparent);
 *   }
 * }
 *
 * @keyframes gen-reveal-up { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
 * @keyframes gen-win-ring { 0% { opacity: 0; transform: scale(0.6); } 25% { opacity: 0.9; } 100% { opacity: 0; transform: scale(2.3); } }
 * @keyframes gen-win-quote { 0% { opacity: 0; transform: translateY(10px); } 18%,78% { opacity: 1; transform: none; } 100% { opacity: 0; transform: translateY(-6px); } }
 * @keyframes gen-verify-pulse {
 *   0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--gen-accent) 65%, transparent); }
 *   100% { box-shadow: 0 0 0 16px color-mix(in srgb, var(--gen-accent) 0%, transparent); }
 * }
 * .gen-win-ring { animation: gen-win-ring 1.5s var(--motion-easing) forwards; }
 * .gen-win-quote { animation: gen-win-quote 1.9s var(--motion-easing) forwards; }
 * .gen-verify-pulse { animation: gen-verify-pulse 1100ms var(--motion-easing) 1; }
 *
 * @media (prefers-reduced-motion: reduce) {
 *   .reveal-up, .gen-win-ring, .gen-win-quote, .gen-verify-pulse { animation: none; }
 * }
 *
 * // only needed if you port the sequences (xyflow) surface:
 * .react-flow__controls { box-shadow: none; border-radius: 8px; overflow: hidden; }
 * .react-flow__controls-button {
 *   background: var(--lunari-surface);
 *   border-bottom: 1px solid var(--lunari-surface-elevated);
 *   color: var(--lunari-neutral-400);
 *   transition-duration: var(--motion-duration);
 *   transition-timing-function: var(--motion-easing);
 * }
 * .react-flow__controls-button:hover { background: var(--lunari-surface-elevated); color: var(--lunari-cream); }
 * .react-flow__controls-button svg { fill: currentColor; }
 */

/* ╔═══════════════════════════════════════════════════════════════════════════
 * ║ THE ONE CAVEAT ... slash-opacity modifiers
 * ╚═══════════════════════════════════════════════════════════════════════════
 * gen uses tailwind opacity modifiers on these tokens: `bg-gen-accent/90`,
 * `text-lunari-cream/85`, `text-lunari-cream/90`, `bg-lunari-surface/60`,
 * `bg-lunari-black/50`, `bg-lunari-black/40`, `border-gen-accent/40`,
 * `border-gen-accent/50`, `bg-gen-accent-soft`.
 *
 * tailwind can only apply the `/NN` alpha to a color whose value carries an
 * `<alpha-value>` placeholder. with the plain `var(--x)` aliases above, the `/NN`
 * is a NO-OP ... the class still applies the base color at FULL opacity (visually
 * very close, since these are subtle dims on dark surfaces). lunari's OWN tokens
 * have the same property, so this is consistent with the house.
 *
 * if you want pixel-exact opacity, define the handful of needed tokens in channel
 * form instead, e.g. in global.css add `--gen-rgb: 45 95 63;` and alias
 * `'gen-accent': 'rgb(var(--gen-rgb) / <alpha-value>)'` in PART A. only worth it
 * for the few tokens that actually take a `/NN` modifier. otherwise: ship the raw
 * var aliases, accept full-opacity on those few classes.
 */
