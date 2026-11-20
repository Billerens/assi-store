(async function(){
  if(window.Game){
    try { window.__hub=await Game.start({sim:window.GameSim,render:function(){}}); }
    catch(error){console.error('Freeboard hub',error);}
  }
  document.getElementById('play').src='play.html';
})();
