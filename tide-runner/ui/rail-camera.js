// Travel changes the framing only when the runner moves across the track or onto a different deck.
// Jump height, gait, pickups, collisions, effects and visual time never feed into the camera.
export function railCamera(px, deck, wide, blend, view){
  if(view==='home')return {eye:[wide?-2.36:-2.03,2.24,wide?4.78:5.13],target:[0,1.12,-.75]};
  const x=6.95*blend+(px-6.95*blend)*.85;
  return {eye:[x,3.64+deck*.74,wide?6.55:6.84],target:[x,.96+deck*.74,-14.2]};
}
export function followDeck(previous, height, advance){
  if(previous===undefined||advance<0||advance>16)return height;
  return previous+(height-previous)*(1-Math.exp(-advance/4.5));
}
