---
name: MatchRV Rugged Horizon light design
description: Current light design system for rv-marketplace, intentional dark blocks, and the heading-color gotcha that breaks dark-section headings
---

## Current design system (LIGHT "Rugged Horizon")
The rv-marketplace web artifact uses a LIGHT design system (replaced the earlier dark theme).
Core tokens live in `index.css :root`: background `#f4fbfa`, foreground `#161d1d`, primary cyan `#00CED1`,
secondary/dark `#0B1117`, border/input `#E2E8F0`, `--radius 0.25rem`; fonts Outfit (display) + DM Sans (body).
Cool-gray neutral ramp: `#161d1d` / `#3b4949` / `#6b7a7a` / `#E2E8F0` / `#eef5f4` / `#f4fbfa`; placeholder gray `#bac9c9`.
On-light cyan text uses deep teal `#00696b` (plain `#00CED1` cyan text fails contrast on light); cyan stays `#00CED1` for fills/buttons.

## Intentional dark blocks — do NOT "fix" to light
Header, footer, mobile bottom nav, hero sections, and major CTA bands are deliberately dark: `bg-[#0B1117]` + `text-white`.
These are part of the design, not leftovers from the old dark theme. Logo stays `matchrv-logo-dark.png` (light artwork for dark bg) in the dark header/footer.

## GOTCHA: never hardcode a color in the global heading rule
The global `h1..h6` base rule in `index.css` must NOT `@apply text-foreground` (or any fixed color).
**Why:** a hardcoded heading color sets color directly on the element, overriding the inherited `text-white` from
`bg-[#0B1117]` dark sections — so every heading on a dark block silently renders dark-on-dark (invisible). This bit us
when flipping dark→light inverted `--foreground`; the bug is invisible in code and only shows in a screenshot.
**How to apply:** keep headings inheriting their section's color (dark via body on light pages, white on dark sections).
If a specific light card needs a dark heading, set `text-foreground` locally on that heading — never globally.

## admin.tsx is a separate, intentionally-dark internal tool
`pages/admin.tsx` uses Tailwind `gray-950`/`gray-900`/`indigo` classes (not brand hexes) and is self-consistently dark.
It is NOT part of the public marketplace look and is unaffected by the token flip. Leave it out of public re-skins.

## Legacy palette to watch for
The site historically had a second WARM-gray neutral palette (`#faf9f8 #e9e8e7 #e3e2e2 #1b1c1c #707972 #404942 #f5f3f3` …).
It has been converted to the cool Rugged Horizon neutrals above. If warm-gray hexes reappear, they are off-palette and should be converted.
