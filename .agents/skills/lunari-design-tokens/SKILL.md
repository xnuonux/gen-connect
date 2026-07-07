---
name: lunari-design-tokens
description: Use whenever writing CSS, Tailwind classes, or styling components. Enforces lunari design tokens, no raw hex, gen forest-green accent reserved for gen-authored content only.
---

# lunari-design-tokens

every style decision goes through this skill. raw hex codes outside `src/design/tokens.css` are a violation.

## the tokens

defined in `src/design/tokens.css`. consumed via tailwind classes that map to css variables.

### base palette

| token | hex | use |
|---|---|---|
| `--lunari-black` | `#08090e` | page background |
| `--lunari-surface` | `#0f1117` | cards, panels, sidebar |
| `--lunari-surface-elevated` | `#14171f` | borders, hover states |
| `--lunari-cream` | `#f5ead8` | high-emphasis text |
| `--lunari-gold` | `#c9a84c` | single high-emphasis accent (rare) |
| `--lunari-crimson` | `#e94462` | destructive states only |
| `--lunari-neutral-400` | `#8a8d96` | muted text |
| `--lunari-neutral-500` | `#5d6068` | tertiary text |

### gen-specific

| token | hex | use |
|---|---|---|
| `--gen-accent` | `#2d5f3f` | gen-authored content marker, primary CTAs (forest green, gen's canon) |
| `--gen-accent-soft` | `#2d5f3f33` | hover, focus, soft fills |

## the rules

1. **no raw hex in components.** every color comes from tokens via tailwind classes.
   - bad: `<div className="bg-[#2d5f3f]">`
   - good: `<div className="bg-gen-accent">`
2. **gold is sacred.** one gold accent per screen. if you want a second, use neutral instead.
3. **forest green is gen's signature.** only used for:
   - the gen-authored content marker on drafts and replies
   - the primary CTA on the landing page
   - the confidence chip in the unibox
   - the win-celebration pulse
   - never as a generic brand color across the whole UI
4. **transitions are planetarium.** 300ms, `cubic-bezier(0.22, 0.68, 0.12, 1)`. use the `planetarium` utility class.
5. **dark-first.** the `dark` class is always applied at the html root. no light-mode toggle in v1.

## typography

| stack | when |
|---|---|
| `var(--font-geist-sans)` | body, UI, default |
| `var(--font-geist-mono)` | data labels, metric values, technical content |
| `var(--font-cinzel)` | hero headers, brand wordmarks, occasional editorial moments |

mono labels are typically `text-[10px] tracking-[0.2em] uppercase text-lunari-neutral-400`. that's the lunari signature.

## density

- row height 36-40px for desktop list views
- compact buttons in toolbars (28-32px height)
- gutters at the page level (`px-6` or `px-8`), not inside components
- accept 13px body for tables (`text-sm`), 16px (`text-base`) for prose

## icons

lucide only. 24px grid. 1.25 stroke width. one icon library, no exceptions.

```tsx
<Icon className="h-4 w-4 stroke-[1.25]" />
```

## motion

- main element animates first (200-300ms)
- secondary elements (icons, labels) trail by 80-150ms
- staggered list reveals: 30-60ms delay between items
- respect `prefers-reduced-motion` (already wired in tokens.css)

## empty states

never ship "no data." every empty state has:
- a one-sentence explanation in dom voice
- a single CTA pointing to the next move
- monospace placeholder rows that hint at the eventual data shape (see pipeline page)
