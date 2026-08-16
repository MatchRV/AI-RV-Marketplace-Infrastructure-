---
name: Dealer portal tier gating
description: How the three-tier dealer portal is structured and how feature gates work.
---

## Tier system

Three tiers: `free` | `intelligence` | `agent` — stored in `DealerSession.tier` in `localStorage` (key: `matchrv_dealer_session`).

`TIER_RANK` map (`{ free: 0, intelligence: 1, agent: 2 }`) and `SECTION_TIER` map live at the top of `dealers.tsx` and drive all gating decisions. No DB table needed for the demo; `upgradeDealerTier()` in `dealer-auth.ts` mutates the localStorage session in place.

## Feature gate pattern

`DealerGate` component (in `dealers.tsx`) wraps any section. It calls `useDealerEntitlement(required, current)` and renders either the children or the paywall + `GatedPreview`.

```tsx
<DealerGate requiredTier="intelligence" currentTier={tier} onUpgrade={() => setUpgradeTarget("intelligence")}>
  <InventoryIntelligence />
</DealerGate>
```

`handleNavClick` in `Dealers()` intercepts sidebar/mobile-nav clicks and opens `UpgradeModal` if the tier is insufficient instead of switching sections.

## What each tier unlocks

- `free` — Leads (Active Leads, Dashboard, Performance, Settings)
- `intelligence` — + Inventory Intelligence (aged stock, high-demand units, demand gap analysis)
- `agent` — + AI Lead Agent (5-factor readiness, tier pricing cards, AI sales opener)

## On each lead card (free tier)

`LeadTierBadge` shows the readiness-score bucket (Inquiry $49 / Engaged $195 / Qualified $295 / Ready-to-Buy $495). `BuyerRoadmapPanel` shows a progressive-disclosure roadmap with more fields unlocked as the readiness score increases.

**Why:** feature gating lives entirely in the React session layer so demo flows work instantly; future production upgrade would call a payment webhook and update the session via a real API endpoint.
