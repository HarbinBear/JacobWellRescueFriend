const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {openReviewBrowser}=require('../design/cave-room/browser.cjs');
const OUT=path.resolve(__dirname,'../node_modules/.cache/continuous-gameplay/regression');
const URL=process.env.JWR_PREVIEW_URL||'http://127.0.0.1:60972/node_modules/.cache/continuous-gameplay/game.html';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 fs.mkdirSync(OUT,{recursive:true});const b=await openReviewBrowser(URL,1400,850),report={scope:'实际手机版源码；隔离浏览器，不是微信真机验收'};
 try{
  const ev=s=>b.evaluate(s);await ev('DeepTapeGame.start()');await wait(900);assert(await ev('DeepTapeGame.world.render.assetsReady()'));
  async function shot(name){const image=await ev('document.getElementById("game").toDataURL("image/png")');fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(image.split(',')[1],'base64'));}
  async function touch(type,p){const q=p?await ev(`(()=>{const r=document.getElementById('game').getBoundingClientRect(),c=DeepTapeGame.cave.config,p=${JSON.stringify(p)};return{x:r.x+p.x/c.screenWidth*r.width,y:r.y+p.y/c.screenHeight*r.height,id:1}})()`):null;await b.command('Input.dispatchTouchEvent',{type,touchPoints:q?[q]:[]});}
  report.camera=await ev(`(()=>{const g=DeepTapeGame,c=g.state.camera,w=g.world.geometry.world();w.hidden=true;g.cave.config.infiniteO2=true;g.state.fishEnemies=[];g.state.npc.active=false;g.input.move=0;
   const m=g.state.mazeRescue,ts=m.mazeTileSize;let p=null;for(let r=20;r<30&&!p;r++)for(let col=3;col<m.mazeCols-3;col++){const x=(col+.5)*ts,y=(r+.5)*ts;if(m.mazeMap[r][col]===0&&!g.world.geometry.circleCollision(x,y,18)){p={x,y};break;}}
   Object.assign(g.player,{...p,vx:0,vy:0});Object.assign(w,{grounded:false,landBlend:0,wet:1,headWet:true});g.camera.snapCameraToPlayer();c.zoom=c.targetZoom=1;
   g.input.move=1;g.input.targetAngle=Math.PI;g.world.runtime.tickWorld();const inputAhead=Math.abs(c.targetX-g.player.x);
   g.input.move=0;for(let i=0;i<260;i++)g.world.runtime.tickWorld();const actual=c.zoom,target=g.camera.getAdaptiveZoom();
   const old={...c},px=g.player.x,py=g.player.y;g.world.runtime.tickWorld();
   const cfg=g.cave.config.camera,speed=Math.hypot(g.player.vx,g.player.vy),look=speed>.5?Math.min(cfg.lookAheadDistance,speed*cfg.lookAheadVelocityScale)/speed:0;
   const tx=g.player.x+g.player.vx*look,ty=g.player.y+g.player.vy*look,ex=old.x+(old.vx+(tx-old.x)*cfg.followStiffness)*cfg.followDamping,ey=old.y+(old.vy+(ty-old.y)*cfg.followStiffness)*cfg.followDamping;
   return{actual,target,inputAhead,springDifference:Math.hypot(c.x-ex,c.y-ey),playerMove:Math.hypot(g.player.x-px,g.player.y-py),targetAhead:Math.hypot(c.targetX-g.player.x,c.targetY-g.player.y)};
  })()`);
  assert(report.camera.inputAhead<3,'前瞻应跟真实速度，不应按输入立即偏58像素');assert(Math.abs(report.camera.actual-report.camera.target)<.03);assert(report.camera.actual>.86,'深洞不应锁死0.76远景');assert(report.camera.springDifference<.00001,JSON.stringify(report.camera));
  await ev('DeepTapeGame.world.runtime.returnToShoreAfterDeath();DeepTapeGame.world.geometry.world().hidden=false;DeepTapeGame.cave.config.infiniteO2=false');await wait(1000);await shot('01-camp-landscape');
  report.barriers=await ev(`(()=>{const g=DeepTapeGame,w=g.world.geometry.world(),out=[];w.hidden=true;g.state.npc.active=false;g.state.fishEnemies=[];
   for(const [local,direction]of [[-1780,-1],[1240,1]]){
    Object.assign(g.player,{x:w.originX+local,y:g.world.geometry.groundAt(w.originX+local)-43,vx:0,vy:0,angle:-Math.PI/2});Object.assign(w,{grounded:true,landBlend:1,headWet:false,wet:0});g.input.move=1;g.input.targetAngle=direction<0?Math.PI:0;
    for(let i=0;i<210;i++)g.world.runtime.tickWorld();g.input.move=0;
    const x=g.player.x,y=g.player.y;out.push({local:x-w.originX,physicalClear:!g.world.geometry.circleCollision(x,y,16),nearRock:w.boundaries.some(b=>g.cave.geometry.circleHitsRock(b,x+direction*22,y,18)),distanceToOuterEdge:direction<0?x-w.originX-g.world.layout.minX:w.originX+g.world.layout.maxX-x});
   }return out;
  })()`);
  for(const barrier of report.barriers){assert(barrier.physicalClear);assert(barrier.nearRock);assert(barrier.distanceToOuterEdge>45,'应先接触可见岩石而不是最外层空气墙');}
  await wait(150);await shot('02-natural-right-boundary');
  await ev('DeepTapeGame.world.runtime.returnToShoreAfterDeath();DeepTapeGame.world.geometry.world().hidden=false');await wait(300);
  const restButton=await ev('DeepTapeGame.world.hud.worldButtons().find(b=>b.id==="station")');assert(restButton);await touch('touchStart',{x:restButton.x+restButton.w/2,y:restButton.y+restButton.h/2});await touch('touchEnd');assert(await ev('DeepTapeGame.world.geometry.world().resting'));await wait(250);await shot('03-bamboo-rest');
  const resting=await ev('DeepTapeGame.world.save.captureWorld()');assert(resting.world.resting);assert(await ev('DeepTapeGame.world.save.saveWorldProgress()'));await ev('DeepTapeGame.world.runtime.resumeContinuousWorld()');assert(await ev('DeepTapeGame.world.geometry.world().resting'));assert.equal(await ev('DeepTapeGame.player.x'),resting.player.x);
  await ev('DeepTapeGame.input.move=1;DeepTapeGame.input.targetAngle=0;DeepTapeGame.world.runtime.tickWorld();DeepTapeGame.input.move=0');assert(!await ev('DeepTapeGame.world.geometry.world().resting'));report.rest='原生按钮躺下、休息状态原位恢复、移动起身';
  report.death=await ev(`(()=>{const g=DeepTapeGame,w=g.world.geometry.world(),m=g.state.mazeRescue;w.hidden=true;g.cave.config.infiniteO2=false;
   const wall=m.mazeWalls.find(b=>!b.shoreBank&&!b.shoreObstacle),a={x:w.originX-90,y:w.surfaceY+90},b={x:w.originX+80,y:w.surfaceY+90};
   const fixed={start:a,end:b,path:[a,b],startWall:wall,endWall:wall,slackFactor:0,mode:'tight'};g.state.rope.ropes=[fixed];
   const f={worldId:w.nextFishId++,x:w.originX+200,y:w.surfaceY+200,vx:0,vy:0,angle:0,bound:true,dead:false,kind:'curious'};g.state.fishEnemies=[f];
   g.state.rope.links=[{id:71,start:{kind:'player',point:a},end:{kind:'fish',fish:f,point:{x:f.x,y:f.y}},path:[a,{x:f.x,y:f.y}],length:140,tension:0,age:0}];
   Object.assign(g.player,{x:w.originX,y:w.surfaceY+150,vx:0,vy:0,o2:0});Object.assign(w,{headWet:true,wet:1,grounded:false,landBlend:0});m.discoveredRelicIds=[17];m.mazeExplored[18][5]=true;
   const seed=m.seed,fishPos={x:f.x,y:f.y};g.world.runtime.returnToShoreAfterDeath();const snapshot=g.world.save.captureWorld();
   return{seedSame:seed===m.seed,spawn:g.player.x-w.originX,expectedSpawn:g.world.layout.spawn[0],headWet:w.headWet,o2:g.player.o2,ropes:g.state.rope.ropes.length,links:g.state.rope.links.length,fishSame:g.state.fishEnemies[0]===f,fishUnmoved:f.x===fishPos.x&&f.y===fishPos.y,explored:m.mazeExplored[18][5],relics:m.discoveredRelicIds,savedX:snapshot.player.x,actualX:g.player.x};
  })()`);
  assert(report.death.seedSame&&report.death.fishSame&&report.death.fishUnmoved&&report.death.explored);assert.equal(report.death.spawn,report.death.expectedSpawn);assert(!report.death.headWet);assert(report.death.o2>0);assert.equal(report.death.ropes,1);assert.equal(report.death.links,0);assert.deepEqual(report.death.relics,[17]);assert.equal(report.death.savedX,report.death.actualX);
  report.fishDeath=await ev(`(()=>{const g=DeepTapeGame,w=g.world.geometry.world();g.state.fishEnemies=[];g.state.rope.ropes=[];Object.assign(g.player,{x:w.originX,y:w.surfaceY+150,o2:g.player.o2Max,vx:0,vy:0});Object.assign(w,{hidden:true,grounded:false,landBlend:0,headWet:true,wet:1});g.state.fishBite={active:true,phase:'dead',timer:10000,shakeIntensity:0};g.world.runtime.tickWorld();return{spawn:g.player.x-w.originX,expectedSpawn:g.world.layout.spawn[0],phase:g.state.mazeRescue.phase,headWet:w.headWet,bite:g.state.fishBite};})()`);
  assert.equal(report.fishDeath.spawn,report.fishDeath.expectedSpawn);assert.equal(report.fishDeath.phase,'play');assert(!report.fishDeath.headWet);assert.equal(report.fishDeath.bite,null);
  await ev('DeepTapeGame.world.geometry.world().hidden=false;DeepTapeGame.state.fishEnemies=[];DeepTapeGame.state.rope.ropes=[]');
  await ev('wx.setDeviceOrientation({value:"portrait",success(){}})');await wait(800);await shot('04-camp-portrait');
  report.portrait=await ev('({width:DeepTapeGame.cave.config.screenWidth,height:DeepTapeGame.cave.config.screenHeight,zoom:DeepTapeGame.state.camera.zoom})');assert(report.portrait.zoom>.9);
  await ev('DeepTapeGame.world.runtime.toggleRest()');await wait(250);await shot('05-rest-portrait');
  report.errors=b.errors;assert.equal(b.errors.length,0,JSON.stringify(b.errors));report.status='passed';fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(e){report.status='failed';report.error=String(e);report.errors=b.errors;fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));throw e;}
 finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
