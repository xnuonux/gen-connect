# gen connect · design system

## the philosophy

cinematic. enterprise-tier without being corporate. dark-first, sparse with high-emphasis color, dense where it counts, breathing where it doesn't. bond, batman, blackrock aladdin, vercel, linear, attio. not dribbble.

## the palette

defined in `src/design/tokens.css`. consumed via tailwind classes (no raw hex in components).

### base
- `--lunari-black` `#08090e` ... page background
- `--lunari-surface` `#0f1117` ... cards, panels, sidebar
- `--lunari-surface-elevated` `#14171f` ... borders, hover states
- `--lunari-cream` `#f5ead8` ... high-emphasis text
- `--lunari-gold` `#c9a84c` ... rare high-emphasis accent
- `--lunari-crimson` `#e94462` ... destructive only
- `--lunari-neutral-400` `#8a8d96` ... muted text
- `--lunari-neutral-500` `#5d6068` ... tertiary

### gen-specific
- `--gen-accent` `#7a1528` ... burgundy. gen-authored content marker.
- `--gen-accent-soft` `#7a152833` ... hover, focus, soft fill

## the gold rule

one gold accent per screen. the highest-scoring card. the deliverability alert. the win celebration pulse. never decorate with gold.

## the burgundy rule

`--gen-accent` is gen's signature, not a brand color. it shows up on:
1. the gen-authored content marker on drafts and replies
2. the primary CTA on the landing page
3. the confidence chip in the unibox
4. the win-celebration pulse (booked + closed)
5. the highlighted node border in the sequence editor

it does NOT show up as a general accent across navigation, headings, or charts. those use neutrals.

## typography

three families:
- **geist sans** ... body, UI, default
- **geist mono** ... data labels, metric values, technical content
- **cinzel** ... hero headers, brand wordmarks, occasional editorial moments

### the mono label signature

every section divider, every column header, every data label uses this:

```tsx
<span className="font-mono text-[10px] tracking-[0.2em] uppercase text-lunari-neutral-400">
  pipeline
</span>
```

it's the lunari fingerprint. used consistently across all three titan products.

### sizing scale

12 / 13 / 14 / 16 / 20 / 28 / 40 / 56. never 18 (neither body nor heading).

## icons

lucide only. 24px grid. 1.25 stroke. one library, no exceptions.

```tsx
<Icon className="h-4 w-4 stroke-[1.25]" />
```

## density

### desktop list views (pipeline table, unibox thread list)
- row height 36-40px
- no row dividers in dense mode, faint borders in expanded
- hover lifts background by one surface level

### kanban (pipeline)
- column width 280-320px
- card padding 12px
- card border on default, gen-accent ring on selected
- drag preview tilts 1° with shadow

### inspectors / drawers
- 320-360px wide
- sticky header (close button)
- sticky footer (primary action)
- scrollable middle

### page-level
- gutters `px-6` or `px-8`
- section spacing `py-6`
- max-width on content `max-w-7xl mx-auto` only for marketing

## motion

planetarium easing. 300ms default. `cubic-bezier(0.22, 0.68, 0.12, 1)`.

utility class:
```html
<div className="planetarium">
```

### follow-through pattern
- main element animates first (200-300ms)
- secondary elements (icons, labels) trail by 80-150ms
- staggered list reveals: 30-60ms delay between items
- `prefers-reduced-motion` cuts all to 0ms (already in tokens.css)

## empty states

never ship "no data." every empty state has:
1. one sentence in dom voice
2. a single CTA pointing to the next move
3. a hint of the eventual data shape

example (pipeline):
```
no contacts yet ... paste a linkedin url or upload a csv to get started.

[paste url] [upload csv]
```

## loading states

skeleton rows matching the final layout, not spinners. 300ms minimum so they don't flash. shimmer pulse uses `--lunari-surface-elevated` over `--lunari-surface`.

## error states

named, recoverable, voice-checked.

bad:
```
Error 500. Please try again.
```

good:
```
that didn't land. give it another shot or ping support if it keeps failing.

[retry]
```

## kanban-specific (plane patterns)

- columns: cold, enriched, drafted, sequenced, replied, booked, closed
- column headers use mono label signature
- count badge next to column name: `cold · 47`
- drag-drop uses dnd-kit with collision detection
- on drop, optimistic stage update + db write
- on db fail, snap back with sonner toast

## table-specific (twenty patterns)

- @tanstack/react-table for the data layer
- sticky header row
- column resize handles on hover
- multi-select via shift-click
- bulk action bar slides up from bottom on selection
- cmd+k command palette overlays everything

## sequence editor (xyflow)

- canvas background `--lunari-black`, grid lines at `--lunari-surface-elevated` 24px gap
- nodes use `--lunari-surface` background, `--lunari-surface-elevated` border
- selected node border `--gen-accent`
- edges are 1.5px lines, neutral by default, gen-accent when traversed
- controls panel matches sidebar styling

## the references

study these:
- vercel dashboard (feb 2026 redesign)
- linear cycles page
- stripe payments dashboard
- attio crm inspector
- raycast command bar
- emil kowalski animation rules
