// ===== BEANCORD feature pack: loaded after app.js, uses its globals =====
const LS={get(k,d){try{const v=localStorage.getItem(k);return v==null?d:JSON.parse(v)}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const GIPHY_KEY='';        // free key from developers.giphy.com; leave empty to hide the GIF button
const LINK_PREVIEWS=true;  // needs the link-preview edge function (setup/link-preview/index.ts); silently off if it is missing
const LP_IMAGES=false;     // true = previews also show the page's image (the viewer's browser then contacts that site)

// ---------- small pickers (used by the quick switcher, forward, GIFs, mute) ----------
function pickList(title,items,placeholder){
  return _modal(null,`<div class="bc-h font-bold text-white mb-2">${esc(title)}</div><input class="w-full bg-[#1e1f22] rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-[#5865f2]/60" placeholder="${esc(placeholder||'Search...')}" autocomplete="off"><div class="mt-2 max-h-72 overflow-y-auto space-y-0.5"></div>`,(d,done)=>{
    const inp=d.querySelector('input'),box=d.querySelector('.overflow-y-auto');let sel=0,shown=[];
    const draw=()=>{const q=inp.value.trim().toLowerCase();shown=items.filter(i=>!q||(i.label+' '+(i.sub||'')).toLowerCase().includes(q)).slice(0,50);if(sel>=shown.length)sel=Math.max(0,shown.length-1);
      box.innerHTML=shown.map((i,n)=>`<div data-n="${n}" class="flex items-center justify-between gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm ${n===sel?'bg-[#404249] text-white':'text-[#b5bac1] hover:bg-[#35373c]'}"><span class="truncate">${esc(i.label)}</span><span class="text-[11px] text-[#80848e] truncate flex-shrink-0">${esc(i.sub||'')}</span></div>`).join('')||'<div class="text-xs text-[#949ba4] px-3 py-2">Nothing found.</div>';
      const a=box.children[sel];if(a&&a.scrollIntoView)a.scrollIntoView({block:'nearest'})};
    inp.oninput=()=>{sel=0;draw()};
    inp.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();sel=Math.min(shown.length-1,sel+1);draw()}else if(e.key==='ArrowUp'){e.preventDefault();sel=Math.max(0,sel-1);draw()}else if(e.key==='Enter'){e.preventDefault();if(shown[sel])done(shown[sel])}};
    box.onclick=e=>{const r=e.target.closest('[data-n]');if(r)done(shown[+r.dataset.n])};
    draw();setTimeout(()=>inp.focus(),30);
  });
}
function askChoice(title,options){
  return _modal(null,`<div class="bc-h font-bold text-white mb-3">${esc(title)}</div><div class="space-y-1.5">${options.map((o,n)=>`<button data-n="${n}" class="w-full text-left px-3 py-2 rounded-lg text-sm bg-[#1e1f22] text-[#dbdee1] hover:bg-[#35373c]">${esc(o[0])}</button>`).join('')}</div><button data-no class="w-full mt-3 text-xs text-[#949ba4] hover:text-white">Cancel</button>`,(d,done)=>{
    d.onclick=e=>{const b=e.target.closest('[data-n]');if(b)done(options[+b.dataset.n][1]);else if(e.target.closest('[data-no]')||e.target===d)done(null)}});
}

// ---------- Ctrl+K quick switcher ----------
let allChans=[];
async function gotoChannel(cid){const sv=chanSrv[cid];if(sv&&sv!==srvId)await openServer(sv);await openChannel(cid)}
async function gotoDM(id){if(srvId||!Object.keys(cur).length)await showDMs();openDM(id)}
async function gotoGroup(id){if(srvId||!Object.keys(cur).length)await showDMs();openGroup(id)}
async function openSwitcher(){
  if(!me||$('app').classList.contains('hidden'))return;
  try{await loadChanMap()}catch(e){}
  const it=[];
  servers.forEach(s=>it.push({label:s.name,sub:'Server',go:()=>openServer(s.id)}));
  allChans.filter(c=>!c.is_voice).forEach(c=>{const s=servers.find(x=>x.id===c.server_id);it.push({label:'# '+c.name,sub:s?s.name:'',go:()=>gotoChannel(c.id)})});
  Object.values(profiles).filter(p=>p.id!==me.id&&fr(p.id)&&fr(p.id).status==='accepted').forEach(p=>it.push({label:'@ '+dn(p),sub:'Direct message',go:()=>gotoDM(p.id)}));
  groups.forEach(g=>it.push({label:'👥 '+g.name,sub:'Group chat',go:()=>gotoGroup(g.id)}));
  const r=await pickList('Jump to…',it,'Where would you like to go?');if(r)r.go();
}
document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='k'){e.preventDefault();openSwitcher()}});

// ---------- mute channels / servers, mark as read ----------
let _muteFor=null,_muteData=null;
function mutes(){if(!me)return {ch:{},srv:{}};if(_muteFor!==me.id){_muteFor=me.id;_muteData=LS.get('bc_mute_'+me.id,{ch:{},srv:{}})}return _muteData}
function isMuted(kind,id){const t=mutes()[kind][id];return !!t&&(t===true||t>Date.now())}
const isMutedCh=cid=>isMuted('ch',cid)||isMuted('srv',chanSrv[cid]);
const isMutedSrv=sid=>isMuted('srv',sid);
function setMute(kind,id,ms){const m=mutes();if(!ms)delete m[kind][id];else m[kind][id]=ms===Infinity?true:Date.now()+ms;LS.set('bc_mute_'+me.id,m);if(srvId)drawChannels();drawServerNav()}
async function muteChoose(kind,id){
  const ms=await askChoice('Mute for…',[['15 minutes',15*60e3],['1 hour',3600e3],['8 hours',8*3600e3],['24 hours',24*3600e3],['Until I turn it back on',Infinity]]);
  if(ms)setMute(kind,id,ms);
}
function recountSrv(sv){unreadSrv[sv]=Object.keys(unreadCh).filter(c=>chanSrv[c]===sv).length;mentSrv[sv]=Object.keys(ment).filter(c=>chanSrv[c]===sv).reduce((a,c)=>a+ment[c],0);if(!unreadSrv[sv])delete unreadSrv[sv];if(!mentSrv[sv])delete mentSrv[sv]}
function markChRead(id){delete unreadCh[id];delete ment[id];markRead(id);recountSrv(chanSrv[id]);if(srvId)drawChannels();drawServerNav()}
function markSrvRead(sid){Object.keys(chanSrv).filter(c=>chanSrv[c]===sid).forEach(c=>{delete unreadCh[c];delete ment[c];markRead(c)});delete unreadSrv[sid];delete mentSrv[sid];if(srvId)drawChannels();drawServerNav()}
const chanExtraMenu=id=>(isMuted('ch',id)?mi('🔔','Unmute channel',`setMute('ch','${id}',0)`):mi('🔕','Mute channel',`muteChoose('ch','${id}')`))+mi('✓','Mark as read',`markChRead('${id}')`)+sep;
const srvExtraMenu=id=>{
  let h=(isMuted('srv',id)?mi('🔔','Unmute server',`setMute('srv','${id}',0)`):mi('🔕','Mute server',`muteChoose('srv','${id}')`))+mi('✓','Mark server as read',`markSrvRead('${id}')`);
  if(id===srvId&&(isStaff()||defRole==='owner'))h+=sep+mi('🔗','Create invite link',`makeInvite('${id}')`)+mi('☺','Add custom emoji',`addEmoji('${id}')`)+mi('🗑','Manage custom emoji',`manageEmoji('${id}')`);
  return h+sep;
};

// ---------- status: online / idle / do not disturb / invisible + custom status ----------
let myStatus=LS.get('bc_status','online'),myCustom=LS.get('bc_cstatus',''),presCh=null,pres={},autoIdle=false,lastAct=Date.now();
const STC={online:'#23a55a',idle:'#f0b232',dnd:'#f23f43',off:'#80848e'};
const effStatus=()=>autoIdle&&myStatus==='online'?'idle':myStatus;
function stOf(u){if(u===me.id){const s=effStatus();return s==='invisible'?'off':s}if(!online.has(u))return 'off';return (pres[u]&&pres[u].s)||'online'}
const stColor=u=>STC[stOf(u)];
const stLabel=u=>({online:'Online',idle:'Idle',dnd:'Do Not Disturb',off:'Offline'})[stOf(u)];
const csOf=u=>u===me.id?(myStatus==='invisible'?'':myCustom):((online.has(u)&&pres[u]&&pres[u].cs)||'');
const csText=u=>csOf(u)?' — '+esc(csOf(u)):'';
const csLine=u=>csOf(u)?`<div class="text-[11px] text-[#949ba4] truncate">💬 ${esc(csOf(u))}</div>`:'';
function pushPresence(){if(presCh)presCh.track({t:Date.now(),s:effStatus(),cs:myCustom})}
function startPresence(){
  const ch=presCh=sb.channel('online',{config:{presence:{key:me.id}}});
  ch.on('presence',{event:'sync'},()=>{
    const st=ch.presenceState();online=new Set();pres={};
    for(const k of Object.keys(st)){const meta=(st[k]&&st[k][st[k].length-1])||{};pres[k]=meta;if(meta.s!=='invisible')online.add(k)}
    if(srvId)drawMembers();else drawPeople();
  }).subscribe(s=>{if(s==='SUBSCRIBED')pushPresence()});
  const act=()=>{lastAct=Date.now();if(autoIdle){autoIdle=false;pushPresence();drawMeBox()}};
  ['mousemove','keydown','pointerdown','touchstart','wheel'].forEach(ev=>window.addEventListener(ev,act,{passive:true}));
  setInterval(()=>{if(!autoIdle&&myStatus==='online'&&Date.now()-lastAct>5*60e3){autoIdle=true;pushPresence();drawMeBox()}},30000);
}
function drawMeBox(){
  const e=$('me');if(!e||!me)return;
  e.innerHTML=`<span class="flex items-center gap-2"><span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background:${stColor(me.id)}"></span><span class="truncate">${esc(dn(me))}</span></span>${myCustom&&myStatus!=='invisible'?`<span class="block text-[11px] font-normal text-[#949ba4] truncate">${esc(myCustom)}</span>`:''}`;
  e.style.cursor='pointer';e.title='Set your status';e.onclick=openStatusMenu;
}
function openStatusMenu(ev){
  ev.stopPropagation();
  const o=(c,l,s)=>mi(`<span class="inline-block w-2.5 h-2.5 rounded-full" style="background:${c}"></span>`,l+(myStatus===s?' ✓':''),`setStatus('${s}')`);
  showCtx(ev.clientX,Math.max(8,ev.clientY-190),o(STC.online,'Online','online')+o(STC.idle,'Idle','idle')+o(STC.dnd,'Do Not Disturb (no sounds)','dnd')+o(STC.off,'Invisible','invisible')+sep+mi('💬','Set custom status…','setCustomStatus()')+(myCustom?mi('✕','Clear custom status',"setCustomStatus('')",1):''));
}
function setStatus(s){myStatus=s;autoIdle=false;LS.set('bc_status',s);hideCtx();pushPresence();drawMeBox();if(srvId)drawMembers();else drawPeople()}
async function setCustomStatus(v){
  hideCtx();if(v===undefined){v=await askText('What are you up to?',myCustom);if(v===null)return}
  v=v.trim().slice(0,60);if(slurBlock(v,'That status'))return;
  myCustom=v;LS.set('bc_cstatus',v);pushPresence();drawMeBox();if(srvId)drawMembers();else drawPeople();
}

// ---------- jump to present / "N new messages" ----------
let newBelow=0;
function ensureJump(){
  if($('jumpbtn'))return;
  const p=$('msgs').parentElement;p.classList.add('relative');
  const b=document.createElement('button');b.id='jumpbtn';b.className='hidden absolute left-1/2 -translate-x-1/2 bottom-24 z-10 bg-[#5865f2] hover:bg-[#4752c4] text-white text-xs font-bold rounded-full px-4 py-1.5 shadow-lg';
  b.onclick=()=>{newBelow=0;$('msgs').scrollTo({top:1e9,behavior:'smooth'});b.classList.add('hidden')};
  p.appendChild(b);
  $('msgs').addEventListener('scroll',updJump,{passive:true});
}
function updJump(){
  const k=$('msgs'),b=$('jumpbtn');if(!b)return;
  const gap=k.scrollHeight-k.scrollTop-k.clientHeight;
  if(gap<150){newBelow=0;b.classList.add('hidden');return}
  if(newBelow||gap>600){b.textContent=newBelow?newBelow+' new message'+(newBelow>1?'s':'')+' ↓':'Jump to present ↓';b.classList.remove('hidden')}else b.classList.add('hidden');
}
function bumpNew(){newBelow++;updJump()}
function afterDraw(){newBelow=0;ensureJump();updJump();if(thrRoot&&msgCache[thrRoot]&&msgCache[thrRoot].channel_id!==cur.id)closeThread()}
const newDiv=()=>'<div id="newdiv" class="flex items-center gap-3 my-2 text-[11px] font-black text-[#f23f43]"><div class="flex-1 h-px bg-[#f23f43]/60"></div>NEW<div class="flex-1 h-px bg-[#f23f43]/60"></div></div>';

// ---------- drag & drop files onto the chat ----------
(function(){
  const area=$('msgs').parentElement;area.classList.add('relative');
  const ov=document.createElement('div');ov.className='hidden absolute inset-0 z-20 bg-[#5865f2]/20 border-2 border-dashed border-[#5865f2] flex items-center justify-center text-white font-bold text-lg pointer-events-none';ov.textContent='Drop to upload';area.appendChild(ov);
  let depth=0;const hasFiles=e=>e.dataTransfer&&[...(e.dataTransfer.types||[])].includes('Files');
  area.addEventListener('dragenter',e=>{if(hasFiles(e)){depth++;ov.classList.remove('hidden')}});
  area.addEventListener('dragleave',e=>{if(hasFiles(e)){depth=Math.max(0,depth-1);if(!depth)ov.classList.add('hidden')}});
  area.addEventListener('dragover',e=>{if(hasFiles(e))e.preventDefault()});
  area.addEventListener('drop',async e=>{if(!hasFiles(e))return;e.preventDefault();depth=0;ov.classList.add('hidden');for(const f of [...e.dataTransfer.files].slice(0,5))await sendImage(f)});
})();

// ---------- friends page tabs ----------
let friendTab=LS.get('bc_ftab','all');
function setFriendTab(t){friendTab=t;LS.set('bc_ftab',t);drawPeople()}
const friTabFilter=acc=>friendTab==='online'?acc.filter(p=>online.has(p.id)):friendTab==='all'?acc:[];
function friendTabs(inc){
  const t=(k,l,n)=>`<button onclick="setFriendTab('${k}')" class="flex-1 whitespace-nowrap text-[10px] font-semibold py-1 rounded ${friendTab===k?'bg-[#404249] text-white':'text-[#949ba4] hover:text-white'}">${l}${n?` <span class="text-[#f23f43]">${n}</span>`:''}</button>`;
  return `<div class="flex gap-1 px-1 pt-1">${t('online','Online')}${t('all','All')}${t('pending','Pending',inc.length)}${t('blocked','Blocked')}</div>`;
}
const friendEmpty=()=>friendTab==='online'?'<p class="text-xs text-[#949ba4] px-2 pt-1">Nobody is online right now.</p>':friendTab==='all'?'<p class="text-xs text-[#949ba4] px-2 pt-1">No friends yet. Add someone below.</p>':'';
function blockedList(){
  const ids=[...blocked];
  return '<div class="text-[11px] font-bold text-[#949ba4] uppercase px-2 pt-3 pb-1">Blocked — '+ids.length+'</div>'+(ids.length?ids.map(id=>`<div class="flex items-center justify-between px-2 py-1 text-sm"><span class="truncate text-[#b5bac1]">${esc(dn(profiles[id]||{username:'unknown'}))}</span><button onclick="unblock('${id}').then(drawPeople)" class="text-xs text-[#5865f2] hover:underline">Unblock</button></div>`).join(''):'<p class="text-xs text-[#949ba4] px-2">Nobody blocked.</p>');
}

// ---------- threads (a thread = a message plus the replies to it) ----------
let thrRoot=null;const replyCount={},counted=new Set();
function ensureThreadPanel(){
  if($('thread'))return;
  const d=document.createElement('div');d.id='thread';d.className='hidden fixed top-0 right-0 bottom-0 w-full sm:w-96 bg-[#2b2d31] border-l border-black/40 z-30 flex flex-col';
  d.innerHTML=`<div class="h-12 px-4 flex items-center justify-between border-b border-black/30 font-bold text-white flex-shrink-0"><span>🧵 Thread</span><button onclick="closeThread()" class="text-[#949ba4] hover:text-white">✕</button></div><div id="thrmsgs" class="flex-1 overflow-y-auto p-3 space-y-3"></div><form id="thrform" class="p-3 flex gap-2 flex-shrink-0"><textarea id="thri" rows="1" placeholder="Reply in thread..." class="flex-1 min-w-0 bg-[#383a40] rounded-lg px-3 py-2 text-white text-sm outline-none resize-none" style="max-height:8rem;field-sizing:content"></textarea><button class="bg-[#5865f2] hover:bg-[#4752c4] text-white font-bold px-4 rounded-lg text-sm">Send</button></form>`;
  bcHost().appendChild(d);
  $('thrform').onsubmit=sendThread;
  $('thri').addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!(matchMedia&&matchMedia('(pointer:coarse)').matches)){e.preventDefault();$('thrform').requestSubmit()}});
}
function thrRow(m){
  const p=profiles[m.sender_id]||{username:'unknown'},t=new Date(m.created_at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  return `<div id="tm_${m.id}" class="flex gap-2"><span onclick="showProfile('${m.sender_id}')" class="cursor-pointer flex-shrink-0">${av(p,9)}</span><div class="min-w-0"><span class="font-bold text-sm" style="color:${col(p)}">${esc(dn(p))}</span> <span class="text-[10px] text-[#949ba4]">${esc(t)}</span><p class="text-sm" data-t>${fmt(m)}</p></div></div>`;
}
async function openThread(id){
  const m=msgCache[id];if(!m||!m.channel_id)return;hideCtx();ensureThreadPanel();thrRoot=id;
  $('thread').classList.remove('hidden');$('thrmsgs').innerHTML='<div class="text-xs text-[#949ba4]">Loading…</div>';
  const {data}=await sb.from('messages').select('*').eq('channel_id',m.channel_id).eq('reply_to',id).order('created_at').limit(300);
  if(thrRoot!==id)return;
  const list=data||[];list.forEach(x=>msgCache[x.id]=x);
  $('thrmsgs').innerHTML=thrRow(m)+'<div class="flex items-center gap-3 text-[11px] font-semibold text-[#949ba4]"><div class="flex-1 h-px bg-[#3f4147]"></div>'+list.length+' repl'+(list.length===1?'y':'ies')+'<div class="flex-1 h-px bg-[#3f4147]"></div></div>'+list.filter(x=>!blocked.has(x.sender_id)).map(thrRow).join('');
  $('thrmsgs').scrollTop=1e9;$('thri').focus();
}
function closeThread(){thrRoot=null;const t=$('thread');if(t)t.classList.add('hidden')}
function threadAdd(m){
  if(!thrRoot||m.reply_to!==thrRoot||$('tm_'+m.id)||blocked.has(m.sender_id))return;
  const k=$('thrmsgs');if(!k)return;k.insertAdjacentHTML('beforeend',thrRow(m));k.scrollTop=1e9;
}
async function sendThread(e){
  e.preventDefault();const t=$('thri').value.trim(),root=msgCache[thrRoot];if(!t||!root)return;
  if(slurBlock(t))return;
  if(!canPostHere())return alert('You do not have permission to type in this channel.');
  {const mu=until(me,'muted_until');if(mu)return alert('You are muted until '+mu.toLocaleString())}
  $('thri').value='';
  const {error}=await sb.from('messages').insert({channel_id:root.channel_id,content:t,reply_to:thrRoot});
  if(error){$('thri').value=t;alert('Could not send: '+error.message)}
}
function updThreadBadge(id){const b=$('thr_'+id),n=replyCount[id]||0;if(!b)return;b.classList.toggle('hidden',!n);if(n)b.textContent='🧵 '+n+' repl'+(n===1?'y':'ies')}
function postRender(m){
  if(m.reply_to&&!counted.has(m.id)){counted.add(m.id);replyCount[m.reply_to]=(replyCount[m.reply_to]||0)+1;updThreadBadge(m.reply_to)}
  updThreadBadge(m.id);
  linkPreview(m);
}

// ---------- forward a message ----------
async function forwardMsg(id){
  hideCtx();const m=msgCache[id];if(!m)return;
  const it=[];
  Object.values(profiles).filter(p=>p.id!==me.id&&fr(p.id)&&fr(p.id).status==='accepted').forEach(p=>it.push({label:'@ '+dn(p),sub:'Direct message',t:'dm',id:p.id}));
  groups.forEach(g=>it.push({label:'👥 '+g.name,sub:'Group chat',t:'group',id:g.id}));
  if(srvId)channels.filter(c=>!c.is_voice&&rank(myRole())>=(c.min_post_rank||1)).forEach(c=>it.push({label:'# '+c.name,sub:(servers.find(x=>x.id===srvId)||{}).name||'',t:'ch',id:c.id}));
  const to=await pickList('Forward to…',it,'Search people, groups, channels');if(!to)return;
  const from=dn(profiles[m.sender_id]||{username:'unknown'}),body=(m.content&&m.content!=='​')?m.content:'';
  const content='↪ Forwarded from '+from+(body?'\n'+body:'');
  if(slurBlock(content,'That message'))return;
  const extra={};if(m.image_url)extra.image_url=m.image_url;if(m.file_url){extra.file_url=m.file_url;extra.file_name=m.file_name}
  const r=to.t==='ch'?await sb.from('messages').insert({channel_id:to.id,content,...extra})
    :to.t==='group'?await sb.from('group_dm_messages').insert({group_id:to.id,content,...extra})
    :await sb.from('dm_messages').insert({recipient_id:to.id,content,...extra});
  if(r.error)alert('Could not forward: '+r.error.message);else toast('Forwarded to '+to.label);
}
let msgExtraMenu=id=>{const m=msgCache[id];if(!m)return '';return sep+(m.channel_id?mi('🧵',(replyCount[id]?'Open thread':'Start thread'),`openThread('${id}')`):'')+mi('➡','Forward',`forwardMsg('${id}')`)};

// ---------- link previews (needs the link-preview edge function) ----------
const LP={};let lpOff=false;
async function linkPreview(m){
  if(!LINK_PREVIEWS||prefs_.linkPrev===false||lpOff||isBot(profiles[m.sender_id])||!m.content)return;
  const mt=String(m.content).match(/https?:\/\/[^\s<>"']+/);if(!mt)return;
  let url=mt[0].replace(/[.,!?;:)\]]+$/,'');
  if(/\.(png|jpe?g|gif|webp|mp4|webm)(\?|$)/i.test(url)||/giphy\.com/i.test(url))return;
  const box=$('lp_'+m.id);if(!box)return;
  if(!(url in LP)){
    LP[url]=sb.functions.invoke('link-preview',{body:{url}}).then(r=>{if(r.error){const st=r.error.context&&r.error.context.status;if(st===404||/Failed to send/i.test(String(r.error.message)))lpOff=true;return null}return r.data&&r.data.title?r.data:null}).catch(()=>null);
  }
  const d=await LP[url];if(!d)return;
  const el=$('lp_'+m.id);if(!el||el.firstChild)return;
  const safe=u=>/^https?:\/\//i.test(u||'')?esc(u):'';
  el.innerHTML=`<a href="${safe(d.url||url)}" target="_blank" rel="noopener noreferrer" class="block max-w-sm mt-1 border-l-4 border-[#5865f2] bg-[#2b2d31] rounded px-3 py-2 hover:bg-[#2f3136]"><div class="text-[11px] text-[#949ba4] truncate">${esc(d.site||'')}</div><div class="text-sm font-semibold text-[#00a8fc]">${esc(d.title)}</div>${d.description?`<div class="text-xs text-[#b5bac1] mt-0.5" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(d.description)}</div>`:''}${LP_IMAGES&&safe(d.image)?`<img src="${safe(d.image)}" loading="lazy" referrerpolicy="no-referrer" class="mt-2 rounded max-h-44">`:''}</a>`;
}

// ---------- GIFs (Giphy) ----------
function gifHtml(c){
  c=String(c||'').trim();if(!/^https:\/\/\S+$/.test(c))return '';
  let u;try{u=new URL(c)}catch(e){return ''}
  if(!/^(media\d*|i)\.giphy\.com$/.test(u.hostname))return '';
  return `<img src="${esc(c)}" alt="GIF" loading="lazy" onclick="lightbox(this.src)" class="mt-1 max-h-64 max-w-xs rounded-lg cursor-pointer">`;
}
function openGifPicker(){
  hideCtx();if(!GIPHY_KEY)return;
  _modal(null,`<input class="w-full bg-[#1e1f22] rounded-lg px-3 py-2 text-white text-sm outline-none focus:ring-2 focus:ring-[#5865f2]/60" placeholder="Search GIFs" autocomplete="off"><div class="mt-2 grid grid-cols-2 gap-1.5 max-h-80 overflow-y-auto"></div><div class="text-[10px] text-[#80848e] mt-2 text-right">Powered by GIPHY</div>`,(d,done)=>{
    const inp=d.querySelector('input'),grid=d.querySelector('.grid');let timer=null,tok=0;
    const load=async()=>{const q=inp.value.trim(),my=++tok;
      try{const r=await fetch('https://api.giphy.com/v1/gifs/'+(q?'search':'trending')+'?api_key='+encodeURIComponent(GIPHY_KEY)+'&limit=24&rating=pg-13'+(q?'&q='+encodeURIComponent(q):''));const j=await r.json();if(my!==tok)return;
        const list=(j.data||[]).filter(g=>g.images&&g.images.fixed_height&&/^https:\/\/(media\d*|i)\.giphy\.com\//.test(g.images.fixed_height.url));
        grid.innerHTML=list.map((g,n)=>`<img data-n="${n}" src="${esc(g.images.fixed_height_small?g.images.fixed_height_small.url:g.images.fixed_height.url)}" alt="${esc(g.title||'GIF')}" loading="lazy" class="w-full h-28 object-cover rounded cursor-pointer hover:opacity-80">`).join('')||'<div class="text-xs text-[#949ba4] col-span-2 p-2">No GIFs found.</div>';
        grid._list=list}catch(e){grid.innerHTML='<div class="text-xs text-[#f23f43] col-span-2 p-2">Could not load GIFs.</div>'}};
    inp.oninput=()=>{clearTimeout(timer);timer=setTimeout(load,350)};
    grid.onclick=e=>{const i=e.target.closest('[data-n]');if(!i)return;const g=grid._list[+i.dataset.n];done(g.images.fixed_height.url)};
    load();setTimeout(()=>inp.focus(),30);
  }).then(url=>{if(!url)return;const el=$('i'),keep=el.value;el.value=url;$('f').requestSubmit();el.value=keep});
}
// emoji picker (replaces the old one): standard emoji, this account's custom emoji, and a GIF button
function pickEmoji(e){
  const std=EMOJIS.map(em=>`<span onclick="insertEmoji('${em}')" class="w-9 h-9 flex items-center justify-center text-xl rounded-full hover:bg-[#35373c] cursor-pointer">${em}</span>`).join('');
  const names=Object.keys(custEmoji);
  const cust=names.length?sep+'<div class="grid grid-cols-4 gap-1 p-1">'+names.map(n=>`<span onclick="insertEmoji(':${n}: ')" title=":${n}:" class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-[#35373c] cursor-pointer"><img src="${esc(custEmoji[n])}" class="w-6 h-6"></span>`).join('')+'</div>':'';
  showCtx(e.clientX,e.clientY,`<div class="grid grid-cols-4 gap-1 p-1">${std}</div>${cust}${GIPHY_KEY?sep+mi('🎞','GIFs','openGifPicker()'):''}`);
}

// ---------- custom server emoji ----------
let custEmoji={};
function mergeCust(){Object.keys(custEmoji).forEach(n=>{emojiMap[n]=':'+n+':'})}   // lets :name: autocomplete like built-in emoji
async function loadCustomEmoji(){
  try{const {data,error}=await sb.from('server_emoji').select('name,url');if(error)return;custEmoji={};(data||[]).forEach(x=>{if(String(x.url).startsWith(IMGBASE))custEmoji[x.name.toLowerCase()]=x.url});mergeCust()}catch(e){}
}
function emojiHtml(s){return s.replace(/:([a-z0-9_]{2,32}):/gi,(x,n)=>{const u=custEmoji[n.toLowerCase()];return u?`<img src="${esc(u)}" alt=":${esc(n)}:" title=":${esc(n)}:" class="inline-block w-6 h-6 align-text-bottom">`:x})}
function emojiBlob(f){return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),k=Math.min(64/i.width,64/i.height),w=i.width*k,h=i.height*k;x.drawImage(i,(64-w)/2,(64-h)/2,w,h);c.toBlob(b=>b?res(b):rej(),'image/png')};i.onerror=rej;i.src=r.result};r.onerror=rej;r.readAsDataURL(f)})}
async function addEmoji(sid){
  hideCtx();
  const inp=document.createElement('input');inp.type='file';inp.accept='image/*';
  inp.onchange=async()=>{
    const f=inp.files[0];if(!f)return;
    let name=await askText('Emoji name (letters, numbers, underscore)',f.name.replace(/\.[^.]+$/,'').toLowerCase().replace(/[^a-z0-9_]/g,'_').slice(0,32));if(name===null)return;
    name=name.toLowerCase().replace(/[^a-z0-9_]/g,'');if(name.length<2)return alert('The name needs 2+ letters or numbers.');
    if(slurBlock(name,'That name'))return;
    try{
      const b=await emojiBlob(f),path=me.id+'/emoji-'+crypto.randomUUID()+'.png';
      const up=await sb.storage.from('chat-images').upload(path,b,{contentType:'image/png'});if(up.error)throw up.error;
      const url=sb.storage.from('chat-images').getPublicUrl(path).data.publicUrl;
      const {error}=await sb.from('server_emoji').insert({server_id:String(sid),name,url});if(error)throw error;
      await loadCustomEmoji();toast('Added :'+name+':');
    }catch(e){alert('Could not add emoji: '+(e.message||e)+(String(e.message||'').includes('server_emoji')?'\n\nRun setup/invites_and_emoji.sql in Supabase first.':''))}
  };
  inp.click();
}
async function manageEmoji(sid){
  hideCtx();const {data,error}=await sb.from('server_emoji').select('*').eq('server_id',String(sid)).order('name');
  if(error)return alert(error.message);
  if(!(data||[]).length)return alert('This server has no custom emoji yet.');
  const r=await pickList('Pick an emoji to delete',data.map(x=>({label:':'+x.name+':',sub:'click to delete',row:x})));
  if(!r||!(await askConfirm('Delete :'+r.row.name+': ?')))return;
  const {error:e2}=await sb.from('server_emoji').delete().eq('id',r.row.id);if(e2)return alert(e2.message);await loadCustomEmoji();
}

// ---------- invites ----------
let _inviteOpen=null;
(function(){try{const c=new URLSearchParams(location.search).get('invite');if(c){sessionStorage.setItem('bc_invite',c);history.replaceState(null,'',location.pathname)}}catch(e){}})();
async function makeInvite(sid){
  hideCtx();
  const hours=await askChoice('Invite link expires…',[['After 1 day',24],['After 7 days',168],['Never',0]]);if(hours===null)return;
  const {data,error}=await sb.rpc('create_invite',{sid:String(sid),hours,max_uses:0});
  if(error)return alert(error.message+(/function|schema cache/i.test(error.message)?'\n\nRun setup/invites_and_emoji.sql in Supabase first.':''));
  const link=location.origin+location.pathname+'?invite='+data;
  try{await navigator.clipboard.writeText(link);toast('Invite link copied')}catch(e){}
  await askText('Invite link (anyone with it can join this server):',link);
}
async function redeemInvite(){
  let code=null;try{code=sessionStorage.getItem('bc_invite')}catch(e){}
  if(!code)return;try{sessionStorage.removeItem('bc_invite')}catch(e){}
  const {data,error}=await sb.rpc('use_invite',{code});
  if(error)return alert(error.message);
  await loadServers();_inviteOpen=data;toast('Joined server');
}

// ---------- push to talk ----------
const ptt={on:LS.get('bc_ptt',false),key:LS.get('bc_pttkey','Backquote'),down:false};
function pttApply(){const s=localStream||groupLocalStream;if(!s)return;const open=!ptt.on||ptt.down;s.getAudioTracks().forEach(t=>{t.enabled=open&&!muted&&!deafened})}
function togglePtt(){ptt.on=!ptt.on;ptt.down=false;LS.set('bc_ptt',ptt.on);pttBtn();pttApply();toast(ptt.on?'Push to talk on — hold '+ptt.key.replace('Key','').replace('Backquote','`')+' to speak (right-click the button to change the key)':'Push to talk off')}
function pttBtn(){const b=$('pttbtn');if(b)b.classList.toggle('bg-[#5865f2]',ptt.on)}
async function pttSetKey(e){
  if(e)e.preventDefault();
  const code=await _modal(null,'<div class="text-sm text-white text-center">Press the key you want to hold to talk…</div><button data-no class="w-full mt-4 text-xs text-[#949ba4] hover:text-white">Cancel</button>',(d,done)=>{
    const k=ev=>{ev.preventDefault();ev.stopPropagation();if(ev.code!=='Escape')done(ev.code);document.removeEventListener('keydown',k,true)};
    document.addEventListener('keydown',k,true);d.querySelector('[data-no]').onclick=()=>{document.removeEventListener('keydown',k,true);done(null)}});
  if(code){ptt.key=code;LS.set('bc_pttkey',code);toast('Push-to-talk key set to '+code.replace('Key','').replace('Backquote','`'))}
}
const _inField=e=>/^(INPUT|TEXTAREA|SELECT)$/.test((e.target||{}).tagName||'')||(e.target&&e.target.isContentEditable);
window.addEventListener('keydown',e=>{if(ptt.on&&e.code===ptt.key&&!e.repeat&&!_inField(e)){ptt.down=true;pttApply()}});
window.addEventListener('keyup',e=>{if(ptt.on&&e.code===ptt.key){ptt.down=false;pttApply()}});
window.addEventListener('blur',()=>{if(ptt.on){ptt.down=false;pttApply()}});
setInterval(()=>{if(ptt.on&&!ptt.down)pttApply()},500);   // a call that starts while PTT is on opens with the mic closed
{const _toggleMute=toggleMute;toggleMute=function(){_toggleMute();pttApply()}}   // keep PTT and the mute button consistent
pttBtn();
