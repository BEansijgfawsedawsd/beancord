// ===== BEANCORD read receipts for DMs: shows "Seen 1:28 PM" under your last message once they have opened it. =====
// Loaded after servertools.js. Needs setup/read_receipts.sql (the dm_reads table). Turn off in Settings > Appearance.
// Turning it off also hides everyone else's receipts from you (it works both ways, like most chat apps).

const peerRead={};            // peerRead[userId] = when that person last read your DM with them
let _rrCh=null;const _rrT={};
const rrOn=()=>prefs_.rr!==false;

function sendRead(peer){
  if(!me||!rrOn())return;
  clearTimeout(_rrT[peer]);
  _rrT[peer]=setTimeout(async()=>{
    try{await sb.from('dm_reads').upsert({reader:me.id,peer,read_at:new Date().toISOString()},{onConflict:'reader,peer'})}catch(e){}
  },400);
}

function updateSeen(){
  const old=document.getElementById('seen_ind');if(old)old.remove();
  if(!me||!rrOn()||cur.type!=='dm')return;
  const t=peerRead[cur.id];if(!t)return;
  const rows=[...document.querySelectorAll('#msgs [id^="m_"]')];
  for(let i=rows.length-1;i>=0;i--){
    const m=msgCache[rows[i].id.slice(2)];if(!m)continue;
    if(m.sender_id!==me.id)return;                       // they wrote last, so a marker isn't needed
    if(new Date(t)>=new Date(m.created_at)){
      const when=new Date(t).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'});
      rows[i].insertAdjacentHTML('afterend','<div id="seen_ind" class="text-[11px] text-[#949ba4] text-right pr-1" style="margin-top:2px">Seen '+esc(when)+'</div>');
    }
    return;
  }
}

async function loadPeerRead(id){
  if(!me||!rrOn())return;
  try{
    const {data}=await sb.from('dm_reads').select('read_at').eq('reader',id).eq('peer',me.id).maybeSingle();
    peerRead[id]=data?data.read_at:null;
  }catch(e){}
  if(cur.type==='dm'&&cur.id===id)updateSeen();
}

function ensureRrChannel(){
  if(_rrCh||!me)return;
  _rrCh=sb.channel('dm_reads_'+me.id)
    .on('postgres_changes',{event:'*',schema:'public',table:'dm_reads',filter:'peer=eq.'+me.id},p=>{
      const r=p.new;if(!r||!r.reader||!rrOn())return;
      peerRead[r.reader]=r.read_at;
      if(cur.type==='dm'&&cur.id===r.reader)updateSeen();
    }).subscribe();
}

// called from Settings when the switch changes
async function rrChanged(){
  if(!rrOn()){
    for(const k in peerRead)delete peerRead[k];
    updateSeen();
    try{await sb.from('dm_reads').delete().eq('reader',me.id)}catch(e){}   // erase the receipts you already sent
  }else if(cur.type==='dm'){sendRead(cur.id);loadPeerRead(cur.id)}
}

// ---- hook into the existing chat code (no changes to app.js needed) ----
{
  const _markRead=markRead;
  markRead=function(k){_markRead(k);if(cur&&cur.type==='dm'&&cur.id===k&&_watching())sendRead(k)};
  const _openDM=openDM;
  openDM=async function(id){const r=await _openDM(id);ensureRrChannel();await loadPeerRead(id);return r};
  const _add=add;
  add=function(m){const r=_add(m);if(cur.type==='dm')updateSeen();return r};
  const _draw=draw;
  draw=function(l,s){const r=_draw(l,s);if(cur.type==='dm')updateSeen();return r};
}
