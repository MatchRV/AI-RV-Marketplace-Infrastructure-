import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, Heart, MapPin, Scale, Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import type { Constraints, UnitMatch } from "@workspace/agent-core";
import { BrandLayout } from "@/components/brand-layout";
import { SEO } from "@/components/seo";
import { UnitPhoto, VerifiedPill } from "@/components/agent/bits";
import { CompareSheet, LeadApprovalModal, UnitDrawer } from "@/components/agent/overlays";
import { agentApi } from "@/agent/api";
import { applySearchOutcome, getSession, setLeadModalHidden, setSearching, toggleShortlist, useAgentSession } from "@/agent/session";
import { humanCompare, humanFocusUnit } from "@/agent/human-actions";
import "@/styles/shop.css";
import { AiShoppingFuture } from "@/components/ai-shopping-future";

const SAMPLE_PROMPT = "I have an F-150 rated around 8,000 lbs and two kids. Find me a bunkhouse travel trailer under $45k, under 30 feet, within 150 miles of Tacoma. We boondock, so prioritize solar and lithium. Show me the best three and explain the compromises.";
type Message = {role:"user"|"assistant";content:string};

function ResultCard({match,selected,onCompare}:{match:UnitMatch;selected:boolean;onCompare:(id:string)=>void}) {
  const s = useAgentSession();
  const u = match.unit;
  const saved = s.shortlist.some(x=>x.id===u.id);
  const strengths = [...match.hardChecks.filter(c=>c.status==='pass').map(c=>`${c.constraint}: ${c.actual}`), ...match.softChecks.filter(c=>c.satisfied===true).map(c=>c.detail)].slice(0,3);
  const compromises = match.softChecks.filter(c=>c.satisfied!==true).map(c=>`${c.preference}: ${c.satisfied===null?'not provided':c.detail}`);
  return <article className="outfitter-result">
    <div className="outfitter-photo"><UnitPhoto images={u.images} alt={u.title} year={u.year} make={u.make} rvType={u.rvType} imgClassName="w-full h-full object-cover"/><button type="button" aria-label={saved?'Remove from shortlist':'Save RV'} aria-pressed={saved} onClick={()=>toggleShortlist({id:u.id,title:u.title,price:u.priceUsd.value,image:u.images[0]??null,dealer:u.dealer.name},'human')}><Heart size={18} fill={saved?'#0d9488':'none'}/></button></div>
    <div className="outfitter-result-body"><VerifiedPill status={match.hardStatus}/><h3>{u.title}</h3><p className="result-price">{u.priceUsd.value!=null?`$${u.priceUsd.value.toLocaleString()}`:'Price not provided'}</p><p className="result-location"><MapPin size={15}/>{u.dealer.name} · {u.dealer.city}{match.distanceMiles!=null?` · ${Math.round(match.distanceMiles)} mi`:''}</p>
      <dl className="result-specs"><div><dt>Length</dt><dd>{u.lengthFt.value!=null?`${u.lengthFt.value} ft`:'Not provided'}</dd></div><div><dt>Sleeps</dt><dd>{u.sleeps.value??'Not provided'}</dd></div><div><dt>GVWR</dt><dd>{u.gvwrLbs.value!=null?`${u.gvwrLbs.value.toLocaleString()} lb`:'Not provided'}</dd></div></dl>
      <div className="result-fit"><strong><Check size={15}/> Why it fits</strong>{strengths.length?<ul>{strengths.map(text=><li key={text}>{text}</li>)}</ul>:<p>Ranked against your current search. Open the details to review published specifications.</p>}</div>
      <div className="result-tradeoffs"><strong>Trade-offs &amp; unknowns</strong><p>{compromises.length?compromises.slice(0,2).join(' · '):'No preference shortfall identified from the available data.'}</p>{match.unknownFields.length>0&&<p>Needs confirmation: {match.unknownFields.join(', ').replaceAll('_',' ')}.</p>}</div>
      <div className="result-buttons"><button className="brand-button" onClick={()=>void humanFocusUnit(u.id)}>View RV <ArrowRight size={15}/></button><label><input type="checkbox" checked={selected} onChange={()=>onCompare(u.id)}/> Compare</label></div>
    </div>
  </article>;
}

export function Shop() {
  const s=useAgentSession();
  const [draft,setDraft]=useState('');
  const [messages,setMessages]=useState<Message[]>([]);
  const [busy,setBusy]=useState(false);
  const busyRef=useRef(false);
  const [error,setError]=useState('');
  const [count,setCount]=useState<number|null>(null);
  const [compareIds,setCompareIds]=useState<string[]>([]);
  const [budget,setBudget]=useState('');
  const [place,setPlace]=useState('');
  const [length,setLength]=useState('');
  const [bunkhouse,setBunkhouse]=useState(false);
  const inputRef=useRef<HTMLTextAreaElement>(null);
  const alive=useRef(true);
  useEffect(()=>{setBudget(s.constraints.priceMaxUsd?.toString()??'');setLength(s.constraints.lengthMaxFt?.toString()??'');setPlace(s.constraints.location?.place??'');setBunkhouse(s.constraints.mustHave?.includes('bunkhouse')??false)},[s.constraints]);
  useEffect(()=>{alive.current=true; void agentApi.meta().then(r=>{if(alive.current&&r.ok){setCount(r.data.dataset.units)}}); return()=>{alive.current=false}},[]);
  const results=s.results.filter(m=>m.hardStatus!=='fail').slice(0,3);
  async function search(next:Constraints) {
    if(busyRef.current||s.searching)return;
    setError(''); setSearching(true);
    const r=await agentApi.search(next,3);
    if(r.ok)applySearchOutcome({actor:'human',constraints:r.data.appliedConstraints,...r.data});
    else {setSearching(false);setError(r.error.hint??'Could not search inventory. Please try again.');}
  }
  async function send(e:FormEvent) {
    e.preventDefault(); if(!draft.trim()||busyRef.current||s.searching)return;
    busyRef.current=true;setBusy(true);setError('');
    const message=draft.trim();
    const next:Message[]=[...messages,{role:'user',content:message}];
    const startingConstraints=getSession().constraints;
    setMessages(next);setDraft('');
    try {
      const r=await agentApi.outfitter(next.slice(-15),startingConstraints);
      if(!alive.current)return;
      if(!r.ok){setMessages(messages);setDraft(message);setError(r.error.message??'RV Outfitter could not respond. Please try again.');return;}
      setMessages([...next,{role:'assistant',content:r.data.message}]);
      if(r.data.search){
        if(getSession().constraints!==startingConstraints){setError('Your search changed while RV Outfitter was working. Send your request again to use the latest filters.');return;}
        const result=r.data.search;
        applySearchOutcome({actor:'agent',constraints:result.appliedConstraints,...result,intentSummary:r.data.summary});setCompareIds([]);
      }
    } finally {busyRef.current=false;if(alive.current)setBusy(false);}
  }
  const chips=Object.entries(s.constraints).filter(([,v])=>v!=null&&(!Array.isArray(v)||v.length));
  function chipText(key:string,value:unknown){
    if(key==='location'){const v=value as {place:string;radiusMiles:number};return `${v.place} · ${v.radiusMiles} mi`;}
    if(key==='priceMaxUsd')return `Under $${Number(value).toLocaleString()}`;
    if(key==='lengthMaxFt')return `Up to ${value} ft`;
    if(key==='sleepsMin')return `Sleeps ${value}+`;
    if(key==='boondocking')return 'Off-grid priority';
    return `${key==='prefer'?'Prefer: ':key==='mustHave'?'Required: ':''}${Array.isArray(value)?value.join(', ').replaceAll('_',' '):String(value)}`;
  }
  return <BrandLayout><SEO title="AI RV Shop — RV Outfitter" description="Tell RV Outfitter what you need. Search real MatchRV inventory and compare three options with clear trade-offs and honest unknowns." canonical="/shop"/>
    <div className="brand-container shop-content"><AiShoppingFuture/>
      <div className="outfitter-composer"><div className="composer-identity"><img src="/images/outfitter-avatar.png" alt=""/><div><strong>RV Outfitter</strong><span>A little guidance for your next big adventure.</span></div><span className="inventory-count">{count!=null?`${count.toLocaleString()} RVs in inventory`:'Search MatchRV inventory'}</span></div>
        {messages.length>0&&<div className="outfitter-conversation" aria-label="Conversation with RV Outfitter" aria-live="polite">{messages.map((m,i)=><div key={i} className={`chat-message ${m.role}`}><strong>{m.role==='user'?'You':'RV Outfitter'}</strong><p>{m.content}</p></div>)}</div>}
        <form onSubmit={send}><label htmlFor="rv-request">{messages.length?'What would you like to change or ask?':'What are you looking for?'}</label><textarea ref={inputRef} id="rv-request" value={draft} onChange={e=>setDraft(e.target.value)} placeholder={messages.length?'Find something shorter, prioritize lithium, or ask a question…':SAMPLE_PROMPT} rows={messages.length?3:4} maxLength={4000} required disabled={busy}/><div className="composer-bottom"><span>Real inventory. Clear trade-offs. Your choice.</span><button className="brand-button" disabled={busy||s.searching||!draft.trim()}>{busy?'RV Outfitter is thinking…':'Ask RV Outfitter'} <ArrowRight size={18}/></button></div></form>
      </div>
      {!messages.length&&<div className="shop-starters"><span>Start with an idea:</span>{['A bunkhouse travel trailer under $45,000','A small camper for weekend trips','An RV for full-time living'].map(text=><button key={text} onClick={()=>{setDraft(text);inputRef.current?.focus()}}>{text}</button>)}</div>}
      {error&&<p className="brand-error" role="alert">{error}</p>}
      <details className="shop-filters"><summary><SlidersHorizontal size={17}/> Or search with filters</summary><form onSubmit={e=>{e.preventDefault();void search({...s.constraints,priceMaxUsd:budget?Number(budget):null,lengthMaxFt:length?Number(length):null,location:place.trim()?{place:place.trim(),radiusMiles:150}:null,mustHave:bunkhouse?Array.from(new Set([...(s.constraints.mustHave??[]),'bunkhouse'])):s.constraints.mustHave?.filter(f=>f!=='bunkhouse')})}}><label>Maximum price<input type="number" min="0" max="2000000" value={budget} onChange={e=>setBudget(e.target.value)} placeholder="45000"/></label><label>Maximum length (ft)<input type="number" min="8" max="60" value={length} onChange={e=>setLength(e.target.value)} placeholder="30"/></label><label>Near (within 150 miles)<input value={place} onChange={e=>setPlace(e.target.value)} placeholder="Tacoma" maxLength={80}/></label><label className="bunkhouse-check"><input type="checkbox" checked={bunkhouse} onChange={e=>setBunkhouse(e.target.checked)}/> Bunkhouse</label><button className="brand-button" disabled={busy||s.searching}><Search size={16}/> Search inventory</button></form></details>
      {chips.length>0&&<div className="shop-constraints" aria-label="Your search requirements">{chips.map(([key,value])=><button key={key} disabled={busy||s.searching} onClick={()=>{const next={...s.constraints};delete next[key as keyof Constraints];void search(next)}} aria-label={`Remove ${chipText(key,value)}`}>{chipText(key,value)} <X size={14}/></button>)}</div>}
      {(busy||s.searching)&&<p role="status" className="shop-searching"><Search size={18}/> {busy?'Understanding your request…':'Searching your inventory matches…'}</p>}
      {s.leadPreview?.status==='awaiting_human_approval'&&s.leadModalHidden&&<button className="brand-button secondary" onClick={()=>setLeadModalHidden(false)}>Review your dealer contact request</button>}
      {s.funnel&&!s.searching&&<section className="shop-results" aria-label="RV recommendations"><div className="section-heading"><div><p className="brand-eyebrow">Matched to your plans</p><h2>{results.length?`Your ${results.length===1?'best available option':`${results.length} best available options`}`:'No photo-verified options returned'}</h2></div>{results.length>=2&&<button className="brand-button secondary" onClick={()=>void humanCompare(results.map(m=>m.unit.id))}><Scale size={17}/> Compare these RVs</button>}</div>
        {s.intentSummary&&<p className="brand-muted">{s.intentSummary}</p>}{results.length<3&&<p className="brand-muted">{results.length?`Only ${results.length} options meet the available checks. `:''}Other listings may have incomplete details or unreachable photos. Try again or adjust a requirement. We haven’t relaxed your filters.</p>}
        {results.some(m=>m.hardStatus==='unverified')&&<p className="shop-notice">Some listings have unpublished specifications. These are marked unverified, not confirmed matches.</p>}
        <div className="shop-result-grid">{results.map(m=><ResultCard key={m.unit.id} match={m} selected={compareIds.includes(m.unit.id)} onCompare={id=>setCompareIds(ids=>ids.includes(id)?ids.filter(x=>x!==id):[...ids,id].slice(-3))}/>)}</div>
        {!results.length&&<div className="shop-empty"><Search size={28}/><h3>Let’s adjust the search together.</h3><p>Tell RV Outfitter which requirement is flexible, or remove a filter above.</p>{s.funnel.excluded.slice(0,3).map(e=><p key={e.reason}>{e.count.toLocaleString()} excluded: {e.reason}</p>)}</div>}
        {compareIds.length>=2&&<button className="brand-button compare-selected" onClick={()=>void humanCompare(compareIds)}><Scale size={17}/> Compare {compareIds.length} selected RVs</button>}
      </section>}
      <div className="shop-footnotes"><p><strong>Know before you tow.</strong> Tow ratings alone don’t confirm compatibility. Check your vehicle configuration, loaded trailer weight, payload, and hitch limits.</p><p>Listings reflect available dealer information. Confirm price, equipment, and availability with the dealership before visiting.</p></div>
    </div><UnitDrawer/><CompareSheet/><LeadApprovalModal/>
  </BrandLayout>;
}