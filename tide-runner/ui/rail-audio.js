// A short filtered wheel rush with a dropping motor pitch as the cab passes.
// Each sound finishes on its own, including if the player pauses mid-pass.
let noise;
export function passBy(ctx,side,tunnel){
  if(!noise||noise.sampleRate!==ctx.sampleRate){
    noise=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*.62),ctx.sampleRate);
    const samples=noise.getChannelData(0);
    for(let i=0;i<samples.length;i++)samples[i]=Math.random()*2-1;
  }
  const at=ctx.currentTime,stop=at+.55;
  const wheels=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),motor=ctx.createOscillator();
  const mix=ctx.createGain(),hum=ctx.createGain();
  wheels.buffer=noise;filter.type='bandpass';filter.Q.value=.65;
  filter.frequency.setValueAtTime(tunnel?2200:3600,at);filter.frequency.exponentialRampToValueAtTime(370,stop);
  motor.type='triangle';motor.frequency.setValueAtTime(164,at);motor.frequency.exponentialRampToValueAtTime(68,stop);
  hum.gain.value=.20;mix.gain.setValueAtTime(.001,at);mix.gain.linearRampToValueAtTime(tunnel?.17:.13,at+.11);
  mix.gain.exponentialRampToValueAtTime(.001,stop);
  wheels.connect(filter);filter.connect(mix);motor.connect(hum);hum.connect(mix);
  const pan=ctx.createStereoPanner?.();
  if(pan){pan.pan.value=Math.sign(side)*.68;mix.connect(pan);pan.connect(ctx.destination);}
  else mix.connect(ctx.destination);
  motor.start(at);wheels.start(at);motor.stop(stop);wheels.stop(stop);
  wheels.onended=()=>{for(const node of [wheels,filter,motor,hum,mix,pan])node?.disconnect();};
}
