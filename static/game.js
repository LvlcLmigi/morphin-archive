/* ===================== Grid Run: a Heroes of the Grid deckbuilding roguelike =====================
   Loaded as its own file. The page that opens it provides window.GR_HOST:
   {rangers(), decksOfKind(kind), loadDecks(ids) -> Promise<{deckId:[cards]}>, zordsOf(rangerId), megazordsOf(rangerId),
    arsenal(), esc, ico, rich(text), onExit()}.
   Everything the player does is kept in this browser (localStorage gr-run and gr-meta). */
(function(){
'use strict';
const H=()=>window.GR_HOST;
const esc=s=>H().esc(s), ico=n=>H().ico(n), rich=t=>H().rich(t||'');
const LS={get(k,d){ try{ const v=localStorage.getItem(k); return v==null?d:JSON.parse(v); }catch(e){ return d; } }, set(k,v){ try{ v==null?localStorage.removeItem(k):localStorage.setItem(k,JSON.stringify(v)); }catch(e){} }};
const rnd=n=>Math.floor(Math.random()*n), pick=a=>a[rnd(a.length)], shuffle=a=>{ for(let i=a.length-1;i>0;i--){ const j=rnd(i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
/* The Heroes of the Grid die: two blanks, two single hits, one double hit and one Morphin Grid symbol (O). */
const FACES=[{h:0,k:'blank'},{h:0,k:'blank'},{h:1,k:'hit'},{h:1,k:'hit'},{h:2,k:'crit'},{h:0,k:'grid'}];
const HAND=5, PLAYS=2, START_E=2, TURN_E=2, MAX_E=10, BASE_HP=32, ZORD_CHARGE=8;

/* ---------- cards ---------- */
const POOL={};          // card id -> card data from the site (title, type, cost, dice, hits, shields, star, text, thumb, rangerName)
const kindOf=c=>{ const t=String(c.type||'').toLowerCase(); return /react/.test(t)?'reaction':/maneu/.test(t)?'maneuver':/attack/.test(t)||c.dice>0?'attack':'maneuver'; };
const costOf=(c,up)=>{ const n=parseInt(c.cost,10); const v=isNaN(n)?0:n; return up&&kindOf(c)!=='attack'&&v>0?v-1:v; };
/** What a card does, read from its text. Parts of the text the game can't play out are flagged. */
function effects(c){ if(c._fx) return c._fx; const t=String(c.text||''), lo=t.toLowerCase(), main=t.split(/★|王/)[0].toLowerCase(), star=(t.split('★')[1]||'').toLowerCase();
  const n=(re,s)=>{ const m=re.exec(s); return m?+m[1]:0; };
  const fx={ energy:n(/gain (\d+) ⚡/,main), draw:n(/draws? (\d+) cards?/,main)||(/draw (a|1) card/.test(main)?1:0), again:/play another card|immediately play 1 card|may immediately play/.test(main)?1:0,
    addDice:/^(?!.*\bif\b).*add (\d+) dic?e to this attack/.test(main)?n(/add (\d+) dic?e to this attack/,main):0,
    each:/each enemy|every enemy|full 💥 to each/.test(main), dmg:n(/deal (\d+) 💥 to (an|a|each|the)/,main), dmgEach:/deal \d+ 💥 to each/.test(main),
    react:null, reactVal:0, starE:n(/gain (\d+) ⚡/,star), starDie:/add 1 die/.test(star)?1:0, starDraw:n(/draws? (\d+) card/,star) };
  if(kindOf(c)==='reaction'){ if(/suffers damage/.test(lo)){ fx.react='dmg'; fx.reactVal=n(/reduce that damage by (\d+)/,lo)||2; fx.dmg=n(/deal (\d+) 💥/,lo); }
    else if(/performs an attack/.test(lo)){ fx.react='atk'; fx.reactVal=n(/add (\d+) dic?e/,lo)||1; }
    else if(/reveals a card for defense|discards a card for defense/.test(lo)){ fx.react='def'; fx.reactVal=n(/add (\d+) ⛊/,lo)||n(/equal to the number of ⛊/,lo)||2; }
    else { fx.react='dmg'; fx.reactVal=2; } }
  const known=fx.energy||fx.draw||fx.again||fx.addDice||fx.dmg||fx.react||fx.each;
  fx.partial=!!t.trim()&&!(/^roll \d+ dice\.?$/i.test(t.trim()))&&(!known||t.length>90);
  return c._fx=fx; }
const dieCount=(c,up)=>(+c.dice||0)+(up&&kindOf(c)==='attack'?1:0);
const shieldsOf=(c,up)=>(+c.shields||0)+(up&&kindOf(c)!=='attack'&&!(parseInt(c.cost,10)>0)?1:0);

/* ---------- arsenal power-ups (relics) ---------- */
const RELIC_FX={
  armor:[['guard','The first card you reveal for defense each battle blocks 2 extra.'],['thick','Every card revealed for defense blocks 1 extra.'],['vital','+6 Health now and at the end of each act.']],
  powerup:[['firstdie','Your first attack each battle rolls 2 extra dice.'],['crit','Each double hit you roll deals 1 extra.'],['zord','Your Zord charges twice as fast.']],
  team:[['spark','Start each battle with 2 extra ⚡.'],['hand','Draw 1 extra card at the start of each battle.'],['coins','Earn 30% more Grid Points.']]};
const subOf=a=>{ const s=((a.ranger||'')+' '+(a.title||'')+' '+(a.series||'')).toLowerCase(); return /team/.test(s)?'team':/armor|armour|mode|vest|battlizer|suit/.test(s)?'armor':'powerup'; };
function relicOf(a){ const sub=subOf(a); const h=[...String(a.title||a.id)].reduce((x,ch)=>x+ch.charCodeAt(0),0); const [k,d]=RELIC_FX[sub][h%3]; return {id:a.id,name:a.character||a.title||'Power-up',sub,k,desc:d,img:a.thumb||''}; }
const FALLBACK_RELICS=[{id:'r1',title:'Power Coin',type:'arsenal'},{id:'r2',title:'Communicator',type:'arsenal'},{id:'r3',title:'Blade Blaster',type:'arsenal'},{id:'r4',title:'Thunder Slinger',type:'arsenal'},{id:'r5',title:'Battle Armor',type:'arsenal'},{id:'r6',title:'Power of Six (Team Powerup)',type:'arsenal'}];
const has=k=>(G.run&&G.run.relics||[]).some(r=>r.k===k);

/* ---------- enemies ---------- */
const FALL_ENEMIES={footsoldier:['Putty Patrollers','Tenga Warriors','Quantrons','Cogs'],monster:['Pudgy Pig','Eye Guy','Knasty Knight','Madame Woe'],nemesis:['Scorpina','Psycho Red','Elsa'],boss:['Rita Repulsa','Goldar','Lord Zedd','Lord Drakkon']};
function enemyCards(d){ return (G.decks[d.id]||[]).filter(x=>/enemy/i.test(x.type||'')||!/deploy/i.test(x.type||'')); }
/** One enemy's next action, from a card of its own deck when it has one: "Roll 2 dice", "suffers 1 damage", ⚀ symbols. */
function intentFrom(card,base){ const t=String(card&&card.text||''); const lo=t.toLowerCase();
  const dice=card?((+card.dice||0)||((t.match(/⚀/g)||[]).length)||(+((/roll (\d+) dic?e/.exec(lo)||[])[1])||0)):0;
  const dmg=card?(+((/suffers? (\d+) damage/.exec(lo)||[])[1])||0)+(+card.hits||0):0;
  return {name:card?card.title:'Attack', dice:dice||base.dice, dmg:(dmg||0)+base.dmg, text:card?t:'', all:/each ranger|all rangers/.test(lo)}; }
function makeEnemy(kind,act,deck,threat){ const hpBase={footsoldier:4+act,monster:9+4*act,nemesis:15+5*act,boss:26+12*act}[kind];
  const base={footsoldier:{dmg:1+act,dice:0},monster:{dmg:1+act,dice:2},nemesis:{dmg:2+act,dice:2},boss:{dmg:2+act,dice:3}}[kind];
  const hp=Math.round(hpBase*(1+.1*threat)); base.dmg+=Math.floor(threat/2);
  return {uid:'e'+Math.random().toString(36).slice(2,8), kind, name:deck?deck.name:pick(FALL_ENEMIES[kind]), deckId:deck?deck.id:'', img:deck?(deck.faceThumb||deck.thumb||''):'', hp, max:hp, base, tokens:0, intent:null, pile:[], turn:0}; }
function nextIntent(e){ const cards=e.deckId?enemyCards({id:e.deckId}):[]; if(cards.length){ if(!e.pile.length) e.pile=shuffle(cards.flatMap(c=>Array(Math.min(3,+c.copies||1)).fill(c.id))); const id=e.pile.pop(); const c=cards.find(x=>x.id===id); e.intent=intentFrom(c,e.base); }
  else e.intent=intentFrom(null,e.base);
  if(e.kind==='boss'&&e.turn%3===2&&G.b.enemies.length<5) e.intent={name:'Deployment',deploy:2,dice:0,dmg:0,text:'Calls in 2 foot soldiers.'};
  e.turn++; }

/* ---------- state ---------- */
const G={el:null, decks:{}, rangers:[], run:null, meta:LS.get('gr-meta',{xp:0,wins:0,runs:0,best:0}), b:null, busy:false, quick:LS.get('gr-quick',false)};
const level=()=>Math.floor(Math.sqrt((G.meta.xp||0)/60));
function save(){ if(G.run) LS.set('gr-run',{...G.run}); }

/* ---------- loading the site's cards ---------- */
async function loadAll(say){ const h=H(); G.rangers=h.rangers().filter(r=>(r.decks||[]).length);
  const ids=[...new Set([...G.rangers.flatMap(r=>r.decks), ...['footsoldier','monster','nemesis','boss'].flatMap(k=>h.decksOfKind(k).map(d=>d.id))])];
  say&&say('Loading Ranger decks and enemies…'); const got=await h.loadDecks(ids); Object.assign(G.decks,got);
  G.rangers.forEach(r=>r.decks.forEach(did=>(G.decks[did]||[]).forEach(c=>{ POOL[c.id]={...c, deckName:(h.deckName&&h.deckName(did))||'', rangerName:r.character||r.title}; })));
  G.rangers=G.rangers.filter(r=>r.decks.some(d=>(G.decks[d]||[]).length)); }
const deckOf=r=>r.decks.flatMap(did=>(G.decks[did]||[]).flatMap(c=>Array(clamp(+c.copies||1,1,3)).fill(c.id)));
const unlocked=()=>{ const n=5+2*level(); return G.rangers.slice(0,n); };

/* ---------- screens ---------- */
function mount(el){ G.el=el; el.innerHTML=`<div class="gr"><div class="gr-top" id="grTop"></div><div class="gr-body" id="grBody"></div><div class="gr-dice" id="grDice" hidden></div><div class="gr-modal" id="grModal" hidden></div><div class="gr-toast" id="grToast"></div></div>`; title(); }
const body=()=>G.el.querySelector('#grBody'), top=()=>G.el.querySelector('#grTop');
function toastG(m){ const t=G.el.querySelector('#grToast'); t.textContent=m; t.classList.add('on'); clearTimeout(toastG.t); toastG.t=setTimeout(()=>t.classList.remove('on'),2200); }
function topBar(extra){ const r=G.run; top().innerHTML=`<button class="gr-b" data-g="exit" aria-label="Leave the game">${ico('x')}</button><b class="gr-logo">Grid Run</b>
  ${r?`<span class="gr-stat hp" title="Health"><i>♥</i>${r.hp}/${r.max}</span><span class="gr-stat" title="Grid Points">◆ ${r.gold}</span><span class="gr-stat" title="Act and floor">Act ${r.act} · Floor ${r.floor+1}</span>
    <button class="gr-b gr-tx" data-g="deck">${ico('grid')}<span>Deck ${r.deck.length}</span></button>
    <span class="gr-relics">${r.relics.map(x=>`<span class="gr-relic" title="${esc(x.name+': '+x.desc)}">${x.img?`<img src="${esc(x.img)}" alt="" referrerpolicy="no-referrer">`:'✦'}</span>`).join('')}</span>`:''}${extra||''}<span class="gr-sp"></span>
  <button class="gr-b gr-tx" data-g="help">?<span>How to play</span></button>`; }
function title(){ G.run=LS.get('gr-run',null); topBar('');
  body().innerHTML=`<div class="gr-title"><div class="gr-hero"><small>A Heroes of the Grid roguelike</small><h1>Grid Run</h1><p>Pick a Ranger, take their real combat deck into three acts of battles, and build it up card by card on the way to the final boss.</p>
    <div class="gr-acts">${G.run?`<button class="gr-btn pri" data-g="continue">Continue run · Act ${G.run.act}, floor ${G.run.floor+1}</button>`:''}<button class="gr-btn${G.run?'':' pri'}" data-g="new">${G.run?'Start a new run':'Start a run'}</button><button class="gr-btn" data-g="help">How to play</button></div></div>
    <div class="gr-meta"><b>Morphin Grid rank ${level()}</b><span class="gr-xp"><i style="width:${Math.min(100,((G.meta.xp||0)-60*level()**2)/(60*((level()+1)**2-level()**2))*100)}%"></i></span>
      <small>${G.meta.runs||0} runs · ${G.meta.wins||0} wins · best: floor ${G.meta.best||0}. Each rank unlocks 2 more Rangers; each win unlocks a higher Threat level.</small></div></div>`; }
function help(){ modal(`<h2>How to play</h2><div class="gr-help">
  <p><b>Your deck is your Ranger’s real combat deck.</b> Every turn you draw up to ${HAND} cards and gain ${TURN_E} ⚡ for the shared energy pool (unspent ⚡ carries over, up to ${MAX_E}). You may play <b>${PLAYS} cards a turn</b>; cards that say “play another card” give you an extra play.</p>
  <p><b>Attacks</b> roll the dice shown on the card. Each die: two blanks, two 💥, one 💥💥 and one Morphin Grid symbol. Pick a target, then roll.</p>
  <p><b>Defense works like the board game.</b> When an enemy hits you, reveal the top card of your deck (its ⛊ block damage and its ★ ability triggers) or discard a card from your hand for its ⛊. Whatever gets through comes off your Health. Reactions can be played in answer to an attack.</p>
  <p><b>Zords:</b> damage you deal charges your Zord. When it’s full, summon it to strike every enemy.</p>
  <p><b>Between battles</b> choose your path on the map: battles, tougher Nemesis fights, the Command Center to rest or upgrade a card, the Power Coin shop, and events. Win battles to add cards from other Rangers’ decks. Upgraded cards (marked +) roll 1 extra die, or cost 1 less ⚡ (or block 1 more if they’re already free).</p>
  <p><b>Arsenal power-ups</b> from the game’s Arsenal Pack are your relics. Beat the boss at the end of each act to move on.</p>
  <p class="gr-dim">Cards are played from the text on the real cards. Most common effects (⚡, drawing, extra plays, extra dice, damage, reactions) happen automatically; cards marked ◇ have extra text the game can’t play out, so they act as plain attacks or maneuvers.</p></div>
  <div class="gr-acts"><label class="gr-chk"><input type="checkbox" id="grQuick" ${G.quick?'checked':''}> Quick defense: always reveal the top card</label><button class="gr-btn pri" data-g="close">Got it</button></div>`);
  G.el.querySelector('#grQuick').onchange=e=>{ G.quick=e.target.checked; LS.set('gr-quick',G.quick); }; }
function modal(html){ const m=G.el.querySelector('#grModal'); m.innerHTML=`<div class="gr-mc">${html}</div>`; m.hidden=false; }
const closeModal=()=>{ const m=G.el.querySelector('#grModal'); m.hidden=true; m.innerHTML=''; };

/* ---------- choosing a Ranger ---------- */
function chooseRanger(){ const all=G.rangers, open=new Set(unlocked().map(r=>r.id)); topBar('');
  const maxT=G.meta.wins||0;
  body().innerHTML=`<div class="gr-pad"><h2 class="gr-h">Choose your Ranger</h2>${maxT?`<p class="gr-dim">Threat level: <select id="grThreat">${Array.from({length:maxT+1},(_,i)=>`<option value="${i}">${i?'Threat '+i+' (+'+i*10+'% enemy health)':'Normal'}</option>`).join('')}</select></p>`:''}
    <div class="gr-rangers">${all.map(r=>{ const ok=open.has(r.id), n=deckOf(r).length;
      return `<button class="gr-rg${ok?'':' locked'}" ${ok?`data-rg="${r.id}"`:'disabled'}><span class="gr-rgi" style="--c:${esc(r.colorHex||'#888')}">${r.thumb?`<img src="${esc(r.thumb)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}</span>
        <b>${esc(r.character||r.title)}</b><small>${esc(r.ranger||'')}</small><small>${ok?n+' cards'+(r.abilityName?' · '+esc(r.abilityName):''):'Unlocks at a higher Grid rank'}</small></button>`; }).join('')}</div>
    ${!all.length?'<p class="gr-dim">No Rangers with combat decks are on the site yet.</p>':''}</div>`; }
function newRun(rid){ const r=G.rangers.find(x=>x.id===rid); if(!r) return; const th=+((G.el.querySelector('#grThreat')||{}).value||0);
  const zord=H().zordsOf(r.id)[0]||null, mega=H().megazordsOf(r.id)[0]||null;
  G.run={ranger:r.id, name:r.character||r.title, img:r.thumb||'', ability:[r.abilityName,r.abilityText].filter(Boolean).join(': '), hp:BASE_HP, max:BASE_HP, gold:60, act:1, floor:-1, threat:th,
    deck:deckOf(r).map((id,i)=>({u:'c'+i, id, up:0})), relics:[], zord:zord?{name:zord.character||zord.title,img:zord.thumb||''}:{name:'Zord',img:''}, mega:mega?{name:mega.character||mega.title,img:mega.thumb||''}:null,
    map:makeMap(1), pos:null, seen:{}, bosses:0, n:0};
  G.meta.runs=(G.meta.runs||0)+1; LS.set('gr-meta',G.meta); save(); showMap(); }

/* ---------- the map ---------- */
const NODE={battle:['⚔','Battle'],elite:['☠','Nemesis'],rest:['⌂','Command Center'],shop:['◆','Power Coin shop'],event:['?','Event'],treasure:['✦','Arsenal cache'],boss:['♛','Boss']};
function makeMap(act){ const rows=[]; const R=9;
  for(let y=0;y<R;y++){ const n=y===0?3:2+rnd(3); const row=[]; for(let x=0;x<n;x++){ let t;
      if(y===0) t='battle'; else if(y===4) t='treasure'; else if(y===R-1) t='rest';
      else { const p=Math.random(); t=p<.45?'battle':p<.65?'event':p<.77&&y>=2?'elite':p<.88?'shop':y>=3?'rest':'battle'; }
      row.push({x, t, to:[]}); } rows.push(row); }
  for(let y=0;y<R-1;y++){ const a=rows[y], b=rows[y+1];
    a.forEach((n,i)=>{ const f=i/(Math.max(1,a.length-1)), j=Math.round(f*(b.length-1)); n.to=[...new Set([j, clamp(j+(Math.random()<.5?-1:1),0,b.length-1)])]; });
    b.forEach((m,j)=>{ if(!a.some(n=>n.to.includes(j))) a[Math.min(a.length-1,Math.round(j/(Math.max(1,b.length-1))*(a.length-1)))].to.push(j); }); }
  rows.push([{x:0,t:'boss',to:[]}]); rows[R-1].forEach(n=>n.to=[0]);
  return rows; }
function reachable(){ const r=G.run; if(!r.pos) return r.map[0].map((_,i)=>[0,i]); const n=r.map[r.pos[0]][r.pos[1]]; return n.to.map(j=>[r.pos[0]+1,j]); }
function showMap(){ const r=G.run; topBar(''); const can=reachable().map(p=>p.join(','));
  const W=100, rows=r.map, H0=rows.length; const xy=(y,x)=>{ const n=rows[y].length; return [(x+1)/(n+1)*W, (H0-y-.5)/H0*100]; };
  let lines=''; rows.forEach((row,y)=>row.forEach((n,x)=>n.to.forEach(j=>{ const [x1,y1]=xy(y,x), [x2,y2]=xy(y+1,j); const done=r.seen[y+','+x]&&r.seen[(y+1)+','+j]; lines+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${done?'done':''}"/>`; })));
  body().innerHTML=`<div class="gr-map"><div class="gr-maph"><h2 class="gr-h">Act ${r.act}: ${['Angel Grove','The Moon Palace','The Shattered Grid'][r.act-1]}</h2><p class="gr-dim">Choose where to go next. ${esc(r.name)} · ${r.deck.length} cards${r.threat?' · Threat '+r.threat:''}</p></div>
    <div class="gr-mapc" style="height:${H0*64}px"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${lines}</svg>
    ${rows.map((row,y)=>row.map((n,x)=>{ const [px,py]=xy(y,x), k=y+','+x, ok=can.includes(k), here=r.pos&&r.pos.join(',')===k;
      return `<button class="gr-node t-${n.t}${ok?' ok':''}${r.seen[k]?' seen':''}${here?' here':''}" style="left:${px}%;top:${py}%" ${ok?`data-node="${k}"`:'disabled'} title="${NODE[n.t][1]}"><span>${NODE[n.t][0]}</span></button>`; }).join('')).join('')}</div>
    <div class="gr-legend">${Object.entries(NODE).map(([k,v])=>`<span><i class="t-${k}">${v[0]}</i>${v[1]}</span>`).join('')}</div></div>`;
  const here=G.el.querySelector('.gr-node.ok'); if(here) setTimeout(()=>here.scrollIntoView({block:'center',behavior:'smooth'}),60); }
function enterNode(k){ const r=G.run; const [y,x]=k.split(',').map(Number); r.pos=[y,x]; r.floor=y; r.seen[k]=1; G.meta.best=Math.max(G.meta.best||0,(r.act-1)*10+y+1); LS.set('gr-meta',G.meta); save();
  const t=r.map[y][x].t; if(t==='battle'||t==='elite'||t==='boss'){ r.pending=t; save(); return startBattle(t); } if(t==='rest') return rest(); if(t==='shop') return shop(); if(t==='treasure') return treasure(); if(t==='event') return event(); }

/* ---------- battle ---------- */
const card=i=>POOL[i.id]||{title:'Missing card',type:'Maneuver',cost:'0',text:'',shields:1};
function decksOf(kind){ return H().decksOfKind(kind); }
function pickDeck(kind){ const l=decksOf(kind); return l.length?pick(l):null; }
function startBattle(t){ const r=G.run, a=r.act; const es=[];
  if(t==='battle'){ const fs=pickDeck('footsoldier'); const n=2+rnd(2)+(a>1?1:0); for(let i=0;i<n;i++) es.push(makeEnemy('footsoldier',a,fs,r.threat)); if(a>1&&Math.random()<.5){ es.splice(0,1,makeEnemy('monster',a,pickDeck('monster'),r.threat)); } }
  else if(t==='elite'){ es.push(makeEnemy(Math.random()<.5&&decksOf('nemesis').length?'nemesis':'monster',a,null,r.threat)); const e0=es[0]; const d=pickDeck(e0.kind); if(d){ e0.name=d.name; e0.deckId=d.id; e0.img=d.faceThumb||d.thumb||''; } e0.hp=e0.max=Math.round(e0.max*1.25); es.push(makeEnemy('footsoldier',a,pickDeck('footsoldier'),r.threat)); }
  else { const bs=decksOf('boss'); const used=r.usedBoss||[]; const d=bs.filter(x=>!used.includes(x.id)); const bd=d.length?pick(d):pickDeck('boss'); if(bd) r.usedBoss=[...used,bd.id];
    es.push(makeEnemy('boss',a,bd,r.threat)); const fs=pickDeck('footsoldier'); es.push(makeEnemy('footsoldier',a,fs,r.threat),makeEnemy('footsoldier',a,fs,r.threat)); }
  const draw=shuffle(r.deck.map(c=>({...c})));
  G.b={type:t, enemies:es, draw, hand:[], disc:[], e:START_E+(has('spark')?2:0), plays:PLAYS, turn:0, zord:0, zordUsed:0, nextDie:0, firstAtk:true, firstDef:true, log:[], target:null, sel:null};
  es.forEach(nextIntent); turnStart(true); body().scrollTop=0; }
function drawCards(n){ const b=G.b; for(let i=0;i<n;i++){ if(!b.draw.length){ if(!b.disc.length) break; b.draw=shuffle(b.disc); b.disc=[]; } b.hand.push(b.draw.pop()); } }
function turnStart(first){ const b=G.b; b.turn++; if(!first) b.e=Math.min(MAX_E,b.e+TURN_E); b.plays=PLAYS; drawCards(Math.max(0,HAND-b.hand.length)+(first&&has('hand')?1:0)); paintBattle(); }
function paintBattle(){ const r=G.run, b=G.b; if(!b) return; topBar(`<span class="gr-stat en" title="Energy">⚡ ${b.e}</span><span class="gr-stat" title="Card plays left this turn">▶ ${b.plays}</span>`);
  const zmax=ZORD_CHARGE, zready=b.zord>=zmax&&b.zordUsed<1;
  body().innerHTML=`<div class="gr-battle">
    <div class="gr-foes">${b.enemies.map(e=>`<button class="gr-foe k-${e.kind}${b.sel&&kindOf(card(b.sel))==='attack'?' tgt':''}" data-foe="${e.uid}">
      <span class="gr-intent" title="${esc(e.intent.text||'')}">${e.intent.deploy?'⚑ Deploy':`⚔ ${e.intent.dmg?e.intent.dmg:''}${e.intent.dice?(e.intent.dmg?'+':'')+'⚀'.repeat(Math.min(5,e.intent.dice)):''}`}<small>${esc(e.intent.name||'')}</small></span>
      <span class="gr-fi">${e.img?`<img src="${esc(e.img)}" alt="" referrerpolicy="no-referrer">`:`<i>${{footsoldier:'◈',monster:'✸',nemesis:'☠',boss:'♛'}[e.kind]}</i>`}</span>
      <b>${esc(e.name)}</b><span class="gr-hpb"><i style="width:${e.hp/e.max*100}%"></i><em>${e.hp}/${e.max}</em></span>${e.tokens?`<span class="gr-tok">⚡${e.tokens}</span>`:''}</button>`).join('')}</div>
    <div class="gr-mid"><div class="gr-me"><span class="gr-mi">${r.img?`<img src="${esc(r.img)}" alt="" referrerpolicy="no-referrer">`:''}</span><span><b>${esc(r.name)}</b><span class="gr-hpb me"><i style="width:${r.hp/r.max*100}%"></i><em>${r.hp}/${r.max}</em></span></span></div>
      <button class="gr-zord${zready?' ready':''}" data-g="zord" ${zready?'':'disabled'} title="Summon your Zord: roll ${r.act>=2&&r.mega?6:4} dice against every enemy">${r.zord.img?`<img src="${esc(r.zord.img)}" alt="" referrerpolicy="no-referrer">`:''}<span><b>${esc(r.act>=2&&r.mega?r.mega.name:r.zord.name)}</b><span class="gr-zbar"><i style="width:${Math.min(100,b.zord/zmax*100)}%"></i></span><small>${b.zordUsed?'Used this battle':zready?'Ready: tap to summon':'Charging '+Math.min(b.zord,zmax)+'/'+zmax}</small></span></button>
      <div class="gr-piles"><button class="gr-b gr-tx" data-g="pile:draw">Deck ${b.draw.length}</button><button class="gr-b gr-tx" data-g="pile:disc">Discard ${b.disc.length}</button></div>
      <button class="gr-btn pri gr-end" data-g="end">End turn</button></div>
    <div class="gr-hint">${b.sel?`Choose an enemy to attack with <b>${esc(card(b.sel).title)}</b>. <button class="gr-link" data-g="unsel">Cancel</button>`:b.plays?'Play a card: tap it.':'No plays left. End your turn.'}</div>
    <div class="gr-hand">${b.hand.map((c,i)=>cardHTML(c,`data-hand="${i}"`,playable(c)?'':'dim')).join('')}</div></div>`; }
function playable(i){ const b=G.b, c=card(i); return b.plays>0&&kindOf(c)!=='reaction'&&costOf(c,i.up)<=b.e; }
function cardHTML(i,attr,cls){ const c=card(i), k=kindOf(c), fx=effects(c), d=dieCount(c,i.up), s=shieldsOf(c,i.up);
  return `<button class="gc k-${k}${i.up?' up':''} ${cls||''}" ${attr||''}><span class="gc-c">${costOf(c,i.up)}</span><b class="gc-t">${esc(c.title)}${i.up?'+':''}</b><small class="gc-k">${k}${fx.partial?' ◇':''}</small>
    ${d||c.hits?`<span class="gc-d">${'<i class="gi">d</i>'.repeat(Math.min(7,d))}${c.hits?` +${c.hits}💥`:''}</span>`:''}<span class="gc-x">${rich(String(c.text||'').slice(0,190))}</span>
    <span class="gc-s">${'⛊'.repeat(Math.min(5,s))}${c.star?' ★':''}</span>${c.deckName?`<small class="gc-r">${esc(c.deckName)}</small>`:''}</button>`; }

/* ---------- dice ---------- */
async function roll(n,label,extra){ const tray=G.el.querySelector('#grDice'); const res=Array.from({length:n},()=>pick(FACES));
  tray.innerHTML=`<div class="gr-dt"><b>${esc(label)}</b><div class="gr-dr">${res.map(()=>`<span class="gr-die spin"></span>`).join('')}</div><div class="gr-dsum"></div></div>`; tray.hidden=false;
  const ds=[...tray.querySelectorAll('.gr-die')]; const glyph=f=>f.k==='blank'?'':f.k==='grid'?'<i class="gr-o">O</i>':f.k==='crit'?'<i class="gi">h</i><i class="gi">h</i>':'<i class="gi">h</i>';
  const t0=Date.now(); while(Date.now()-t0<650){ ds.forEach(d=>{ d.innerHTML=glyph(pick(FACES)); }); await sleep(70); }
  ds.forEach((d,k)=>{ d.classList.remove('spin'); d.classList.add('land','f-'+res[k].k); d.innerHTML=glyph(res[k]); });
  let hits=res.reduce((a,f)=>a+f.h,0); if(has('crit')) hits+=res.filter(f=>f.k==='crit').length; hits+=extra||0;
  tray.querySelector('.gr-dsum').innerHTML=`${hits} ${hits===1?'hit':'hits'}${extra?` (incl. +${extra})`:''}`;
  await sleep(G.quick?500:850); tray.hidden=true; return {hits, grid:res.filter(f=>f.k==='grid').length}; }

/* ---------- playing cards ---------- */
async function playHand(idx){ const b=G.b; if(G.busy) return; const i=b.hand[idx]; if(!i) return; const c=card(i);
  if(kindOf(c)==='reaction') return toastG('Reactions are played when their moment comes: when you attack or get hit.');
  if(!b.plays) return toastG('No plays left this turn.'); if(costOf(c,i.up)>b.e) return toastG('Not enough ⚡.');
  if(kindOf(c)==='attack'){ const fx=effects(c); if(fx.each||b.enemies.length===1){ return resolve(idx,b.enemies[0]); } b.sel=i; return paintBattle(); }
  return resolve(idx,null); }
async function resolve(idx,target){ const b=G.b, r=G.run; G.busy=true; const i=b.hand.splice(idx,1)[0], c=card(i), fx=effects(c), k=kindOf(c); b.sel=null;
  b.e-=costOf(c,i.up); b.plays--; paintBattle();
  try{
    if(fx.energy) b.e=Math.min(MAX_E,b.e+fx.energy);
    if(fx.again) b.plays+=fx.again;
    if(k==='attack'){ let dice=dieCount(c,i.up)+fx.addDice+b.nextDie; b.nextDie=0; if(b.firstAtk&&has('firstdie')) dice+=2; b.firstAtk=false;
      const reacts=b.hand.filter(h=>effects(card(h)).react==='atk'&&costOf(card(h),h.up)<=b.e);
      for(const h of reacts){ const hc=card(h); if(await ask(`Play <b>${esc(hc.title)}</b> (${costOf(hc,h.up)} ⚡) to add ${effects(hc).reactVal} ${effects(hc).reactVal===1?'die':'dice'} to this attack?`,'Play it','Not now')){ b.e-=costOf(hc,h.up); dice+=effects(hc).reactVal; b.hand.splice(b.hand.indexOf(h),1); b.disc.push(h); } }
      const res=await roll(Math.max(0,dice),c.title,+c.hits||0);
      if(fx.each) b.enemies.slice().forEach(e=>hurt(e,res.hits)); else hurt(target&&b.enemies.includes(target)?target:b.enemies[0],res.hits);
      if(/⚡ for each o result/i.test(c.text||'')&&res.grid) b.e=Math.min(MAX_E,b.e+res.grid); }
    if(fx.dmg&&k!=='reaction'){ if(fx.dmgEach) b.enemies.slice().forEach(e=>hurt(e,fx.dmg)); else if(b.enemies[0]) hurt(target&&b.enemies.includes(target)?target:b.enemies.slice().sort((x,y)=>x.hp-y.hp)[0],fx.dmg); }
    if(fx.draw) drawCards(fx.draw);
    b.disc.push(i);
  } finally { G.busy=false; }
  if(checkWin()) return; paintBattle(); }
function hurt(e,n){ const b=G.b; if(!e||n<=0) return; e.hp-=n; b.zord+=n*(has('zord')?2:1); floatText(e.uid,'-'+n);
  if(e.hp<=0){ b.enemies=b.enemies.filter(x=>x!==e); if(e.tokens) b.e=Math.min(MAX_E,b.e+e.tokens); } }
function floatText(uid,t){ const el=G.el.querySelector(`[data-foe="${uid}"]`); if(!el) return; const f=document.createElement('span'); f.className='gr-float'; f.textContent=t; el.appendChild(f); setTimeout(()=>f.remove(),900); }
function ask(html,yes,no){ return new Promise(res=>{ modal(`<p class="gr-q">${html}</p><div class="gr-acts"><button class="gr-btn" data-ask="0">${esc(no)}</button><button class="gr-btn pri" data-ask="1">${esc(yes)}</button></div>`);
  G.el.querySelector('#grModal').onclick=e=>{ const a=e.target.closest('[data-ask]'); if(!a) return; G.el.querySelector('#grModal').onclick=null; closeModal(); res(a.dataset.ask==='1'); }; }); }
async function zord(){ const b=G.b, r=G.run; if(G.busy||b.zord<ZORD_CHARGE||b.zordUsed) return; G.busy=true; b.zordUsed=1;
  const n=r.act>=2&&r.mega?6:4; const res=await roll(n,(r.act>=2&&r.mega?r.mega.name:r.zord.name)+' strikes!'); b.enemies.slice().forEach(e=>hurt(e,res.hits)); G.busy=false; if(!checkWin()) paintBattle(); }
async function endTurn(){ const b=G.b, r=G.run; if(G.busy) return; G.busy=true; b.sel=null; paintBattle();
  try{ for(const e of b.enemies.slice()){ if(!b.enemies.includes(e)) continue; const it=e.intent;
      if(it.deploy){ const fs=pickDeck('footsoldier'); for(let k=0;k<it.deploy&&b.enemies.length<6;k++){ const ne=makeEnemy('footsoldier',r.act,fs,r.threat); nextIntent(ne); b.enemies.push(ne); } toastG(e.name+' deploys foot soldiers!'); paintBattle(); await sleep(500); }
      else { let dmg=it.dmg||0; if(it.dice){ const res=await roll(it.dice,e.name+': '+(it.name||'Attack')); dmg+=res.hits; }
        if(dmg>0) await defend(dmg,e); else toastG(e.name+' missed!'); if(r.hp<=0) return lose(); }
      nextIntent(e); }
    b.hand.forEach(h=>b.disc.push(h)); b.hand=[]; turnStart(false);
  } finally { G.busy=false; } }
/** An enemy deals dmg: reveal the top card of the deck, or discard a card from hand, for its ⛊; reactions may cut it down. */
async function defend(dmg,e){ const b=G.b, r=G.run; let left=dmg;
  let choice=G.quick?{t:'reveal'}:await new Promise(res=>{ const reacts=b.hand.map((h,i)=>({h,i})).filter(x=>{ const f=effects(card(x.h)); return (f.react==='dmg'||f.react==='def')&&costOf(card(x.h),x.h.up)<=b.e; });
    modal(`<h2>${esc(e.name)} deals ${dmg} damage</h2><p class="gr-dim">Reveal the top card of your deck, or discard a card from your hand: its ⛊ block that much. Reactions can help too.</p>
      <div class="gr-acts"><button class="gr-btn pri" data-def="reveal" ${b.draw.length||b.disc.length?'':'disabled'}>Reveal the top card${b.draw.length?'':b.disc.length?' (reshuffles)':' (deck empty)'}</button><button class="gr-btn" data-def="take">Take it</button></div>
      ${reacts.length?`<p class="gr-sub">Reactions</p><div class="gr-hand sm">${reacts.map(x=>cardHTML(x.h,`data-defr="${x.i}"`)).join('')}</div>`:''}
      ${b.hand.length?`<p class="gr-sub">Or discard from your hand</p><div class="gr-hand sm">${b.hand.map((h,i)=>cardHTML(h,`data-defd="${i}"`)).join('')}</div>`:''}`);
    G.el.querySelector('#grModal').onclick=ev=>{ const t=ev.target.closest('[data-def],[data-defd],[data-defr]'); if(!t) return; G.el.querySelector('#grModal').onclick=null; closeModal();
      res(t.dataset.def?{t:t.dataset.def}:t.dataset.defd!==undefined?{t:'disc',i:+t.dataset.defd}:{t:'react',i:+t.dataset.defr}); }; });
  if(choice.t==='react'){ const h=b.hand[choice.i], f=effects(card(h)); b.e-=costOf(card(h),h.up); b.hand.splice(choice.i,1); b.disc.push(h);
    if(f.react==='dmg'){ left-=f.reactVal; if(f.dmg&&b.enemies.includes(e)) hurt(e,f.dmg); toastG(card(h).title+': −'+f.reactVal+' damage'); choice={t:left>0?'reveal':'none'}; }
    else { choice={t:'reveal', bonus:f.reactVal}; } if(checkWin(true)) return; }
  if(choice.t==='reveal'&&left>0){ if(!b.draw.length){ b.draw=shuffle(b.disc); b.disc=[]; } const h=b.draw.pop();
    if(h){ const c=card(h), f=effects(c); let s=shieldsOf(c,h.up)+(choice.bonus||0)+(has('thick')?1:0)+(b.firstDef&&has('guard')?2:0); b.firstDef=false;
      if(c.star){ if(f.starE) b.e=Math.min(MAX_E,b.e+f.starE); if(f.starDie) b.nextDie+=1; if(f.starDraw) drawCards(f.starDraw); }
      left-=s; b.disc.push(h); await showReveal(h,s,Math.max(0,left)); } }
  if(choice.t==='disc'&&left>0){ const h=b.hand.splice(choice.i,1)[0]; const s=shieldsOf(card(h),h.up)+(has('thick')?1:0); left-=s; b.disc.push(h); toastG('Discarded '+card(h).title+': blocked '+s); }
  if(left>0){ r.hp=Math.max(0,r.hp-left); toastG('You take '+left+' damage'); } paintBattle(); await sleep(250); }
async function showReveal(h,s,left){ modal(`<p class="gr-sub">Revealed for defense</p><div class="gr-hand sm one">${cardHTML(h)}</div><p class="gr-q">Blocks ${s}. ${left?left+' gets through.':'Nothing gets through!'}</p>`); await sleep(G.quick?700:1200); closeModal(); }
function checkWin(quiet){ const b=G.b; if(b.enemies.length) return false; setTimeout(()=>winBattle(),quiet?400:300); return true; }

/* ---------- after a battle ---------- */
function gold(n){ return Math.round(n*(has('coins')?1.3:1)); }
function winBattle(){ const r=G.run, b=G.b; if(!b) return; G.b=null; r.pending=null; const t=b.type; const g=gold(t==='boss'?80:t==='elite'?40+rnd(10):15+rnd(11)); r.gold+=g;
  G.meta.xp=(G.meta.xp||0)+(t==='boss'?50:t==='elite'?15:6); LS.set('gr-meta',G.meta);
  if(t==='boss'){ r.bosses++; if(r.act>=3) return victory(); r.act++; r.map=makeMap(r.act); r.pos=null; r.floor=-1; r.seen={}; r.hp=Math.min(r.max,r.hp+Math.round(r.max*.4)); if(has('vital')){ r.max+=6; r.hp+=6; } }
  save(); rewards(t,g); }
function cardChoices(n,rare){ const own=new Set(G.run.deck.map(x=>x.id)); const all=Object.keys(POOL).filter(id=>!own.has(id)); const w=all.map(id=>({id,w:(parseInt(POOL[id].cost,10)>=3?(rare?3:.6):1)}));
  const out=[]; while(out.length<n&&w.length){ const tot=w.reduce((a,x)=>a+x.w,0); let p=Math.random()*tot, k=0; for(;k<w.length;k++){ p-=w[k].w; if(p<=0) break; } out.push(w.splice(Math.min(k,w.length-1),1)[0].id); } return out; }
function rewards(t,g){ const r=G.run; topBar(''); const ch=cardChoices(3,t!=='battle'); const rel=t!=='battle'?newRelic():null; if(rel) r.relics.push(rel); save();
  body().innerHTML=`<div class="gr-pad gr-center"><h2 class="gr-h">${t==='boss'?'Boss defeated!':'Victory!'}</h2><p>+${g} Grid Points${rel?` · New power-up: <b>${esc(rel.name)}</b> (${esc(rel.desc)})`:''}${t==='boss'?` · On to Act ${r.act}, and you recover some Health.`:''}</p>
    <p class="gr-sub">Add a card to your deck</p><div class="gr-hand pick">${ch.map(id=>cardHTML({id,up:0},`data-take="${id}"`)).join('')}</div><button class="gr-btn" data-g="map">Skip</button></div>`; }
function newRelic(){ const own=new Set(G.run.relics.map(x=>x.id)); const l=(H().arsenal()||[]).concat(FALLBACK_RELICS).filter(a=>!own.has(a.id)); return l.length?relicOf(pick(l)):null; }
function rest(){ const r=G.run; topBar(''); const heal=Math.round(r.max*.3);
  body().innerHTML=`<div class="gr-pad gr-center"><h2 class="gr-h">Command Center</h2><p class="gr-dim">Zordon’s viewing globe hums. Rest, or train with Alpha 5.</p>
    <div class="gr-opts"><button class="gr-opt" data-g="heal"><b>Rest</b><span>Recover ${heal} Health (${r.hp}/${r.max})</span></button><button class="gr-opt" data-g="upg"><b>Train</b><span>Upgrade a card</span></button></div></div>`; }
function pickFromDeck(titleText,filter,then){ const r=G.run; const l=r.deck.map((x,i)=>({x,i})).filter(o=>!filter||filter(o.x));
  modal(`<h2>${esc(titleText)}</h2><div class="gr-hand grid">${l.map(o=>cardHTML(o.x,`data-pk="${o.i}"`)).join('')}</div><div class="gr-acts"><button class="gr-btn" data-pk="-1">Cancel</button></div>`);
  G.el.querySelector('#grModal').onclick=e=>{ const t=e.target.closest('[data-pk]'); if(!t) return; G.el.querySelector('#grModal').onclick=null; closeModal(); const i=+t.dataset.pk; if(i>=0) then(i); }; }
function shop(){ const r=G.run; topBar(''); if(!r.stock||r.stock.key!==r.act+':'+r.floor){ r.stock={key:r.act+':'+r.floor, cards:cardChoices(4,true).map(id=>({id,p:parseInt(POOL[id].cost,10)>=3?110+rnd(30):55+rnd(30)})), relic:newRelic(), rp:140+rnd(30), removed:false}; save(); }
  const s=r.stock;
  body().innerHTML=`<div class="gr-pad gr-center"><h2 class="gr-h">Power Coin shop</h2><p class="gr-dim">You have ◆ ${r.gold}.</p>
    <div class="gr-hand pick">${s.cards.map((o,k)=>`<div class="gr-buy">${cardHTML({id:o.id,up:0},`data-buy="${k}"`,r.gold<o.p?'dim':'')}<span>◆ ${o.p}</span></div>`).join('')||'<p class="gr-dim">Sold out.</p>'}</div>
    <div class="gr-opts">${s.relic?`<button class="gr-opt" data-g="buyrelic" ${r.gold<s.rp?'disabled':''}><b>${esc(s.relic.name)}</b><span>${esc(s.relic.desc)} · ◆ ${s.rp}</span></button>`:''}
      <button class="gr-opt" data-g="remove" ${r.gold<75||s.removed?'disabled':''}><b>Remove a card</b><span>${s.removed?'Done here':'◆ 75'}</span></button>
      <button class="gr-opt" data-g="buyupg" ${r.gold<60?'disabled':''}><b>Upgrade a card</b><span>◆ 60</span></button></div>
    <button class="gr-btn pri" data-g="map">Leave the shop</button></div>`; }
function treasure(){ const r=G.run; const rel=newRelic(); if(rel) r.relics.push(rel); r.gold+=gold(25); save(); topBar('');
  body().innerHTML=`<div class="gr-pad gr-center"><h2 class="gr-h">Arsenal cache</h2>${rel?`<div class="gr-relbig">${rel.img?`<img src="${esc(rel.img)}" alt="" referrerpolicy="no-referrer">`:'<i>✦</i>'}<b>${esc(rel.name)}</b><span>${esc(rel.desc)}</span></div>`:''}<p>+${gold(25)} Grid Points</p><button class="gr-btn pri" data-g="map">Back to the map</button></div>`; }
const EVENTS=[
  {t:'Zordon’s counsel',d:'“The Power protects those who are ready.” Zordon offers guidance.',o:[['Study (upgrade a random card)',r=>{ const l=r.deck.filter(x=>!x.up); if(l.length) pick(l).up=1; return 'A card was upgraded.'; }],['Meditate (recover 10 Health)',r=>{ r.hp=Math.min(r.max,r.hp+10); return 'You feel refreshed.'; }]]},
  {t:'Alpha 5 malfunctions',d:'“Ay-yi-yi!” Alpha’s circuits spark, scattering spare parts.',o:[['Help fix him (lose 5 Health, gain ◆ 60)',r=>{ r.hp=Math.max(1,r.hp-5); r.gold+=60; return 'Alpha thanks you with Power Coins.'; }],['Leave him to it',()=> 'Alpha will be fine. Probably.']]},
  {t:'Putty ambush',d:'Putties pour out of a portal in the park.',o:[['Fight them',r=>'fight'],['Slip away (lose 4 Health)',r=>{ r.hp=Math.max(1,r.hp-4); return 'You get away, bruised.'; }]]},
  {t:'A Ranger’s gift',d:'Another team of Rangers shares a technique.',o:[['Take a new card',r=>{ const id=cardChoices(1,false)[0]; if(id) r.deck.push({u:'c'+Date.now(),id,up:0}); return id?'Added '+POOL[id].title+'.':'Nothing new to learn.'; }],['Clear your head (remove a card)',r=>'remove']]},
  {t:'Power Coin cache',d:'A hidden stash glows under the Youth Center.',o:[['Take it (◆ 45)',r=>{ r.gold+=45; return 'Grid Points!'; }]]}];
function event(){ const r=G.run; const ev=EVENTS[(r.n++ + rnd(EVENTS.length))%EVENTS.length]; save(); topBar('');
  body().innerHTML=`<div class="gr-pad gr-center"><h2 class="gr-h">${esc(ev.t)}</h2><p>${esc(ev.d)}</p><div class="gr-opts">${ev.o.map((o,k)=>`<button class="gr-opt" data-ev="${k}"><b>${esc(o[0])}</b></button>`).join('')}</div></div>`;
  body().onclick=e=>{ const b=e.target.closest('[data-ev]'); if(!b) return; body().onclick=null; const out=ev.o[+b.dataset.ev][1](r); save();
    if(out==='fight'){ r.pending='battle'; save(); return startBattle('battle'); } if(out==='remove') return pickFromDeck('Remove a card',null,i=>{ r.deck.splice(i,1); save(); showMap(); });
    body().innerHTML=`<div class="gr-pad gr-center"><h2 class="gr-h">${esc(ev.t)}</h2><p>${esc(out)}</p><button class="gr-btn pri" data-g="map">Back to the map</button></div>`; topBar(''); }; }
function lose(){ const r=G.run; G.b=null; G.meta.xp=(G.meta.xp||0)+r.floor*2+(r.act-1)*20; LS.set('gr-meta',G.meta); LS.set('gr-run',null);
  topBar(''); body().innerHTML=`<div class="gr-pad gr-center gr-end"><h2 class="gr-h">Defeated</h2><p>${esc(r.name)} fell in Act ${r.act}, floor ${r.floor+1}. Your Morphin Grid rank grows with every run.</p><button class="gr-btn pri" data-g="title">Back to the title</button></div>`; G.run=null; }
function victory(){ const r=G.run; G.meta.wins=(G.meta.wins||0)+1; G.meta.xp=(G.meta.xp||0)+100; LS.set('gr-meta',G.meta); LS.set('gr-run',null);
  topBar(''); body().innerHTML=`<div class="gr-pad gr-center gr-end win"><h2 class="gr-h">The Grid is safe!</h2><p>${esc(r.name)} beat all three acts${r.threat?' on Threat '+r.threat:''}. A higher Threat level is now open.</p><button class="gr-btn pri" data-g="title">Back to the title</button></div>`; G.run=null; }
function showPile(which){ const b=G.b; const l=which==='draw'?[...b.draw].sort((x,y)=>card(x).title.localeCompare(card(y).title)):b.disc;
  modal(`<h2>${which==='draw'?'Draw pile (shown in name order)':'Discard pile'}</h2><div class="gr-hand grid">${l.map(h=>cardHTML(h)).join('')||'<p class="gr-dim">Empty.</p>'}</div><div class="gr-acts"><button class="gr-btn pri" data-g="close">Close</button></div>`); }

/* ---------- clicks ---------- */
function onClick(e){ const t=e.target.closest('[data-g],[data-hand],[data-foe],[data-rg],[data-node],[data-take],[data-buy]'); if(!t||G.busy&&!t.dataset.g) return; const r=G.run, b=G.b, a=t.dataset.g;
  if(a==='exit'){ save(); return H().onExit(); } if(a==='help') return help(); if(a==='close') return closeModal();
  if(a==='new') return chooseRanger(); if(a==='continue') return G.run.pending?startBattle(G.run.pending):showMap(); if(a==='title') return title();
  if(a==='deck'&&r) return modal(`<h2>Your deck (${r.deck.length})</h2>${r.ability?`<p class="gr-dim">${esc(r.name)}: ${esc(r.ability)}</p>`:''}<div class="gr-hand grid">${r.deck.map(x=>cardHTML(x)).join('')}</div><div class="gr-acts"><button class="gr-btn pri" data-g="close">Close</button></div>`);
  if(a&&a.startsWith('pile:')) return showPile(a.slice(5));
  if(a==='map') return showMap(); if(a==='end') return endTurn(); if(a==='zord') return zord(); if(a==='unsel'){ b.sel=null; return paintBattle(); }
  if(a==='heal'){ r.hp=Math.min(r.max,r.hp+Math.round(r.max*.3)); save(); return showMap(); }
  if(a==='upg') return pickFromDeck('Upgrade a card',x=>!x.up,i=>{ r.deck[i].up=1; save(); showMap(); });
  if(a==='buyupg') return pickFromDeck('Upgrade a card (◆ 60)',x=>!x.up,i=>{ r.gold-=60; r.deck[i].up=1; save(); shop(); });
  if(a==='remove') return pickFromDeck('Remove a card (◆ 75)',null,i=>{ r.gold-=75; r.deck.splice(i,1); r.stock.removed=true; save(); shop(); });
  if(a==='buyrelic'){ const s=r.stock; if(s.relic&&r.gold>=s.rp){ r.gold-=s.rp; r.relics.push(s.relic); s.relic=null; save(); shop(); } return; }
  if(t.dataset.rg) return newRun(t.dataset.rg);
  if(t.dataset.node) return enterNode(t.dataset.node);
  if(t.dataset.take){ r.deck.push({u:'c'+Date.now(),id:t.dataset.take,up:0}); save(); return showMap(); }
  if(t.dataset.buy!==undefined){ const o=r.stock.cards[+t.dataset.buy]; if(!o||r.gold<o.p) return toastG('Not enough Grid Points.'); r.gold-=o.p; r.deck.push({u:'c'+Date.now(),id:o.id,up:0}); r.stock.cards.splice(+t.dataset.buy,1); save(); return shop(); }
  if(b&&t.dataset.hand!==undefined) return playHand(+t.dataset.hand);
  if(b&&t.dataset.foe){ if(!b.sel) return; const e2=b.enemies.find(x=>x.uid===t.dataset.foe); const idx=b.hand.indexOf(b.sel); if(e2&&idx>=0) resolve(idx,e2); } }
function onKey(e){ if(!G.el||!G.el.isConnected) return; if(e.key==='Escape'){ const m=G.el.querySelector('#grModal'); if(!m.hidden&&!m.querySelector('[data-ask],[data-def]')){ closeModal(); e.preventDefault(); } else if(G.b&&G.b.sel){ G.b.sel=null; paintBattle(); } }
  if(G.b&&!G.busy&&/^[1-9]$/.test(e.key)&&G.el.querySelector('#grModal').hidden){ playHand(+e.key-1); } if(G.b&&!G.busy&&(e.key==='e'||e.key==='E')&&G.el.querySelector('#grModal').hidden) endTurn(); }

/** Opens the game inside el. */
window.GridRun={ async open(el){ G.el=el; el.innerHTML=`<div class="gr"><div class="gr-load"><div class="gr-spin"></div><p id="grSay">Opening Grid Run…</p></div></div>`;
    try{ await loadAll(t=>{ const s=el.querySelector('#grSay'); if(s) s.textContent=t; }); }catch(err){ el.innerHTML=`<div class="gr"><div class="gr-load"><p>The game could not load the cards: ${esc(err.message||err)}</p><button class="gr-btn pri" onclick="GR_HOST.onExit()">Back</button></div></div>`; return; }
    mount(el); el.addEventListener('click',onClick); document.addEventListener('keydown',onKey);
    const run=LS.get('gr-run',null); if(run&&!G.rangers.some(r=>r.id===run.ranger)) LS.set('gr-run',null); },
  close(){ document.removeEventListener('keydown',onKey); save(); if(G.el){ G.el.removeEventListener('click',onClick); G.el.innerHTML=''; } G.el=null; G.b=null; } };
})();
