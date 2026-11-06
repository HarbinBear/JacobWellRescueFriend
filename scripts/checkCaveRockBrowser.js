const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const{openReviewBrowser}=require('../design/cave-room/browser.cjs');
const study=process.argv.includes('--sculpt');
const root=path.resolve(__dirname,'..'),out=path.join(root,study?'node_modules/.cache/cave-sculpt-game':'node_modules/.cache/cave-native-game');fs.mkdirSync(out,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const url = process.env.JWR_PREVIEW_URL || 'http://127.0.0.1:60972/'+(study?'node_modules/.cache/cave-sculpt-study/live/game.html':'design/deeptape/game.html');
 const b=await openReviewBrowser(url,1100,940);
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
  // Pick two real wall locations with visible, reachable anchor directions.
  const anchors=await b.evaluate(`(()=>{
   const g=DeepTapeGame,m=g.state.mazeRescue,room=m.caveRockRoom,geometry=g.cave.geometry;
   const candidates=[];
   for(const site of room.sites) for(let dy=-36;dy<=36;dy+=12) for(let dx=-36;dx<=36;dx+=12){
    const p={x:room.x+site.player[0]+dx,y:room.y+site.player[1]+dy};
    if(g.cave.collision(p.x,p.y,m))continue;
    const near=g.cave.nearest(p.x,p.y,g.cave.config.ropeAnchorDistance-4);
    if(!near||near.dist<22)continue;
    const q=geometry.closestRockPoint(near.wall,p.x,p.y);
    const anchor={x:q.x+(p.x-q.x)/near.dist*.6,y:q.y+(p.y-q.y)/near.dist*.6};
    if(!geometry.rockSegmentClear(m.mazeWalls,p,anchor))continue;
    candidates.push({p,anchor});
   }
   for(const a of candidates) for(const b of candidates){
    if(Math.hypot(a.anchor.x-b.anchor.x,a.anchor.y-b.anchor.y)<32)continue;
    if(geometry.rockSegmentClear(m.mazeWalls,a.anchor,b.anchor,g.cave.config.ropeAvoidPadding))return [a,b];
   }
   return null;
  })()`);
  assert(anchors,'The cave must have a reachable pair of rock anchors');
  async function wheelPlace({p,anchor}) {
   const from = await b.evaluate(`(()=>{
    const g=DeepTapeGame,p=${JSON.stringify(p)},a=${JSON.stringify(anchor)};
    Object.assign(g.player,{x:p.x,y:p.y,vx:0,vy:0});
    const c=g.cave.wheelPos(),cfg=g.cave.config;
    const dx=a.x-p.x,dy=a.y-p.y,d=Math.hypot(dx,dy);
    const r=cfg.marker.wheelInnerRadius+(cfg.marker.wheelOuterRadius-cfg.marker.wheelInnerRadius)*d/cfg.ropeAnchorDistance;
    return {c,target:{x:c.x+dx/d*r,y:c.y+dy/d*r}};
   })()`);
   const screen = p => ({x:rect.x+p.x/375*rect.w,y:rect.y+p.y/667*rect.h});
   const press=screen(from.c), drag=screen(from.target);
   await b.mouse('mousePressed',press.x,press.y);
   assert(await b.evaluate('DeepTapeGame.state.wheel.open'),'Actual wheel must open');
   await b.mouse('mouseMoved',drag.x,drag.y);
   await b.mouse('mouseReleased',drag.x,drag.y);
   assert.equal(await b.evaluate('DeepTapeGame.state.wheel.open'),false);
  }
  await wheelPlace(anchors[0]);
  const start=await b.evaluate('DeepTapeGame.state.rope.current.start');
  assert(start&&Math.hypot(start.x-anchors[0].anchor.x,start.y-anchors[0].anchor.y)<5,'Directional wheel must pick the intended rock point');
  await shot('rope-started');
  await wheelPlace(anchors[1]);
  assert.equal(await b.evaluate('DeepTapeGame.state.rope.ropes.length'),1,'Directional wheel must finish the strand');
  const ropeCheck=await b.evaluate('(()=>{const g=DeepTapeGame,m=g.state.mazeRescue,r=g.state.rope.ropes[0];return r.path.length>1&&r.path.slice(1).every((p,i)=>g.cave.geometry.rockSegmentClear(m.mazeWalls,r.path[i],p,0))})()');assert(ropeCheck,'Actual placed rope must not cut through the drawn rock');await shot('rope-completed');
  await click(315,24);assert.equal(await b.evaluate('DeepTapeGame.state.screen'),'menu');
  const restored=await b.evaluate('JSON.stringify({storage:{...localStorage},ex:DeepTapeGame.state.extraction,story:DeepTapeGame.state.story2})');assert.equal(restored,before,'Exiting actual trial must restore inventory/story/storage');
  await wait(100);const released=await b.evaluate('DeepTapeGame.cave.stats()');assert.equal(released.loaded,false);assert.equal(released.textureBytes,0);assert.equal(released.decodedImageBytes,0);
  await shot('returned-menu');const report={phases,initial,oxygenAfter:after,movement:moved,collision,released,hudTextDraws,errors:b.errors,scope:'Browser performance removed before actual dive; unmodified actual game simulation from native menu; no paused review package; desktop Chrome, not WeChat phone'};
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));assert.equal(b.errors.length,0);console.log(JSON.stringify({phases,initial,oxygenAfter:after,moved,errors:b.errors},null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
