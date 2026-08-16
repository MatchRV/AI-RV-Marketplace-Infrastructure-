# MatchRV Replit Handoff

Generated: 2026-05-17

## What this bundle contains

This bundle contains the changed source files for:
- Dealer login flow from homepage/main nav: /dealers/login -> local demo dealer session -> /dealers portal.
- Local Clerk fallback for development so the app can run without a real Clerk key.
- Buyer intent tracking across page views, browse filters, explicit location/state search, listing views, saves, tow checks, contact opens, dealer contacts, price alerts, AI Outfitter activity, and match/pricing lead forms.
- Lead API enrichment: public leads and price-alert leads store enriched uyerProfile.matchrvIntent using frontend intent data plus recent server-side analytics events by session ID.
- Dealer portal display of readiness, proximity/location, filter summary, and buyer intent trail.

## Files included

- artifacts/rv-marketplace/src/App.tsx
- artifacts/rv-marketplace/src/components/layout.tsx
- artifacts/rv-marketplace/src/contexts/auth-context.tsx
- artifacts/rv-marketplace/src/hooks/use-chat-session.ts
- artifacts/rv-marketplace/src/lib/analytics.ts
- artifacts/rv-marketplace/src/lib/buyer-intent.ts
- artifacts/rv-marketplace/src/lib/dealer-auth.ts
- artifacts/rv-marketplace/src/pages/browse.tsx
- artifacts/rv-marketplace/src/pages/dealer-login.tsx
- artifacts/rv-marketplace/src/pages/dealers.tsx
- artifacts/rv-marketplace/src/pages/discover.tsx
- artifacts/rv-marketplace/src/pages/home.tsx
- artifacts/rv-marketplace/src/pages/listing-detail.tsx
- artifacts/rv-marketplace/src/pages/match.tsx
- artifacts/rv-marketplace/src/pages/pricing.tsx
- artifacts/api-server/src/routes/leads.ts


## Verification performed locally

- ite build passed for rtifacts/rv-marketplace with PORT=5173, BASE_PATH=/, and local placeholder Clerk key.
- App dev server was running at http://localhost:5173.
- Full typecheck is still blocked by existing workspace setup issues unrelated to these changes: missing generated @workspace/api-client-react/src/generated/api.schemas imports in the frontend and missing Node type definitions for the API server.

## Privacy note

This implementation uses first-party behavioral signals and explicit location inputs, such as selected city/state, selected filters, listing/dealer location, saves, and contact intent. It does not silently request or collect precise GPS location.
