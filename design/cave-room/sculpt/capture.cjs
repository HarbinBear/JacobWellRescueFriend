const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {openReviewBrowser}=require('../browser.cjs');
const root=path.resolve(__dirname,'../../..');
const label=process.argv[2]||'sculpt';
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid capture label');
const out=path.join(root,'node_modules/.cache/cave-sculpt-study',label);
fs.mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await openReviewBrowser(label==='baseline'?'http://127.0.0.1:60972/design/deeptape/game.html':'http://127.0.0.1:60972/node_modules/.cache/cave-sculpt-study/live/game.html',1000,920);
 try{
  await b.evaluate('Object.defineProperty(window,"performance",{value:undefined,configurable:true});true');
  const rect=await b.evaluate('(()=>{const r=document.getElementById("game").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()');
  await b.click(rect.x+187.5/375*rect.w,rect.y+554/667*rect.h);
  for(let i=0;i<240;i++){
   if(await b.evaluate('DeepTapeGame.state.mazeRescue?.phase==="play"'))break;
   await wait(120);
  }
  assert.equal(await b.evaluate('DeepTapeGame.state.mazeRescue?.phase'),'play');
  await wait(6500);
  const initial=await b.evaluate('({o2:DeepTapeGame.player.o2,anim:DeepTapeGame.player.animTime})');
  async function shot(name){
   const s=await b.evaluate('DeepTapeGame.cave.draw();document.getElementById("game").toDataURL("image/png")');
   fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(s.split(',')[1],'base64'));
  }
  const sites=[];
  for(let i=0;i<3;i++){
   assert(await b.evaluate('DeepTapeGame.cave.site('+i+')'));
   await wait(650);
   const site=await b.evaluate('(()=>{const g=DeepTapeGame,m=g.state.mazeRescue;return {x:g.player.x,y:g.player.y,angle:g.player.angle,blocked:g.cave.collision(g.player.x,g.player.y,m),rock:g.cave.stats()}})()');
   assert(!site.blocked,'Observation site must be genuinely playable');assert.equal(site.rock.mode,'normal-map');
   sites.push(site);await shot('site-'+i);
  }
  assert(await b.evaluate('DeepTapeGame.cave.site(0)'));await wait(400);
  const frames=[];
  for(let i=0;i<13;i++){
   assert(await b.evaluate('DeepTapeGame.cave.site(0);DeepTapeGame.cave.aim('+(-.36+i*.06)+')'));
   await wait(100);await shot('turn-'+String(i).padStart(2,'0'));frames.push('turn-'+String(i).padStart(2,'0')+'.png');
  }
  if(label!=='baseline'){
   assert(await b.evaluate('DeepTapeGame.cave.site(0);DeepTapeGame.cave.inspect(2);true'));
   await wait(200);await shot('untextured');
   assert(await b.evaluate('DeepTapeGame.cave.inspect(1);true'));
   await wait(200);await shot('normals');
   await b.evaluate('DeepTapeGame.cave.inspect(0);true');
  }
  const after=await b.evaluate('({o2:DeepTapeGame.player.o2,anim:DeepTapeGame.player.animTime})');
  assert(after.o2<initial.o2);assert(after.anim>initial.anim);assert.equal(b.errors.length,0);
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({label,sites,initial,after,frames,errors:b.errors,scope:'Actual running game, unchanged HUD/water/diver; no browser performance; fixed observation placement only; desktop, not phone acceptance'},null,2));
  console.log(JSON.stringify({out,sites,initial,after,errors:b.errors},null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
