import {safeLink, recordKey, mergeResults, buildNetwork, csvCell, matchLabel} from './helpers.mjs';
const $ = id => document.getElementById(id);
const state = {results:[], records:new Map(), selected:null, next:null, busy:false, batch:false, stop:false, controller:null, query:'', mode:'agent', pageCount:0};
function el(tag, text, className) { const node=document.createElement(tag); if(text != null) node.textContent=String(text); if(className) node.className=className; return node; }
function button(text, action, className='text-action') { const node=el('button',text,className); node.type='button'; node.addEventListener('click',action); return node; }
function link(text, value) { const url=safeLink(value); if(!url) return el('span','Source unavailable'); const node=el('a',text); node.href=url; node.target='_blank'; node.rel='noopener noreferrer'; return node; }
function say(text, error=false) { $('notice').textContent=text; $('notice').classList.toggle('error',error); }
function lock(busy) { state.busy=busy; for(const id of ['query','mode','search-button','more-button','batch-button','clear-button']) $(id).disabled=busy || (id==='clear-button' && !state.records.size); document.querySelectorAll('.result-card,.text-action').forEach(node=>node.disabled=busy); $('search-button').textContent=busy?'Working…':'Search records ↗'; }
async function api(path, params) { const response=await fetch(path+'?'+new URLSearchParams(params),{signal:state.controller?.signal}); let data; try { data=await response.json(); } catch { throw new Error('The service returned an unreadable response. Try again.'); } if(!response.ok) { const detail=data.detail ?? data.error ?? `Request failed (${response.status})`; throw new Error(typeof detail==='string'?detail:JSON.stringify(detail)); } return data; }
function showTab(name) { for(const view of ['details','connections']) { $(view+'-view').hidden=view!==name; $(view+'-tab').classList.toggle('active',view===name); $(view+'-tab').setAttribute('aria-selected',String(view===name)); } }
async function search(append=false) {
  if(state.busy) return;
  const query=$('query').value.trim(); if(!query) { $('query').focus(); return; }
  state.controller=new AbortController(); lock(true);
  if(!append) { state.query=query; state.mode=$('mode').value; state.results=[]; state.next=null; state.pageCount=0; $('search-source').replaceChildren(); renderResults(); }
  say(append?'Loading the next page of candidate records…':'Searching Sunbiz candidate records…');
  try {
    const params={q:state.query,mode:state.mode}; if(append) params.next_url=state.next;
    const data=await api('/api/search',params);
    state.results=mergeResults(state.results,Array.isArray(data.results)?data.results:[]); state.next=data.next_url || null; state.pageCount=(data.results || []).length;
    renderResults(); $('search-source').replaceChildren(link('Search evidence ↗',data.source_url));
    if(data.retrieved_at) $('search-source').append(el('div','Retrieved '+data.retrieved_at));
    say(state.results.length ? 'Candidate records loaded. Sunbiz uses alphabetical browsing; nearby names may appear. Inspect a record to verify its listed names.' : 'No candidate records returned. Try another spelling or search type.');
  } catch(error) { say(error.name==='AbortError'?'Search stopped.':error.message,true); }
  finally { lock(false); }
}
function renderResults() {
  const root=$('results'); root.replaceChildren(); $('result-count').textContent=state.results.length;
  $('search-meta').textContent=`${state.pageCount} results on this page · ${state.results.length} unique candidates loaded. Nearby names may appear.`;
  $('more-button').hidden=!state.next; $('batch-tools').hidden=!state.results.length;
  if(!state.results.length) { const empty=el('div',null,'empty results-empty'); empty.append(el('span','⌕','empty-icon'),el('h3',state.query?'No candidate records loaded.':'A name is a starting point.'),el('p','Search a registered agent, officer, or entity. Inspect a candidate to verify the match.')); root.append(empty); }
  for(const result of state.results) { const key=recordKey(result); const node=button('',()=>inspect(result),'result-card'+(key===state.selected?' active':'')); node.append(el('strong',result.entity_name || result.name || 'Unnamed entity'),el('span',matchLabel(result),'result-doc'),el('span',`Document ${result.document_number || 'not listed'}${state.records.has(key)?' · Inspected':''}`,'result-doc'),el('span','↗','result-arrow')); node.disabled=state.busy; root.append(node); }
}
async function loadRecord(result) {
  const key=recordKey(result);
  if(state.records.has(key)) { state.selected=key; renderInvestigation(); renderDetails(state.records.get(key)); renderResults(); return; }
  const url=safeLink(result.url); if(!url) throw new Error('This candidate has no valid source URL to inspect.');
  const record=await api('/api/entity',{url});
  if(!record || !record.name) throw new Error('The source did not return an entity record.');
  if(!record.source_url) record.source_url=url;
  const recordId=recordKey(record) || key;
  state.records.set(recordId,record); state.selected=recordId;
  renderInvestigation(); renderDetails(record); renderResults();
}
async function inspect(result) { if(state.busy) return; state.controller=new AbortController(); lock(true); say('Inspecting the source record…'); try { await loadRecord(result); showTab('details'); say('Record inspected and added to your investigation. Listed roles are not ownership claims.'); } catch(error) {say(error.message,true);} finally {lock(false);} }
function address(value) { if(Array.isArray(value)) return value.join('\n'); if(value && typeof value==='object') return Object.values(value).filter(Boolean).join('\n'); return value || 'Not listed'; }
function personCard(person, role) { const card=el('div',null,'person-card'), info=el('div'); info.append(el('p',person.name || 'Not listed','person-name'),el('p',role,'person-role'),el('p',address(person.address),'person-address')); card.append(info); if(person.name) card.append(button('Search this name ↗',()=> { if(state.busy) return; $('mode').value='officer'; $('query').value=person.name; search(); })); return card; }
function renderDetails(record) {
  const root=el('div',null,'detail-content'); const title=el('div',null,'detail-title'); title.append(el('h2',record.name),el('span',record.status || 'Status not listed','status-pill')); root.append(el('p','ENTITY RECORD','eyebrow'),title,el('p',`${record.entity_type || 'Entity'} · Document ${record.document_number || 'not listed'}`,'detail-meta'));
  const fields=el('div',null,'detail-fields'); for(const [label,value] of [['Principal address',record.principal_address],['Mailing address',record.mailing_address]]) { const field=el('div'); field.append(el('p',label,'field-label'),el('p',address(value),'field-value')); fields.append(field); } root.append(fields);
  const agents=el('section',null,'detail-section'); agents.append(el('h3','Registered agent')); agents.append(record.registered_agent?.name?personCard(record.registered_agent,'Registered agent'):el('p','No registered agent listed.','field-value')); root.append(agents);
  const officers=el('section',null,'detail-section'); officers.append(el('h3',`Officers / authorized persons (${(record.officers || []).length})`)); for(const person of record.officers || []) officers.append(personCard(person,person.title || 'Officer / authorized person')); if(!(record.officers || []).length) officers.append(el('p','No officers or authorized persons listed.','field-value')); root.append(officers);
  const evidence=el('div',null,'evidence-line'); evidence.append(link('View source record ↗',record.source_url)); for(const filing of record.filings || []) evidence.append(link((filing.label || 'Filing')+' ↗',filing.url)); root.append(evidence); root.append(el('p','Listed roles only. This does not establish beneficial ownership. Historical filing contents are not included.','disclaimer')); $('details-view').replaceChildren(root);
}
function evidenceTable(records, people=false) {
  const wrap=el('div',null,'table-wrap'), table=el('table'), head=el('thead'), tr=el('tr');
  for(const heading of people?['Listed name','Role','Entity / document','Evidence']:['Entity','Document / status','Listed people','Evidence']) tr.append(el('th',heading)); head.append(tr); table.append(head); const body=el('tbody');
  for(const record of records) {
    const persons=buildNetwork([record]).nodes.filter(n=>n.kind==='person');
    for(const person of people?persons:[null]) { const row=el('tr'), name=el('td'); name.append(people?el('span',person.name):button(record.name,()=>selectRecord(record))); const second=el('td',people?person.role:record.document_number || 'Not listed'); if(!people) second.append(el('small',record.status || 'Status not listed')); const third=el('td',people?record.name:String(persons.length)+' listed occurrences'); if(people) third.append(el('small',record.document_number || 'Document not listed')); const source=el('td'); source.append(link('Source ↗',record.source_url)); row.append(name,second,third,source); body.append(row); }
  } table.append(body); wrap.append(table); return wrap;
}
function selectRecord(record) { state.selected=recordKey(record); renderDetails(record); renderResults(); showTab('details'); $('details-tab').focus(); }
function svg(tag, attributes={}, text) { const node=document.createElementNS('http://www.w3.org/2000/svg',tag); for(const [key,value] of Object.entries(attributes)) node.setAttribute(key,value); if(text!=null) node.textContent=text; return node; }
function renderNetwork(records) {
  const root=el('div',null,'connections-content'); root.append(el('p','Every line is a listed role in an inspected source record. Same-name occurrences stay separate, including agent and officer roles within one record. No ownership inference; historical records are not included.','disclaimer'));
  if(!records.length) { root.append(el('div','Inspect a record to build your evidence network.','empty inspector-empty')); $('connections-view').replaceChildren(root); return; }
  const network=buildNetwork(records), graph=svg('svg',{class:'network',role:'img','aria-label':`Entity-centric network of ${records.length} inspected records. Full names and source evidence are in the table below.`});
  let top=24;
  for(const entity of network.nodes.filter(n=>n.kind==='entity')) {
    const people=network.nodes.filter(n=>n.kind==='person' && n.entityKey===entity.entityKey), block=Math.max(106,people.length*68+20), center=top+block/2;
    for(let i=0;i<people.length;i++) { const y=top+12+i*68; graph.append(svg('path',{d:`M 285 ${center} C 355 ${center}, 355 ${y+23}, 415 ${y+23}`})); const group=svg('g',{class:'person-node'}); group.append(svg('rect',{x:415,y,width:270,height:48,rx:6}),svg('title',{},people[i].name+' · '+people[i].role),svg('text',{x:429,y:y+20},truncate(people[i].name,34)),svg('text',{x:429,y:y+36,class:'node-role'},people[i].role)); graph.append(group); }
    const group=svg('g',{class:'entity-node',role:'button',tabindex:0,'aria-label':'Inspect '+entity.name}); group.append(svg('rect',{x:20,y:center-29,width:265,height:58,rx:6}),svg('title',{},entity.name),svg('text',{x:34,y:center-3},truncate(entity.name,32)),svg('text',{x:34,y:center+16,class:'node-role'},entity.entityKey)); const select=()=>selectRecord(state.records.get(entity.entityKey)); group.addEventListener('click',select); group.addEventListener('keydown',event=>{if(event.key==='Enter' || event.key===' ') {event.preventDefault();select();}}); graph.append(group); top+=block+24;
  }
  graph.setAttribute('viewBox',`0 0 710 ${top}`); graph.style.height=top+'px'; const wrap=el('div',null,'network-wrap'); wrap.append(graph); root.append(wrap); const legend=el('div',null,'legend'); for(const [label,kind] of [['Entity record',''],['Listed person occurrence','person-key']]) { const item=el('span'); item.append(el('i',null,kind),document.createTextNode(label)); legend.append(item); } root.append(legend,el('h3','People & source evidence'),evidenceTable(records,true)); $('connections-view').replaceChildren(root);
}
function truncate(value,length) { const text=String(value || 'Not listed'); return text.length>length?text.slice(0,length-1)+'…':text; }
function renderInvestigation() { const records=[...state.records.values()],count=records.length; $('inspected-count').textContent=`${count} records inspected`; $('collection-count').textContent=count; $('network-count').textContent=count; for(const id of ['json-button','csv-button','clear-button']) $(id).disabled=!count || (id==='clear-button' && state.busy); $('collection').replaceChildren(count?evidenceTable(records):el('p','No records inspected yet. Nothing is collected automatically.','collection-empty')); renderNetwork(records); }
async function batchInspect() {
  if(state.busy) return; state.controller=new AbortController(); state.batch=true; state.stop=false; lock(true); $('stop-button').hidden=false;
  const candidates=state.results.slice(0,5); let completed=0,failed=0;
  for(const result of candidates) { if(state.stop) break; $('batch-progress').textContent=`${completed} / ${candidates.length} inspected`; say(`Inspecting candidate ${completed+failed+1} of ${candidates.length}…`); try {await loadRecord(result);completed++;} catch(error) { if(error.name==='AbortError') break; failed++; say(error.message,true); } }
  state.batch=false; $('stop-button').hidden=true; $('batch-progress').textContent=`${completed} inspected${failed?` · ${failed} failed`:''}${state.stop?' · stopped':''}`; say(`Batch ${state.stop?'stopped':'complete'}: ${completed} records inspected${failed?`, ${failed} failed`:''}. No further records will be fetched.`,failed>0); lock(false);
}
function download(text,type,filename) { const url=URL.createObjectURL(new Blob([text],{type})); const a=el('a'); a.href=url; a.download=filename; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000); }
$('search-form').addEventListener('submit',event=>{event.preventDefault();search();}); $('more-button').addEventListener('click',()=>search(true)); $('batch-button').addEventListener('click',batchInspect); $('stop-button').addEventListener('click',()=> {state.stop=true;state.controller?.abort();});
for(const name of ['details','connections']) { $(name+'-tab').addEventListener('click',()=>showTab(name)); $(name+'-tab').addEventListener('keydown',event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?'details':event.key==='End'?'connections':name==='details'?'connections':'details';showTab(next);$(next+'-tab').focus();}}); }
$('json-button').addEventListener('click',()=>download(JSON.stringify({scope:'Inspected current Sunbiz entity records only; no identity merging or ownership inference.',records:[...state.records.values()]},null,2),'application/json','sunbiz-investigation.json'));
$('csv-button').addEventListener('click',()=>{const rows=[['Entity','Document','Status','Listed name','Role','Address','Source']]; for(const record of state.records.values()) { const people=buildNetwork([record]).nodes.filter(n=>n.kind==='person'); for(const person of people.length?people:[{}]) rows.push([record.name,record.document_number,record.status,person.name,person.role,address(person.address),record.source_url]); } download(rows.map(row=>row.map(csvCell).join(',')).join('\r\n'),'text/csv;charset=utf-8','sunbiz-investigation.csv');});
$('clear-button').addEventListener('click',()=>{if(state.busy || !confirm('Clear all inspected records from this session? Search results will remain.')) return; state.records.clear();state.selected=null;renderInvestigation();renderResults();const empty=el('div',null,'empty inspector-empty');empty.append(el('h2','Investigation cleared.'),el('p','Select a candidate record to begin again.'));$('details-view').replaceChildren(empty);say('Investigation cleared. No records are saved by this browser workspace.');});
renderNetwork([]);
