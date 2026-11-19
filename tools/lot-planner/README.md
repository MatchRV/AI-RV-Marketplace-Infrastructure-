# Lot Planner

A single-file "will it fit on my lot?" widget, in the style of canibuild. It works for any address in the world, and opens on Tacoma, WA.

## What it does
1. Address search (Esri public geocoder, OpenStreetMap fallback) zooms to the property on Esri aerial imagery.
2. The visitor clicks the lot corners to trace the property line. Corners can be dragged afterward.
3. They pick a model (tiny home, park model, ADU, travel trailer, Class A, or a custom size), rotate it and drag it.
4. It reports lot area, footprint, lot coverage and the distance to the closest lot line, and turns red when the structure crosses the setback or the lot line.
5. A lead form captures name, email and phone plus the full site plan (lot polygon, footprint position, fit result) as JSON.

## Setup
- Host `index.html` anywhere (any static host, or embed it in an `<iframe>` on a site).
- Set `CONFIG.LEAD_ENDPOINT` to a URL that accepts a JSON POST (a Zapier/Make webhook, HubSpot, or your own API). Until it is set, the form shows the payload it would have sent.
- Change `CONFIG.start` to center it somewhere else.

## Known limits
- The lot line is traced by hand. Automatic parcel boundaries need a parcel data source: free county GIS layers (Pierce County publishes one) work for a single county, and Regrid or similar paid APIs cover the whole US.
- The setback is one value for every side. Real zoning has different front, side and rear setbacks, plus height, separation from the main house, utility and easement rules. Results are a planning estimate.
- No accounts, no saving, no PDF export yet.
