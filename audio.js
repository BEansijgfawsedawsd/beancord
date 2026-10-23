const RTC_CONFIG = {
  iceServers: [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] },
    { urls: ['stun:openrelay.metered.ca:80', 'stun:stun.stunprotocol.org:3478'] }
  ]
};

let pendingIce = [], callTimer = null;

// Production-grade audio constraints for clear voice without robotic artifacts or gating
const AUDIO_CONSTRAINTS = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    highpassFilter: true
  }
};

async function startCall(){
  if(cur.type!=='dm'||callState!=='idle')return;
  const target=cur.id;
  try{
    localStream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
  } catch(e) {
    return alert('Could not access your microphone. Check your browser\'s permission settings for this site.');
  }
  activeCallWith=target; callState='calling'; pendingIce=[];
  $('callbtn').classList.add('hidden');
  $('calltext').textContent='Calling '+dn(profiles[target])+'...'; $('callbar').classList.remove('hidden');
  setupPeerConnection(target);
  
  callCh=sb.channel(pairKey(me.id,target),{config:{presence:{key:me.id}}});
  callCh.on('broadcast',{event:'signal'},p=>handleCallSignal(p.payload));
  callCh.on('presence',{event:'sync'},async()=>{
    const others=Object.keys(callCh.presenceState()).filter(k=>k!==me.id);
    if(others.length&&(callState==='calling'||callState==='connecting')){
      makeOffer();
    }
  });
  await callCh.subscribe(async st=>{
    if(st==='SUBSCRIBED'){
      await callCh.track({t:Date.now()});
      sb.channel('ring-'+target).send({type:'broadcast',event:'signal',payload:{type:'incoming-call',from:me.id}});
    }
  });
  clearTimeout(callTimer);
  callTimer=setTimeout(()=>{if(callState!=='connected')endCall('Call failed to connect.')},20000);
}

async function makeOffer(){
  if(!pc)return;
  callState='connecting'; $('calltext').textContent='Connecting...';
  const offer=await pc.createOffer();
  await pc.setLocalDescription(offer);
  callCh.send({type:'broadcast',event:'signal',payload:{type:'offer',sdp:offer,from:me.id}});
}

async function acceptCall(){
  if(callState!=='ringing-in')return;
  const target=incomingFrom; $('ringbanner').classList.add('hidden');
  try{
    localStream = await navigator.mediaDevices.getUserMedia(AUDIO_CONSTRAINTS);
  } catch(e) {
    alert('Could not access your microphone.'); declineCall(); return;
  }
  activeCallWith=target; callState='connecting'; pendingIce=[];
  $('calltext').textContent='Connecting to '+dn(profiles[target])+'...'; $('callbar').classList.remove('hidden');
  setupPeerConnection(target);
  
  callCh=sb.channel(pairKey(me.id,target),{config:{presence:{key:me.id}}});
  callCh.on('broadcast',{event:'signal'},p=>handleCallSignal(p.payload));
  await callCh.subscribe(async st=>{
    if(st==='SUBSCRIBED'){
      await callCh.track({t:Date.now()});
      callCh.send({type:'broadcast',event:'signal',payload:{type:'joined',from:me.id}});
    }
  });
  clearTimeout(callTimer);
  callTimer=setTimeout(()=>{if(callState!=='connected')endCall('Call failed to connect.')},20000);
}

function declineCall(){
  if(incomingFrom) sb.channel('ring-'+incomingFrom).send({type:'broadcast',event:'signal',payload:{type:'declined',from:me.id}});
  $('ringbanner').classList.add('hidden'); incomingFrom=null; callState='idle';
}

function setupPeerConnection(peerId){
  if(pc){pc.close(); pc=null;}
  pc=new RTCPeerConnection(RTC_CONFIG);
  if(localStream) localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  
  pc.onicecandidate=e=>{if(e.candidate&&callCh)callCh.send({type:'broadcast',event:'signal',payload:{type:'ice',candidate:e.candidate,from:me.id}})};
  
  pc.ontrack=e=>{
    let a=$('remoteAudio');
    if(!a){
      a=document.createElement('audio');
      a.id='remoteAudio';
      a.autoplay=true;
      a.controls=false;
      document.body.appendChild(a);
    }
    if (a.srcObject !== e.streams[0]) {
      a.srcObject = e.streams[0];
    }
  };
  
  pc.onconnectionstatechange=()=>{
    if(pc.connectionState==='connected'){
      callState='connected'; clearTimeout(callTimer);
      $('calltext').textContent='In call with '+dn(profiles[peerId]);
    }else if(['failed','disconnected','closed'].includes(pc.connectionState)&&callState!=='idle'){
      endCall('Call ended.');
    }
  };
}

async function handleCallSignal(msg){
  if(!pc)return;
  if(msg.type==='joined'&&callState==='calling'){
    makeOffer();
  }else if(msg.type==='offer'){
    await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    while(pendingIce.length){const cand=pendingIce.shift(); try{await pc.addIceCandidate(cand)}catch(e){}}
    const answer=await pc.createAnswer();
    await pc.setLocalDescription(answer);
    callCh.send({type:'broadcast',event:'signal',payload:{type:'answer',sdp:answer,from:me.id}});
  }else if(msg.type==='answer'){
    await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    while(pendingIce.length){const cand=pendingIce.shift(); try{await pc.addIceCandidate(cand)}catch(e){}}
  }else if(msg.type==='ice'){
    const candidate=new RTCIceCandidate(msg.candidate);
    if(pc.remoteDescription&&pc.remoteDescription.type){
      try{await pc.addIceCandidate(candidate)}catch(e){}
    }else{
      pendingIce.push(candidate);
    }
  }else if(msg.type==='hangup'){
    endCall((profiles[msg.from]||{username:'They'}).username+' left the call.');
  }
}
