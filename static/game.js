/* ===================== Grid Run: a Heroes of the Grid deckbuilding roguelike =====================
   Loaded as its own file. The page that opens it provides window.GR_HOST:
   {rangers(), decksOfKind(kind), deckName(id), loadDecks(ids) -> Promise<{deckId:[cards]}>, zords(), megazords(),
    zordsOf(rangerId), megazordsOf(rangerId), arsenal(), esc, ico, rich(text), onExit()}.
   Runs and progress are kept in this browser (localStorage gr2-run and gr-meta). */
(function(){
'use strict';
const H=()=>window.GR_HOST, esc=s=>H().esc(s), rich=t=>H().rich(t||'');
const LS={get(k,d){ try{ const v=localStorage.getItem(k); return v==null?d:JSON.parse(v); }catch(e){ return d; } }, set(k,v){ try{ v==null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }};
const rnd=n=>Math.floor(Math.random()*n), pick=a=>a[rnd(a.length)], shuffle=a=>{ for(let i=a.length-1;i>0;i--){ const j=rnd(i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms)), clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const RUN_KEY='gr2-run';
/* Rules */
const HAND=5, PLAYS=2, BATTLE_E=3, STORE_MAX=1, CC_START=3, RECOVER_SHIELDS=6, XP_TRACK=5, MEGA_AT=4;
/* The die: two misses, three single hits, one double hit. */
const FACES=[{h:0,k:'miss'},{h:0,k:'miss'},{h:1,k:'hit'},{h:1,k:'hit'},{h:1,k:'hit'},{h:2,k:'double'}];
/* Small line icons (no emoji). */
const SV={bolt:'<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',shield:'<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/>',fist:'<path d="M5 13V8a2 2 0 0 1 4 0v4m0-3V6a2 2 0 0 1 4 0v6m0-4a2 2 0 0 1 4 0v4m0-2a2 2 0 0 1 4 0v4a7 7 0 0 1-7 7h-1a7 7 0 0 1-7-7v-2"/>',
  skull:'<path d="M12 3a8 8 0 0 0-8 8c0 3 1.6 5 3.5 6v3h9v-3c1.9-1 3.5-3 3.5-6a8 8 0 0 0-8-8z"/><circle cx="9" cy="11" r="1.6"/><circle cx="15" cy="11" r="1.6"/>',
  home:'<path d="M3 11 12 4l9 7v9h-6v-6H9v6H3z"/>',coin:'<circle cx="12" cy="12" r="8"/><path d="M12 8v8m-3-6h6"/>',q:'<path d="M9 9a3 3 0 1 1 4 2.8c-.7.3-1 .9-1 1.7V15M12 18.5v.5"/>',
  chest:'<path d="M4 10h16v9H4zM4 10a8 5 0 0 1 16 0M12 13v3"/>',crown:'<path d="m3 8 4 4 5-7 5 7 4-4-2 11H5z"/>',deck:'<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M3 7v12a2 2 0 0 0 2 2h10"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',zord:'<path d="M4 16 9 8l3 4 3-6 5 10z"/><path d="M3 19h18"/>'};
const svg=(n,c)=>`<svg class="gi-${n} ${c||''}" viewBox="0 0 24 24" aria-hidden="true">${SV[n]}</svg>`;

/* ---------- combat cards ---------- */
const POOL={};
const kindOf=c=>{ const t=String(c.type||'').toLowerCase(); return /react/.test(t)?'reaction':/maneu/.test(t)?'maneuver':/attack/.test(t)||c.dice>0?'attack':'maneuver'; };
const baseCost=c=>{ const n=parseInt(c.cost,10); return isNaN(n)?0:n; };
const costOf=(c,up)=>{ const v=baseCost(c); return up&&kindOf(c)!=='attack'&&v>0?v-1:v; };
const diceOf=(c,up)=>(+c.dice||0)+(up&&kindOf(c)==='attack'?1:0);
const shieldsOf=(c,up)=>(+c.shields||0)+(up&&kindOf(c)!=='attack'&&!(baseCost(c)>0)?1:0);
const upNote=(c)=>kindOf(c)==='attack'?'+1 die':baseCost(c)>0?'Costs 1 less':'+1 shield';
/** What a card's text does when it's played. Effects the game can't carry out are listed on the card instead. */
function effects(c){ if(c._fx) return c._fx; const t=String(c.text||''), parts=t.split(/★|王/), main=parts[0].toLowerCase(), star=(t.split('★')[1]||'').toLowerCase(), lo=t.toLowerCase();
  const n=(re,s)=>{ const m=re.exec(s); return m?+m[1]:0; }, E='(?:⚡|\\[crystal\\]|\\[energy\\]|energy)';
  const fx={energy:n(new RegExp('gain (\\d+) '+E),main), draw:n(/draws? (\d+) cards?/,main)||(/draw (a|1) card/.test(main)?1:0), again:/play another card|immediately play 1 card/.test(main)?1:0,
    addDice:/^(?!.*\bif\b)[^.]*add (\d+) dic?e to this attack/.test(main)?n(/add (\d+) dic?e to this attack/,main):0,
    each:/full 💥 to each|each enemy card|every enemy card/.test(main), dmg:n(/deal (\d+) 💥 to (?:an|a|each|the|one)/,main), dmgEach:/deal \d+ 💥 to each/.test(main),
    react:null, reactVal:0, starE:n(new RegExp('gain (\\d+) '+E),star), starDie:/add 1 die/.test(star)?1:0, starDraw:n(/draws? (\d+) cards?/,star)};
  if(kindOf(c)==='reaction'){ if(/suffers damage/.test(lo)){ fx.react='dmg'; fx.reactVal=n(/reduce that damage by (\d+)/,lo); fx.dmg=n(/deal (\d+) 💥/,lo); }
    else if(/performs an attack/.test(lo)){ fx.react='atk'; fx.reactVal=n(/add (\d+) dic?e/,lo)||1; } else if(/for defense/.test(lo)){ fx.react='def'; fx.reactVal=n(/add (\d+) ⛊/,lo)||2; } }
  fx.auto=!!(fx.energy||fx.draw||fx.again||fx.addDice||fx.dmg||fx.react||fx.each);
  fx.plain=!t.trim()||/^roll \d+ dic?e\.?$/i.test(t.trim());
  return c._fx=fx; }

/* ---------- Zords, Megazords and arsenal: once-per-battle abilities read from their card text ---------- */
function abilityFx(text){ const t=String(text||'').toLowerCase(), E='(?:⚡|\\[crystal\\]|\\[energy\\]|energy)';
  const n=re=>{ const m=re.exec(t); return m?+m[1]:0; };
  const fx={when:/performs an attack|before you roll|this attack/.test(t)?'atk':/suffers? damage|would suffer|reduce (that|the) damage|prevent/.test(t)?'dmg':'turn',
    dice:n(/add (\d+) dic?e/), reduce:n(/reduce (?:that|the) damage by (\d+)/)||n(/prevent (\d+) damage/), energy:n(new RegExp('gain (\\d+) '+E)),
    dmg:n(/deal (\d+) (?:💥|hits?|damage) to (?:an|a|each|every|one|1|any)/)||n(/place (\d+) hit tokens? on (?:an|a|each|every|one) enemy/), each:/to each enemy|on each enemy|every enemy/.test(t),
    draw:n(/draws? (\d+) cards?/)||(/draw (a|1) card/.test(t)?1:0), recover:/discard pile/.test(t)&&/(shuffle|return|put)/.test(t)?(n(/(\d+) cards? from (?:your|their|a) discard/)||2):0};
  fx.ok=!!(fx.dice||fx.reduce||fx.energy||fx.dmg||fx.draw||fx.recover); if(fx.when==='atk'&&!fx.dice) fx.when='turn'; if(fx.when==='dmg'&&!fx.reduce) fx.when='turn';
  return fx; }
const abilityOf=(c,kind)=>({id:c.id, kind, name:c.character||c.title, img:c.thumb||c.src||'', text:c.abilityText||'', fx:abilityFx(c.abilityText)});
const fxSummary=fx=>[fx.dice?`+${fx.dice} ${fx.dice===1?'die':'dice'} to an attack`:'', fx.reduce?`reduce damage by ${fx.reduce}`:'', fx.energy?`gain ${fx.energy} energy`:'', fx.dmg?`${fx.dmg} ${fx.dmg===1?'hit':'hits'} to ${fx.each?'every':'an'} enemy card`:'', fx.draw?`draw ${fx.draw}`:'', fx.recover?`return ${fx.recover} cards from your discard pile to your deck`:''].filter(Boolean).join(', ');

/* ---------- enemy cards ---------- */
function enemyFx(c){ if(c._e) return c._e; const t=String(c.text||''), lo=t.toLowerCase(); const n=re=>{ const m=re.exec(lo); return m?+m[1]:0; };
  return c._e={hp:n(/health\s*:?\s*(\d+)/)||4, fast:/\bfast\b/i.test(t), guard:/\bguard\b/i.test(t), passive:/\bpassive\b/i.test(t),
    dmg:n(/deal (\d+) damage/), drain:n(/drain (\d+)/), discHand:n(/discard (\d+) cards? from (?:their|your) hand/)||(/discard (?:a|1) card from (?:their|your) hand/.test(lo)?1:0),
    discTop:n(/discard the top (\d+) cards?/)||(/discard the top card/.test(lo)?1:0), boost:/passive/i.test(t)&&/(\+1 damage|1 additional damage|deals? 1 more damage|increase)/.test(lo)?1:0}; }
const isBattleCard=c=>!/deploy/i.test(c.type||'')&&!/^deploy/i.test(c.title||'');

/* ---------- state ---------- */
const G={el:null, decks:{}, rangers:[], run:null, meta:LS.get('gr-meta',{xp:0,wins:0,runs:0,best:0}), b:null, busy:false, quick:LS.get('gr-quick',false)};
const level=()=>Math.floor(Math.sqrt((G.meta.xp||0)/60));
const save=()=>{ if(G.run) LS.set(RUN_KEY,G.run); };
const card=i=>POOL[i.id]||{title:'Missing card',type:'Maneuver',cost:'0',text:'',shields:1};

async function loadAll(say){ const h=H(); G.rangers=h.rangers().filter(r=>(r.decks||[]).length);
  const ids=[...new Set([...G.rangers.flatMap(r=>r.decks), ...['footsoldier','monster','nemesis','boss'].flatMap(k=>h.decksOfKind(k).map(d=>d.id))])];
  say&&say('Loading decks…'); Object.assign(G.decks,await h.loadDecks(ids));
  G.rangers.forEach(r=>r.decks.forEach(did=>(G.decks[did]||[]).forEach(c=>{ if(/attack|maneu|react/i.test(c.type||'')) POOL[c.id]={...c,deckName:(h.deckName&&h.deckName(did))||''}; })));
  G.rangers=G.rangers.filter(r=>r.decks.some(d=>(G.decks[d]||[]).length)); }
const deckOf=r=>r.decks.flatMap(did=>(G.decks[did]||[]).filter(c=>POOL[c.id]).flatMap(c=>Array(clamp(+c.copies||1,1,3)).fill(c.id)));
const unlocked=()=>G.rangers.slice(0,5+2*level());
const enemyDecks=k=>H().decksOfKind(k).filter(d=>(G.decks[d.id]||[]).some(isBattleCard));

/* ---------- screens ---------- */
const body=()=>G.el.querySelector('#grBody'), top=()=>G.el.querySelector('#grTop');
function mount(el){ G.el=el; el.innerHTML=`<div class="gr"><div class="gr-top" id="grTop"></div><div class="gr-body" id="grBody"></div><div class="gr-dice" id="grDice" hidden></div><div class="gr-modal" id="grModal" hidden></div><div class="gr-toast" id="grToast"></div><div class="gr-zoom" id="grZoom" hidden></div></div>`; title(); }
function toastG(m){ const t=G.el.querySelector('#grToast'); t.textContent=m; t.classList.add('on'); clearTimeout(toastG.t); toastG.t=setTimeout(()=>t.classList.remove('on'),2400); }
function topBar(extra){ const r=G.run; top().innerHTML=`<button class="gr-b" data-g="exit" aria-label="Leave the game">${svg('x')}</button><b class="gr-logo">Grid Run</b>
  ${r?`<span class="gr-stat" title="Command Center energy: each time your deck runs out you spend 1. At 0 the run ends.">Command Center ${r.cc}</span><span class="gr-stat" title="Grid Points">${svg('coin')}${r.gold}</span><span class="gr-stat">Act ${r.act} · Floor ${r.floor+1}</span>
    <button class="gr-b gr-tx" data-g="deck">${svg('deck')}<span>Cards ${r.draw.length+r.hand.length+r.disc.length}</span></button>`:''}${extra||''}<span class="gr-sp"></span>
  <button class="gr-b gr-tx" data-g="help">${svg('q')}<span>How to play</span></button>`; }
function modal(html,cls){ const m=G.el.querySelector('#grModal'); m.innerHTML=`<div class="gr-mc ${cls||''}">${html}</div>`; m.hidden=false; }
const closeModal=()=>{ const m=G.el.querySelector('#grModal'); m.hidden=true; m.innerHTML=''; m.onclick=null; };
function zoom(src,text){ const z=G.el.querySelector('#grZoom'); z.innerHTML=`<div class="gr-zc">${src?`<img src="${esc(src.replace(/=w\d+$/,'=w900'))}" alt="" referrerpolicy="no-referrer">`:''}${text?`<p>${rich(text)}</p>`:''}<button class="gr-btn" data-zclose>Close</button></div>`; z.hidden=false; z.onclick=e=>{ if(e.target===z||e.target.closest('[data-zclose]')){ z.hidden=true; z.innerHTML=''; } }; }

function title(){ G.run=LS.get(RUN_KEY,null); topBar('');
  body().innerHTML=`<div class="gr-title"><div class="gr-hero"><small>Heroes of the Grid roguelike</small><h1>Grid Run</h1><p>Lead one Ranger through three acts of Heroes of the Grid battles. Your combat deck is your lifeline: every hit you take costs you cards, so build the deck, summon Zords and keep it alive to the final boss.</p>
    <div class="gr-acts">${G.run?`<button class="gr-btn pri" data-g="continue">Continue · Act ${G.run.act}, floor ${G.run.floor+1}</button>`:''}<button class="gr-btn${G.run?'':' pri'}" data-g="new">${G.run?'New run':'Start a run'}</button><button class="gr-btn" data-g="help">How to play</button></div></div>
    <div class="gr-meta"><b>Grid rank ${level()}</b><span class="gr-xp"><i style="width:${Math.min(100,((G.meta.xp||0)-60*level()**2)/(60*((level()+1)**2-level()**2))*100)}%"></i></span>
      <small>${G.meta.runs||0} runs · ${G.meta.wins||0} wins · furthest: floor ${G.meta.best||0}. Each rank unlocks 2 more Rangers. Each win unlocks a higher threat level.</small></div></div>`; }
function help(){ modal(`<h2>How to play</h2><div class="gr-help">
  <h3>Your deck is your health</h3><p>You start with your Ranger’s combat deck and a hand of ${HAND} cards. There is no health bar: when you take damage you lose cards from the top of your deck. If you need a card from your deck and it’s empty, your Ranger is knocked out: you spend 1 Command Center energy, shuffle your hand and discard pile into a new deck and draw ${HAND}. When the Command Center has no energy left, the run is over.</p>
  <h3>Battles</h3><p>Enemies fight with a row of enemy cards. Foot soldiers put in one card each; a monster or boss adds a row of 4 cards from its own deck. Every enemy card has health, and most have an effect such as dealing damage.</p>
  <p>Turns alternate: you take a turn, then the next enemy card acts (top row first, left to right), then you, and so on. Cards marked FAST make the enemies go first. After the last enemy card has acted you get one final turn, and the battle ends. Enemies still standing fight again in the next battle.</p>
  <h3>Your turn</h3><p>Play up to ${PLAYS} cards, paying their cost from the energy pool. Each battle adds ${BATTLE_E} energy to the pool, and you can keep ${STORE_MAX} energy between battles to add whenever you like. Cards that let you play another card give you an extra play. You draw back up to ${HAND} cards only at the start of a battle, so spend your hand with care.</p>
  <p>Attacks roll the dice shown on the card. Each die has two misses, three single hits and one double hit. Hits go onto the target card; it’s defeated when its hits reach its health. You can’t attack a card next to an enemy card with GUARD (beside it in its row, or directly above or below it) until the GUARD card is defeated.</p>
  <h3>Taking damage</h3><p>When you take damage, reveal the top card of your deck and compare its shields to the damage. More shields than damage: the card goes to the bottom of your deck. The same: it’s discarded. Fewer: it’s discarded and you reveal the next card for the rest. Some cards have an ability that triggers when they’re revealed this way. Reactions can be played from your hand when you take damage or attack.</p>
  <h3>Between battles</h3><p>Foot soldier fights show up to one card per foot soldier (more in later acts). After each battle you may recover: shuffle cards from your discard pile back into your deck, up to ${RECOVER_SHIELDS} shields’ worth. Monsters need 4 of their cards defeated and bosses 6, so they can take several battles. When you win a fight, discarded cards worth up to ${RECOVER_SHIELDS} shields return to your deck on their own. At the Command Center you power up: your hand and discard pile go back into your deck and you draw a fresh hand.</p>
  <h3>Zords</h3><p>Every ${XP_TRACK} foot soldier cards you defeat, and every monster you beat, summon a Zord. After ${MEGA_AT} Zords the Megazord joins you. Each Zord, Megazord and arsenal card has its own ability, usable once per battle.</p>
  <h3>Building your deck</h3><p>Win fights to earn Grid Points and add cards from other Rangers’ decks. Upgrade cards at the Command Center or shop: an upgraded attack rolls 1 more die, and other upgraded cards cost 1 less energy (or gain 1 shield if they’re already free).</p>
  <p class="gr-dim">Cards play from their printed text. Energy, drawing, extra plays, extra dice, damage and reactions happen automatically. Other text is shown on the card so you can see it, but isn’t carried out.</p></div>
  <div class="gr-acts"><label class="gr-chk"><input type="checkbox" id="grQuick" ${G.quick?'checked':''}> Faster dice and reveals</label><button class="gr-btn pri" data-g="close">Close</button></div>`,'wide');
  G.el.querySelector('#grQuick').onchange=e=>{ G.quick=e.target.checked; LS.set('gr-quick',G.quick); }; }

/* ---------- choosing a Ranger ---------- */
function chooseRanger(){ const open=new Set(unlocked().map(r=>r.id)), maxT=G.meta.wins||0; topBar('');
  body().innerHTML=`<div class="gr-pad"><h2 class="gr-h">Choose your Ranger</h2>${maxT?`<p class="gr-dim">Threat level <select id="grThreat">${Array.from({length:maxT+1},(_,i)=>`<option value="${i}">${i?i+' (enemy cards +'+i+' health)':'Normal'}</option>`).join('')}</select></p>`:''}
    <div class="gr-rangers">${G.rangers.map(r=>{ const ok=open.has(r.id);
      return `<button class="gr-rg${ok?'':' locked'}" ${ok?`data-rg="${r.id}"`:'disabled'}>${r.thumb?`<img src="${esc(r.thumb)}" alt="${esc(r.character||r.title)}" loading="lazy" referrerpolicy="no-referrer">`:''}
        <span><b>${esc(r.character||r.title)}</b><small>${ok?deckOf(r).length+' combat cards':'Unlocks at a higher Grid rank'}</small></span></button>`; }).join('')}</div>
    ${!G.rangers.length?'<p class="gr-dim">No Rangers with combat decks are on the site yet.</p>':''}</div>`; }
function zordDeck(r){ const h=H(); const mine=h.zordsOf(r.id).map(z=>abilityOf(z,'zord')).filter(a=>a.fx.ok);
  const rest=shuffle(h.zords().filter(z=>!mine.some(m=>m.id===z.id)).map(z=>abilityOf(z,'zord')).filter(a=>a.fx.ok));
  const mega=[...h.megazordsOf(r.id),...shuffle(h.megazords())].map(z=>abilityOf(z,'mega')).find(a=>a.fx.ok)||null;
  return {zords:[...mine,...rest].slice(0,MEGA_AT), mega}; }
function newRun(rid){ const r=G.rangers.find(x=>x.id===rid); if(!r) return; const th=+((G.el.querySelector('#grThreat')||{}).value||0); const zd=zordDeck(r);
  const deck=shuffle(deckOf(r).map((id,i)=>({u:'c'+i,id,up:0})));
  G.run={ranger:r.id, name:r.character||r.title, img:r.thumb||'', ability:[r.abilityName,r.abilityText].filter(Boolean).join(': '), threat:th,
    cc:CC_START, gold:50, act:1, floor:-1, draw:deck.slice(HAND), hand:deck.slice(0,HAND), disc:[], stored:1, xp:0,
    zordDeck:zd.zords, megaCard:zd.mega, zords:[], arsenal:[], map:makeMap(), pos:null, seen:{}, enc:null, n:0, usedBoss:[]};
  G.meta.runs=(G.meta.runs||0)+1; LS.set('gr-meta',G.meta); save(); showMap(); }

/* ---------- the map ---------- */
const NODE={fight:['fist','Foot soldiers'],monster:['skull','Monster'],rest:['home','Command Center'],shop:['coin','Shop'],event:['q','Event'],arsenal:['chest','Arsenal'],boss:['crown','Boss']};
function makeMap(){ const R=8, rows=[];
  for(let y=0;y<R;y++){ const n=y===0?3:2+rnd(2); const row=[]; for(let x=0;x<n;x++){ let t;
      if(y===0) t='fight'; else if(y===R-1) t='rest'; else if(y===3) t=x===0?'arsenal':'monster';
      else { const p=Math.random(); t=p<.42?'fight':p<.6?'event':p<.72&&y>=2?'monster':p<.84?'shop':y>=2?'rest':'fight'; }
      row.push({t,to:[]}); } rows.push(row); }
  for(let y=0;y<R-1;y++){ const a=rows[y], b=rows[y+1];
    a.forEach((nd,i)=>{ const j=Math.round(i/Math.max(1,a.length-1)*(b.length-1)); nd.to=[...new Set([j,clamp(j+(Math.random()<.5?-1:1),0,b.length-1)])]; });
    b.forEach((m,j)=>{ if(!a.some(nd=>nd.to.includes(j))) a[Math.round(j/Math.max(1,b.length-1)*(a.length-1))].to.push(j); }); }
  rows.push([{t:'boss',to:[]}]); rows[R-1].forEach(nd=>nd.to=[0]); return rows; }
function reachable(){ const r=G.run; if(!r.pos) return r.map[0].map((_,i)=>[0,i]); return r.map[r.pos[0]][r.pos[1]].to.map(j=>[r.pos[0]+1,j]); }
function showMap(){ const r=G.run; topBar(''); const can=reachable().map(p=>p.join(',')), rows=r.map, H0=rows.length;
  const xy=(y,x)=>[(x+1)/(rows[y].length+1)*100,(H0-y-.5)/H0*100];
  let lines=''; rows.forEach((row,y)=>row.forEach((nd,x)=>nd.to.forEach(j=>{ const [a,b]=xy(y,x),[c,d]=xy(y+1,j); lines+=`<line x1="${a}" y1="${b}" x2="${c}" y2="${d}" class="${r.seen[y+','+x]&&r.seen[(y+1)+','+j]?'done':''}"/>`; })));
  body().innerHTML=`<div class="gr-map"><div class="gr-maph"><h2 class="gr-h">Act ${r.act}: ${['Angel Grove','The Moon Palace','The Shattered Grid'][r.act-1]}</h2><p class="gr-dim">Choose your next stop.</p></div>
    <div class="gr-mapc" style="height:${H0*66}px"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
    ${rows.map((row,y)=>row.map((nd,x)=>{ const [px,py]=xy(y,x), k=y+','+x, ok=can.includes(k);
      return `<button class="gr-node t-${nd.t}${ok?' ok':''}${r.seen[k]?' seen':''}" style="left:${px}%;top:${py}%" ${ok?`data-node="${k}"`:'disabled'} aria-label="${NODE[nd.t][1]}" title="${NODE[nd.t][1]}">${svg(NODE[nd.t][0])}</button>`; }).join('')).join('')}</div>
    <div class="gr-legend">${Object.entries(NODE).map(([k,v])=>`<span class="t-${k}">${svg(v[0])}${v[1]}</span>`).join('')}</div></div>`;
  const nx=G.el.querySelector('.gr-node.ok'); if(nx) setTimeout(()=>nx.scrollIntoView({block:'center',behavior:'smooth'}),60); }
function enterNode(k){ const r=G.run; const [y,x]=k.split(',').map(Number); r.pos=[y,x]; r.floor=y; r.seen[k]=1; G.meta.best=Math.max(G.meta.best||0,(r.act-1)*9+y+1); LS.set('gr-meta',G.meta);
  const t=r.map[y][x].t; if(t==='fight'||t==='monster'||t==='boss'){ r.enc=makeEncounter(t); save(); return startBattle(); }
  save(); if(t==='rest') return rest(); if(t==='shop') return shop(); if(t==='arsenal') return arsenalNode(); if(t==='event') return event(); }

/* ---------- encounters: foot soldiers, plus a monster or boss that may take several battles ---------- */
function makeEncounter(t){ const r=G.run, a=r.act; const fsd=enemyDecks('footsoldier'); const fs=fsd.length?pick(fsd):null;
  const enc={t, fs:fs?fs.id:'', fsName:fs?fs.name:'Foot soldiers', fsLeft:t==='fight'?1+a+rnd(2):t==='monster'?a:1+a, big:null};
  if(t==='monster'){ const ms=[...enemyDecks('monster'),...enemyDecks('nemesis')]; if(ms.length){ const m=pick(ms); enc.big={id:m.id,name:m.name,need:4,kind:'monster',pile:[],out:0}; } }
  if(t==='boss'){ const bs=enemyDecks('boss').filter(d=>!r.usedBoss.includes(d.id)); const all=bs.length?bs:enemyDecks('boss'); if(all.length){ const d=pick(all); r.usedBoss.push(d.id); enc.big={id:d.id,name:d.name,need:6,kind:'boss',pile:[],out:0}; } }
  if(enc.big) enc.big.need=Math.max(1,Math.min(enc.big.need,(G.decks[enc.big.id]||[]).filter(isBattleCard).length));
  return enc; }
const deckCards=id=>(G.decks[id]||[]).filter(isBattleCard);
function startBattle(){ const r=G.run, e=r.enc; const fsCards=deckCards(e.fs); const rowB=[], rowT=[];
  const n=Math.min(Math.min(4,r.act+(e.big?0:1)),e.fsLeft); const fsPick=shuffle(fsCards.slice()); for(let i=0;i<n&&fsCards.length;i++) rowB.push(eCard(fsPick[i%fsPick.length],'fs'));
  if(e.big){ const cards=deckCards(e.big.id); if(!e.big.pile.length) e.big.pile=shuffle(cards.map(c=>c.id).filter(id=>!(e.big.done||[]).includes(id))); const take=e.big.pile.splice(0,e.big.kind==='boss'?4:Math.min(4,r.act+1));
    take.forEach(id=>{ const c=cards.find(x=>x.id===id); if(c) rowT.push(eCard(c,'big')); }); }
  const order=row=>[...row.filter(x=>x.fast),...row.filter(x=>!x.fast)];
  const rows=[order(rowT),order(rowB)].filter(x=>x.length);
  const pool=BATTLE_E; drawUp();
  G.b={rows, seq:rows.flat(), next:0, pool, plays:0, turn:'ranger', final:false, used:{}, nextDie:0, log:[], sel:null, defeatedFs:0, round:(e.round=(e.round||0)+1)};
  r.zords.concat(r.arsenal).forEach(a=>{ a.ex=false; }); if(r.megaOn) r.megaOn.ex=false;
  save(); if(G.b.seq.some(x=>x.fast&&!x.dead)){ paintBattle(); setTimeout(enemyTurn,700); } else rangerTurn(); }
function eCard(c,from){ const f=enemyFx(c), th=G.run.threat; return {uid:'k'+Math.random().toString(36).slice(2,8), id:c.id, from, name:c.title, img:c.thumb||c.src||'', text:c.text||'', hp:f.hp+th, hits:0, dead:false, done:false, fast:f.fast, guard:f.guard, passive:f.passive, fx:f}; }
function drawUp(){ const r=G.run; let ko=false; while(r.hand.length<HAND){ if(!r.draw.length){ if(ko||!r.disc.length||!knockout('draw')) return; ko=true; continue; } r.hand.push(r.draw.shift()); } }
/** The deck ran out: spend Command Center energy, rebuild the deck from hand and discard pile, draw a fresh hand. */
function knockout(why){ const r=G.run; if(r.cc<=0){ r.dead=true; return false; } r.cc--; r.draw=shuffle([...r.hand,...r.disc,...r.draw]); r.hand=[]; r.disc=[];
  for(let i=0;i<HAND&&r.draw.length;i++) r.hand.push(r.draw.shift()); toastG('Your Ranger is knocked out. Command Center energy left: '+r.cc+'.'); if(G.b) G.b.koed=true; return r.draw.length>0||r.hand.length>0; }

/* ---------- painting a battle ---------- */
function targetable(k){ const b=G.b; if(k.dead) return false; if(k.guard) return true;
  for(let ri=0;ri<b.rows.length;ri++){ const row=b.rows[ri], i=row.indexOf(k); if(i<0) continue;
    const near=[row[i-1],row[i+1],(b.rows[ri-1]||[])[i],(b.rows[ri+1]||[])[i]].filter(Boolean); return !near.some(o=>o.guard&&!o.dead); } return true; }
function paintBattle(){ const r=G.run, b=G.b; if(!b) return; const e=r.enc;
  topBar(`<span class="gr-stat en" title="Energy pool">${svg('bolt')}${b.pool}</span>${r.stored?`<button class="gr-b gr-tx" data-g="stored" title="Add your stored energy to the pool">${svg('bolt')}<span>Use stored (${r.stored})</span></button>`:''}`);
  const live=b.seq.filter(k=>!k.dead&&!k.done), nextK=b.turn==='enemy'?null:live[0];
  const abil=[...r.zords,...(r.megaOn?[r.megaOn]:[]),...r.arsenal];
  body().innerHTML=`<div class="gr-battle">
    <div class="gr-enc"><b>${esc(e.big?e.big.name:e.fsName)}</b><span>${e.big?`${e.big.out}/${e.big.need} of its cards defeated · `:''}${e.fsLeft} ${esc(e.fsName)} left · battle ${b.round}</span></div>
    <div class="gr-rows">${b.rows.map(row=>`<div class="gr-row">${row.map(k=>{ const i=b.seq.indexOf(k), can=b.sel&&targetable(k);
      return `<button class="gr-ec${k.dead?' dead':''}${k.done?' done':''}${k===nextK?' next':''}${can?' tgt':''}${b.sel&&!can&&!k.dead?' safe':''}" data-ek="${k.uid}" aria-label="${esc(k.name)}">
        <span class="gr-eo">${i+1}</span>${k.img?`<img src="${esc(k.img)}" alt="" referrerpolicy="no-referrer">`:`<span class="gr-et">${esc(k.name)}</span>`}
        ${k.dead?'<span class="gr-ed">Defeated</span>':`<span class="gr-eh">${k.hits}/${k.hp}</span>`}${k.done&&!k.dead?'<span class="gr-ee">Acted</span>':''}</button>`; }).join('')}</div>`).join('')}</div>
    <div class="gr-turn">${b.turn==='enemy'?'Enemy turn':b.final?'Your final turn':'Your turn'} · ${b.sel?`Choose a target for <b>${esc(card(b.sel).title)}</b> <button class="gr-link" data-g="unsel">Cancel</button>`:b.turn==='ranger'?`${b.plays} ${b.plays===1?'play':'plays'} left`:''}</div>
    <div class="gr-me"><button class="gr-ch" data-zoomsrc="${esc(r.img)}" data-zoomtext="${esc(r.ability)}">${r.img?`<img src="${esc(r.img)}" alt="${esc(r.name)}" referrerpolicy="no-referrer">`:`<b>${esc(r.name)}</b>`}</button>
      <div class="gr-piles"><span>Deck <b>${r.draw.length}</b></span><span>Discard <b>${r.disc.length}</b></span><span>Zord track <b>${r.xp}/${XP_TRACK}</b></span></div>
      <div class="gr-abil">${abil.map(a=>`<button class="gr-ab${a.ex?' ex':''}" data-ab="${a.id}" title="${esc(a.name+': '+fxSummary(a.fx))}">${a.img?`<img src="${esc(a.img)}" alt="" referrerpolicy="no-referrer">`:''}<span><b>${esc(a.name)}</b><small>${a.ex?'Used this battle':esc(fxSummary(a.fx))}</small></span></button>`).join('')}</div>
      <div class="gr-btns"><button class="gr-btn pri" data-g="pass" ${b.turn!=='ranger'?'disabled':''}>${b.plays<PLAYS?'End turn':'Pass'}</button></div></div>
    <div class="gr-hand">${r.hand.map((h,i)=>cardHTML(h,`data-hand="${i}"`,b.turn==='ranger'&&playable(h)?'':'dim')).join('')||'<p class="gr-dim">Your hand is empty.</p>'}</div></div>`; }
function playable(h){ const b=G.b, c=card(h); return b.plays>0&&kindOf(c)!=='reaction'&&costOf(c,h.up)<=b.pool; }
/** A combat card shown as its own card picture, with an upgrade tag when upgraded. */
function cardHTML(h,attr,cls){ const c=card(h), fx=effects(c);
  return `<button class="gc ${cls||''}${h.up?' up':''}" ${attr||''} aria-label="${esc(c.title)}">${c.thumb?`<img src="${esc(c.thumb)}" alt="${esc(c.title)}" loading="lazy" referrerpolicy="no-referrer">`:`<span class="gc-f"><b>${esc(c.title)}</b><small>${esc(c.type)} · cost ${esc(c.cost)}</small><span>${rich(c.text)}</span></span>`}
    ${h.up?`<span class="gc-up">Upgraded · ${esc(upNote(c))}</span>`:''}${!fx.auto&&!fx.plain?'<span class="gc-na" title="Part of this card’s text isn’t carried out automatically">Text shown only</span>':''}</button>`; }

/* ---------- dice ---------- */
async function roll(n,label,flat){ const tray=G.el.querySelector('#grDice'); const res=Array.from({length:Math.max(0,n)},()=>pick(FACES));
  const face=f=>f.k==='miss'?'':f.k==='double'?'<i></i><i></i>':'<i></i>';
  tray.innerHTML=`<div class="gr-dt"><b>${esc(label)}</b><div class="gr-dr">${res.map(()=>'<span class="gr-die spin"></span>').join('')||'<span class="gr-dim">No dice</span>'}</div><div class="gr-dsum"></div></div>`; tray.hidden=false;
  const ds=[...tray.querySelectorAll('.gr-die')]; const t0=Date.now(), dur=G.quick?350:750;
  while(Date.now()-t0<dur){ ds.forEach(d=>{ d.className='gr-die spin f-'+pick(FACES).k; d.innerHTML=face(pick(FACES)); }); await sleep(70); }
  ds.forEach((d,k)=>{ d.className='gr-die land f-'+res[k].k; d.innerHTML=face(res[k]); });
  const hits=res.reduce((a,f)=>a+f.h,0)+(flat||0); tray.querySelector('.gr-dsum').textContent=`${hits} ${hits===1?'hit':'hits'}${flat?` (includes +${flat})`:''}`;
  await sleep(G.quick?450:900); tray.hidden=true; return {hits, misses:res.filter(f=>f.k==='miss').length, doubles:res.filter(f=>f.k==='double').length}; }

/* ---------- the turn sequence ---------- */
function rangerTurn(){ const b=G.b; b.turn='ranger'; b.plays=PLAYS; paintBattle(); }
async function endRangerTurn(){ const b=G.b; if(G.busy) return; b.sel=null; if(b.final||!b.seq.some(k=>!k.dead&&!k.done)) return endBattle(); b.turn='enemy'; paintBattle(); await sleep(350); enemyTurn(); }
async function enemyTurn(){ const b=G.b, r=G.run; if(!b) return; G.busy=true;
  try{ const k=b.seq.find(x=>!x.dead&&!x.done); if(!k){ b.final=true; G.busy=false; toastG('Every enemy card has acted. Take your final turn.'); return rangerTurn(); }
    k.done=true; paintBattle(); await resolveEnemy(k); if(!G.b) return;
    if(r.dead) return lose();
    if(!b.seq.some(x=>!x.dead&&!x.done)) b.final=true;
  } finally { G.busy=false; }
  if(G.b){ if(b.seq.every(x=>x.dead)) return endBattle(); rangerTurn(); } }
async function resolveEnemy(k){ const b=G.b, r=G.run, f=k.fx; let txt=k.name;
  if(f.passive&&!f.dmg&&!f.drain&&!f.discHand&&!f.discTop){ toastG(k.name+' has an ongoing effect.'); await sleep(500); return; }
  const boost=b.seq.filter(x=>x!==k&&!x.dead&&x.fx.boost).length;
  if(f.drain){ let d=f.drain; const a=Math.min(b.pool,d); b.pool-=a; d-=a; const s=Math.min(r.stored,d); r.stored-=s; d-=s; for(let i=0;i<d&&r.hand.length;i++) r.disc.push(r.hand.pop()); toastG(k.name+' drains '+f.drain+' energy'); }
  if(f.discHand){ for(let i=0;i<f.discHand&&r.hand.length;i++){ const j=await pickHand(`${esc(k.name)}: discard a card from your hand`); r.disc.push(r.hand.splice(j,1)[0]); } }
  if(f.discTop){ for(let i=0;i<f.discTop;i++){ if(!r.draw.length&&!knockout('mill')) break; if(r.draw.length) r.disc.push(r.draw.shift()); } toastG(k.name+': discard the top of your deck'); }
  const dmg=(f.dmg||0)+(f.dmg?boost:0); if(dmg>0) await takeDamage(dmg,k);
  else if(!f.drain&&!f.discHand&&!f.discTop){ zoom(k.img,k.text+'\n\n(This effect has no automatic result in Grid Run.)'); await sleep(G.quick?900:1500); const z=G.el.querySelector('#grZoom'); z.hidden=true; z.innerHTML=''; }
  paintBattle(); }
function pickHand(q){ const r=G.run; if(r.hand.length===1) return Promise.resolve(0); return new Promise(res=>{ modal(`<h2>${q}</h2><div class="gr-hand grid">${r.hand.map((h,i)=>cardHTML(h,`data-pk="${i}"`)).join('')}</div>`);
  G.el.querySelector('#grModal').onclick=e=>{ const t=e.target.closest('[data-pk]'); if(!t) return; closeModal(); res(+t.dataset.pk); }; }); }
/** Damage: reactions and abilities first, then reveal cards from the top of the deck. */
async function takeDamage(dmg,k){ const b=G.b, r=G.run; let left=dmg;
  const reacts=r.hand.map((h,i)=>({h,i})).filter(x=>{ const fx=effects(card(x.h)); return fx.react==='dmg'&&fx.reactVal>0&&costOf(card(x.h),x.h.up)<=b.pool; });
  const abs=[...r.zords,...(r.megaOn?[r.megaOn]:[]),...r.arsenal].filter(a=>!a.ex&&a.fx.when==='dmg');
  if((reacts.length||abs.length)&&!G.quick){ const ch=await new Promise(res=>{ modal(`<h2>${esc(k.name)} deals ${dmg} damage</h2><p class="gr-dim">Reduce it first, or reveal cards from your deck.</p>
      <div class="gr-hand sm">${reacts.map(x=>cardHTML(x.h,`data-rx="${x.i}"`)).join('')}${abs.map(a=>`<button class="gr-ab" data-ax="${a.id}">${a.img?`<img src="${esc(a.img)}" alt="" referrerpolicy="no-referrer">`:''}<span><b>${esc(a.name)}</b><small>${esc(fxSummary(a.fx))}</small></span></button>`).join('')}</div>
      <div class="gr-acts"><button class="gr-btn pri" data-rv>Reveal from my deck</button></div>`);
      G.el.querySelector('#grModal').onclick=e=>{ const t=e.target.closest('[data-rx],[data-ax],[data-rv]'); if(!t) return; closeModal(); res(t.dataset.rx!==undefined?{rx:+t.dataset.rx}:t.dataset.ax?{ax:t.dataset.ax}:{}); }; });
    if(ch.rx!==undefined){ const h=r.hand[ch.rx], fx=effects(card(h)); b.pool-=costOf(card(h),h.up); r.hand.splice(ch.rx,1); r.disc.push(h); left-=fx.reactVal; if(fx.dmg&&!k.dead) addHits(k,fx.dmg); toastG(card(h).title+': damage reduced by '+fx.reactVal); }
    if(ch.ax){ const a=findAb(ch.ax); if(a){ a.ex=true; left-=a.fx.reduce; toastG(a.name+': damage reduced by '+a.fx.reduce); } } }
  while(left>0){ if(!r.draw.length){ if(!knockout('def')) { r.dead=true; return; } return; }
    const h=r.draw.shift(), c=card(h), fx=effects(c); const s=shieldsOf(c,h.up); let where;
    if(c.star){ if(fx.starE) b.pool+=fx.starE; if(fx.starDie) b.nextDie++; if(fx.starDraw) for(let i=0;i<fx.starDraw&&r.draw.length;i++) r.hand.push(r.draw.shift()); }
    if(s>left){ r.draw.push(h); where='goes to the bottom of your deck'; left=0; } else { r.disc.push(h); left-=s; where=left?`is discarded; ${left} damage left`:'is discarded'; }
    await showReveal(h,s,where); }
  paintBattle(); }
async function showReveal(h,s,where){ modal(`<p class="gr-sub">Revealed for defense</p><div class="gr-hand sm one">${cardHTML(h)}</div><p class="gr-q">${s} ${s===1?'shield':'shields'}: the card ${where}.</p>`); await sleep(G.quick?650:1300); closeModal(); }
const findAb=id=>[...G.run.zords,...(G.run.megaOn?[G.run.megaOn]:[]),...G.run.arsenal].find(a=>a.id===id);

/* ---------- playing cards ---------- */
async function playHand(idx){ const b=G.b, r=G.run; if(G.busy||!b||b.turn!=='ranger') return; const h=r.hand[idx]; if(!h) return; const c=card(h);
  if(kindOf(c)==='reaction') return toastG('Reactions are played when you attack or take damage.');
  if(!b.plays) return toastG('No plays left this turn.'); if(costOf(c,h.up)>b.pool) return toastG('Not enough energy in the pool.');
  if(kindOf(c)==='attack'&&!effects(c).each){ const t=b.seq.filter(k=>targetable(k)); if(t.length===1) return resolve(idx,t[0]); if(!t.length) return toastG('No enemy card can be attacked.'); b.sel=h; return paintBattle(); }
  return resolve(idx,null); }
function addHits(k,n){ const b=G.b, r=G.run, e=r.enc; if(!k||k.dead||n<=0) return; k.hits+=n; floatText(k.uid,'+'+n);
  if(k.hits>=k.hp){ k.dead=true; if(k.from==='fs'){ e.fsLeft=Math.max(0,e.fsLeft-1); b.defeatedFs++; r.xp++; if(r.xp>=XP_TRACK){ r.xp=0; summonZord(); } }
    else if(e.big){ e.big.out++; (e.big.done=e.big.done||[]).push(k.id); } } }
async function resolve(idx,target){ const b=G.b, r=G.run; G.busy=true; const h=r.hand.splice(idx,1)[0], c=card(h), fx=effects(c), k=kindOf(c); b.sel=null;
  b.pool-=costOf(c,h.up); b.plays--; paintBattle();
  try{ if(fx.energy) b.pool+=fx.energy; if(fx.again) b.plays+=fx.again;
    if(k==='attack'){ let dice=diceOf(c,h.up)+fx.addDice+b.nextDie; b.nextDie=0;
      for(const x of r.hand.filter(x=>effects(card(x)).react==='atk'&&costOf(card(x),x.up)<=b.pool)){ const xc=card(x); if(await ask(`Play ${esc(xc.title)} (${costOf(xc,x.up)} energy) to add ${effects(xc).reactVal} ${effects(xc).reactVal===1?'die':'dice'}?`,'Play it','No')){ b.pool-=costOf(xc,x.up); dice+=effects(xc).reactVal; r.hand.splice(r.hand.indexOf(x),1); r.disc.push(x); } }
      for(const a of [...r.zords,...(r.megaOn?[r.megaOn]:[]),...r.arsenal].filter(a=>!a.ex&&a.fx.when==='atk')){ if(await ask(`Use ${esc(a.name)} to add ${a.fx.dice} ${a.fx.dice===1?'die':'dice'}? It can be used once per battle.`,'Use it','Save it')){ a.ex=true; dice+=a.fx.dice; } }
      const res=await roll(dice,c.title,+c.hits||0);
      if(fx.each) b.seq.filter(x=>!x.dead).forEach(x=>addHits(x,res.hits)); else addHits(target&&!target.dead?target:b.seq.find(x=>targetable(x)),res.hits);
      if(/for each o result|for each miss/i.test(c.text||'')&&res.misses) b.pool+=res.misses; }
    if(fx.dmg&&k!=='reaction'){ const live=b.seq.filter(x=>!x.dead); if(fx.dmgEach) live.forEach(x=>addHits(x,fx.dmg)); else addHits(target&&!target.dead?target:live.sort((x,y)=>(x.hp-x.hits)-(y.hp-y.hits))[0],fx.dmg); }
    for(let i=0;i<fx.draw;i++){ if(!r.draw.length) break; r.hand.push(r.draw.shift()); }
    r.disc.push(h);
  } finally { G.busy=false; }
  if(b.seq.every(x=>x.dead)) return endBattle(); paintBattle(); if(!b.plays) setTimeout(()=>{ if(G.b===b&&b.turn==='ranger'&&!G.busy) endRangerTurn(); },500); }
function floatText(uid,t){ const el=G.el.querySelector(`[data-ek="${uid}"]`); if(!el) return; const f=document.createElement('span'); f.className='gr-float'; f.textContent=t; el.appendChild(f); setTimeout(()=>f.remove(),900); }
function ask(q,yes,no){ return new Promise(res=>{ modal(`<p class="gr-q">${q}</p><div class="gr-acts"><button class="gr-btn" data-ask="0">${esc(no)}</button><button class="gr-btn pri" data-ask="1">${esc(yes)}</button></div>`);
  G.el.querySelector('#grModal').onclick=e=>{ const a=e.target.closest('[data-ask]'); if(!a) return; closeModal(); res(a.dataset.ask==='1'); }; }); }
async function useAbility(id){ const b=G.b, r=G.run, a=findAb(id); if(!a) return; if(!b||G.busy) return zoom(a.img,a.name+': '+a.text);
  if(a.ex) return toastG(a.name+' has been used this battle.'); if(a.fx.when!=='turn') return zoom(a.img,`${a.name}: ${a.text}\n\nUsed automatically when you ${a.fx.when==='atk'?'attack':'take damage'}.`);
  if(b.turn!=='ranger') return toastG('Use it on your turn.');
  a.ex=true; G.busy=true; try{ const f=a.fx; if(f.energy) b.pool+=f.energy; if(f.draw) for(let i=0;i<f.draw&&r.draw.length;i++) r.hand.push(r.draw.shift());
    if(f.recover){ const back=r.disc.splice(-f.recover); r.draw=shuffle([...r.draw,...back]); }
    if(f.dmg){ if(f.each) b.seq.filter(x=>!x.dead).forEach(x=>addHits(x,f.dmg)); else addHits(b.seq.filter(x=>targetable(x)).sort((x,y)=>(x.hp-x.hits)-(y.hp-y.hits))[0],f.dmg); }
    toastG(a.name+': '+fxSummary(f)); } finally { G.busy=false; }
  if(b.seq.every(x=>x.dead)) return endBattle(); paintBattle(); }
function summonZord(){ const r=G.run; const z=r.zordDeck.shift(); if(z){ r.zords.push(z); toastG(z.name+' joins you!'); }
  if(r.zords.length>=MEGA_AT&&r.megaCard&&!r.megaOn){ r.megaOn=r.megaCard; toastG(r.megaCard.name+' is ready!'); } }

/* ---------- after a battle ---------- */
function endBattle(){ const r=G.run, b=G.b; if(!b) return; G.b=null; const e=r.enc;
  r.stored=Math.min(STORE_MAX,r.stored+(b.pool>0?1:0));
  if(e.big){ b.seq.filter(k=>k.from==='big'&&!k.dead).forEach(k=>e.big.pile.push(k.id)); shuffle(e.big.pile); }
  const bigDone=!e.big||e.big.out>=e.big.need; const over=bigDone&&e.fsLeft<=0;
  if(e.big&&e.big.out>=e.big.need&&!e.bigBeat){ e.bigBeat=true; if(e.big.kind==='monster') summonZord(); }
  if(r.dead) return lose();
  save(); if(over) return winEncounter(); regroup(); }
/** Between battles of one fight: recover (shuffle discarded cards worth up to 6 shields back into the deck). */
function regroup(){ const r=G.run, e=r.enc; topBar('');
  body().innerHTML=`<div class="gr-pad gr-center"><h2 class="gr-h">The fight goes on</h2><p>${e.big&&e.big.out<e.big.need?`${esc(e.big.name)}: ${e.big.out} of ${e.big.need} cards defeated. `:''}${e.fsLeft?`${e.fsLeft} ${esc(e.fsName)} still standing.`:''}</p>
    <div class="gr-opts"><button class="gr-opt" data-g="recover"><b>Recover</b><span>Shuffle discarded cards worth up to ${RECOVER_SHIELDS} shields back into your deck (${r.disc.length} in your discard pile)</span></button>
    <button class="gr-opt" data-g="nextbattle"><b>Battle again now</b><span>Skip recovering</span></button></div></div>`; }
function recoverPick(then){ const r=G.run; const sel=new Set();
  const paint=()=>{ const tot=[...sel].reduce((a,i)=>a+shieldsOf(card(r.disc[i]),r.disc[i].up),0);
    modal(`<h2>Recover: choose cards (${tot}/${RECOVER_SHIELDS} shields)</h2><div class="gr-hand grid">${r.disc.map((h,i)=>cardHTML(h,`data-rc="${i}"`,sel.has(i)?'on':'')).join('')||'<p class="gr-dim">Your discard pile is empty.</p>'}</div>
      <div class="gr-acts"><button class="gr-btn" data-rc="auto">Pick for me</button><button class="gr-btn pri" data-rc="ok">Shuffle ${sel.size} back</button></div>`,'wide');
    G.el.querySelector('#grModal').onclick=ev=>{ const t=ev.target.closest('[data-rc]'); if(!t) return; const v=t.dataset.rc;
      if(v==='ok'){ closeModal(); const back=[...sel].sort((a,b)=>b-a).map(i=>r.disc.splice(i,1)[0]); r.draw=shuffle([...r.draw,...back]); save(); toastG(back.length+' cards back in your deck'); return then(); }
      if(v==='auto'){ sel.clear(); let t2=0; r.disc.map((h,i)=>({i,s:shieldsOf(card(h),h.up)})).sort((a,b)=>a.s-b.s).forEach(o=>{ if(t2+o.s<=RECOVER_SHIELDS){ sel.add(o.i); t2+=o.s; } }); return paint(); }
      const i=+v, s=shieldsOf(card(r.disc[i]),r.disc[i].up); if(sel.has(i)) sel.delete(i); else if(tot+s<=RECOVER_SHIELDS) sel.add(i); else toastG('That would go over '+RECOVER_SHIELDS+' shields.'); paint(); }; };
  paint(); }
function gold(n){ return n; }
/** After winning a fight, cards worth up to 6 shields come back from the discard pile on their own. */
function autoRecover(){ const r=G.run; let t=0; const back=[]; r.disc.map((h,i)=>({h,i,s:shieldsOf(card(h),h.up)})).sort((a,b)=>b.s-a.s).forEach(o=>{ if(t+o.s<=RECOVER_SHIELDS){ t+=o.s; back.push(o.i); } }); back.sort((a,b)=>b-a).forEach(i=>r.draw.push(r.disc.splice(i,1)[0])); shuffle(r.draw); r.lastRecovered=back.length; }
function winEncounter(){ const r=G.run, e=r.enc, t=e.t; r.enc=null; autoRecover(); const g=t==='boss'?90:t==='monster'?45+rnd(10):18+rnd(10); r.gold+=g;
  G.meta.xp=(G.meta.xp||0)+(t==='boss'?50:t==='monster'?15:6); LS.set('gr-meta',G.meta);
  if(t==='boss'){ if(r.act>=3) return victory(); r.act++; r.cc++; r.map=makeMap(); r.pos=null; r.floor=-1; r.seen={}; }
  save(); rewards(t,g); }
function cardChoices(n,rare){ const own=new Set([...G.run.draw,...G.run.hand,...G.run.disc].map(x=>x.id)); const all=Object.keys(POOL).filter(id=>!own.has(id)); const w=all.map(id=>({id,w:baseCost(POOL[id])>=3?(rare?3:.6):1}));
  const out=[]; while(out.length<n&&w.length){ const tot=w.reduce((a,x)=>a+x.w,0); let p=Math.random()*tot, k=0; for(;k<w.length;k++){ p-=w[k].w; if(p<=0) break; } out.push(w.splice(Math.min(k,w.length-1),1)[0].id); } return out; }
function addCard(id){ const r=G.run; r.draw.splice(rnd(r.draw.length+1),0,{u:'c'+Date.now()+rnd(999),id,up:0}); }
function rewards(t,g){ const r=G.run; topBar(''); const ch=cardChoices(3,t!=='fight');
  body().innerHTML=`<div class="gr-pad gr-center"><h2 class="gr-h">${t==='boss'?'Boss defeated':'Victory'}</h2><p>+${g} Grid Points. ${r.lastRecovered?r.lastRecovered+' discarded cards went back into your deck.':''}${t==='boss'?`. On to Act ${r.act}; the Command Center gains 1 energy.`:''}</p>
    <p class="gr-sub">Add a card to your deck</p><div class="gr-hand pick">${ch.map(id=>cardHTML({id,up:0},`data-take="${id}"`)).join('')}</div><button class="gr-btn" data-g="map">Skip</button></div>`; }
function rest(){ const r=G.run; topBar('');
  body().innerHTML=`<div class="gr-pad gr-center"><h2 class="gr-h">Command Center</h2><p class="gr-dim">Choose one.</p>
    <div class="gr-opts"><button class="gr-opt" data-g="powerup"><b>Power up</b><span>Your hand and discard pile go back into your deck; draw ${HAND} and store 1 energy</span></button><button class="gr-opt" data-g="upg"><b>Train</b><span>Upgrade a card</span></button></div></div>`; }
const allCards=()=>{ const r=G.run; return [...r.hand.map(x=>({x,p:'hand'})),...r.draw.map(x=>({x,p:'draw'})),...r.disc.map(x=>({x,p:'disc'}))]; };
function pickFromDeck(ttl,filter,then){ const l=allCards().filter(o=>!filter||filter(o.x));
  modal(`<h2>${esc(ttl)}</h2><div class="gr-hand grid">${l.map((o,i)=>cardHTML(o.x,`data-pk="${i}"`)).join('')}</div><div class="gr-acts"><button class="gr-btn" data-pk="-1">Cancel</button></div>`,'wide');
  G.el.querySelector('#grModal').onclick=e=>{ const t=e.target.closest('[data-pk]'); if(!t) return; closeModal(); const i=+t.dataset.pk; if(i>=0) then(l[i]); }; }
function removeInst(o){ const r=G.run; const arr=o.p==='hand'?r.hand:o.p==='draw'?r.draw:r.disc; const i=arr.indexOf(o.x); if(i>=0) arr.splice(i,1); }
function shop(){ const r=G.run; topBar(''); if(!r.stock||r.stock.key!==r.act+':'+r.floor){ r.stock={key:r.act+':'+r.floor, cards:cardChoices(4,true).map(id=>({id,p:baseCost(POOL[id])>=3?100+rnd(30):45+rnd(30)})), ar:newArsenal(), ap:110+rnd(30), removed:false}; save(); }
  const s=r.stock;
  body().innerHTML=`<div class="gr-pad gr-center"><h2 class="gr-h">Shop</h2><p class="gr-dim">You have ${r.gold} Grid Points.</p>
    <div class="gr-hand pick">${s.cards.map((o,k)=>`<div class="gr-buy">${cardHTML({id:o.id,up:0},`data-buy="${k}"`,r.gold<o.p?'dim':'')}<span>${o.p} points</span></div>`).join('')||'<p class="gr-dim">Sold out.</p>'}</div>
    <div class="gr-opts">${s.ar?`<button class="gr-opt" data-g="buyar" ${r.gold<s.ap?'disabled':''}><b>${esc(s.ar.name)}</b><span>${esc(fxSummary(s.ar.fx))} · ${s.ap} points</span></button>`:''}
      <button class="gr-opt" data-g="remove" ${r.gold<60||s.removed?'disabled':''}><b>Remove a card</b><span>${s.removed?'Done here':'60 points'}</span></button>
      <button class="gr-opt" data-g="buyupg" ${r.gold<50?'disabled':''}><b>Upgrade a card</b><span>50 points</span></button>
      <button class="gr-opt" data-g="buycc" ${r.gold<120?'disabled':''}><b>Command Center energy</b><span>+1 · 120 points</span></button></div>
    <button class="gr-btn pri" data-g="map">Leave</button></div>`; }
function newArsenal(){ const own=new Set(G.run.arsenal.map(a=>a.id)); const l=H().arsenal().map(a=>abilityOf(a,'arsenal')).filter(a=>a.fx.ok&&!own.has(a.id)); return l.length?pick(l):null; }
function arsenalNode(){ const r=G.run; const a=newArsenal(); if(a) r.arsenal.push(a); r.gold+=20; save(); topBar('');
  body().innerHTML=`<div class="gr-pad gr-center"><h2 class="gr-h">Arsenal</h2>${a?`<div class="gr-relbig">${a.img?`<img src="${esc(a.img)}" alt="${esc(a.name)}" referrerpolicy="no-referrer">`:''}<b>${esc(a.name)}</b><span>Once per battle: ${esc(fxSummary(a.fx))}</span></div>`:'<p>The arsenal is empty.</p>'}<p>+20 Grid Points</p><button class="gr-btn pri" data-g="map">Back to the map</button></div>`; }
const EVENTS=[
  {t:'Zordon’s counsel',d:'Zordon offers guidance before the next fight.',o:[['Study: upgrade a random card',r=>{ const l=allCards().filter(o=>!o.x.up); if(l.length) pick(l).x.up=1; return 'A card was upgraded.'; }],['Meditate: shuffle 3 cards from your discard pile into your deck',r=>{ const back=r.disc.splice(-3); r.draw=shuffle([...r.draw,...back]); return back.length+' cards returned to your deck.'; }]]},
  {t:'Alpha 5 needs a hand',d:'Alpha’s circuits are sparking.',o:[['Help: discard the top 2 cards of your deck, gain 60 Grid Points',r=>{ for(let i=0;i<2&&r.draw.length;i++) r.disc.push(r.draw.shift()); r.gold+=60; return 'Alpha thanks you.'; }],['Leave him to it',()=>'Alpha will manage.']]},
  {t:'Ambush in the park',d:'Foot soldiers pour out of a portal.',o:[['Fight them',()=>'fight'],['Slip away: discard the top 3 cards of your deck',r=>{ for(let i=0;i<3&&r.draw.length;i++) r.disc.push(r.draw.shift()); return 'You get away.'; }]]},
  {t:'Another team’s technique',d:'Visiting Rangers share a move.',o:[['Learn it: add a card',r=>{ const id=cardChoices(1,false)[0]; if(id) addCard(id); return id?'Added '+POOL[id].title+'.':'Nothing new to learn.'; }],['Clear your head: remove a card',()=>'remove']]},
  {t:'Power Coin cache',d:'A hidden stash under the Youth Center.',o:[['Take it: 45 Grid Points',r=>{ r.gold+=45; return 'Grid Points added.'; }]]}];
function event(){ const r=G.run; const ev=EVENTS[(r.n++ + rnd(EVENTS.length))%EVENTS.length]; save(); topBar('');
  body().innerHTML=`<div class="gr-pad gr-center"><h2 class="gr-h">${esc(ev.t)}</h2><p>${esc(ev.d)}</p><div class="gr-opts">${ev.o.map((o,k)=>`<button class="gr-opt" data-ev="${k}"><b>${esc(o[0])}</b></button>`).join('')}</div></div>`;
  body().onclick=e=>{ const b=e.target.closest('[data-ev]'); if(!b) return; body().onclick=null; const out=ev.o[+b.dataset.ev][1](r); save();
    if(out==='fight'){ r.enc=makeEncounter('fight'); save(); return startBattle(); } if(out==='remove') return pickFromDeck('Remove a card',null,o=>{ removeInst(o); save(); showMap(); });
    body().innerHTML=`<div class="gr-pad gr-center"><h2 class="gr-h">${esc(ev.t)}</h2><p>${esc(out)}</p><button class="gr-btn pri" data-g="map">Back to the map</button></div>`; topBar(''); }; }
function lose(){ const r=G.run; G.b=null; G.meta.xp=(G.meta.xp||0)+r.floor*2+(r.act-1)*20; LS.set('gr-meta',G.meta); LS.set(RUN_KEY,null);
  topBar(''); body().innerHTML=`<div class="gr-pad gr-center gr-end"><h2 class="gr-h">Run over</h2><p>${esc(r.name)} was knocked out with no energy left at the Command Center (Act ${r.act}, floor ${r.floor+1}). Your Grid rank still grows with every run.</p><button class="gr-btn pri" data-g="title">Back to the title</button></div>`; G.run=null; }
function victory(){ const r=G.run; G.meta.wins=(G.meta.wins||0)+1; G.meta.xp=(G.meta.xp||0)+100; LS.set('gr-meta',G.meta); LS.set(RUN_KEY,null);
  topBar(''); body().innerHTML=`<div class="gr-pad gr-center gr-end win"><h2 class="gr-h">Victory</h2><p>${esc(r.name)} cleared all three acts${r.threat?' at threat level '+r.threat:''}. A higher threat level is now open.</p><button class="gr-btn pri" data-g="title">Back to the title</button></div>`; G.run=null; }
function showCards(){ const r=G.run;
  modal(`<h2>Your cards</h2>${r.ability?`<p class="gr-dim">${esc(r.name)}: ${esc(r.ability)}</p>`:''}<p class="gr-sub">Hand (${r.hand.length})</p><div class="gr-hand grid">${r.hand.map(x=>cardHTML(x)).join('')}</div>
    <p class="gr-sub">Deck (${r.draw.length}, shown in name order)</p><div class="gr-hand grid">${[...r.draw].sort((a,b)=>card(a).title.localeCompare(card(b).title)).map(x=>cardHTML(x)).join('')}</div>
    <p class="gr-sub">Discard pile (${r.disc.length})</p><div class="gr-hand grid">${r.disc.map(x=>cardHTML(x)).join('')||'<p class="gr-dim">Empty.</p>'}</div>
    ${r.zords.length||r.arsenal.length?`<p class="gr-sub">Zords and arsenal</p><div class="gr-abil">${[...r.zords,...(r.megaOn?[r.megaOn]:[]),...r.arsenal].map(a=>`<button class="gr-ab" data-ab="${a.id}">${a.img?`<img src="${esc(a.img)}" alt="" referrerpolicy="no-referrer">`:''}<span><b>${esc(a.name)}</b><small>${esc(fxSummary(a.fx))}</small></span></button>`).join('')}</div>`:''}
    <div class="gr-acts"><button class="gr-btn pri" data-g="close">Close</button></div>`,'wide'); }

/* ---------- clicks and keys ---------- */
function onClick(e){ const t=e.target.closest('[data-g],[data-hand],[data-ek],[data-rg],[data-node],[data-take],[data-buy],[data-ab],[data-zoomsrc]'); if(!t) return; const r=G.run, b=G.b, a=t.dataset.g;
  if(t.closest('#grModal')&&!a&&!t.dataset.ab) return;
  if(a==='exit'){ save(); return H().onExit(); } if(a==='help') return help(); if(a==='close') return closeModal();
  if(a==='new') return chooseRanger(); if(a==='continue') return r&&r.enc?startBattle():showMap(); if(a==='title') return title();
  if(a==='deck'&&r) return showCards();
  if(t.dataset.zoomsrc!==undefined) return zoom(t.dataset.zoomsrc,t.dataset.zoomtext);
  if(t.dataset.ab){ if(t.closest('#grModal')){ const ab=findAb(t.dataset.ab); return ab&&zoom(ab.img,ab.name+': '+ab.text); } return useAbility(t.dataset.ab); }
  if(G.busy) return;
  if(a==='map') return showMap(); if(a==='pass') return endRangerTurn(); if(a==='unsel'){ b.sel=null; return paintBattle(); }
  if(a==='stored'&&b&&r.stored){ b.pool+=r.stored; r.stored=0; return paintBattle(); }
  if(a==='recover') return recoverPick(()=>startBattle()); if(a==='nextbattle') return startBattle();
  if(a==='powerup'){ r.draw=shuffle([...r.draw,...r.hand,...r.disc]); r.hand=[]; r.disc=[]; drawUp(); r.stored=STORE_MAX; save(); toastG('Powered up'); return showMap(); }
  if(a==='upg') return pickFromDeck('Upgrade a card',x=>!x.up,o=>{ o.x.up=1; save(); showMap(); });
  if(a==='buyupg') return pickFromDeck('Upgrade a card (50 points)',x=>!x.up,o=>{ r.gold-=50; o.x.up=1; save(); shop(); });
  if(a==='remove') return pickFromDeck('Remove a card (60 points)',null,o=>{ r.gold-=60; removeInst(o); r.stock.removed=true; save(); shop(); });
  if(a==='buyar'){ const s=r.stock; if(s.ar&&r.gold>=s.ap){ r.gold-=s.ap; r.arsenal.push(s.ar); s.ar=null; save(); shop(); } return; }
  if(a==='buycc'&&r.gold>=120){ r.gold-=120; r.cc++; save(); return shop(); }
  if(t.dataset.rg) return newRun(t.dataset.rg);
  if(t.dataset.node) return enterNode(t.dataset.node);
  if(t.dataset.take){ addCard(t.dataset.take); save(); return showMap(); }
  if(t.dataset.buy!==undefined){ const o=r.stock.cards[+t.dataset.buy]; if(!o||r.gold<o.p) return toastG('Not enough Grid Points.'); r.gold-=o.p; addCard(o.id); r.stock.cards.splice(+t.dataset.buy,1); save(); return shop(); }
  if(b&&t.dataset.hand!==undefined) return playHand(+t.dataset.hand);
  if(b&&t.dataset.ek){ const k=b.seq.find(x=>x.uid===t.dataset.ek); if(b.sel&&k&&targetable(k)){ const idx=r.hand.indexOf(b.sel); if(idx>=0) return resolve(idx,k); } if(k) return zoom(k.img,k.text); } }
function onKey(e){ if(!G.el||!G.el.isConnected) return; const m=G.el.querySelector('#grModal'), z=G.el.querySelector('#grZoom');
  if(e.key==='Escape'){ if(!z.hidden){ z.hidden=true; z.innerHTML=''; } else if(!m.hidden&&m.querySelector('[data-g="close"],[data-pk="-1"]')) closeModal(); else if(G.b&&G.b.sel){ G.b.sel=null; paintBattle(); } return; }
  if(!G.b||G.busy||!m.hidden) return; if(/^[1-9]$/.test(e.key)) playHand(+e.key-1); if(e.key==='e'||e.key==='E') endRangerTurn(); }

window.GridRun={ async open(el){ G.el=el; el.innerHTML=`<div class="gr"><div class="gr-load"><div class="gr-spin"></div><p id="grSay">Opening Grid Run…</p></div></div>`;
    try{ await loadAll(t=>{ const s=el.querySelector('#grSay'); if(s) s.textContent=t; }); }catch(err){ el.innerHTML=`<div class="gr"><div class="gr-load"><p>The cards could not load: ${esc(err.message||err)}</p><button class="gr-btn pri" onclick="GR_HOST.onExit()">Back</button></div></div>`; return; }
    const run=LS.get(RUN_KEY,null); if(run&&!G.rangers.some(r=>r.id===run.ranger)) LS.set(RUN_KEY,null);
    mount(el); el.addEventListener('click',onClick); document.addEventListener('keydown',onKey); },
  close(){ document.removeEventListener('keydown',onKey); save(); if(G.el){ G.el.removeEventListener('click',onClick); G.el.innerHTML=''; } G.el=null; G.b=null; } };
})();
