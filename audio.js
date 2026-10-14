async function startCall(){
  if(cur.type!=='dm'||callState!=='idle')return;
  const target=cur.id;
  try{
    // Fix: Explicitly optimize audio constraints to prevent browser noise suppression from cutting out voices
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
  } catch(e) {
    return alert('Could not access your microphone. Check your browser\'s permission settings for this site.');
  }
  activeCallWith=target;callState='calling';
  $('callbtn').classList.add('hidden');
  $('calltext').textContent='Calling '+dn(profiles[target])+'...';$('callbar').classList.remove('hidden');
  setupPeerConnection(target);
  callCh=sb.channel(pairKey(me.id,target),{config:{presence:{key:me.id}}});
  callCh.on('broadcast',{event:'signal'},p=>handleCallSignal(p.payload));
  callCh.on('presence',{event:'sync'},async()=>{
    const others=Object.keys(callCh.presenceState()).filter(k=>k!==me.id);
    if(others.length&&callState==='calling'){
      callState='connecting';$('calltext').textContent='Connecting...';
      const offer=await pc.createOffer();await pc.setLocalDescription(offer);
      callCh.send({type:'broadcast',event:'signal',payload:{type:'offer',sdp:offer,from:me.id}});
    }
  });
  await callCh.subscribe(async st=>{
    if(st==='SUBSCRIBED'){
      await callCh.track({t:Date.now()});
      sb.channel('ring-'+target).send({type:'broadcast',event:'signal',payload:{type:'incoming-call',from:me.id}});
    }
  });
}

async function acceptCall(){
  if(callState!=='ringing-in')return;
  const target=incomingFrom;$('ringbanner').classList.add('hidden');
  try{
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
  } catch(e) {
    alert('Could not access your microphone.');declineCall();return;
  }
  activeCallWith=target;callState='connecting';
  $('calltext').textContent='Connecting to '+dn(profiles[target])+'...';$('callbar').classList.remove('hidden');
  setupPeerConnection(target);
  callCh=sb.channel(pairKey(me.id,target),{config:{presence:{key:me.id}}});
  callCh.on('broadcast',{event:'signal'},p=>handleCallSignal(p.payload));
  await callCh.subscribe(async st=>{if(st==='SUBSCRIBED')await callCh.track({t:Date.now()})});
}

function setupPeerConnection(peerId){
  pc=new RTCPeerConnection(RTC_CONFIG);
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  
  pc.onicecandidate=e=>{if(e.candidate&&callCh)callCh.send({type:'broadcast',event:'signal',payload:{type:'ice',candidate:e.candidate,from:me.id}})};
  
  // Fix: Safely handle remote audio stream without recreating elements if they already exist
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
    if(pc.connectionState==='connected'){callState='connected';$('calltext').textContent='In call with '+dn(profiles[peerId]);}
    else if(['failed','disconnected','closed'].includes(pc.connectionState)&&callState!=='idle'){endCall('Call ended.')}
  };
}
