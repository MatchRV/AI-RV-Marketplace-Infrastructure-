"""Approved MatchRV full-report and one-page snapshot presentation.

Data is evidence, never executable markup. Preserve original dates and scores;
unknown metrics stay unknown. The reference Tacoma score is never a default.
"""
from pathlib import Path
import html
import json
import re

NAVY = '#0a2233'
TEAL = '#00bfa6'
CSS = '''*{box-sizing:border-box}body{margin:0;background:#dfe7ea;color:#17293a;font:15px/1.55 "Segoe UI",Arial,sans-serif}.sheet{max-width:960px;margin:28px auto;background:white;box-shadow:0 2px 18px #0a22332e}.cover{background:#0a2233;color:white;padding:32px 48px;border-bottom:8px solid #00bfa6}.logo{font-weight:900;font-style:italic;font-size:34px}.logo span{color:#00bfa6}.logo-sub{font-size:11px;letter-spacing:2px;color:#9fc3cf}.cover h1{font-size:30px;margin:16px 0 4px}.cover .for{color:#00bfa6;font-weight:700}.meta{font-size:12px;color:#c4d6de}.body{padding:28px 48px}.grid{display:flex;gap:24px}.score{border:2px solid #0a2233;border-radius:10px;background:#eef4f5;padding:20px;min-width:200px;text-align:center;color:#0a2233}.score .n{font-size:48px;font-weight:900;line-height:1}.score small{display:block;font-size:11px;color:#4a5f70}.points{flex:1}.points p{border-bottom:1px solid #d9e3e8;padding-bottom:10px}.points b{color:#087f6d}h2{font-size:21px;border-bottom:3px solid #00bfa6;padding-bottom:6px;margin-top:28px}h3{font-size:16px}table{width:100%;border-collapse:collapse;font-size:13px;margin:12px 0}th,td{padding:9px;border-bottom:1px solid #d9e3e8;text-align:left;vertical-align:top}th{background:#0a2233;color:white;font-size:11px;text-transform:uppercase}.fix{border:1px solid #d9e3e8;border-top:4px solid #087f6d;padding:16px;margin:12px 0}.fix h3{margin:0 0 8px}.cta{background:#0a2233;color:white;padding:20px;border-radius:10px;margin:20px 0}.cta b{color:#00bfa6}.muted,.foot{font-size:12px;color:#4a5f70}.bar{display:block;background:#e2ebee;height:8px;margin-top:5px}.bar i{display:block;background:#087f6d;height:8px}a{color:#087f6d;overflow-wrap:anywhere}pre{white-space:pre-wrap;font:inherit}.foot{padding:18px 48px;border-top:1px solid #d9e3e8}@media(max-width:640px){.sheet{margin:0}.cover,.body,.foot{padding:22px}.grid{flex-direction:column}.score{min-width:0}table{font-size:11px}th,td{padding:5px}}@media print{body{background:white}.sheet{margin:0;box-shadow:none}.cover,th,.cta{-webkit-print-color-adjust:exact;print-color-adjust:exact}h2,h3{break-after:avoid}.fix,tr{break-inside:avoid}}@page{size:letter;margin:12mm}'''


def presentation(data):
    legacy = data.get('legacyAudit') or (data if 'field_health' in data else None)
    source = legacy or data
    dealer = source.get('dealer') or 'Dealership'
    location = source.get('location') or ', '.join(filter(None, [source.get('city'), source.get('state')]))
    website = source.get('website') or source.get('base_url') or ''
    observed = source.get('checkedAt') or source.get('observed_at') or 'Not recorded'
    scores = source.get('scores', {})
    metrics = [('Overall AI readiness', scores.get('overall')), ('Inventory health', scores.get('inventory_health')), ('AI readability', scores.get('ai_readability')), ('Shopper-question coverage', scores.get('query_coverage')), ('Crawlability', scores.get('crawlability'))]
    fields = []
    if legacy:
        fields = [{'field': f['field'].replace('_', ' ').title(), 'found': f['present'], 'checked': f.get('applicable', len(source.get('detail_units', []))), 'missing': f.get('missing', 0) + f.get('invalid_or_conflicting', 0)} for f in source['field_health']]
        units = source.get('detail_units', [])
        if units and any('rv_type' in u for u in units) and not any(f['field'] == 'Rv Type' for f in fields):
            found = sum(bool(u.get('rv_type')) for u in units)
            fields.append({'field':'RV type','found':found,'checked':len(units),'missing':len(units)-found})
    else:
        fields = [{'field': re.sub(r'([a-z])([A-Z])', r'\1 \2', f['field']).replace('_', ' ').title(), 'found': f['extracted'], 'checked': f['checked'], 'missing': f['notExtracted']} for f in data.get('findings', [])]
    gaps = sorted([f for f in fields if f['checked'] > 0], key=lambda f: f['missing'] / f['checked'], reverse=True)
    points = [f"{f['field']} was not extracted or was conflicting on {f['missing']} of {f['checked']} assessed records." if f['missing'] else f"{f['field']} was extractable on all {f['checked']} assessed records." for f in gaps[:3]]
    if legacy:
        shell = sum(bool(r.get('js_shell')) for r in source.get('readability', []))
        if shell: points.insert(0, f"{shell} of {len(source['readability'])} sampled listing pages were flagged as script-dependent shells in the original crawl.")
        unresolved = [f['field'].lower() for f in gaps if f['missing'] == f['checked'] and f['field'].lower() in ('rv type','sleeping capacity','length','location')]
        if unresolved:
            points = points[:1] + ['No confirmed values for '+', '.join(unresolved)+' in the assessed inventory records.'] + points[1:]
        if scores.get('query_coverage') is not None:
            points = points[:2] + [f"Shopper-question coverage scored {round(scores['query_coverage'])}/100 in the saved audit. Unresolved fields limit verifiable matches."]
    while len(points) < 3: points.append('A wider inventory sample is needed to assess additional listing facts.')
    questions = []
    if legacy:
        for q in source.get('queries', []):
            missing = ', '.join(k.replace('_', ' ') for k in q.get('missing', {}))
            result = f"{q.get('confirmed', 0)} confirmed matches; {q.get('potential', 0)} potential matches."
            if missing: result += ' Unresolved: ' + missing + '.'
            questions.append((q['query'], result))
    else:
        for q in data.get('questionPlan', []):
            answers = [a for a in data.get('answers', []) if a.get('questionId') == q['id']]
            done = [a for a in answers if a.get('status') == 'answered']
            determinate = [a for a in done if (a.get('visibility') or {}).get('dealerCited') is not None]
            cited = sum((a.get('visibility') or {}).get('dealerCited') is True for a in determinate)
            result = f"{len(done)} of {len(answers)} AI answers captured; {cited} of {len(determinate)} determined answers cite the dealer." if done else 'Not tested / answer unavailable. No negative visibility conclusion.'
            questions.append((q['question'], result))
    actions = source.get('actions', [])[:5]
    action_rows = []
    for a in actions:
        action_rows.append({'title': a.get('title') or a.get('issue') or a.get('action') or 'Review sampled listing evidence', 'why': a.get('why') or a.get('action') or a.get('evidence') or '', 'steps': a.get('steps') or [], 'urls': a.get('evidenceUrls') or a.get('affected_urls') or a.get('urls') or [], 'impact': a.get('impact') or a.get('priority') or 'Prioritized by assessed gaps'})
    if not action_rows:
        action_rows = [{'title': f"Review {f['field'].lower()} on sampled listings", 'why': f"{f['missing']} of {f['checked']} assessed records have unresolved values. Confirm the unit-specific fact, then expose it in page text and structured data.", 'steps': [], 'urls': [], 'impact': 'Prioritized by assessed gaps'} for f in gaps if f['missing']][:5]
    if legacy:
        # Prioritize the broad readability blocker and the exact filter gaps,
        # as in the approved report, rather than filling five arbitrary slots.
        ranked=[]
        if shell:
            ranked.append({'title':'Make listing facts readable without scripts and add structured data','why':f'{shell} of {len(source["readability"])} sampled pages were flagged as script-dependent shells.','impact':'Highest','steps':['Ask the website vendor to render confirmed unit identity, price, VIN and specs in the initial HTML.','Add valid Product/Vehicle structured data and a clear year/make/model headline. Re-test the same URLs.'],'urls':[r['url'] for r in source['readability'] if r.get('js_shell')]})
        def add_fix(names,title,impact,steps):
            rows=[f for f in gaps if f['field'].lower() in names and f['missing']]
            if rows:
                ranked.append({'title':title,'impact':impact,'why':' '.join(f"{f['field']}: {f['missing']} unresolved of {f['checked']} assessed records." for f in rows),'steps':steps,'urls':[]})
        add_fix(('rv type',),'Tag each unit with its verified RV type','High',['Publish the verified type as a labeled fact on each affected listing: travel trailer, fifth wheel, toy hauler or motorhome class.'])
        add_fix(('sleeping capacity','length'),'Add verified sleeping capacity and overall length','High',['Confirm manufacturer specifications for each affected unit and show the values as readable listing text with explicit units.'])
        add_fix(('location',),'Publish the location on each affected listing','Medium-high',['Show the actual lot city and state for the unit. Do not substitute the audit city for an unverified unit location.'])
        add_fix(('price','availability','dry weight','gvwr','slides'),'Close the remaining price, availability and specification gaps','Medium',['Review the affected records and publish verified values. Weight data supports comparison; it does not establish a safe tow match.'])
        if ranked: action_rows=ranked[:5]
    units = source.get('detail_units') if legacy else data.get('inventory', [])
    coverage = source.get('coverage', {})
    scope = (f"{coverage.get('vdp_sampled', len(source.get('readability', [])))} listing pages sampled; {len(units)} inventory records analyzed. " if legacy else coverage.get('scope', '') + ' ')
    scope += 'Dated evidence; sampled records are not a verified stock count.'
    overall = scores.get('overall')
    verdict = 'Readiness not scored in this audit' if overall is None else 'Key listing facts need attention' if overall < 50 else 'Your data is partly readable' if overall < 80 else 'Your sampled listing facts are readable'
    return dict(dealer=dealer, location=location, website=website, observed=observed, metrics=metrics, fields=fields, points=points[:3], questions=questions, actions=action_rows, units=units or [], scope=scope, overall=overall, verdict=verdict, legacy=bool(legacy), demo=bool(source.get('demo')), methodology=data.get('methodology') or 'Static website extraction, inventory field assessment and rules-based shopper-query matching. These query results measure website evidence, not live AI recommendations. Unresolved facts are not guessed; the observation date and original scores are preserved.', answers=data.get('answers', []) if not legacy else source.get('citations', []))


def representative_questions(m, count):
    if not m['legacy']: return m['questions'][:count]
    patterns = ('travel trailer under $40,000','travel trailer sleeps at least 6','fifth wheel under $75,000','travel trailer under 30 feet','travel trailer dry weight','new fifth wheel')
    picked=[]
    for pattern in patterns:
        match=next((q for q in m['questions'] if pattern in q[0].lower()),None)
        if match and match not in picked:picked.append(match)
    return (picked+[q for q in m['questions'] if q not in picked])[:count]


def score(value):
    return 'Not assessed' if value is None else str(round(value)) + '/100'


def render_html(m, free):
    e = lambda value: html.escape(str(value), quote=True)
    def table(headers, rows):
        return '<table><thead><tr>' + ''.join('<th>'+e(x)+'</th>' for x in headers) + '</tr></thead><tbody>' + ''.join('<tr>'+''.join('<td>'+e(c)+'</td>' for c in row)+'</tr>' for row in rows)+'</tbody></table>'
    title = 'Free Visibility Snapshot' if free else 'AI Visibility Report'
    body = f'<div class="cover"><div class="logo">Match<span>RV</span></div><div class="logo-sub">AI VISIBILITY REPORTS</div><h1>{title}</h1><p class="for">Prepared for {e(m["dealer"])} — {e(m["location"])}</p><p class="meta">{e(m["website"])} | Observed {e(m["observed"])}</p></div><div class="body">'
    if m['demo']: body += '<p><b>DEMONSTRATION — synthetic data, not a dealer assessment.</b></p>'
    body += f'<div class="grid"><div class="score"><div class="n">{e(score(m["overall"]))}</div><small>OVERALL AI READINESS — OBSERVED</small><b>{e(m["verdict"])}</b></div><div class="points">' + ''.join(f'<p><b>Finding {i+1}:</b> {e(p)}</p>' for i,p in enumerate(m['points'])) + '</div></div>'
    if not free:
        body += '<h2>1. Your report in 60 seconds</h2><p>'+e(m['scope'])+'</p><p>'+e(m['verdict'])+'</p>'
        body += '<h2>2. Your scorecard</h2>'+table(['Metric','Score'],[(name,score(value)) for name,value in m['metrics']])
        body += '<p class="muted">Scores measure website readiness. Unassessed metrics stay unknown; readiness scores do not imply AI rankings, leads or sales.</p>'
        body += '<h2>3. Dealership snapshot</h2>'+table(['Fact','Observed'], [('Dealership',m['dealer']),('Location',m['location']),('Website',m['website']),('Scope',m['scope'])])
    body += '<h2>'+('What shoppers asked — could your site prove it?' if free else '4. What shoppers asked — evidence and results')+'</h2>'
    body += table(['Shopper question','Result'],representative_questions(m,3 if free else 6)) if m['questions'] else '<p>Shopper questions were not assessed in this audit.</p>'
    if not free:
        body += '<h2>5. Inventory health — which facts are missing</h2>'+table(['Field','Extracted','Unresolved'],[(f['field'],f"{f['found']}/{f['checked']}",f['missing']) for f in m['fields']])
        body += '<h2>6. Listing spot-checks — real examples</h2>'
        for u in m['units'][:3]:
            evidence = u.get('evidence') or {}
            missing = [k for k,v in evidence.items() if v.get('value') is None] if evidence else [k for k in ('rv_type','price','sleeping_capacity','length','location') if u.get(k) is None]
            body += f'<div class="fix"><h3>{e(u.get("title") or "Sampled inventory record")}</h3><a href="{e(u.get("url") or "")}">{e(u.get("url") or "Source not recorded")}</a><p>Unresolved: {e(", ".join(missing) or "None among assessed fields")}</p></div>'
        body += '<h2>7. Top fixes — ranked by impact</h2>'
        for i,a in enumerate(m['actions'],1):
            body += f'<div class="fix"><h3>Fix {i} — {e(a["title"])}</h3><b>{e(a["impact"])}</b><p>{e(a["why"])}</p>'+''.join('<p>'+e(step)+'</p>' for step in a['steps'])+'</div>'
        if not m['actions']: body += '<p>No unresolved field fixes were identified in the assessed records. Review scope before expanding the audit.</p>'
        body += '<h2>8. Next steps and methodology</h2><p>Confirm the listed issues with your website vendor, update verified inventory facts, then re-test the same pages and questions.</p><p class="muted">'+e(m['methodology'])+'</p>'
        body += '<details><summary>Complete shopper-question and AI evidence appendix</summary>'+table(['Question','Result'],m['questions'])
        for a in m['actions']:
            for url in a['urls']: body += '<p><a href="'+e(url)+'">'+e(url)+'</a></p>'
        for a in m['answers']:
            body += '<div class="fix"><h3>'+e(a.get('platform') or a.get('provider') or 'Observation')+'</h3><p>'+e(a.get('question') or a.get('prompt') or '')+'</p><pre>'+e(a.get('answer') or a.get('response') or a.get('status') or 'No answer captured')+'</pre></div>'
        body += '</details>'
    else:
        body += '<div class="cta"><b>Want the fix list?</b><p>The full report includes your scorecard, inventory gaps, listing spot-checks and fixes ranked by impact. Book a short report call at matchrv.com/book.</p></div>'
    body += '<p class="muted">'+e(m['scope'])+' Not extracted does not prove a specification is absent from every source.</p></div><div class="foot">MatchRV · AI Visibility Reports · Prepared for '+e(m['dealer'])+'</div>'
    return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MatchRV '+title+' — '+e(m['dealer'])+'</title><style>'+CSS+'</style></head><body><div class="sheet">'+body+'</div></body></html>'


def render_pdf(m, path, free):
    from reportlab.lib import colors
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer, PageBreak, KeepTogether
    from reportlab.lib.enums import TA_CENTER
    navy, teal, wash = colors.HexColor(NAVY), colors.HexColor(TEAL), colors.HexColor('#eef4f5')
    styles=getSampleStyleSheet()
    styles.add(ParagraphStyle(name='ReportBody',fontName='Helvetica',fontSize=9 if free else 10,leading=12 if free else 14,spaceAfter=7,textColor=navy))
    styles.add(ParagraphStyle(name='ReportSmall',fontName='Helvetica',fontSize=7.5,leading=10,textColor=colors.HexColor('#4a5f70'),spaceAfter=5,wordWrap='CJK'))
    styles.add(ParagraphStyle(name='ReportScore',fontName='Helvetica-Bold',fontSize=34,leading=40,textColor=navy,alignment=TA_CENTER))
    styles['Heading2'].textColor=navy;styles['Heading2'].fontSize=14;styles['Heading2'].leading=18;styles['Heading2'].spaceBefore=12
    def para(value,style='ReportBody'):
        text=str(value).replace('—','-').replace('–','-').replace('’',"'").replace('“','"').replace('”','"')
        return Paragraph(html.escape(text).replace('\n','<br/>'),styles[style])
    def table(headers, rows, widths):
        t=Table([[para(c,'ReportSmall') for c in row] for row in [headers]+list(rows)],colWidths=widths,repeatRows=1,hAlign='LEFT')
        t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),navy),('TEXTCOLOR',(0,0),(-1,0),colors.white),('VALIGN',(0,0),(-1,-1),'TOP'),('LINEBELOW',(0,0),(-1,-1),.4,colors.HexColor('#d9e3e8')),('TOPPADDING',(0,0),(-1,-1),7),('BOTTOMPADDING',(0,0),(-1,-1),7)]))
        # Paragraph colors override TableStyle, so explicitly color header text.
        for i,c in enumerate(headers): t._cellvalues[0][i]=Paragraph('<font color="white"><b>'+html.escape(str(c))+'</b></font>',styles['ReportSmall'])
        return t
    def chrome(canvas,doc):
        canvas.saveState();canvas.setFillColor(navy);canvas.rect(32,655,548,105,fill=1,stroke=0);canvas.setFillColor(teal);canvas.rect(32,649,548,6,fill=1,stroke=0)
        canvas.setFillColor(colors.white);canvas.setFont('Helvetica-BoldOblique',24);canvas.drawString(54,727,'Match');canvas.setFillColor(teal);canvas.drawString(125,727,'RV')
        canvas.setFillColor(colors.HexColor('#9fc3cf'));canvas.setFont('Helvetica',7);canvas.drawString(54,713,'AI VISIBILITY REPORTS')
        canvas.setFillColor(colors.white);canvas.setFont('Helvetica-Bold',19);canvas.drawString(54,688,'Free Visibility Snapshot' if free else 'AI Visibility Report')
        canvas.setFillColor(teal);canvas.setFont('Helvetica-Bold',10);canvas.drawString(54,671,(m['dealer']+' | '+m['location'])[:88])
        canvas.setFillColor(colors.HexColor('#4a5f70'));canvas.setFont('Helvetica',7);canvas.drawString(44,631,('Observed '+m['observed']+' | '+m['website'])[:120])
        canvas.setFont('Helvetica',7);canvas.drawString(44,29,'MatchRV | Dated evidence | Public website sample');canvas.drawRightString(568,29,str(doc.page));canvas.restoreState()
    story=[]
    badge=[para(score(m['overall']),'ReportScore'),para('OVERALL AI READINESS - OBSERVED','ReportSmall'),para(m['verdict'])]
    points=[para(f"Finding {i+1}: {p}") for i,p in enumerate(m['points'])]
    top=Table([[badge,points]],colWidths=[190,334]);top.setStyle(TableStyle([('BACKGROUND',(0,0),(0,0),wash),('BOX',(0,0),(0,0),1,navy),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),12),('RIGHTPADDING',(0,0),(-1,-1),12),('TOPPADDING',(0,0),(-1,-1),12),('BOTTOMPADDING',(0,0),(-1,-1),12)]))
    if m['demo']:story.append(para('DEMONSTRATION - synthetic data, not a dealer assessment.'))
    story.append(top)
    if free:
        story += [para('What shoppers asked - could your site prove it?','Heading2'),table(['Shopper question','Result'],representative_questions(m,3) or [('Not assessed','No shopper-question results available.')],[248,276]),Spacer(1,12)]
        cta=Table([[Paragraph('<font color="#00bfa6"><b>Want the fix list?</b></font><br/><font color="white">The full report includes your scorecard, inventory gaps, listing spot-checks and ranked fixes. Book a short report call at matchrv.com/book.</font>',styles['ReportBody'])]],colWidths=[524]);cta.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),navy),('TOPPADDING',(0,0),(-1,-1),12),('BOTTOMPADDING',(0,0),(-1,-1),12),('LEFTPADDING',(0,0),(-1,-1),14)]));story += [cta,Spacer(1,9),para(m['scope'],'ReportSmall'),para('Readiness is not an AI ranking. Not extracted does not prove a fact is absent from every source.','ReportSmall')]
    else:
        story += [para('1. Your report in 60 seconds','Heading2'),para(m['scope']),para('2. Your scorecard','Heading2'),table(['Metric','Score'],[(n,score(v)) for n,v in m['metrics']],[380,144]),para('Scores measure website readiness, not AI rankings, leads or sales. Unassessed metrics stay unknown.','ReportSmall'),PageBreak()]
        story += [para('3. Dealership snapshot','Heading2'),table(['Fact','Observed'],[('Dealership',m['dealer']),('Location',m['location']),('Website',m['website']),('Sample',m['scope'])],[125,399]),para('4. What shoppers asked - evidence and results','Heading2'),table(['Shopper question','Result'],representative_questions(m,6) or [('Not assessed','No results available.')],[248,276]),PageBreak()]
        core = [f for f in m['fields'] if f['checked'] and f['field'].lower() in ('year','make','model','vin','floorplan','dry weight','price','advertised price','availability','gvwr','slides','rv type','sleeps','sleeping capacity','length','location')]
        health = table(['Field','Extracted','Unresolved'],[(f['field'],f"{f['found']}/{f['checked']}",f['missing']) for f in (core or m['fields'])],[310,110,104])
        health.setStyle(TableStyle([('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4)]))
        story += [para('5. Inventory health - which facts are missing','Heading2'),health,para('6. Listing spot-checks - real examples','Heading2')]
        spots=[]
        for u in m['units'][:3]:
            evidence=u.get('evidence') or {};missing=[k for k,v in evidence.items() if v.get('value') is None] if evidence else [k for k in ('rv_type','price','sleeping_capacity','length','location') if u.get(k) is None]
            spots.append((u.get('title') or 'Sampled inventory record', ', '.join(missing) or 'None among assessed fields'))
        story += [table(['Unit observed','Unresolved facts'],spots,[250,274]),para('Listing source URLs and complete field results are retained in the evidence appendix.','ReportSmall')]
        story.append(PageBreak());story.append(para('7. Top fixes - ranked by impact','Heading2'))
        for i,a in enumerate(m['actions'],1):story.append(KeepTogether([para(f"Fix {i} - {a['title']}"),para(str(a['impact'])+' | '+a['why'],'ReportSmall')]+[para(step,'ReportSmall') for step in a['steps']]))
        if not m['actions']:story.append(para('No unresolved field fixes identified. Review the sample scope before expanding the audit.'))
        story += [para('8. Next steps and methodology','Heading2'),para('Confirm the issues with your website vendor, update verified inventory facts, then re-test the same pages and questions.'),para(m['methodology'],'ReportSmall')]
        if len(m['questions'])>6 or m['answers']:
            story += [PageBreak(),para('Evidence appendix','Heading2'),table(['Shopper question','Result'],m['questions'],[248,276])]
            story += [para('Complete inventory field results','Heading2'),table(['Field','Extracted','Unresolved'],[(f['field'],f"{f['found']}/{f['checked']}",f['missing']) for f in m['fields']],[310,110,104])]
            for u in m['units']:
                story += [para(u.get('title') or 'Sampled inventory record'),para(u.get('url') or 'Source not recorded','ReportSmall')]
            for a in m['actions']:
                if a['urls']: story.append(para(a['title'],'Heading2'))
                for url in a['urls']: story.append(para(url,'ReportSmall'))
            for a in m['answers']:
                story += [para(a.get('platform') or a.get('provider') or 'Observation','Heading2'),para(a.get('question') or a.get('prompt') or ''),para(a.get('answer') or a.get('response') or a.get('status') or 'No answer captured','ReportSmall')]
                for s in a.get('sources',[]):story.append(para(s.get('url') if isinstance(s,dict) else s,'ReportSmall'))
    doc=SimpleDocTemplate(str(path),pagesize=letter,leftMargin=44,rightMargin=44,topMargin=180,bottomMargin=46,title=('Free Visibility Snapshot' if free else 'AI Visibility Report')+' - '+m['dealer'],author='MatchRV')
    doc.build(story,onFirstPage=chrome,onLaterPages=chrome)
    return doc.page


def render_standard_reports(data,folder):
    folder=Path(folder);folder.mkdir(parents=True,exist_ok=True);m=presentation(data)
    for free,name in [(False,'full-report'),(True,'free-report')]:
        (folder/(name+'.html')).write_text(render_html(m,free),encoding='utf-8')
        pages = render_pdf(m,folder/(name+'.pdf'),free)
        if free and pages != 1:
            raise ValueError('Free snapshot exceeded one page; shorten the evidence summary before delivery.')
        m[name+'_pages'] = pages
    return m


def write_standard_audit(out,folder):
    """Keep the existing report.pdf contract and also produce both tiers."""
    import shutil
    result = render_standard_reports(out,folder)
    shutil.copyfile(Path(folder)/'full-report.pdf',Path(folder)/'report.pdf')
    return result['full-report_pages']
