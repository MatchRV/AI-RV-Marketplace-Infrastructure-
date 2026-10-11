import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { indexSnapshot } from '../src/dataset.js';
import { runSearch } from '../src/match.js';
const snapshot=JSON.parse(gunzipSync(readFileSync(new URL('../data/inventory.snapshot.json.gz',import.meta.url))).toString());
const {units}=indexSnapshot(snapshot);
const result=runSearch(units,{location:{place:'Texas',radiusMiles:250},rvTypes:['travel_trailer'],mustHave:['bunkhouse'],lengthMaxFt:30,priceMinUsd:35000,priceMaxUsd:45000});
console.log(JSON.stringify({funnel:result.funnel,results:result.results.slice(0,5).map(m=>({title:m.unit.title,price:m.unit.priceUsd.value,length:m.unit.lengthFt,status:m.hardStatus,bunks:m.unit.bunkhouse})),vibe:units.filter(u=>u.id==='stk:bennettsrv.com:unknown:IGSN-18610951').map(u=>({length:u.lengthFt,bunks:u.bunkhouse}))},null,2));
