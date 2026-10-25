const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const{openReviewBrowser}=require('../design/cave-room/browser.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'node_modules/.cache/cave-native-game');fs.mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await openReviewBrowser('http://127.0.0.1:60972/design/deeptape/game.html',1100,940);
 try{
  await b.evaluate('Object.defineProperty(window,"performance",{value:undefined,configurable:true});true');
  assert.equal(await b.evaluate('typeof performance'),'undefined');
  await b.evaluate('(()=>{window.__CaveUiProbe={count:0};const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(...args){if(DeepTapeGame.state.mazeRescue?.phase==="play")__CaveUiProbe.count++;return original.apply(this,args)};return true})()');
  const rect=await b.evaluate('(()=>{const r=document.getElementById("game").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()');
  async function click(x,y){await b.click(rect.x+x/375*rect.w,rect.y+y/667*rect.h);}
  async function shot(name){const s=await b.evaluate('document.getElementById("game").toDataURL("image/png")');fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(s.split(',')[1],'base64'));}
  const before=await b.evaluate('JSON.stringify({storage:{...localStorage},ex:DeepTapeGame.state.extraction,story:DeepTapeGame.state.story2})');
  assert.equal(await b.evaluate('DeepTapeGame.cave.stats().loaded'),false,'Main menu must not preload cave artwork');
  await shot('menu');await click(187.5,554);
  assert.equal(await b.evaluate('DeepTapeGame.state.mazeRescue.rockTrial'),true,'Native menu must enter the actual trial');
  await shot('rewind');
  const phases=[];
  for(let i=0;i<200;i++){
   const phase=await b.evaluate('DeepTapeGame.state.mazeRescue.phase');if(!phases.includes(phase))phases.push(phase);
   if(phase==='play')break;await wait(150);
  }
  assert.equal(await b.evaluate('DeepTapeGame.state.mazeRescue.phase'),'play','Actual tape/dive flow must complete');
  await wait(500);const initial=await b.evaluate('({o2:DeepTapeGame.player.o2,anim:DeepTapeGame.player.animTime,x:DeepTapeGame.player.x,y:DeepTapeGame.player.y,rock:DeepTapeGame.cave.stats()})');
  assert.equal(initial.rock.mode,'normal-map');await shot('playing');
  const hudTextDraws=await b.evaluate('__CaveUiProbe.count');assert(hudTextDraws>10,'HUD text must still draw after the rock pass without performance');assert(Number.isFinite(initial.rock.surfaceCPUms));
  await wait(5500);const after=await b.evaluate('({o2:DeepTapeGame.player.o2,anim:DeepTapeGame.player.animTime})');
  assert(after.anim>initial.anim,'Real simulation cannot be paused');assert(after.o2<initial.o2,'Real oxygen must be consumed');
  const collision=await b.evaluate('(()=>{const g=DeepTapeGame,s=g.state,m=s.mazeRescue,w=m.mazeWalls[2];return{inside:g.cave.collision(w.x,w.y,m),targetBlocked:g.cave.collision(m.npcInitX,m.npcInitY,m),path:g.cave.path({x:g.player.x,y:g.player.y},{x:m.npcInitX,y:m.npcInitY},12)}})()');
  assert(collision.inside);assert.equal(collision.targetBlocked,false);assert(collision.path.length>1);
  // The browser's WASD drives the same actual keyboard input listeners as the game.
  const position=await b.evaluate('({x:DeepTapeGame.player.x,y:DeepTapeGame.player.y})');
  await b.command('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65});await wait(700);await b.command('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65});await wait(150);
  const moved=await b.evaluate('({x:DeepTapeGame.player.x,y:DeepTapeGame.player.y,blocked:DeepTapeGame.cave.collision(DeepTapeGame.player.x,DeepTapeGame.player.y,DeepTapeGame.state.mazeRescue)})');
  assert(!moved.blocked);assert(Math.hypot(position.x-moved.x,position.y-moved.y)>.2,'Actual game controls must move the diver');await shot('moved');
  for(let i=0;i<80;i++){if(await b.evaluate('DeepTapeGame.state.wheel.btnActive'))break;await wait(100);}
  if(!(await b.evaluate('DeepTapeGame.state.wheel.btnActive'))){await b.command('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65});await wait(220);await b.command('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65});await wait(1600);}
  async function wheelAction(action){
   const p=await b.evaluate('DeepTapeGame.cave.wheelPos()');const x=rect.x+p.x/375*rect.w,y=rect.y+p.y/667*rect.h;
   await b.mouse('mousePressed',x,y);await wait(180);
   const sector=await b.evaluate('(()=>{const w=DeepTapeGame.state.wheel,s=w.sectors.find(s=>s.action==='+JSON.stringify(action)+');return s?{angle:(s.startAngle+s.endAngle)/2,x:w.centerX,y:w.centerY}:null})()');assert(sector,'Actual wheel action missing: '+action);
   const tx=sector.x+Math.cos(sector.angle)*70,ty=sector.y+Math.sin(sector.angle)*70;
   await b.mouse('mouseMoved',rect.x+tx/375*rect.w,rect.y+ty/667*rect.h);await wait(120);await b.mouse('mouseReleased',rect.x+tx/375*rect.w,rect.y+ty/667*rect.h);await wait(300);
  }
  await wheelAction('startRope');assert(await b.evaluate('DeepTapeGame.state.rope.active'),'Actual wheel must anchor on the polygon');await shot('rope-started');
  await b.command('Input.dispatchKeyEvent',{type:'keyDown',key:'d',code:'KeyD',windowsVirtualKeyCode:68});await wait(240);await b.command('Input.dispatchKeyEvent',{type:'keyUp',key:'d',code:'KeyD',windowsVirtualKeyCode:68});await wait(1800);
  if(await b.evaluate('DeepTapeGame.state.wheel.nearbyInfo?.context!==\'ropingWall\'')){await b.command('Input.dispatchKeyEvent',{type:'keyDown',key:'a',code:'KeyA',windowsVirtualKeyCode:65});await wait(450);await b.command('Input.dispatchKeyEvent',{type:'keyUp',key:'a',code:'KeyA',windowsVirtualKeyCode:65});}
  for(let i=0;i<100;i++){if(await b.evaluate('DeepTapeGame.state.wheel.btnActive&&DeepTapeGame.state.wheel.nearbyInfo?.context===\'ropingWall\''))break;await wait(100);}
  await wheelAction('endRope');assert.equal(await b.evaluate('DeepTapeGame.state.rope.ropes.length'),1,'Wheel end action must lock a real rope');
  const ropeCheck=await b.evaluate('(()=>{const g=DeepTapeGame,m=g.state.mazeRescue,r=g.state.rope.ropes[0];return r.path.length>1&&r.path.slice(1).every((p,i)=>g.cave.geometry.rockSegmentClear(m.mazeWalls,r.path[i],p,0))})()');assert(ropeCheck,'Actual placed rope must not cut through the drawn rock');await shot('rope-completed');
  await click(315,24);assert.equal(await b.evaluate('DeepTapeGame.state.screen'),'menu');
  const restored=await b.evaluate('JSON.stringify({storage:{...localStorage},ex:DeepTapeGame.state.extraction,story:DeepTapeGame.state.story2})');assert.equal(restored,before,'Exiting actual trial must restore inventory/story/storage');
  await wait(100);const released=await b.evaluate('DeepTapeGame.cave.stats()');assert.equal(released.loaded,false);assert.equal(released.textureBytes,0);assert.equal(released.decodedImageBytes,0);
  await shot('returned-menu');const report={phases,initial,oxygenAfter:after,movement:moved,collision,released,hudTextDraws,errors:b.errors,scope:'Browser performance removed before actual dive; unmodified actual game simulation from native menu; no paused review package; desktop Chrome, not WeChat phone'};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));assert.equal(b.errors.length,0);console.log(JSON.stringify({phases,initial,oxygenAfter:after,moved,errors:b.errors},null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
