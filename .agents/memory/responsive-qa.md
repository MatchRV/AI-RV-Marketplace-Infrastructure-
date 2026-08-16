---
name: Responsive QA — inverted arbitrary font sizes
description: A class of mobile-overflow bug introduced by visual-editor edits in the rv-marketplace web app
---

# Responsive QA — inverted arbitrary font sizes

Symptom: a heading or button looks fine on desktop but is enormous and overflows the
viewport on mobile.

Root cause pattern: an element has a large **base** arbitrary font size (e.g.
`text-[100px]` or `text-[40px]`) together with *smaller* responsive overrides
(`sm:text-6xl md:text-7xl`). Tailwind is mobile-first, so the base applies below `sm`,
meaning the phone gets the giant size and larger screens get the smaller one — inverted.

**Why:** visual-editor drag/resize can write an arbitrary base size without setting a
sane mobile-first scale, leaving the base larger than the breakpoint overrides.

**How to apply:**
- When asked to make the site work on mobile, screenshot the key pages at ~402px wide
  (and 1280px for desktop) — the inversion is invisible on desktop.
- Grep for suspect sizes: `rg "text-\[[0-9]{2,}px\]"` and check any line that also has
  `sm:text-`/`md:text-`. Replace with a mobile-first scale (e.g.
  `text-5xl sm:text-6xl md:text-7xl`) so the base is the smallest.
- Note: rv-marketplace runs Vite (HMR), so class fixes hot-reload — no workflow restart
  needed (unlike api-server).
