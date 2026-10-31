// ===== BEANCORD settings: User Settings page (tabs), voice/video devices, light mode, compact mode,
// ===== font size, keyboard shortcuts, channel navigation keys, install prompt. Loaded after extras.js. =====

// ---------- preferences (kept in this browser) ----------
const PREF_DEF={mode:'dark',compact:false,font:16,sound:true,linkPrev:true,mic:'',spk:'',cam:'',ns:true,ec:true,agc:true,share:'sharp'};
let prefs_=Object.assign({},PREF_DEF,LS.get('bc_prefs',{}));
function setPref(k,v){prefs_[k]=v;LS.set('bc_prefs',prefs_);applyPrefs()}
function applyPrefs(){
  const r=document.documentElement;
  r.dataset.mode=prefs_.mode==='light'?'light':'dark';
  r.classList.toggle('compact',!!prefs_.compact);
  r.style.setProperty('--bc-chat',(+prefs_.font||16)+'px');
}
applyPrefs();

// ---------- microphone / camera / speaker choices ----------
function audioConstraints(){
  const a={noiseSuppression:!!prefs_.ns,echoCancellation:!!prefs_.ec,autoGainControl:!!prefs_.agc};
  if(prefs_.mic)a.deviceId={ideal:prefs_.mic};
  return a;
}
function videoConstraints(){return prefs_.cam?{deviceId:{ideal:prefs_.cam}}:true}
// every existing getUserMedia({audio:true}) in the call code now uses the saved device and processing choices
(function(){
  const md=navigator.mediaDevices;if(!md||!md.getUserMedia)return;
  const g=md.getUserMedia.bind(md);
  md.getUserMedia=function(c){c=Object.assign({},c);if(c.audio===true)c.audio=audioConstraints();if(c.video===true&&prefs_.cam)c.video=videoConstraints();return g(c)};
})();
function applySink(){
  if(!prefs_.spk)return;
  document.querySelectorAll('audio').forEach(a=>{if(a.setSinkId&&a.sinkId!==prefs_.spk)a.setSinkId(prefs_.spk).catch(()=>{})});
}
{const _av=applyVol;applyVol=function(id){_av(id);applySink()}}

// ---------- the settings window ----------
const ST_TABS=[['account','My Account'],['look','Appearance'],['notif','Notifications'],['voice','Voice & Video'],['keys','Keybinds']];
let stTab='account',_micTest=null;
function openSettings(tab){
  if(!me)return;closeSettings();stTab=tab||stTab;
  const d=document.createElement('div');d.id='bc_settings';d.className='fixed inset-0 z-[57] bg-[#313338] flex flex-col md:flex-row';
  d.innerHTML=`<nav class="md:w-56 flex-shrink-0 bg-[#2b2d31] p-3 flex items-center md:items-stretch md:flex-col gap-1 overflow-x-auto">
    <div class="hidden md:block text-[11px] font-bold uppercase text-[#949ba4] px-2 pb-1">User settings</div>
    ${ST_TABS.map(([k,l])=>`<button data-tab="${k}" class="whitespace-nowrap text-left px-3 py-1.5 rounded-md text-sm"></button>`).join('')}
    <div class="order-first md:order-none md:mt-auto flex md:flex-col gap-1 sticky left-0"><button data-x title="Close" class="text-left px-3 py-1.5 rounded-md text-sm text-[#949ba4] hover:bg-[#35373c] hover:text-white">✕<span class="hidden md:inline"> Close (Esc)</span></button></div></nav>
    <main class="flex-1 overflow-y-auto"><div id="st_body" class="max-w-2xl mx-auto p-5 md:p-10"></div></main>`;
  d.onclick=e=>{const t=e.target.closest('[data-tab]');if(t){stTab=t.dataset.tab;drawSettings()}else if(e.target.closest('[data-x]'))closeSettings()};
  bcHost().appendChild(d);drawSettings();
}
function closeSettings(){stopMicTest();const d=$('bc_settings');if(d)d.remove()}
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&$('bc_settings')&&!$('bc_sheet')&&!document.querySelector('.z-\\[60\\]')){closeSettings();e.stopPropagation()}},true);
function drawSettings(){
  const d=$('bc_settings');if(!d)return;stopMicTest();
  d.querySelectorAll('[data-tab]').forEach(b=>{const k=b.dataset.tab;b.textContent=ST_TABS.find(t=>t[0]===k)[1];b.className='whitespace-nowrap text-left px-3 py-1.5 rounded-md text-sm '+(k===stTab?'bg-[#404249] text-white':'text-[#b5bac1] hover:bg-[#35373c]')});
  const el=$('st_body');el.innerHTML='';
  ({account:stAccount,look:stLook,notif:stNotif,voice:stVoice,keys:stKeys})[stTab](el);
}
const stH=t=>`<h2 class="text-xl font-bold text-white mb-5">${t}</h2>`;
const stSec=t=>`<div class="text-[11px] font-bold uppercase tracking-wide text-[#949ba4] mt-7 mb-2">${t}</div>`;
const stRow=(label,sub,ctl)=>`<div class="flex items-center justify-between gap-4 py-2.5"><div class="min-w-0"><div class="text-sm text-white">${label}</div>${sub?`<div class="text-xs text-[#949ba4]">${sub}</div>`:''}</div><div class="flex-shrink-0">${ctl}</div></div>`;
const stSwitch=(id,on)=>`<button data-sw="${id}" role="switch" aria-checked="${!!on}" class="w-10 h-6 rounded-full relative transition-colors ${on?'bg-[#23a55a]':'bg-[#4e5058]'}"><span class="absolute top-0.5 ${on?'left-[1.125rem]':'left-0.5'} w-5 h-5 rounded-full bg-white transition-all"></span></button>`;
const stSel='bg-[#1e1f22] rounded-lg px-3 py-2 text-white text-sm outline-none max-w-[16rem] w-full';
function wireSwitches(el,onChange){el.querySelectorAll('[data-sw]').forEach(b=>b.onclick=()=>{const k=b.dataset.sw;onChange(k,!prefs_[k])})}
const stBtn=(id,t,cls)=>`<button id="${id}" class="${cls||'bg-[#4e5058] hover:bg-[#5d6068]'} text-white text-sm px-4 py-2 rounded-lg">${t}</button>`;

// -- My Account
async function stAccount(el){
  el.innerHTML=stH('My Account')+`<div class="bg-[#2b2d31] rounded-xl p-5 flex items-center gap-4"><span class="flex-shrink-0">${av(me,16)}</span><div class="min-w-0"><div class="text-lg font-bold text-white truncate">${esc(dn(me))}</div><div class="text-sm text-[#949ba4]">@${esc(me.username)}</div></div><div class="ml-auto">${stBtn('st_prof','Edit profile','bg-[#5865f2] hover:bg-[#4752c4]')}</div></div>
   ${stSec('Account')}<div id="st_acc" class="bg-[#2b2d31] rounded-xl px-5 py-2 divide-y divide-[#3f4147]"><div class="py-3 text-sm text-[#949ba4]">Loading…</div></div>
   ${stSec('App')}<div class="bg-[#2b2d31] rounded-xl px-5 py-2">${stRow('Install BEANCORD','Open it in its own window, like an app.',stBtn('st_inst','Install'))}</div>
   ${stSec('Session')}<div>${stBtn('st_out','Log out','bg-[#f23f43] hover:bg-[#d7373b]')}</div>`;
  $('st_prof').onclick=()=>{closeSettings();openProfile()};
  $('st_out').onclick=()=>logout();
  $('st_inst').onclick=installApp;
  let email='',created='';
  try{const {data:{user}}=await sb.auth.getUser();email=(user&&user.email)||'';created=user&&user.created_at?new Date(user.created_at).toLocaleDateString([],{year:'numeric',month:'long',day:'numeric'}):''}catch(e){}
  const acc=$('st_acc');if(acc)acc.innerHTML=[['Username','@'+esc(me.username)],['Email',esc(email)||'—'],['Member since',esc(created)||'—'],['Your ID',`<code class="text-xs">${esc(me.id)}</code>`]].map(([a,b])=>`<div class="flex justify-between gap-4 py-3 text-sm"><span class="text-[#949ba4]">${a}</span><span class="text-white text-right break-all">${b}</span></div>`).join('');
}

// -- Appearance
function stLook(el){
  el.innerHTML=stH('Appearance')+`<div class="bg-[#2b2d31] rounded-xl px-5 py-2 divide-y divide-[#3f4147]">
    ${stRow('Brightness','Dark is the default.',`<select id="st_mode" class="${stSel}"><option value="dark">Dark</option><option value="light">Light</option></select>`)}
    ${stRow('Message spacing','Compact packs more messages on screen.',`<select id="st_dens" class="${stSel}"><option value="0">Cozy</option><option value="1">Compact</option></select>`)}
    ${stRow('Chat font size',`<span id="st_fsv">${prefs_.font}px</span>`,`<input id="st_font" type="range" min="12" max="20" step="1" value="${prefs_.font}" class="w-40">`)}
    ${stRow('Link previews','Show a small card under links. Turning this off also stops your browser asking the link-preview service.',stSwitch('linkPrev',prefs_.linkPrev))}
   </div>
   ${stSec('Preview')}<div class="bg-[#313338] border border-[#3f4147] rounded-xl p-4"><div class="flex gap-3">${av(me,9)}<div><span class="font-bold text-sm" style="color:${col(me)}">${esc(dn(me))}</span> <span class="text-[10px] text-[#949ba4]">Today</span><p class="text-sm" style="font-size:var(--bc-chat,14px)!important">This is how your messages will look. 🫘</p></div></div></div>`;
  $('st_mode').value=prefs_.mode;$('st_dens').value=prefs_.compact?'1':'0';
  $('st_mode').onchange=e=>setPref('mode',e.target.value);
  $('st_dens').onchange=e=>setPref('compact',e.target.value==='1');
  $('st_font').oninput=e=>{setPref('font',+e.target.value);$('st_fsv').textContent=e.target.value+'px'};
  wireSwitches(el,(k,v)=>{setPref(k,v);stLook(el)});
}

// -- Notifications
function stNotif(el){
  el.innerHTML=stH('Notifications')+`<div class="bg-[#2b2d31] rounded-xl px-5 py-2 divide-y divide-[#3f4147]">
    ${stRow('Notification sounds','The ping for DMs and @mentions. Do Not Disturb always silences it.',stSwitch('sound',prefs_.sound))}
    ${stRow('Alerts when BEANCORD is closed','Browser push notifications. Same as the Alerts button; press again to turn off.',stBtn('st_push','Turn on / off'))}
    ${stRow('Muted channels & servers','Right-click a channel or server icon to mute it.','')}
   </div>
   <p class="text-xs text-[#949ba4] mt-4">Status (Online / Idle / Do Not Disturb / Invisible) is set by clicking your name at the bottom of the channel list.</p>`;
  $('st_push').onclick=()=>togglePush();
  wireSwitches(el,(k,v)=>{setPref(k,v);stNotif(el)});
}

// -- Voice & Video
function stopMicTest(){
  if(!_micTest)return;
  try{cancelAnimationFrame(_micTest.raf);_micTest.stream.getTracks().forEach(t=>t.stop());_micTest.ctx.close()}catch(e){}
  _micTest=null;const b=$('st_test');if(b)b.textContent='Test microphone';const m=$('st_meter');if(m)m.style.width='0%';
}
async function micTest(){
  if(_micTest)return stopMicTest();
  let stream;try{stream=await navigator.mediaDevices.getUserMedia({audio:true})}catch(e){return alert('Could not use the microphone: '+e.message)}
  const ctx=new (window.AudioContext||window.webkitAudioContext)(),an=ctx.createAnalyser();an.fftSize=512;
  ctx.createMediaStreamSource(stream).connect(an);const buf=new Uint8Array(an.fftSize);
  _micTest={stream,ctx,raf:0};$('st_test').textContent='Stop test';
  const loop=()=>{if(!_micTest)return;an.getByteTimeDomainData(buf);let s=0;for(const v of buf){const x=(v-128)/128;s+=x*x}const lvl=Math.min(100,Math.sqrt(s/buf.length)*320);const m=$('st_meter');if(m)m.style.width=lvl+'%';_micTest.raf=requestAnimationFrame(loop)};
  loop();
}
async function stVoice(el){
  let devs=[];try{devs=await navigator.mediaDevices.enumerateDevices()}catch(e){}
  const named=devs.some(d=>d.label);
  const opts=(kind,cur,fallback)=>{const l=devs.filter(d=>d.kind===kind);return `<option value="">System default</option>`+l.map((d,i)=>`<option value="${esc(d.deviceId)}" ${d.deviceId===cur?'selected':''}>${esc(d.label||fallback+' '+(i+1))}</option>`).join('')};
  const canSink='setSinkId' in HTMLMediaElement.prototype;
  el.innerHTML=stH('Voice & Video')+(named?'':`<div class="bg-[#2b2d31] rounded-xl p-4 mb-5 text-sm text-[#dbdee1]">Your browser hides device names until you allow the microphone once. ${stBtn('st_allow','Allow microphone','bg-[#5865f2] hover:bg-[#4752c4] ml-2')}</div>`)+
   `<div class="bg-[#2b2d31] rounded-xl px-5 py-2 divide-y divide-[#3f4147]">
    ${stRow('Microphone','',`<select id="st_mic" class="${stSel}">${opts('audioinput',prefs_.mic,'Microphone')}</select>`)}
    ${stRow('Speaker / headphones',canSink?'':'Your browser picks the output; Chrome and Edge let you choose.',canSink?`<select id="st_spk" class="${stSel}">${opts('audiooutput',prefs_.spk,'Speaker')}</select>`:'')}
    ${stRow('Camera','Used when you start a video call.',`<select id="st_cam" class="${stSel}">${opts('videoinput',prefs_.cam,'Camera')}</select>`)}
   </div>
   ${stSec('Screen sharing')}<div class="bg-[#2b2d31] rounded-xl px-5 py-2">${stRow('Quality','Sharp keeps text and detail crisp at about 30 fps. Smooth favours games at up to 60 fps but can blur when the connection is slow.',`<select id="st_share" class="${stSel}"><option value="sharp"${prefs_.share!=='smooth'?' selected':''}>Sharp (30 fps)</option><option value="smooth"${prefs_.share==='smooth'?' selected':''}>Smooth (60 fps)</option></select>`)}</div>
   ${stSec('Audio processing')}<div class="bg-[#2b2d31] rounded-xl px-5 py-2 divide-y divide-[#3f4147]">
    ${stRow('Noise suppression','Cuts keyboard clicks and background hum.',stSwitch('ns',prefs_.ns))}
    ${stRow('Echo cancellation','Stops people hearing themselves when you use speakers.',stSwitch('ec',prefs_.ec))}
    ${stRow('Automatic gain','Evens out how loud you are.',stSwitch('agc',prefs_.agc))}
   </div>
   ${stSec('Check your microphone')}<div class="bg-[#2b2d31] rounded-xl p-5"><div class="h-3 rounded-full bg-[#1e1f22] overflow-hidden"><div id="st_meter" class="h-full bg-[#23a55a]" style="width:0%"></div></div><div class="mt-3 flex items-center gap-3">${stBtn('st_test','Test microphone')}<span class="text-xs text-[#949ba4]">Speak — the bar should move. Changes apply to your next call.</span></div></div>`;
  const al=$('st_allow');if(al)al.onclick=async()=>{try{const s=await navigator.mediaDevices.getUserMedia({audio:true});s.getTracks().forEach(t=>t.stop())}catch(e){alert('Microphone blocked: '+e.message)}stVoice(el)};
  $('st_mic').onchange=e=>setPref('mic',e.target.value);
  if($('st_spk'))$('st_spk').onchange=e=>{setPref('spk',e.target.value);applySink()};
  $('st_cam').onchange=e=>setPref('cam',e.target.value);
  $('st_share').onchange=e=>setPref('share',e.target.value);
  $('st_test').onclick=micTest;
  wireSwitches(el,(k,v)=>{setPref(k,v);stopMicTest();stVoice(el)});
}

// -- Keybinds
const SHORTCUTS=[['Ctrl + K','Quick switcher: jump to any channel or person'],['Ctrl + /','Show this list of shortcuts'],['Ctrl + ,','Open user settings'],['Alt + ↑ / Alt + ↓','Previous / next channel'],['Alt + Shift + ↓','Next channel with unread messages'],['↑ in an empty box','Edit your last message'],['Enter','Send the message'],['Shift + Enter','New line'],['Esc','Close menus and windows, cancel an edit'],['Tab','Complete an @mention or :emoji:']];
const keyName=c=>String(c||'').replace('Key','').replace('Digit','').replace('Backquote','`');
function stKeys(el){
  el.innerHTML=stH('Keybinds')+`<div class="bg-[#2b2d31] rounded-xl px-5 py-2 divide-y divide-[#3f4147]">
    ${stRow('Push to talk',ptt.on?'On — hold the key to speak.':'Off — your mic stays open while unmuted.',stBtn('st_ptt',ptt.on?'Turn off':'Turn on'))}
    ${stRow('Push-to-talk key','Click, then press the key you want.',`<span class="text-sm text-white mr-3"><kbd class="kbd">${esc(keyName(ptt.key))}</kbd></span>${stBtn('st_pkey','Change')}`)}
   </div>`+stSec('All shortcuts')+`<div class="bg-[#2b2d31] rounded-xl px-5 py-2 divide-y divide-[#3f4147]">${SHORTCUTS.map(([k,d])=>`<div class="flex justify-between gap-4 py-2.5 text-sm"><span class="text-[#dbdee1]">${esc(d)}</span><span class="flex-shrink-0">${k.split(' ').map(x=>/^[+/]$/.test(x)?`<span class="text-[#949ba4] mx-1">${x}</span>`:`<kbd class="kbd">${esc(x)}</kbd>`).join('')}</span></div>`).join('')}</div>`;
  $('st_ptt').onclick=()=>{togglePtt();stKeys(el)};
  $('st_pkey').onclick=async()=>{await pttSetKey();stKeys(el)};
}
function openShortcuts(){
  const body=sheet('Keyboard shortcuts',`<div class="divide-y divide-[#3f4147]">${SHORTCUTS.map(([k,d])=>`<div class="flex justify-between gap-4 py-2 text-sm"><span class="text-[#dbdee1]">${esc(d)}</span><span class="flex-shrink-0">${k.split(' ').map(x=>/^[+/]$/.test(x)?`<span class="text-[#949ba4] mx-1">${x}</span>`:`<kbd class="kbd">${esc(x)}</kbd>`).join('')}</span></div>`).join('')}</div>`);
  return body;
}

// ---------- shortcuts ----------
function navChannel(dir,unreadOnly){
  if(!srvId||!channels.length)return;
  const seen={},keys=[];channels.forEach(c=>{if(c.is_voice)return;const k=c.category||'';if(!(k in seen)){seen[k]=[];keys.push(k)}seen[k].push(c)});
  const list=keys.flatMap(k=>seen[k]);if(!list.length)return;
  let i=list.findIndex(c=>c.id===cur.id);
  for(let n=0;n<list.length;n++){
    i=(i+dir+list.length)%list.length;
    if(!unreadOnly||unreadCh[list[i].id]){openChannel(list[i].id);return}
  }
}
document.addEventListener('keydown',e=>{
  if(!me)return;const mod=e.ctrlKey||e.metaKey;
  if(mod&&e.key==='/'){e.preventDefault();$('bc_sheet')?closeSheet():openShortcuts();return}
  if(mod&&e.key===','){e.preventDefault();$('bc_settings')?closeSettings():openSettings();return}
  if(e.altKey&&!mod&&(e.key==='ArrowUp'||e.key==='ArrowDown')){e.preventDefault();navChannel(e.key==='ArrowDown'?1:-1,e.shiftKey)}
});

// ---------- install as an app ----------
let _bip=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();_bip=e});
window.addEventListener('appinstalled',()=>{_bip=null;toast('BEANCORD installed')});
async function installApp(){
  if(window.matchMedia&&matchMedia('(display-mode: standalone)').matches)return toast('You are already using the installed app.');
  if(_bip){const p=_bip;_bip=null;p.prompt();try{await p.userChoice}catch(e){}return}
  askConfirm('Your browser did not offer a one-click install.\n\nChrome / Edge: open the browser menu (⋮) and choose "Install BEANCORD" or "Cast, save and share → Install page as app".\niPhone / iPad (Safari): tap Share, then "Add to Home Screen".\n\nPress OK to close.');
}
