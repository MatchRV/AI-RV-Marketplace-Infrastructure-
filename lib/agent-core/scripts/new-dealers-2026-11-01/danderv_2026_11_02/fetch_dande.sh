#!/bin/bash
# fetch_dande.sh: how danderv.com was read on 2026-11-02 (browser-like GET, >=1.6 s between requests, one host, nothing bypassed).
# TLS: the server omits its intermediate; like a browser's AIA fetch, we add the CCADB-published "Certera RSA DV SSL CA 2"
# (issuer Sectigo Public Server Authentication Root R46, SHA256 C38ADC49...84F8) to the system roots; full chain verifies (code 0).
# robots.txt: 404 (no rules). Listing: inventory.html?from=cfcategory&vehicle_category=<cat> loads rows via the site's own XHR
# connector.html?param=cfcategory&data=<cat>; page 2 (param=pagelinks) returns 0 rows, so units past page 1 were reached through the
# site's make filter (param=cfmake&data=<make>, which lists across all categories). Unit pages: view_vehicle.html?vehicle_id=<base64 id>.
UA='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
G(){ curl -sS -m 30 --cacert cabundle.pem -c jar.txt -b jar.txt -A "$UA" -H 'Accept-Language: en-US,en;q=0.9' "$@"; sleep 2; }
for c in Motorhomes "Travel%20Trailers" "5th%20Wheels" Toyhaulers; do n=${c//%20/}
  G -o /dev/null "https://danderv.com/inventory.html?from=cfcategory&vehicle_category=$c"
  G -o cat/$n.conn.html "https://danderv.com/connector.html?param=cfcategory&data=$c&ymmt=&inventory="; done
# make-filtered listings -> mk/<cat>.<make>.html ; unit pages -> units/<id>.html (see summary.md for the exact loop)
