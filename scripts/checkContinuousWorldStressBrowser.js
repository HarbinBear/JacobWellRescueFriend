const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {openReviewBrowser}=require('../design/cave-room/browser.cjs');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'node_modules/.cache/continuous-world/stress');
const URL=process.env.JWR_PREVIEW_URL||'http://127.0.0.1:60972/node_modules/.cache/continuous-world/game.html';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 fs.mkdirSync(OUT,{recursive:true});const b=await openReviewBrowser(URL,1400,850),report={scope:'当前实际游戏代码的完整模拟、真实岸上触控与 GPU 恢复；压力测试起点为明确布置，不作为游戏内移动能力'};
 try{
  const ev=s=>b.evaluate(s);async function until(s,timeout=10000){const begin=Date.now();while(!await ev(s)){if(Date.now()-begin>timeout)throw Error('等待超时 '+s);await wait(80);}}
  await until('DeepTapeGame.world.render.assetsReady() && DeepTapeGame.world.surface.terrainSurfaceStats().webgl');
  report.graphics=await ev('DeepTapeGame.world.surface.terrainSurfaceStats()');
  report.coverage=await ev('DeepTapeGame.world.surface.terrainCoverageDiagnostics()');assert.equal(report.coverage.failures.length,0,JSON.stringify(report.coverage));
  report.background=await ev('DeepTapeGame.world.render.backdropProjectionStats()');assert(report.background.independentOfWorldZoom&&report.background.pixelMagnification<1.3,'远景不能跟随世界镜头进行巨大局部放大');
  report.physicalRoute=await ev('(()=>{const g=DeepTapeGame,w=g.world.geometry.world(),a={x:w.originX-180,y:667},b={x:w.originX-314.4,y:587},display=[a,{x:w.originX-225,y:620},{x:b.x-.05,y:b.y+.5},b],link={id:997,start:{kind:"player",point:a},end:{kind:"loose",point:b},path:display,length:128,age:0,tension:0};const route=g.world.queries.contourTetherRoute(link,a,b);return{route,stored:link.route,lastLeg:route.length>1?Math.hypot(route[route.length-1].x-route[route.length-2].x,route[route.length-1].y-route[route.length-2].y):0,ignoredDisplayCurve:JSON.stringify(route)!==JSON.stringify(display)}})()');
  assert(report.physicalRoute.ignoredDisplayCurve&&report.physicalRoute.lastLeg>2,'不能把显示弧线末端的小段当成固定物理锚点');assert.deepEqual(report.physicalRoute.route,report.physicalRoute.stored);
  const points=await ev(`(()=>{const g=DeepTapeGame,m=g.state.mazeRescue,w=g.world.geometry.world(),ts=m.mazeTileSize,out=[];
   for(const depth of [1980,3240,4560,6360,8280,10260]){let best=null;for(let r=Math.floor(depth/ts)-3;r<Math.floor(depth/ts)+4;r++)for(let c=2;c<m.mazeCols-2;c++){const x=(c+.5)*ts,y=(r+.5)*ts;if(m.mazeMap[r]?.[c]!==0||g.cave.collision(x,y,m))continue;const score=Math.abs(y-depth)+Math.abs(x-(w.originX-720))*.15;if(!best||score<best.score)best={x,y,score};}if(best)out.push(best);}return out;})()`);
  assert.equal(points.length,6);
  report.deepCases=[];
  for(let index=0;index<points.length;index++){
   const point=points[index];const data=await ev(`new Promise(resolve=>{const g=DeepTapeGame,w=g.world.geometry.world(),m=g.state.mazeRescue,p=${JSON.stringify(point)},oldNow=Date.now;let now=oldNow(),seed=${23017+index},count=0,maxMove=0,maxPenetration=0,violations=[];const time=w.elapsed;
    g.interactions.work.cancelInteractionInput();g.state.rope.links=[];g.state.rope.ropes=[];g.state.fishEnemies=[];g.state.npc.active=false;g.cave.config.infiniteO2=true;
    Object.assign(g.player,{x:p.x,y:p.y,vx:0,vy:0,angle:0,targetAngle:0});Object.assign(w,{grounded:false,landBlend:0,hidden:true,panel:null});g.cave.config.driveMode='semiAuto';
    Date.now=()=>now;
    function batch(){for(let j=0;j<100&&count<1200;j++,count++){
     if(count%47===0){seed=(Math.imul(seed,1664525)+1013904223)>>>0;g.input.targetAngle=seed/4294967296*Math.PI*2;g.input.move=count%141===0?0:1;g.state.semiAutoDrive.inputPower=count%94===0?1:.45;g.input.speedUp=g.state.semiAutoDrive.inputPower===1;}
     const x=g.player.x,y=g.player.y;now+=1000/60;g.world.runtime.tickWorld();const d=Math.hypot(g.player.x-x,g.player.y-y);maxMove=Math.max(maxMove,d);
     const q=g.world.contours.terrainNearest(w.terrain,g.player.x,g.player.y,22);maxPenetration=Math.max(maxPenetration,18-q.dist);
     if(!Number.isFinite(g.player.x+g.player.y+g.player.vx+g.player.vy)||d>18||m.phase!=='play'||q.dist<-3){if(violations.length<8)violations.push({count,x:g.player.x,y:g.player.y,d,land:w.landBlend,ground:w.grounded,rock:q.dist});}
    }if(count<1200){setTimeout(batch,1);return;}Date.now=oldNow;w.hidden=false;g.input.move=0;resolve({start:p,end:{x:g.player.x,y:g.player.y},frames:count,maxMove,maxPenetration,logicalSeconds:w.elapsed-time,violations});}batch();
   })`);
   assert.equal(data.violations.length,0,JSON.stringify(data));report.deepCases.push(data);
  }
  report.totalDeepFrames=report.deepCases.reduce((n,c)=>n+c.frames,0);

  // Restore an upright grounded actor once as an explicit test fixture. The
  // interaction is then selected using the real native direction-only rope UI.
  await ev(`(()=>{const g=DeepTapeGame,w=g.world.geometry.world();g.interactions.work.resetInteractions();g.interactions.rope.cancelRopePlacement();g.state.rope.ropes=[];g.state.rope.links=[];g.state.fishEnemies=[];g.state.npc.active=false;
   const x=w.originX-930;Object.assign(g.player,{x,y:g.world.geometry.groundAt(x)-43,vx:0,vy:0,angle:-Math.PI/2,targetAngle:-Math.PI/2});Object.assign(w,{grounded:true,landBlend:1,hidden:false,panel:null});Object.assign(g.input,{move:0,targetAngle:-Math.PI/2});g.state.camera.x=x;g.state.camera.y=g.player.y-64;g.state.camera.zoom=.76;})()`);await wait(400);
  const gesture=await ev(`(()=>{const g=DeepTapeGame,l=g.interactions.layout,c=l.getRopeControlPosition(),p={x:g.player.x+12,y:g.world.geometry.groundAt(g.player.x+12)},a=Math.atan2(p.y-g.player.y,p.x-g.player.x),r=82;return{button:c,target:{x:c.x+Math.cos(a)*r,y:c.y+Math.sin(a)*r}}})()`);
  async function touch(type,p){const box=await ev('(()=>{const r=document.getElementById("game").getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,cw:DeepTapeGame.cave.config.screenWidth,ch:DeepTapeGame.cave.config.screenHeight}})()');await b.command('Input.dispatchTouchEvent',{type,touchPoints:p?[{x:box.x+p.x/box.cw*box.w,y:box.y+p.y/box.ch*box.h,id:1}]:[]});}
  await touch('touchStart',gesture.button);await touch('touchMove',gesture.target);assert.equal(await ev('DeepTapeGame.interactions.wheel.getRopeWheelAim()?.target?.kind'),'rock');await touch('touchEnd');
  report.shoreWork=await ev(`new Promise(resolve=>{const g=DeepTapeGame,start={x:g.player.x,y:g.player.y},frames=[],shots={};function frame(){const task=g.state.interaction.task,w=g.world.geometry.world(),work=g.interactions.work.getInteractionWorkPose(),pose=g.world.diver.expeditionPose({landPose:{blend:w.landBlend,phase:w.walkPhase,effort:0,facing:w.facing},workPose:work},g.player.angle);
    frames.push({x:g.player.x,y:g.player.y,rotation:pose.rotation,grounded:w.grounded,crouch:pose.crouch,feet:pose.ankles.map(p=>p.y),phase:task?.phase,feedback:g.state.interaction.feedback});
    if(pose.crouch>.8&&!shots.crouch)shots.crouch=document.getElementById('game').toDataURL('image/png');
    if(task&&frames.length<250){requestAnimationFrame(frame);return;}resolve({start,frames,active:g.state.rope.active,feedback:g.state.interaction.feedback,shots});}requestAnimationFrame(frame);})`);
  assert(report.shoreWork.active&&report.shoreWork.feedback?.success,JSON.stringify(report.shoreWork.feedback));
  assert(report.shoreWork.frames.every(f=>f.grounded&&Math.abs(f.rotation)<.10),'系绳全程不能变成横向潜泳姿态');
  assert(report.shoreWork.frames.some(f=>f.crouch>.8),'必须有实际屈膝蹲身动作');
  for(const [key,image]of Object.entries(report.shoreWork.shots))fs.writeFileSync(path.join(OUT,'shore-'+key+'.png'),Buffer.from(image.split(',')[1],'base64'));delete report.shoreWork.shots;
  report.shoreWork.frameCount=report.shoreWork.frames.length;delete report.shoreWork.frames;

  await ev('DeepTapeGame.interactions.rope.cancelRopePlacement();DeepTapeGame.world.geometry.world().hidden=true');
  const graph=await ev('({player:{x:DeepTapeGame.player.x,y:DeepTapeGame.player.y,o2:DeepTapeGame.player.o2},seed:DeepTapeGame.state.mazeRescue.seed,ropes:DeepTapeGame.state.rope.ropes.length})');
  const before=await ev('DeepTapeGame.world.surface.terrainSurfaceStats()');assert(await ev('DeepTapeGame.world.surface.loseTerrainContext()'));
  await until(`DeepTapeGame.world.surface.terrainSurfaceStats().webgl && DeepTapeGame.world.surface.terrainSurfaceStats().revision>${before.revision}`);
  assert.deepEqual(await ev('({player:{x:DeepTapeGame.player.x,y:DeepTapeGame.player.y,o2:DeepTapeGame.player.o2},seed:DeepTapeGame.state.mazeRescue.seed,ropes:DeepTapeGame.state.rope.ropes.length})'),graph,'GPU 恢复不应重开地图或位置');
  report.contextRestore=await ev('DeepTapeGame.world.surface.terrainSurfaceStats()');assert.equal(report.contextRestore.textureCount,4);
  report.reentry=[];
  for(let i=0;i<3;i++){
   await ev('DeepTapeGame.world.save.saveWorldProgress();DeepTapeGame.world.runtime.resumeContinuousWorld();DeepTapeGame.world.geometry.world().hidden=true');await wait(350);const stats=await ev('DeepTapeGame.world.surface.terrainSurfaceStats()');assert.equal(stats.textureCount,4);assert.equal(stats.fieldBytes,before.fieldBytes);report.reentry.push(stats);
  }
  report.errors=b.errors;assert.equal(b.errors.length,0);report.status='passed';fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({...report,deepCases:report.deepCases.map(c=>({start:c.start,end:c.end,frames:c.frames,maxMove:c.maxMove,violations:c.violations}))},null,2));
 }catch(error){report.status='failed';report.error=String(error);report.errors=b.errors;fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));throw error;}
 finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
