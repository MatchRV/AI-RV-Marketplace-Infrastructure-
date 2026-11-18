/**
 * RV cards widget (MCP Apps / ChatGPT Apps SDK). A fixed, declarative
 * renderer for the card payload built in src/lib/rv-cards.ts: three views
 * (results, compare, detail), no tool calls, no network access besides the
 * listing photos named in the payload.
 *
 * Data in: the tool result's _meta["matchrv/cards"], from either
 *  - window.openai.toolResponseMetadata (ChatGPT), or
 *  - the MCP Apps ui/notifications/tool-result message (params._meta).
 *
 * Every string is rendered with textContent. Links must be http(s).
 * A field missing from the payload is not rendered at all.
 */
export const RV_CARDS_URI = "ui://matchrv/rv-cards-v1.html";
export const RV_CARDS_MIME = "text/html;profile=mcp-app";

export const RV_CARDS_HTML = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MatchRV RV cards</title><style>
:root{color-scheme:light dark;--bg:transparent;--card:#fff;--ink:#14262b;--muted:#566b70;--line:#d5e3e3;--accent:#075e63;--price:#075e63;--warn:#8a5a00;font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}
@media(prefers-color-scheme:dark){:root{--card:#172b30;--ink:#e6f2f1;--muted:#a9c2c2;--line:#355057;--accent:#6fd3da;--price:#8be3e8;--warn:#ffcf7a}}
:root[data-theme=light]{--card:#fff;--ink:#14262b;--muted:#566b70;--line:#d5e3e3;--accent:#075e63;--price:#075e63;--warn:#8a5a00;color-scheme:light}
:root[data-theme=dark]{--card:#172b30;--ink:#e6f2f1;--muted:#a9c2c2;--line:#355057;--accent:#6fd3da;--price:#8be3e8;--warn:#ffcf7a;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;padding:8px}a{color:var(--accent)}a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.row{display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:2px 2px 10px}
.card{flex:0 0 260px;scroll-snap-align:start;background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
.ph{aspect-ratio:4/3;background:var(--line);overflow:hidden}.ph img{width:100%;height:100%;object-fit:cover;display:block}
.body{padding:10px 12px 12px;display:flex;flex-direction:column;gap:4px;flex:1}
.t{font-weight:650;font-size:15px;margin:0}.price{font-weight:700;font-size:17px;color:var(--price)}
.muted{color:var(--muted);font-size:13px}.badge{display:inline-block;font-size:12px;font-weight:600;color:var(--warn)}
.specs{display:flex;flex-wrap:wrap;gap:4px 10px;margin:4px 0 0;padding:0;list-style:none;font-size:13px}.specs b{font-weight:600}
.go{margin-top:auto;padding-top:6px;font-weight:600;text-decoration:none}
.empty{padding:14px;border:1px dashed var(--line);border-radius:12px;color:var(--muted)}
.cmp{overflow-x:auto}table{border-collapse:collapse;width:100%;min-width:420px;background:var(--card);border:1px solid var(--line);border-radius:12px}
th,td{padding:8px 10px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line);font-size:13px}th[scope=row]{color:var(--muted);font-weight:600;white-space:nowrap}
thead td{font-weight:650}thead img{width:100%;max-width:200px;aspect-ratio:4/3;object-fit:cover;border-radius:8px;display:block;margin-bottom:6px}
.detail{background:var(--card);border:1px solid var(--line);border-radius:12px;overflow:hidden}.detail .ph{aspect-ratio:auto;height:clamp(160px,45vw,260px)}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin:8px 0}dt{color:var(--muted)}dd{margin:0;font-weight:600}
.desc{margin:6px 0 0;font-size:13px}.links{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px}
.note{margin:8px 2px 0;font-size:12px;color:var(--muted)}
@media(max-width:480px){.card{flex-basis:78%}}
</style></head><body><main id="root" aria-live="polite"></main>
<script>
(function(){
var KEY='matchrv/cards',root=document.getElementById('root'),pending={},nextId=1,ready=false,last=null;
function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined&&text!==null)n.textContent=String(text);return n;}
function num(v){return typeof v==='number'&&isFinite(v)&&v>0;}
function usd(v){return '$'+Math.round(v).toLocaleString('en-US');}
function lbs(v){return Math.round(v).toLocaleString('en-US')+' lbs';}
function ft(v){return (Math.round(v*10)/10)+' ft';}
function href(u){if(typeof u!=='string')return null;try{var x=new URL(u);return x.protocol==='https:'||x.protocol==='http:'?x.href:null;}catch(e){return null;}}
function photo(u){var h=href(u);return h&&h.indexOf('https:')===0?h:null;}
function rpc(method,params){return new Promise(function(resolve,reject){var id=nextId++;pending[id]={resolve:resolve,reject:reject};window.parent.postMessage({jsonrpc:'2.0',id:id,method:method,params:params},'*');setTimeout(function(){if(pending[id]){delete pending[id];reject(new Error('timeout'));}},15000);});}
function open(e,url){var o=window.openai;if(o&&typeof o.openExternal==='function'){e.preventDefault();o.openExternal({href:url});return;}if(ready){e.preventDefault();rpc('ui/open-link',{url:url}).catch(function(){});}}
function link(text,url,cls){var h=href(url);if(!h)return null;var a=el('a',cls,text);a.href=h;a.target='_blank';a.rel='noopener noreferrer';a.addEventListener('click',function(e){open(e,h);});return a;}
function img(u,alt){var src=photo(u);if(!src)return null;var i=document.createElement('img');i.alt=alt||'';i.loading='lazy';i.decoding='async';i.referrerPolicy='no-referrer';i.addEventListener('error',function(){var p=i.parentNode;if(p&&p.className==='ph'&&p.parentNode)p.parentNode.removeChild(p);else if(p)p.removeChild(i);});i.src=src;return i;}
function photoBox(u){var i=img(u.photo,u.title);if(!i)return null;var b=el('div','ph');b.appendChild(i);return b;}
function heading(u){return u.title;}
function sub(u){return [u.condition==='new'?'New':u.condition==='used'?'Used':null,u.typeLabel].filter(Boolean).join(' · ');}
function dealer(u){return [u.dealerName,u.dealerLocation].filter(Boolean).join(' · ');}
function status(u){return u.status==='sold'?'Listed as sold':u.status==='pending'?'Sale pending':u.status==='removed'?'No longer listed':null;}
var SPECS=[['lengthFt','Length',ft],['sleeps','Sleeps',String],['gvwrLbs','GVWR',lbs],['dryWeightLbs','Dry weight (UVW)',lbs],['cccLbs','CCC',lbs]];
function add(parent,node){if(node)parent.appendChild(node);}
function card(u){var c=el('article','card');add(c,photoBox(u));var b=el('div','body');b.appendChild(el('h3','t',heading(u)));if(num(u.priceUsd))b.appendChild(el('div','price',usd(u.priceUsd)));var s=status(u);if(s)b.appendChild(el('span','badge',s));var st=sub(u);if(st)b.appendChild(el('div','muted',st));var d=dealer(u);if(d)b.appendChild(el('div','muted',d));var ul=el('ul','specs');SPECS.forEach(function(k){if(num(u[k[0]])){var li=el('li');li.appendChild(el('b',null,k[1]+' '));li.appendChild(document.createTextNode(k[2](u[k[0]])));ul.appendChild(li);}});if(ul.childNodes.length)b.appendChild(ul);add(b,link('View on MatchRV',u.url,'go'));c.appendChild(b);return c;}
function results(p){if(!p.units.length)return empty(p);var r=el('div','row');r.setAttribute('role','list');p.units.forEach(function(u){var c=card(u);c.setAttribute('role','listitem');r.appendChild(c);});return r;}
function compare(p){if(!p.units.length)return empty(p);var wrap=el('div','cmp'),t=el('table'),head=el('thead'),hr=el('tr');hr.appendChild(el('td'));p.units.forEach(function(u){var td=el('td');add(td,img(u.photo,u.title));var a=link(heading(u),u.url);td.appendChild(a||el('span',null,heading(u)));hr.appendChild(td);});head.appendChild(hr);t.appendChild(head);var body=el('tbody');
var rows=[['priceUsd','Price',usd],['status','Status',null],['typeLabel','Type',null],['dealerName','Dealer',null],['dealerLocation','Location',null]].concat(SPECS);
rows.forEach(function(k){var vals=p.units.map(function(u){var v=u[k[0]];if(k[0]==='status')return status(u);if(k[2])return num(v)?k[2](v):null;return typeof v==='string'&&v?v:null;});if(!vals.some(function(v){return v!==null;}))return;var tr=el('tr');tr.appendChild(el('th',null,k[1])).setAttribute('scope','row');vals.forEach(function(v){var td=el('td',null,v===null?'—':v);if(v===null)td.setAttribute('aria-label','Not listed');tr.appendChild(td);});body.appendChild(tr);});
t.appendChild(body);wrap.appendChild(t);var f=el('div');f.appendChild(wrap);f.appendChild(el('p','note','— means the listing does not state it. Confirm details with the dealership.'));return f;}
function detail(p){var u=p.units[0];if(!u)return empty(p);var c=el('article','detail');add(c,photoBox(u));var b=el('div','body');b.appendChild(el('h2','t',heading(u)));if(num(u.priceUsd))b.appendChild(el('div','price',usd(u.priceUsd)));var s=status(u);if(s)b.appendChild(el('span','badge',s));var st=sub(u);if(st)b.appendChild(el('div','muted',st));var d=dealer(u);if(d)b.appendChild(el('div','muted',d));var dl=el('dl');SPECS.concat([['slideouts','Slideouts',String]]).forEach(function(k){var v=u[k[0]];if(num(v)||(k[0]==='slideouts'&&v===0)){dl.appendChild(el('dt',null,k[1]));dl.appendChild(el('dd',null,k[2](v)));}});if(dl.childNodes.length)b.appendChild(dl);if(typeof u.description==='string'&&u.description){b.appendChild(el('div','muted',"From the dealer's listing"));b.appendChild(el('p','desc',u.description));}var ls=el('div','links');add(ls,link('View on MatchRV',u.url));add(ls,link("Dealer's listing",u.dealerListingUrl));if(ls.childNodes.length)b.appendChild(ls);c.appendChild(b);var f=el('div');f.appendChild(c);f.appendChild(el('p','note','Specs come from the dealer listing or the manufacturer. Confirm price and availability with the dealership.'));return f;}
function empty(p){var asked=p.status==='needs_discovery'||p.status==='choose_swipe_or_chat';return el('div','empty',asked?'MatchRV has a question for you in the chat before it shows RVs.':'No RVs to show.');}
function valid(p){return p&&typeof p==='object'&&p.schema==='matchrv.rv-cards'&&typeof p.version==='number'&&p.version>=1&&Array.isArray(p.units)&&(p.view==='results'||p.view==='compare'||p.view==='detail');}
function size(){var h=document.documentElement.scrollHeight;var o=window.openai;if(o&&typeof o.notifyIntrinsicHeight==='function'){try{o.notifyIntrinsicHeight(h);}catch(e){}}if(ready)window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/size-changed',params:{height:h}},'*');}
function render(p){if(!valid(p))return;last=p;var units=p.units.filter(function(u){return u&&typeof u==='object'&&typeof u.title==='string';});var q={view:p.view,units:units,status:p.status};var node=q.view==='compare'?compare(q):q.view==='detail'?detail(q):results(q);while(root.firstChild)root.removeChild(root.firstChild);root.appendChild(node);setTimeout(size,0);}
function theme(t){if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}
function fromOpenAI(){var o=window.openai;if(!o)return;theme(o.theme);var m=o.toolResponseMetadata;if(m&&m[KEY])render(m[KEY]);}
window.addEventListener('openai:set_globals',fromOpenAI);
window.addEventListener('message',function(ev){if(ev.source!==window.parent)return;var m=ev.data;if(!m||m.jsonrpc!=='2.0')return;if(m.id!==undefined&&pending[m.id]){var p=pending[m.id];delete pending[m.id];m.error?p.reject(m.error):p.resolve(m.result);return;}if(m.method==='ui/notifications/tool-result'){var r=m.params||{};if(r._meta&&r._meta[KEY])render(r._meta[KEY]);}else if(m.method==='ui/notifications/host-context-changed'){theme(m.params&&m.params.theme);}});
fromOpenAI();
if(window.parent&&window.parent!==window){rpc('ui/initialize',{appInfo:{name:'matchrv-rv-cards',version:'1.0.0'},appCapabilities:{},protocolVersion:'2026-01-26'}).then(function(res){ready=true;theme(res&&res.hostContext&&res.hostContext.theme);window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized',params:{}},'*');if(last)size();}).catch(function(){});}
})();
</script></body></html>`;
