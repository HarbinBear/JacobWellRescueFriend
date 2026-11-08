const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {openReviewBrowser}=require('../design/cave-room/browser.cjs');
const OUT=path.resolve(__dirname,'../node_modules/.cache/continuous-world/acceptance');
const URL=process.env.JWR_PREVIEW_URL||'http://127.0.0.1:60972/node_modules/.cache/continuous-world/game.html';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 fs.mkdirSync(OUT,{recursive:true});const browser=await openReviewBrowser(URL,1390,850),report={scope:'真实当前游戏模块 + 独立连续章节接入；独立浏览器与原生输入。不是微信真机性能验收。'};
 try{
  const ev=s=>browser.evaluate(s);
  async function until(expression,timeout=18000){const start=Date.now();while(!await ev(expression)){if(Date.now()-start>timeout)throw Error('等待条件超时: '+expression+'\n'+JSON.stringify(await ev('({player:DeepTapeGame.player,world:{...DeepTapeGame.world.geometry.world(),banks:undefined,left:undefined,right:undefined,events:undefined},input:DeepTapeGame.input})')));await wait(120);}}
  async function key(type,key,code){await browser.command('Input.dispatchKeyEvent',{type,key,code});}
  async function keysOn(keys){for(const [key,code]of keys)await keyEvent('keyDown',key,code);}
  const keyEvent=key;
  async function keysOff(keys){for(const [key,code]of keys)await keyEvent('keyUp',key,code);}
  async function shot(name){const image=await ev('document.getElementById("game").toDataURL("image/png")');fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(image.split(',')[1],'base64'));}
  await until('DeepTapeGame.world.render.assetsReady()',10000);await wait(350);
  await ev('localStorage.setItem("deeptape-game-review/untouched-fixture","用户旧档不应被实验改写");DeepTapeGame.cave.config.infiniteO2=false');
  assert.equal(await ev('DeepTapeGame.state.mazeRescue.phase'),'play');assert(await ev('DeepTapeGame.world.geometry.world().grounded'));
  report.graphics=await ev('DeepTapeGame.world.render.worldGraphicsStats()');assert(report.graphics.webgl,'必须验证真实 WebGL 路径，而不是静默退化');
  const origin=await ev('DeepTapeGame.world.geometry.world().originX');
  report.geometry=await ev(`(()=>{const g=DeepTapeGame,w=g.world.geometry.world(),rock=g.cave.geometry;let failures=[],samples=0;let seed=1337;
   for(const bank of w.banks)for(let i=0;i<1200;i++){seed=(seed*1664525+1013904223)>>>0;const x=bank.x-bank.r+(seed/4294967296)*bank.r*2;seed=(seed*1664525+1013904223)>>>0;const y=400+(seed/4294967296)*750;
    const r=[0,5,18,26][i%4],a=g.world.geometry.bankCircleCollision(bank,x,y,r),b=rock.circleHitsRock(bank,x,y,r);samples++;if(a!==b&&failures.length<10)failures.push({x,y,r,a,b});}return{samples,failures};})()`);
  assert.equal(report.geometry.failures.length,0,'快速岸坡碰撞必须与原多边形几何完全一致');
  report.connectivity=await ev('(()=>{const g=DeepTapeGame,m=g.state.mazeRescue,ts=m.mazeTileSize,start=[Math.floor(g.world.geometry.world().seamY/ts),Math.floor(m.exitX/ts)],goal=[Math.floor(m.npcInitY/ts),Math.floor(m.npcInitX/ts)],queue=[start],seen=new Set([start.join(",")]);for(let i=0;i<queue.length;i++){const [r,c]=queue[i];for(const [dr,dc]of [[1,0],[-1,0],[0,1],[0,-1]]){const y=r+dr,x=c+dc,id=y+","+x;if(y>=start[0]&&m.mazeMap[y]?.[x]===0&&!seen.has(id)){seen.add(id);queue.push([y,x])}}}return{reachable:seen.has(goal.join(",")),reachableCells:seen.size,npc:{x:m.npcInitX,y:m.npcInitY}}})()');assert(report.connectivity.reachable,'泉井接缝必须连到实际原有救援目标');
  await shot('01-camp');
  await ev('window.__WorldTrace=[];window.__WorldTraceOn=true;window.__TraceFrame=()=>{if(!window.__WorldTraceOn)return;const g=DeepTapeGame,w=g.world.geometry.world();window.__WorldTrace.push({t:w.elapsed,x:g.player.x,y:g.player.y,phase:g.state.mazeRescue.phase,wet:w.wet,head:w.headWet,land:w.landBlend});requestAnimationFrame(window.__TraceFrame)};requestAnimationFrame(window.__TraceFrame)');
  const D=[['d','KeyD']],WA=[['w','KeyW'],['a','KeyA']],A=[['a','KeyA']];
  await keysOn(D);await until(`DeepTapeGame.world.geometry.world().headWet && DeepTapeGame.world.geometry.world().landBlend<.1 && DeepTapeGame.player.x>${origin-130}`);await keysOff(D);await wait(220);
  assert(await ev('DeepTapeGame.world.geometry.world().headWet'));await shot('02-submerged');
  await keysOn(WA);await until(`!DeepTapeGame.world.geometry.world().headWet && DeepTapeGame.world.geometry.world().landBlend>.9 && DeepTapeGame.player.x<${origin-445}`,24000);await keysOff(WA);await wait(250);await shot('03-back-on-bank');
  const trace=await ev('window.__WorldTraceOn=false;window.__WorldTrace');
  assert(trace.some(f=>f.wet>0&&f.wet<1),'必须有实际半浸没阶段');assert(trace.some(f=>f.head)&&trace.some(f=>!f.head));assert(trace.every(f=>f.phase==='play'),'出入水不能切转场或结算');
  let largest=0;for(let i=1;i<trace.length;i++){const a=trace[i-1],b=trace[i],dt=b.t-a.t;if(dt>0){const d=Math.hypot(b.x-a.x,b.y-a.y);largest=Math.max(largest,d);assert(d<=dt*60*10+4,'身体不能在跨介质时传送');}}
  report.movement={samples:trace.length,halfSubmerged:true,phaseAlwaysPlay:true,maxObservedFrameDisplacement:largest};
  fs.writeFileSync(path.join(OUT,'movement-trace.json'),JSON.stringify(trace,null,2));

  await ev('DeepTapeGame.world.runtime.setupTowReview(3)');await wait(400);
  const fishIDs=await ev('DeepTapeGame.state.fishEnemies.filter(f=>f.reviewTow).map(f=>f.worldId)');
  assert.equal(fishIDs.length,3);await shot('04-three-tethers');
  await keysOn(A);await until(`DeepTapeGame.player.x<${origin-690} && DeepTapeGame.state.fishEnemies.filter(f=>f.reviewTow).every(f=>f.y<DeepTapeGame.world.geometry.world().surfaceY-10)`,24000);await keysOff(A);await wait(300);await shot('05-fish-on-land');
  assert.equal(await ev('DeepTapeGame.state.rope.links.length'),3);assert(await ev('DeepTapeGame.state.fishEnemies.filter(f=>f.reviewTow).every(f=>f.bound)'));
  const o2=await ev('DeepTapeGame.player.o2');await wait(750);assert.equal(await ev('DeepTapeGame.player.o2'),o2,'空气中不能消耗或自动补满气瓶');
  report.tow={fishIDs,tethers:3,allBodiesAboveWater:true,fishStayBound:true};

  function canonical(s){return {seed:s.seed,player:{x:s.player.x,y:s.player.y,vx:s.player.vx,vy:s.player.vy,angle:s.player.angle,o2:s.player.o2,o2Max:s.player.o2Max},npc:s.npc,fish:s.fish.map(f=>({...f,stunUntil:0,stunRemaining:0})),ropes:s.ropes,links:s.links,current:s.current,ropeActive:s.ropeActive,markers:s.markers,maze:s.maze,explored:s.explored,extraction:s.extraction,story:s.story,gas:s.bcd.gasNL,nitrogen:s.deco.nitrogenLoad,stamina:s.stamina,world:{elapsed:s.world.elapsed,chapterStatus:s.world.chapterStatus,nextFishId:s.world.nextFishId,airTanks:s.world.airTanks}};}
  async function reloadAt(name){
   await ev('window.__ShoreLifecycle.hide()');const before=await ev('DeepTapeGame.world.save.captureWorld()');await wait(850);
   const paused=await ev('DeepTapeGame.world.save.captureWorld()');assert.deepEqual(canonical(paused),canonical(before),'后台期间不能推进世界');assert.deepEqual(paused.fish.map(f=>f.stunRemaining),before.fish.map(f=>f.stunRemaining),'后台等待不能减少眩晕');assert(await ev('DeepTapeGame.world.save.saveWorldProgress()'));
   await browser.command('Page.reload',{});await until('!!window.DeepTapeGame?.world.geometry.world()',15000);await until('!!DeepTapeGame.world.save.getLastRestoreSnapshot()',12000);
   const restored=await ev('DeepTapeGame.world.save.getLastRestoreSnapshot()');assert.deepEqual(canonical(restored),canonical(before),'读档必须恢复实际对象图，而不仅是存了一个坐标');
   restored.fish.forEach((f,i)=>assert(Math.abs(f.stunRemaining-before.fish[i].stunRemaining)<.03,'离线眩晕必须按剩余时间重锚定'));
   assert(await ev('DeepTapeGame.state.rope.links.every(l=>[l.start,l.end].every(e=>e.kind!=="fish"||DeepTapeGame.state.fishEnemies.includes(e.fish)))'),'绳端引用必须重新挂到恢复的鱼实体');
   await until('DeepTapeGame.world.render.assetsReady()');await shot(name);return{position:{x:restored.player.x,y:restored.player.y},o2:restored.player.o2,fishIDs:restored.fish.filter(f=>f.reviewTow).map(f=>f.worldId),elapsed:restored.world.elapsed,offlineFrozen:true,stamina:restored.stamina};
  }
  await ev('DeepTapeGame.state.fishEnemies.filter(f=>f.reviewTow).forEach(f=>{f.stunFrames=180;f.stunUntil=Date.now()+3000;f.state="stunned"});DeepTapeGame.state.semiAutoDrive.remaining=.42;DeepTapeGame.state.semiAutoDrive.exhausted=false');
  report.landResume=await reloadAt('06-land-resume');
  await keysOn(D);await until(`DeepTapeGame.world.geometry.world().headWet && DeepTapeGame.world.geometry.world().landBlend<.1 && DeepTapeGame.player.x>${origin-100}`,24000);await keysOff(D);await wait(200);
  assert.equal(await ev('DeepTapeGame.state.rope.links.length'),3,'再次入水不能解开腰绳');assert.deepEqual(await ev('DeepTapeGame.state.fishEnemies.filter(f=>f.reviewTow).map(f=>f.worldId)'),fishIDs);
  await ev('(()=>{const m=DeepTapeGame.state.mazeRescue,t=m.oxygenTanks[0];if(t){t.consumed=true;if(!m.consumedTankIds.includes(t.id))m.consumedTankIds.push(t.id)}m.discoveredRelicIds=[17];DeepTapeGame.ui.bcdRuntime().gasNL=6.75;DeepTapeGame.ui.decoRuntime().nitrogenLoad=2.5;})()');
  report.waterResume=await reloadAt('07-water-resume');
  assert(await ev('DeepTapeGame.state.mazeRescue.oxygenTanks.filter(t=>DeepTapeGame.state.mazeRescue.consumedTankIds.includes(t.id)).every(t=>t.consumed)'),'已使用气瓶不能在重进时刷新');
  assert.equal(await ev('localStorage.getItem("deeptape-game-review/untouched-fixture")'),'用户旧档不应被实验改写');

  const SWA=[['Shift','ShiftLeft'],...WA];
  await keysOn(SWA);await until('DeepTapeGame.world.geometry.world().stationId==="air" && !DeepTapeGame.world.geometry.world().headWet',26000);await keysOff(SWA);await wait(250);
  report.tow.returnToShoreInput='原生 Shift+W+A 强力划水，等同充分拖动触控方向';
  await ev('DeepTapeGame.player.o2=40');await keyEvent('keyDown','e','KeyE');await keyEvent('keyUp','e','KeyE');
  assert(await ev('DeepTapeGame.world.geometry.world().pendingAction==="air"'));assert(await ev('DeepTapeGame.player.o2<DeepTapeGame.player.o2Max'),'补气不能瞬间刷满');await until('DeepTapeGame.player.o2===DeepTapeGame.player.o2Max && !DeepTapeGame.world.geometry.world().pendingAction',7000);await shot('08-air-station');report.air={requiresPhysicalStation:true,gradualRefill:true};
  async function tap(rect){const box=await ev('(()=>{const r=document.getElementById("game").getBoundingClientRect(),c=DeepTapeGame.cave.config;return{x:r.x,y:r.y,w:r.width,h:r.height,cw:c.screenWidth,ch:c.screenHeight}})()');const p={x:box.x+(rect.x+rect.w/2)/box.cw*box.w,y:box.y+(rect.y+rect.h/2)/box.ch*box.h,id:1};await browser.command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await browser.command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  await tap(await ev('DeepTapeGame.ui.inventory.getInventoryHUDButtonRect()'));await until('DeepTapeGame.ui.inventory.isBagFullPageOpen() && !!DeepTapeGame.ui.bagPage.getBagPageCloseRect()');await shot('09-bag-page');await tap(await ev('DeepTapeGame.ui.bagPage.getBagPageCloseRect()'));await until('!DeepTapeGame.ui.inventory.isBagFullPageOpen()');report.inventory='原生触控打开和关闭背包，仍在同一章节';
  await ev('DeepTapeGame.world.runtime.setupRescueReview()');await wait(500);
  await keysOn(A);await until(`DeepTapeGame.world.geometry.world().stationId==='medical' && Math.abs(DeepTapeGame.state.npc.x-(${origin-1500}))<175`,24000);await keysOff(A);await wait(250);
  const ex=await ev('JSON.stringify(DeepTapeGame.state.extraction)'),beforePos=await ev('({x:DeepTapeGame.player.x,y:DeepTapeGame.player.y})'),beforeTethers=await ev('DeepTapeGame.state.rope.links.map(l=>l.id)');
  await keyEvent('keyDown','e','KeyE');await keyEvent('keyUp','e','KeyE');await wait(180);
  assert.equal(await ev('DeepTapeGame.world.geometry.world().chapterStatus'),'rescued');assert.equal(await ev('DeepTapeGame.state.mazeRescue.phase'),'play');assert.equal(await ev('DeepTapeGame.state.npc.active'),false);
  assert.equal(await ev('JSON.stringify(DeepTapeGame.state.extraction)'),ex,'移交不能触发旧战利品结算');assert.deepEqual(await ev('DeepTapeGame.state.rope.links.map(l=>l.id)'),beforeTethers,'救援交接不能清除鱼身腰绳');
  const pos=await ev('({x:DeepTapeGame.player.x,y:DeepTapeGame.player.y})');assert(Math.hypot(pos.x-beforePos.x,pos.y-beforePos.y)<8,'移交不能把玩家传送走');await shot('08-medical-handoff');
  report.handoff={chapterResolved:true,worldStillPlayable:true,noLiquidation:true,fishTethersRetained:true};
  await ev('DeepTapeGame.world.runtime.closeWorldPanel();DeepTapeGame.world.runtime.toggleOverview()');await wait(1700);await shot('09-world-overview');
  await ev('window.__ShoreLifecycle.hide()');const graph=await ev('({seed:DeepTapeGame.state.mazeRescue.seed,player:{x:DeepTapeGame.player.x,y:DeepTapeGame.player.y},fish:DeepTapeGame.state.fishEnemies.map(f=>({id:f.worldId,x:f.x,y:f.y})),links:DeepTapeGame.state.rope.links.map(l=>l.id)})');
  const orientation=await ev('DeepTapeGame.ui.orientation()');assert(orientation);
  const rect=await ev('(()=>{const r=document.getElementById("game").getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()');
  const p={x:rect.x+orientation.x/667*rect.w,y:rect.y+orientation.y/375*rect.h};
  await browser.command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...p,id:1}]});await browser.command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await wait(400);
  assert.deepEqual(await ev('({seed:DeepTapeGame.state.mazeRescue.seed,player:{x:DeepTapeGame.player.x,y:DeepTapeGame.player.y},fish:DeepTapeGame.state.fishEnemies.map(f=>({id:f.worldId,x:f.x,y:f.y})),links:DeepTapeGame.state.rope.links.map(l=>l.id)})'),graph,'切屏不能重开章节或改动实体图');await shot('10-portrait');await ev('window.__ShoreLifecycle.show();DeepTapeGame.world.runtime.toggleOverview()');await wait(1400);await shot('11-portrait-play');report.orientation='原生触控切屏，章节与实体保持不变';
  report.errors=browser.errors;assert.equal(browser.errors.length,0);report.status='passed';
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(error){report.status='failed';report.error=String(error);report.errors=browser.errors;fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));throw error;}
 finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
