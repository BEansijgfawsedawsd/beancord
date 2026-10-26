// ===== BEANCORD server tools: auto-mod + raid protection, blocked-word list, welcome/rules gate,
// ===== webhooks, forum channels. Loaded after settings.js. Needs setup/moderation_and_servers.sql. =====

const SUPA_URL='https://ilmzklhvkacnljfgnxvq.supabase.co';
const needSql=e=>missingTable(e)?'Run setup/moderation_and_servers.sql in the Supabase SQL editor first.':e.message;
const isDefaultServer=()=>!!(servers.find(x=>x.id===srvId)||{}).is_default;
const stBack='<button data-back class="text-xs text-[#5865f2] hover:underline mb-3">‹ Back to server tools</button>';
const numIn=(id,v,max)=>`<input id="${id}" type="number" min="0" max="${max||1000}" step="1" inputmode="numeric" value="${v}" class="w-24 bg-[#1e1f22] rounded-lg px-3 py-2 text-white text-sm outline-none text-right">`;
const int=(id,max)=>Math.max(0,Math.min(max||1000,parseInt($(id).value,10)||0));

// ---------- entry point (the 🛡 button in the server header) ----------
function openServerTools(){
  if(!srvId||!isStaff())return;
  const def=isDefaultServer();
  const body=sheet('Server tools','',false);
  const card=(k,ic,t,d)=>`<button data-go="${k}" class="w-full text-left flex gap-3 items-start bg-[#1e1f22] hover:bg-[#35373c] rounded-lg px-4 py-3"><span class="text-xl">${ic}</span><span><span class="block text-sm font-semibold text-white">${t}</span><span class="block text-xs text-[#949ba4]">${d}</span></span></button>`;
  const home=()=>{
    body.innerHTML='<div class="space-y-2">'+card('rules','📜','Welcome message & rules','What new members see, and whether they must agree to the rules before posting.')+card('hooks','🔗','Webhooks','Let other apps (GitHub, uptime monitors, scripts) post into a channel.')+
      (def?card('automod','🛡','Auto-mod & raid protection','Spam, repeated messages, mention spam, link limits and a minimum account age.')+card('words','🚫','Blocked words','Words that auto-mod removes. (Slurs are always blocked separately.)'):'')+'</div>';
  };
  body.onclick=e=>{
    if(e.target.closest('[data-back]'))return home();
    const g=e.target.closest('[data-go]');if(!g)return;
    ({rules:tvRules,hooks:tvHooks,automod:tvAutomod,words:tvWords})[g.dataset.go](body);
  };
  home();
}

// ---------- auto-mod + raid protection ----------
async function tvAutomod(b){
  b.innerHTML=stBack+'<div class="text-xs text-[#949ba4]">Loading…</div>';
  const {data:c,error}=await sb.from('automod_config').select('*').eq('id',1).maybeSingle();
  if(error||!c){b.innerHTML=stBack+`<p class="text-sm text-[#f23f43]">${esc(error?needSql(error):'Settings row not found. Run setup/moderation_and_servers.sql.')}</p>`;return}
  const row=(t,d,ctl)=>`<div class="flex items-center justify-between gap-4 py-2.5"><div><div class="text-sm text-white">${t}</div><div class="text-xs text-[#949ba4]">${d}</div></div>${ctl}</div>`;
  b.innerHTML=stBack+`<div class="divide-y divide-[#3f4147]">
    ${row('Spam limit','Max messages in 10 seconds. 0 = off.',numIn('am_spam',c.spam_per_10s,60))}
    ${row('Repeated message limit','Same message within a minute. 0 = off.',numIn('am_dup',c.dup_limit,20))}
    ${row('Mention limit','@mentions allowed in one message. 0 = off.',numIn('am_men',c.mention_limit,50))}
    ${row('Block links for new members','Plain “member” role can’t post links until verified.',`<input id="am_links" type="checkbox" ${c.block_links_members?'checked':''} class="w-5 h-5">`)}
    ${row('Minimum account age (hours)','Brand-new accounts can’t post yet. 0 = off. Good against raids.',numIn('am_age',c.min_account_hours,720))}
   </div><p class="text-xs text-[#949ba4] mt-3">Mods and above are never limited. These apply everywhere on the site.</p>
   <div id="am_msg" class="text-xs min-h-[1rem] mt-2"></div><button id="am_save" class="mt-1 w-full bg-[#23a55a] hover:bg-[#1a8044] text-white py-2 rounded-lg text-sm font-semibold">Save</button>`;
  $('am_save').onclick=async()=>{
    const f={spam_per_10s:int('am_spam',60),dup_limit:int('am_dup',20),mention_limit:int('am_men',50),block_links_members:$('am_links').checked,min_account_hours:int('am_age',720),updated_at:new Date().toISOString()};
    const {data,error}=await sb.from('automod_config').update(f).eq('id',1).select();
    const m=$('am_msg');
    if(error){m.className='text-xs text-[#f23f43]';m.textContent=needSql(error)}
    else if(!data||!data.length){m.className='text-xs text-[#f23f43]';m.textContent='The database refused the change. Only staff of the main server can edit these.'}
    else{m.className='text-xs text-[#23a55a]';m.textContent='Saved.'}
  };
}

// ---------- blocked words ----------
async function tvWords(b){
  const draw=async()=>{
    const {data,error}=await sb.rpc('list_banned_words');
    if(error){b.innerHTML=stBack+`<p class="text-sm text-[#f23f43]">${esc(error.message)}</p>`;return}
    const words=(data||[]).map(String).sort();
    b.innerHTML=stBack+`<div class="flex gap-2"><input id="bw_in" maxlength="40" placeholder="Add a word or phrase" autocomplete="off" class="flex-1 bg-[#1e1f22] rounded-lg px-3 py-2 text-white text-sm outline-none"><button id="bw_add" class="bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm px-4 rounded-lg">Add</button></div>
      <div class="flex flex-wrap gap-2 mt-4">${words.length?words.map(w=>`<span class="inline-flex items-center gap-1.5 bg-[#1e1f22] rounded-full pl-3 pr-2 py-1 text-sm text-white">${esc(w)}<button data-w="${esc(w)}" class="text-[#949ba4] hover:text-[#f23f43]" title="Remove">✕</button></span>`).join(''):'<span class="text-sm text-[#949ba4]">No custom blocked words yet.</span>'}</div>
      <p class="text-xs text-[#949ba4] mt-4">Repeated strikes from this list can mute people automatically. Slurs and their disguises (n1…, n!…) are always blocked, with no list needed.</p>`;
    const add=async()=>{const w=$('bw_in').value.trim().toLowerCase();if(!w)return;const {error}=await sb.rpc('ban_word',{w});if(error)return alert(error.message);draw()};
    $('bw_add').onclick=add;$('bw_in').onkeydown=e=>{if(e.key==='Enter')add()};
    b.querySelectorAll('[data-w]').forEach(x=>x.onclick=async()=>{const {error}=await sb.rpc('unban_word',{w:x.dataset.w});if(error)return alert(error.message);draw()});
  };
  draw();
}

// ---------- welcome message + rules (editor) ----------
async function tvRules(b){
  b.innerHTML=stBack+'<div class="text-xs text-[#949ba4]">Loading…</div>';
  const sid=String(srvId);
  const {data:s,error}=await sb.from('server_settings').select('*').eq('server_id',sid).maybeSingle();
  if(error){b.innerHTML=stBack+`<p class="text-sm text-[#f23f43]">${esc(needSql(error))}</p>`;return}
  b.innerHTML=stBack+`<label class="${FLD_LBL}">Welcome message<textarea id="sr_w" rows="3" maxlength="1000" placeholder="Hi! Glad you’re here…" class="${FLD_INP} resize-none"></textarea></label>
   <label class="${FLD_LBL} mt-3 block">Rules<textarea id="sr_r" rows="6" maxlength="2000" placeholder="1. Be kind&#10;2. No spam" class="${FLD_INP} resize-none"></textarea></label>
   <label class="flex items-center gap-2 text-sm text-[#dbdee1] mt-3"><input id="sr_req" type="checkbox"> Members must agree to the rules before they can post</label>
   <div id="sr_msg" class="text-xs min-h-[1rem] mt-2"></div><button id="sr_save" class="mt-1 w-full bg-[#23a55a] hover:bg-[#1a8044] text-white py-2 rounded-lg text-sm font-semibold">Save</button>`;
  $('sr_w').value=(s&&s.welcome)||'';$('sr_r').value=(s&&s.rules)||'';$('sr_req').checked=!!(s&&s.require_rules);
  $('sr_save').onclick=async()=>{
    const f={server_id:sid,welcome:$('sr_w').value.trim()||null,rules:$('sr_r').value.trim()||null,require_rules:$('sr_req').checked,updated_at:new Date().toISOString()};
    if(f.require_rules&&!f.rules){const m=$('sr_msg');m.className='text-xs text-[#f23f43]';m.textContent='Write some rules first, or untick the box.';return}
    const {error}=await sb.from('server_settings').upsert(f,{onConflict:'server_id'});
    const m=$('sr_msg');
    if(error){m.className='text-xs text-[#f23f43]';m.textContent=needSql(error)}
    else{delete gateCache[sid];m.className='text-xs text-[#23a55a]';m.textContent='Saved.'}
  };
}

// ---------- welcome + rules (what members see) ----------
const gateCache={},gateSkip={};   // gateSkip: "Not now" was pressed, so don't ask again until the page reloads
async function serverGate(sid,force){
  sid=String(sid);if(!me)return;
  if(!force&&gateSkip[sid])return;
  let s=gateCache[sid];
  if(s===undefined||force){
    const {data,error}=await sb.from('server_settings').select('*').eq('server_id',sid).maybeSingle();
    if(error)return;s=gateCache[sid]=data||null;
  }
  if(!s||(!s.welcome&&!s.rules))return;
  const seenKey='bc_welcome_'+sid+'_'+me.id,staff=isStaff();
  let accepted=true;
  if(s.require_rules&&!staff){
    const {data}=await sb.from('rules_accepted').select('server_id').eq('server_id',sid).eq('user_id',me.id).maybeSingle();
    accepted=!!data;
  }
  if(srvId!==sid&&String(srvId)!==sid)return;
  if(accepted&&!force&&LS.get(seenKey,false))return;
  if(accepted&&!force&&!s.welcome&&!s.rules)return;
  const name=(servers.find(x=>String(x.id)===sid)||{}).name||'this server';
  const must=!accepted;
  const html=`<div class="bc-h text-lg font-bold text-white mb-1">Welcome to ${esc(name)}</div>${s.welcome?`<div class="text-sm text-[#dbdee1] whitespace-pre-wrap mb-3">${esc(s.welcome)}</div>`:''}${s.rules?`<div class="text-[11px] font-bold uppercase text-[#949ba4] mb-1">Rules</div><div class="text-sm text-[#dbdee1] whitespace-pre-wrap bg-[#1e1f22] rounded-lg p-3 max-h-60 overflow-y-auto">${esc(s.rules)}</div>`:''}
    <div class="flex gap-2 mt-4"><button data-ok class="flex-1 bg-[#23a55a] hover:bg-[#1a8044] text-white py-2 rounded-lg text-sm font-semibold">${must?'I agree to the rules':'Got it'}</button>${must?'<button data-no class="flex-1 bg-[#4e5058] hover:bg-[#5d6068] text-white py-2 rounded-lg text-sm">Not now</button>':''}</div>${must?'<p class="text-[11px] text-[#949ba4] mt-2">You can read this server, but you can’t post until you agree.</p>':''}`;
  const ok=await _modal(false,html,(d,done)=>{d.querySelector('[data-ok]').onclick=()=>done(true);const n=d.querySelector('[data-no]');if(n)n.onclick=()=>done(false)});
  if(!ok){gateSkip[sid]=true;return}
  LS.set(seenKey,true);
  if(must){
    const {error}=await sb.from('rules_accepted').insert({server_id:sid,user_id:me.id});
    if(error&&!/duplicate|23505/.test(error.message+(error.code||'')))return alert(error.message);
    toast('Thanks — you can post now.');
  }
}
{
  const _os=openServer;
  openServer=async function(id){const r=await _os(id);serverGate(id).catch(()=>{});return r};
}

// ---------- webhooks ----------
async function tvHooks(b){
  const sid=String(srvId),voice=c=>c.is_voice;
  const textChans=channels.filter(c=>!voice(c));
  const draw=async()=>{
    b.innerHTML=stBack+'<div class="text-xs text-[#949ba4]">Loading…</div>';
    const {data,error}=await sb.from('webhooks').select('*').eq('server_id',sid).order('created_at');
    if(error){b.innerHTML=stBack+`<p class="text-sm text-[#f23f43]">${esc(needSql(error))}</p>`;return}
    const url=h=>`${SUPA_URL}/functions/v1/webhook?id=${h.id}&token=${h.token}`;
    b.innerHTML=stBack+`<div class="space-y-2">${(data||[]).length?data.map(h=>{const c=channels.find(x=>String(x.id)===String(h.channel_id));return `<div class="bg-[#1e1f22] rounded-lg px-3 py-2"><div class="flex items-center justify-between gap-2"><div class="min-w-0"><div class="text-sm text-white truncate">${esc(h.name)}</div><div class="text-xs text-[#949ba4]">posts in #${esc(c?c.name:'deleted channel')}</div></div><div class="flex gap-3 text-xs flex-shrink-0"><button data-copy="${esc(url(h))}" class="text-[#5865f2] hover:underline">Copy URL</button><button data-del="${esc(h.id)}" class="text-[#f23f43] hover:underline">Delete</button></div></div></div>`}).join(''):'<p class="text-sm text-[#949ba4]">No webhooks yet.</p>'}</div>
     <div class="border-t border-[#3f4147] mt-4 pt-4"><div class="text-[11px] font-bold uppercase text-[#949ba4] mb-2">New webhook</div>
     <div class="flex gap-2"><input id="wh_name" maxlength="40" placeholder="Name (e.g. GitHub)" class="flex-1 min-w-0 bg-[#1e1f22] rounded-lg px-3 py-2 text-white text-sm outline-none"><select id="wh_ch" class="bg-[#1e1f22] rounded-lg px-2 py-2 text-white text-sm outline-none max-w-[9rem]">${textChans.map(c=>`<option value="${esc(c.id)}">#${esc(c.name)}</option>`).join('')}</select></div>
     <button id="wh_add" class="mt-2 w-full bg-[#5865f2] hover:bg-[#4752c4] text-white py-2 rounded-lg text-sm font-semibold">Create webhook</button></div>
     <details class="mt-4 text-xs text-[#949ba4]"><summary class="cursor-pointer">How to use one</summary><p class="mt-2">Send a POST with JSON to the URL. Anyone with the URL can post, so keep it secret — delete it if it leaks.</p><pre class="mt-2 bg-[#1e1f22] rounded p-2 overflow-x-auto text-[#dbdee1]">curl -X POST "URL" \\
  -H "Content-Type: application/json" \\
  -d '{"content":"Hello from a script"}'

{"embed":{"title":"Deploy done","description":"v1.2 is live",
 "color":"#23a55a","fields":[{"name":"Time","value":"42s","inline":true}]}}</pre><p class="mt-2">The edge function must be deployed first: see setup/README.md → Webhooks.</p></details>`;
    b.querySelectorAll('[data-copy]').forEach(x=>x.onclick=async()=>{try{await navigator.clipboard.writeText(x.dataset.copy);toast('Webhook URL copied')}catch(e){askText('Webhook URL:',x.dataset.copy)}});
    b.querySelectorAll('[data-del]').forEach(x=>x.onclick=async()=>{if(!(await askConfirm('Delete this webhook? Anything using its URL will stop working.')))return;const {error}=await sb.from('webhooks').delete().eq('id',x.dataset.del);if(error)return alert(error.message);draw()});
    $('wh_add').onclick=async()=>{
      const name=$('wh_name').value.trim(),ch=$('wh_ch').value;if(!name)return alert('Give the webhook a name.');if(!ch)return alert('Pick a channel.');
      if(slurBlock(name,'That name'))return;
      const {error}=await sb.from('webhooks').insert({channel_id:String(ch),server_id:sid,name});if(error)return alert(needSql(error));draw();
    };
  };
  draw();
}

// ---------- forum channels ----------
let forumOn=null,_forumT=null;
const postTitle=m=>String(m.content||'').split('\n')[0].replace(/^\*\*|\*\*$/g,'').slice(0,120)||'(untitled)';
const postBody=m=>String(m.content||'').split('\n').slice(1).join(' ').trim();
async function renderForum(cid){
  forumOn=cid;closeThread();$('f').classList.add('hidden');
  const k=$('msgs');k.innerHTML='<div class="text-xs text-[#949ba4] p-2">Loading posts…</div>';
  const {data:posts,error}=await sb.from('messages').select('*').eq('channel_id',cid).is('reply_to',null).order('created_at',{ascending:false}).limit(60);
  if(forumOn!==cid)return;
  if(error){k.innerHTML='<p class="text-sm text-[#f23f43] p-2">'+esc(error.message)+'</p>';return}
  const list=(posts||[]).filter(p=>!blocked.has(p.sender_id));
  if(list.some(p=>!profiles[p.sender_id]))await loadProfiles();
  const reps={};
  if(list.length){
    const {data:r}=await sb.from('messages').select('reply_to,created_at').in('reply_to',list.map(p=>p.id)).order('created_at',{ascending:false}).limit(2000);
    (r||[]).forEach(x=>{const o=reps[x.reply_to]=reps[x.reply_to]||{n:0,last:x.created_at};o.n++});
  }
  if(forumOn!==cid)return;
  list.forEach(p=>{msgCache[p.id]=p;replyCount[p.id]=(reps[p.id]||{}).n||0});
  list.sort((a,b)=>new Date((reps[b.id]||b).last||b.created_at)-new Date((reps[a.id]||a).last||a.created_at));
  const can=canPostHere()&&!until(me,'muted_until');
  k.innerHTML=`<div class="forum-wrap"><div class="flex items-center justify-between mb-3"><div class="text-sm text-[#949ba4]">${list.length} post${list.length===1?'':'s'}</div>${can?'<button onclick="newForumPost()" class="bg-[#5865f2] hover:bg-[#4752c4] text-white text-sm font-semibold px-4 py-1.5 rounded-lg">New post</button>':''}</div>`+
   (list.length?list.map(p=>{
     const a=profiles[p.sender_id]||{username:'?'},r=reps[p.id];
     return `<div id="m_${p.id}" onclick="openThread('${p.id}')" class="bg-[#2b2d31] hover:bg-[#35373c] rounded-lg px-4 py-3 mb-2 cursor-pointer"><div class="font-semibold text-white break-words">${esc(postTitle(p))}</div>${postBody(p)?`<div class="text-sm text-[#b5bac1] mt-0.5 line-clamp-2 break-words">${esc(plainText(postBody(p)).slice(0,200))}</div>`:''}<div class="flex items-center gap-2 mt-2 text-xs text-[#949ba4]"><span class="flex-shrink-0">${av(a,6)}</span><span style="color:${col(a)}">${esc(dn(a))}</span><span>· ${ago(p.created_at)}</span><span class="ml-auto">💬 ${r?r.n:0}${r?' · last reply '+ago(r.last):''}</span></div></div>`;
   }).join(''):'<p class="text-sm text-[#949ba4] p-2">No posts yet. Be the first to start a discussion.</p>')+'</div>';
}
function scheduleForum(){clearTimeout(_forumT);_forumT=setTimeout(()=>{if(forumOn&&cur.type==='ch'&&cur.id===forumOn)renderForum(forumOn)},400)}
async function newForumPost(){
  const cid=cur.id;
  const ok=await _modal(false,`<div class="bc-h font-bold text-white mb-3">New post</div><input id="fp_t" maxlength="100" placeholder="Title" class="w-full bg-[#1e1f22] rounded-lg px-3 py-2 text-white text-sm outline-none mb-2"><textarea id="fp_b" rows="5" maxlength="1800" placeholder="What do you want to talk about?" class="w-full bg-[#1e1f22] rounded-lg px-3 py-2 text-white text-sm outline-none resize-none"></textarea>`+_btns,(d,done)=>{
    setTimeout(()=>d.querySelector('#fp_t').focus(),30);
    d.querySelector('[data-ok]').onclick=()=>{
      const t=d.querySelector('#fp_t').value.trim(),b=d.querySelector('#fp_b').value.trim();
      if(!t)return d.querySelector('#fp_t').focus();
      if(slurBlock(t+' '+b,'That post'))return;
      done({t,b});
    };
    d.querySelector('[data-no]').onclick=()=>done(false);
  });
  if(!ok)return;
  const {error}=await sb.from('messages').insert({channel_id:cid,content:'**'+ok.t.replace(/\*\*/g,'')+'**'+(ok.b?'\n'+ok.b:'')});
  if(error)return alert('Could not post: '+error.message);
  renderForum(cid);
}
{
  const _oc=openChannel;
  openChannel=async function(id){
    const c=channels.find(x=>x.id===id);
    forumOn=null;$('f').classList.remove('hidden');
    const r=await _oc(id);
    if(c&&c.is_forum&&cur.type==='ch'&&cur.id===id)await renderForum(id);
    return r;
  };
  const _add=add;
  add=function(m){
    if(forumOn&&cur.type==='ch'&&m.channel_id===forumOn){
      msgCache[m.id]=m;
      if(m.reply_to){threadAdd(m);replyCount[m.reply_to]=(replyCount[m.reply_to]||0)+1;updThreadBadge(m.reply_to)}
      scheduleForum();return;
    }
    return _add(m);
  };
}
