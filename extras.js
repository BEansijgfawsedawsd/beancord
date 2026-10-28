// ===== BEANCORD extras: DM edit/react, mark unread, saved messages + reminders, mentions inbox,
// ===== search filters, message links, syntax highlighting. Loaded after features.js, uses app.js globals. =====

// ---------- small shared panel (wider than the little prompt boxes) ----------
function sheet(title,html,wide){
  closeSheet();
  const d=document.createElement('div');d.id='bc_sheet';d.className='fixed inset-0 bg-black/70 z-[58] flex items-center justify-center p-4';
  d.onclick=e=>{if(e.target===d)closeSheet()};
  d.innerHTML=`<div class="bc-modal w-full ${wide?'max-w-2xl':'max-w-md'} bg-[#2b2d31] rounded-2xl max-h-[88vh] flex flex-col"><div class="flex items-center justify-between px-5 pt-4 pb-2"><h3 class="font-bold text-white">${esc(title)}</h3><button data-x class="text-[#949ba4] hover:text-white">✕</button></div><div data-body class="px-5 pb-5 overflow-y-auto">${html}</div></div>`;
  d.querySelector('[data-x]').onclick=closeSheet;bcHost().appendChild(d);return d.querySelector('[data-body]');
}
function closeSheet(){const d=$('bc_sheet');if(d)d.remove()}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('bc_sheet')&&!document.querySelector('.z-\\[60\\]')){closeSheet();e.stopPropagation()}},true);
const missingTable=e=>/relation|schema cache|does not exist|could not find/i.test((e&&e.message)||'');

// ---------- which table / kind a message lives in ----------
const tblOf=m=>!m||m.channel_id?'messages':m.group_id?'group_dm_messages':'dm_messages';
const kindOf=m=>m.channel_id?'ch':m.group_id?'group':'dm';
const msgCtx=m=>m.channel_id||m.group_id||(m.sender_id===me.id?m.recipient_id:m.sender_id);
const tblOfKind=k=>k==='ch'?'messages':k==='group'?'group_dm_messages':'dm_messages';

// ---------- DM reactions + live edits/deletes (needs setup/dm_and_saved.sql) ----------
async function loadDmRx(list,kind){
  const ids=(list||[]).map(m=>m.id);if(!ids.length)return;
  try{
    const {data,error}=await sb.from('dm_reactions').select('*').eq('kind',kind).in('message_id',ids.map(String));
    if(error)return;(data||[]).forEach(x=>{const a=rx[x.message_id]=rx[x.message_id]||[];if(!a.some(y=>y.user_id===x.user_id&&y.emoji===x.emoji))a.push(x)});
  }catch(e){}
}
function dmUpd(m){
  const old=msgCache[m.id];if(!old)return;
  msgCache[m.id]={...old,...m};
  const d=$('m_'+m.id),t=d&&d.querySelector('[data-t]');
  if(t)t.innerHTML=fmt(msgCache[m.id])+(m.edited_at?' <span class="text-[10px] text-[#949ba4]">(edited)</span>':'');
}
function dmDel(o){const e=$('m_'+o.id);if(e)e.remove()}
function dmRxEvt(p){
  const n=p.new,o=p.old,id=String((n&&n.message_id)||(o&&o.message_id)||'');if(!id)return;
  if(p.eventType==='INSERT'&&n){const a=rx[id]=rx[id]||[];if(!a.some(x=>x.user_id===n.user_id&&x.emoji===n.emoji))a.push(n)}
  else if(p.eventType==='DELETE'&&o&&o.user_id)rx[id]=(rx[id]||[]).filter(x=>!(x.user_id===o.user_id&&x.emoji===o.emoji));
  drawRx(id);
}
// DMs and group chats get the search button too
{
  const _od=openDM,_og=openGroup;
  openDM=async function(id){await _od(id);$('searchbtn').classList.remove('hidden');$('sqres').innerHTML=''};
  openGroup=async function(id){await _og(id);$('searchbtn').classList.remove('hidden');$('sqres').innerHTML=''};
}

// ---------- mark unread ----------
function markUnread(id){
  const m=msgCache[id];if(!m)return;hideCtx();
  const key=msgCtx(m);
  lastRead[key]=new Date(new Date(m.created_at)-1).toISOString();lrSave();
  if(m.channel_id){unreadCh[key]=1;const sv=chanSrv[key];if(sv)unreadSrv[sv]=Math.max(1,unreadSrv[sv]||0);if(srvId)drawChannels();drawServerNav()}
  else{unread[key]=Math.max(1,unread[key]||0);updateTot();if(!srvId)drawPeople()}
  toast('Marked as unread from that message');
}

// ---------- message links + jumping to a message ----------
function copyMsgLink(id){
  const m=msgCache[id];if(!m)return;hideCtx();
  const l=location.origin+location.pathname+'?msg='+kindOf(m)+'.'+msgCtx(m)+'.'+m.id;
  (navigator.clipboard?navigator.clipboard.writeText(l):Promise.reject()).then(()=>toast('Message link copied'),()=>askText('Message link:',l));
}
(function(){try{const c=new URLSearchParams(location.search).get('msg');if(c){sessionStorage.setItem('bc_msglink',c);history.replaceState(null,'',location.pathname)}}catch(e){}})();
async function openMsgLink(){
  let c=null;try{c=sessionStorage.getItem('bc_msglink')}catch(e){}
  if(!c)return;try{sessionStorage.removeItem('bc_msglink')}catch(e){}
  const [kind,ctx,mid]=c.split('.');if(!/^(ch|dm|group)$/.test(kind)||!ctx||!mid)return;
  for(let i=0;i<50&&!(cur.type&&(srvId?channels.length:true));i++)await new Promise(r=>setTimeout(r,200));   // wait for the first screen to finish loading
  jumpToMsg(kind,ctx,mid);
}
async function jumpToMsg(kind,ctx,mid){
  try{
    closeSheet();
    if(kind==='ch')await gotoChannel(ctx);else if(kind==='group')await gotoGroup(ctx);else await gotoDM(ctx);
    if(!$('m_'+mid)){
      const T=tblOfKind(kind);
      const base=()=>{const q=sb.from(T).select('*');return kind==='ch'?q.eq('channel_id',ctx):kind==='group'?q.eq('group_id',ctx):q.or(`sender_id.eq.${ctx},recipient_id.eq.${ctx}`)};
      const {data:t}=await base().eq('id',mid).maybeSingle();
      if(!t){toast('That message was deleted, or you cannot see it.',true);return}
      const [a,b]=await Promise.all([base().lt('created_at',t.created_at).order('created_at',{ascending:false}).limit(30),base().gte('created_at',t.created_at).order('created_at').limit(PAGE-30)]);
      const list=[...(a.data||[]).reverse(),...(b.data||[])];
      rx={};
      if(kind==='ch'){const {data:r}=await sb.from('reactions').select('*').in('message_id',list.map(x=>x.id));(r||[]).forEach(x=>(rx[x.message_id]=rx[x.message_id]||[]).push(x))}
      else await loadDmRx(list,kind);
      draw(list);
      const more=(a.data||[]).length>=30;msgMore=more;const ob=$('olderbtn');if(!more&&ob)ob.remove();else if(more&&!ob)$('msgs').insertAdjacentHTML('afterbegin',olderBtn());
    }
    const el=$('m_'+mid);if(!el){toast('Could not find that message.',true);return}
    el.scrollIntoView({block:'center'});el.classList.add('hl');setTimeout(()=>el.classList.remove('hl'),2600);
  }catch(e){console.error(e);toast('Could not open that message.',true)}
}

// ---------- saved messages + reminders ----------
let saved={};
const svKey=m=>kindOf(m)+':'+m.id;
const isSaved=id=>!!(msgCache[id]&&saved[svKey(msgCache[id])]);
const savedErr=e=>missingTable(e)?'Run setup/dm_and_saved.sql in Supabase first.':e.message;
async function loadSaved(){try{const {data,error}=await sb.from('saved_messages').select('*');if(error)return;saved={};(data||[]).forEach(r=>saved[r.kind+':'+r.message_id]=r)}catch(e){}}
async function toggleSaved(id){
  const m=msgCache[id];if(!m)return;hideCtx();const k=svKey(m);
  if(saved[k]){const {error}=await sb.from('saved_messages').delete().eq('id',saved[k].id);if(error)return alert(savedErr(error));delete saved[k];toast('Removed from saved')}
  else{const {data,error}=await sb.from('saved_messages').insert({kind:kindOf(m),message_id:String(m.id)}).select().single();if(error)return alert(savedErr(error));saved[k]=data;toast('Saved. Find it under 🔖 at the top.')}
}
async function remindMe(id){
  const m=msgCache[id];if(!m)return;hideCtx();
  const mins=await askChoice('Remind me about this message…',[['In 20 minutes',20],['In 1 hour',60],['In 3 hours',180],['Tomorrow (24 hours)',1440]]);
  if(mins===null)return;
  const at=new Date(Date.now()+mins*60000).toISOString();
  const {data,error}=await sb.from('saved_messages').upsert({user_id:me.id,kind:kindOf(m),message_id:String(m.id),remind_at:at,reminded:false},{onConflict:'user_id,kind,message_id'}).select().single();
  if(error)return alert(savedErr(error));
  saved[svKey(m)]=data;toast('Okay, I will remind you in '+(mins<60?mins+' minutes':mins===60?'an hour':mins<1440?(mins/60)+' hours':'a day'));
}
function checkReminders(){
  if(!me)return;const now=Date.now();
  Object.values(saved).forEach(async r=>{
    if(!r.remind_at||r.reminded||new Date(r.remind_at)>now)return;
    r.reminded=true;
    try{await sb.from('saved_messages').update({reminded:true}).eq('id',r.id)}catch(e){}
    let txt='a saved message';
    try{const {data}=await sb.from(tblOfKind(r.kind)).select('*').eq('id',r.message_id).maybeSingle();if(data){const p=profiles[data.sender_id]||{};txt=(p.username||'someone')+': '+plainText(data.content).slice(0,80)}}catch(e){}
    toast('⏰ Reminder — '+txt);ping();
    try{if('Notification' in window&&Notification.permission==='granted'&&document.hidden)new Notification('BEANCORD reminder',{body:txt})}catch(e){}
  });
}
function whereLabel(kind,m){
  if(!m)return '';
  if(kind==='ch'){const c=allChans.find(x=>x.id===m.channel_id),s=c&&servers.find(x=>x.id===c.server_id);return c?'#'+c.name+(s?' · '+s.name:''):'a channel'}
  if(kind==='group'){const g=groups.find(x=>x.id===m.group_id);return '👥 '+(g?g.name:'group chat')}
  return 'DM with '+dn(profiles[msgCtx(m)]||{username:'?'});
}
function msgRowHtml(kind,m,extra){
  const p=profiles[m.sender_id]||{username:'?'};
  return `<div class="bg-[#1e1f22] rounded-lg px-3 py-2"><div class="flex items-center gap-2 text-xs"><b style="color:${col(p)}">${esc(dn(p))}</b><span class="text-[#949ba4] truncate">${esc(whereLabel(kind,m))}</span><span class="text-[#80848e] ml-auto flex-shrink-0">${new Date(m.created_at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</span></div><div class="text-sm text-[#dbdee1] mt-1 break-words">${esc(plainText(m.content).slice(0,300))||'<i class="text-[#949ba4]">attachment</i>'}</div><div class="flex gap-3 mt-1.5 text-xs"><button data-jump="${kind}|${esc(msgCtx(m))}|${esc(m.id)}" class="text-[#5865f2] hover:underline">Jump to message</button>${extra||''}</div></div>`;
}
async function openSaved(){
  const body=sheet('Saved messages & reminders','<div class="text-xs text-[#949ba4]">Loading…</div>',true);
  await loadSaved();
  const rows=Object.values(saved).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  if(!rows.length){body.innerHTML='<p class="text-sm text-[#949ba4]">Nothing saved yet. Right-click (or long-press) any message and choose <b>Save message</b> or <b>Remind me…</b></p>';return}
  const by={ch:[],dm:[],group:[]};rows.forEach(r=>by[r.kind]&&by[r.kind].push(r.message_id));
  const got={};
  await Promise.all(Object.entries(by).filter(([,v])=>v.length).map(async([k,ids])=>{const {data}=await sb.from(tblOfKind(k)).select('*').in('id',ids);(data||[]).forEach(m=>{got[k+':'+m.id]=m})}));
  if(!$('bc_sheet'))return;
  body.innerHTML='<div class="space-y-2">'+rows.map(r=>{
    const m=got[r.kind+':'+r.message_id];
    const rem=r.remind_at&&!r.reminded?`<span class="text-[#f0b232]">⏰ ${new Date(r.remind_at).toLocaleString([],{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</span>`:'';
    const rm=`<button data-rm="${esc(r.id)}" class="text-[#f23f43] hover:underline">Remove</button>`;
    return m?msgRowHtml(r.kind,m,rem+' '+rm):`<div class="bg-[#1e1f22] rounded-lg px-3 py-2 text-sm text-[#949ba4]">That message was deleted or is no longer visible to you. ${rm}</div>`;
  }).join('')+'</div>';
  body.onclick=async e=>{
    const j=e.target.closest('[data-jump]');if(j){const [k,c,i]=j.dataset.jump.split('|');return jumpToMsg(k,c,i)}
    const r=e.target.closest('[data-rm]');if(r){const {error}=await sb.from('saved_messages').delete().eq('id',r.dataset.rm);if(error)return alert(error.message);openSaved()}
  };
}

// ---------- mentions inbox ----------
async function openMentions(){
  const body=sheet('Mentions','<div class="text-xs text-[#949ba4]">Loading…</div>',true);
  const u=me.username.replace(/[^A-Za-z0-9_]/g,'');
  const {data,error}=await sb.from('messages').select('*').neq('sender_id',me.id)
    .or(`content.ilike.%@${u}%,content.ilike.%@everyone%,content.ilike.%@here%`).order('created_at',{ascending:false}).limit(80);
  if(error){body.innerHTML='<p class="text-sm text-[#f23f43]">'+esc(error.message)+'</p>';return}
  if(!data.every(m=>profiles[m.sender_id]))await loadProfiles();
  const list=data.filter(m=>!blocked.has(m.sender_id)&&mentionsMe(m)).slice(0,40);
  if(!$('bc_sheet'))return;
  body.innerHTML=list.length?'<div class="space-y-2">'+list.map(m=>msgRowHtml('ch',m)).join('')+'</div>':'<p class="text-sm text-[#949ba4]">Nobody has mentioned you recently.</p>';
  body.onclick=e=>{const j=e.target.closest('[data-jump]');if(j){const [k,c,i]=j.dataset.jump.split('|');jumpToMsg(k,c,i)}};
}

// ---------- search with filters ----------
const SEARCH_HELP='<p class="text-xs text-[#949ba4]">Filters: <code>from:name</code> <code>in:#channel</code> <code>in:server</code> <code>has:image</code> <code>has:file</code> <code>has:link</code> <code>before:2026-01-31</code> <code>after:2026-01-01</code></p>';
function parseSearch(q){
  const f={from:null,in:null,has:[],before:null,after:null,text:''},words=[];
  (q.match(/"[^"]*"|\S+/g)||[]).forEach(t=>{
    const m=t.match(/^(from|in|has|before|after):(.+)$/i);
    if(!m){words.push(t.replace(/^"|"$/g,''));return}
    const k=m[1].toLowerCase(),v=m[2].replace(/^"|"$/g,'');
    if(k==='from')f.from=v.replace(/^@/,'');else if(k==='in')f.in=v.replace(/^#/,'');else if(k==='has')f.has.push(v.toLowerCase());else f[k]=v;
  });
  f.text=words.join(' ').trim();return f;
}
async function doSearch(){
  const raw=$('sq').value.trim(),box=$('sqres');
  const bad=t=>{box.innerHTML='<p class="text-xs text-[#f23f43]">'+esc(t)+'</p>'};
  if(!raw){box.innerHTML=SEARCH_HELP;return}
  const f=parseSearch(raw);
  if(f.text.length<2&&!f.from&&!f.has.length&&!f.in&&!f.before&&!f.after){box.innerHTML='<p class="text-xs text-[#949ba4]">Type at least 2 characters, or add a filter like <code>from:name</code>.</p>'+SEARCH_HELP;return}
  let q,kind=cur.type,multi=false;
  if(kind==='ch'){
    let scope=[cur.id];
    if(f.in){
      if(/^(server|all)$/i.test(f.in)){scope=channels.filter(c=>!c.is_voice).map(c=>c.id);multi=true}
      else{const c=channels.find(x=>x.name===f.in.toLowerCase());if(!c)return bad('There is no channel called #'+f.in+' in this server.');scope=[c.id]}
    }
    q=sb.from('messages').select('*').in('channel_id',scope);
  }else if(kind==='group')q=sb.from('group_dm_messages').select('*').eq('group_id',cur.id);
  else if(kind==='dm')q=sb.from('dm_messages').select('*').or(`sender_id.eq.${cur.id},recipient_id.eq.${cur.id}`);
  else return;
  if(f.from){const n=f.from.toLowerCase();const p=Object.values(profiles).find(x=>x.username===n||(x.nickname||'').toLowerCase()===n);if(!p)return bad('Nobody is called "'+f.from+'".');q=q.eq('sender_id',p.id)}
  for(const h of f.has){
    if(h==='image'||h==='img'||h==='photo')q=q.not('image_url','is',null);
    else if(h==='file')q=q.not('file_url','is',null);
    else if(h==='link'||h==='url')q=q.ilike('content','%http%');
    else return bad('has:'+h+' is not a filter. Use image, file or link.');
  }
  const day=/^\d{4}-\d{2}-\d{2}$/;
  if(f.before){if(!day.test(f.before))return bad('before: needs a date like 2026-01-31');q=q.lt('created_at',f.before)}
  if(f.after){if(!day.test(f.after))return bad('after: needs a date like 2026-01-31');q=q.gt('created_at',f.after+'T23:59:59.999')}
  if(f.text)q=q.ilike('content','%'+f.text.replace(/[\\%_]/g,'\\$&')+'%');
  const {data,error}=await q.order('created_at',{ascending:false}).limit(40);
  if(error)return bad(error.message);
  if(!data.every(m=>profiles[m.sender_id]))await loadProfiles();
  box.innerHTML=data.length?data.map(m=>{
    const p=profiles[m.sender_id]||{username:'?'},c=multi?allChans.find(x=>x.id===m.channel_id):null;
    return `<div data-jump="${kind}|${esc(msgCtx(m))}|${esc(m.id)}" class="p-2 rounded bg-[#2b2d31] cursor-pointer hover:bg-[#35373c]"><b style="color:${col(p)}">${esc(dn(p))}</b> ${c?`<span class="text-[10px] text-[#80848e]">#${esc(c.name)}</span> `:''}<span class="text-[10px] text-[#949ba4]">${new Date(m.created_at).toLocaleString()}</span><p>${esc(plainText(m.content)||(m.image_url?'🖼 image':m.file_url?'📄 file':''))}</p></div>`;
  }).join(''):'<p class="text-xs text-[#949ba4]">No matches.</p>';
  box.onclick=e=>{const j=e.target.closest('[data-jump]');if(j){const [k,c,i]=j.dataset.jump.split('|');jumpToMsg(k,c,i)}};
}

// ---------- syntax highlighting inside ``` code blocks ----------
const HL_ALIAS={js:'js',javascript:'js',ts:'js',typescript:'js',jsx:'js',tsx:'js',node:'js',py:'py',python:'py',c:'c',cpp:'c','c++':'c',cs:'c',csharp:'c',java:'c',go:'c',rust:'c',rs:'c',kotlin:'c',swift:'c',php:'c',sql:'sql',sh:'sh',bash:'sh',shell:'sh',zsh:'sh',json:'json',html:'html',xml:'html',css:'css',scss:'css'};
const HL_KW={
  js:'break case catch class const continue debugger default delete do else export extends finally for function if import in instanceof let new of return super switch this throw try typeof var void while with yield async await static get set null undefined true false NaN interface type enum implements',
  py:'and as assert async await break class continue def del elif else except finally for from global if import in is lambda None nonlocal not or pass raise return try while with yield True False self',
  c:'auto break case char class const continue default do double else enum extern float for goto if inline int long namespace new private protected public register return short signed sizeof static struct switch template this throw try typedef union unsigned using virtual void volatile while bool true false null nullptr final override package import interface implements extends abstract synchronized boolean byte instanceof throws fn let mut pub impl use mod match trait where loop move ref func go chan defer select var type range string',
  sql:'select from where and or not insert into values update set delete create table alter drop index join left right inner outer on group by order having limit offset as distinct union all null is in like between case when then else end primary key foreign references default unique count sum avg min max SELECT FROM WHERE AND OR NOT INSERT INTO VALUES UPDATE SET DELETE CREATE TABLE ALTER DROP INDEX JOIN LEFT RIGHT INNER OUTER ON GROUP BY ORDER HAVING LIMIT OFFSET AS DISTINCT UNION ALL NULL IS IN LIKE BETWEEN CASE WHEN THEN ELSE END PRIMARY KEY FOREIGN REFERENCES DEFAULT UNIQUE',
  sh:'if then else elif fi for while do done case esac function in echo cd ls export return exit sudo apt npm git',
  json:'true false null',css:'',html:''
};
const _unesc=s=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#0?39;/g,"'").replace(/&amp;/g,'&');
function hlCode(raw,lang){
  const L=HL_ALIAS[lang];if(!L||raw.length>8000)return esc(raw);
  const sp=(c,t)=>`<span class="tk-${c}">${esc(t)}</span>`;
  let re;
  if(L==='html')re=/(<!--[\s\S]*?-->)|(<\/?[A-Za-z][^>]*>)/g;
  else{
    const cm=L==='py'||L==='sh'?'#[^\\n]*':L==='sql'?'--[^\\n]*':L==='css'?'\\/\\*[\\s\\S]*?\\*\\/':'\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/';
    re=new RegExp('('+cm+')|("(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\])*`)|(\\b\\d+(?:\\.\\d+)?\\b)|([A-Za-z_$][\\w$]*)(\\s*\\()?','g');
  }
  const kw=new Set((HL_KW[L]||'').split(' ')),html=L==='html';
  let out='',last=0,m;
  while((m=re.exec(raw))){
    out+=esc(raw.slice(last,m.index));
    if(m[1]!==undefined)out+=sp('c',m[0]);
    else if(html)out+=sp('k',m[0]);
    else if(m[2]!==undefined)out+=sp('s',m[0]);
    else if(m[3]!==undefined)out+=sp('n',m[0]);
    else if(kw.has(m[4]))out+=sp('k',m[4])+esc(m[5]||'');
    else if(m[5])out+=sp('f',m[4])+esc(m[5]);
    else out+=esc(m[0]);
    last=re.lastIndex;if(m[0]==='')re.lastIndex++;
  }
  return out+esc(raw.slice(last));
}
// c arrives already HTML-escaped (md() runs after esc())
function codeBlock(c){
  let body=c,lang='';
  const m=c.match(/^([A-Za-z0-9+#_-]{1,12})\n/);
  if(m&&HL_ALIAS[m[1].toLowerCase()]){lang=m[1].toLowerCase();body=c.slice(m[0].length)}
  body=body.replace(/\n$/,'');
  return `<code class="block bg-[#1e1f22] rounded p-2 my-1 text-xs overflow-x-auto" style="white-space:pre"${lang?` data-lang="${lang}"`:''}>${lang?hlCode(_unesc(body),lang):body}</code>`;
}

// ---------- extra items in the message right-click menu ----------
{
  const base=msgExtraMenu;
  msgExtraMenu=function(id){
    const m=msgCache[id];if(!m)return '';
    return base(id)+sep+mi('🔖',isSaved(id)?'Remove from saved':'Save message',`toggleSaved('${id}')`)+mi('⏰','Remind me…',`remindMe('${id}')`)+mi('◐','Mark unread',`markUnread('${id}')`)+mi('🔗','Copy message link',`copyMsgLink('${id}')`);
  };
}

async function initExtras(){
  try{$('sq').placeholder='Search… try from:name  has:image  in:#channel'}catch(e){}
  await loadSaved();
  setInterval(checkReminders,30000);setTimeout(checkReminders,3000);
  openMsgLink();
}

