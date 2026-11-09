const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {openReviewBrowser}=require('../design/cave-room/browser.cjs');
const output=path.resolve(__dirname,'../node_modules/.cache/fish-interactions-browser-v2');
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
(async()=>{
 fs.mkdirSync(output,{recursive:true});
 const browser=await openReviewBrowser(process.env.JWR_PREVIEW_URL||'http://127.0.0.1:60972/design/fish-handling/game.html',1100,940);
 const report={};
 try{
  const evaluate=s=>browser.evaluate(s),before=await evaluate('JSON.stringify({storage:{...localStorage},ex:DeepTapeGame.state.extraction,story:DeepTapeGame.state.story2})');
  const rect=await evaluate('(()=>{const r=document.getElementById("game").getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}})()');
  const screen=p=>({x:rect.x+p.x/375*rect.w,y:rect.y+p.y/667*rect.h});
  const touch=(type,p)=>browser.command('Input.dispatchTouchEvent',{type,touchPoints:p?[{...screen(p),id:1}]:[]});
  async function shot(name){const image=await evaluate('document.getElementById("game").toDataURL("image/png")');fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(image.split(',')[1],'base64'));}
  async function ready(){const start=Date.now();while(await evaluate('DeepTapeGame.state.interaction.cooldown>0||DeepTapeGame.state.fishBump.stunTimer>0')){if(Date.now()-start>3000)throw Error('Action recovery timeout');await wait(30);}}
  async function gesture(expression,mode='action',radius){
   if(mode==='action')await ready();
   const p=await evaluate(`(()=>{const g=DeepTapeGame,a=g.interactions,p=${expression},c=${mode==='rope'?'a.layout.getRopeControlPosition()':'a.layout.getActionWheelCenter()'},b=${mode==='rope'?'c':'a.layout.getActionControlPosition()'};
    const angle=Math.atan2(p.y-g.player.y,p.x-g.player.x),r=${radius|| (mode==='rope'?82:68)};return{button:b,target:{x:c.x+Math.cos(angle)*r,y:c.y+Math.sin(angle)*r}}})()`);
   await touch('touchStart',p.button);await touch('touchMove',p.target);
   if(mode==='rope')await evaluate('(()=>{const g=DeepTapeGame,a=g.interactions,t=a.wheel.getRopeWheelAim()?.target;if(!t)return;const p=a.rope.ropeAnchorPoint(t.anchor),dx=p.x-g.player.x,dy=p.y-g.player.y,d=Math.hypot(dx,dy)||1,r=g.cave.config.fishInteraction.handReach,stance={x:p.x-dx/d*r,y:p.y-dy/d*r},speed=g.cave.config.fishInteraction.approachSpeed;window.__LastWorkPick={kind:t.kind,point:p,player:{x:g.player.x,y:g.player.y},distance:d,stance,rock:g.cave.collision(stance.x,stance.y,g.state.mazeRescue),net:!!a.rope.traceWovenRopes(g.player,stance,g.cave.config.maze.playerRadius),response:a.rope.getRopeResponseAlong(g.player,stance,g.cave.config.maze.playerRadius,dx/d*speed,dy/d*speed)?.kind};})()');
   return p;
  }
  async function trace(name){
   const data=await evaluate(`new Promise(resolve=>{const start=Date.now(),frames=[],shots={};function frame(){const g=DeepTapeGame,t=g.state.interaction.task;
    if(t){const p=t.time/t.duration,m=t.phase==='perform'?g.interactions.motion.sampleWorkMotion(g.interactions.work.getInteractionWorkPose()):null;
     frames.push({elapsed:Date.now()-start,phase:t.phase,progress:p,applied:!!t.applied,motion:m?.phase,ropes:g.state.rope.ropes.length,impact:g.state.interaction.impact?.kind,shake:g.state.fx.shake});
     const key=t.phase==='approach'?'approach':t.applied?'impact':p<.30?'windup':p<.57?'prepare':'output';
     if(!shots[key])shots[key]=document.getElementById('game').toDataURL('image/png');
     if(Date.now()-start<6000){requestAnimationFrame(frame);return;}}
    resolve({frames,shots,feedback:g.state.interaction.feedback,stillRunning:!!t});}requestAnimationFrame(frame);})`);
   if(!data.feedback?.success)console.log('接近诊断：'+JSON.stringify(await evaluate('window.__LastWorkPick')));
   assert(!data.stillRunning,'Animation must end');assert(data.feedback?.success,JSON.stringify(data.feedback));
   for(const [key,image]of Object.entries(data.shots))fs.writeFileSync(path.join(output,name+'-'+key+'.png'),Buffer.from(image.split(',')[1],'base64'));
   delete data.shots;return data;
  }
  report.scene=await evaluate('DeepTapeGame.interactions.setup("rammer",true)');assert(report.scene.caught);
  await wait(300);await evaluate('DeepTapeGame.interactions.near("head");DeepTapeGame.state.flashlightOn=true');
  const first=await gesture('a.fishGeometry.fishHeadPoint(g.state.fishEnemies[0])','action',34);
  assert.equal(await evaluate('DeepTapeGame.state.interaction.aim?.target?.kind'),'fish');
  const c=await evaluate('DeepTapeGame.interactions.layout.getActionWheelCenter()'),angle=Math.atan2(first.target.y-c.y,first.target.x-c.x);
  await touch('touchMove',{x:c.x+Math.cos(angle)*78,y:c.y+Math.sin(angle)*78});assert.equal(await evaluate('DeepTapeGame.state.interaction.aim?.target?.kind'),'fish','Drag radius never chooses another depth');
  assert.equal(await evaluate('DeepTapeGame.state.fishEnemies[0].stunFrames'),0);await shot('01-direction-preview');await touch('touchEnd');
  report.stun=await trace('02-stun');assert(report.stun.frames.some(f=>!f.applied&&f.motion==='举瓶收肘'));
  assert(report.stun.frames.some(f=>f.applied&&f.progress<.85&&f.impact==='stun'&&f.shake>=4),'Impact feedback during output');
  assert(await evaluate('DeepTapeGame.state.fishEnemies[0].stunFrames>0'));await shot('03-stunned');
  const status=await evaluate('DeepTapeGame.interactions.statusRect()');assert(status.y+status.height<667/2-65,'Text stays off the actor/action area');

  await evaluate('DeepTapeGame.interactions.near("knot")');await gesture('a.fishGeometry.fishKnotPoint(g.state.fishEnemies[0])','rope');
  assert.equal(await evaluate('DeepTapeGame.interactions.wheel.getRopeWheelAim()?.target?.kind'),'fish');await shot('04-bind-preview');await touch('touchEnd');
  report.bind=await trace('05-bind');assert(report.bind.frames.some(f=>f.motion==='绕两圈'));assert(report.bind.frames.some(f=>f.motion==='交叉穿结'));assert(report.bind.frames.some(f=>f.motion==='双手拉紧'));
  assert(await evaluate('DeepTapeGame.state.fishEnemies[0].bound&&DeepTapeGame.state.rope.active'));
  const ropeButton=await evaluate('DeepTapeGame.interactions.layout.getRopeControlPosition()');await touch('touchStart',ropeButton);
  const self=await evaluate('DeepTapeGame.interactions.layout.getSelfSockets(DeepTapeGame.state.wheel.centerX,DeepTapeGame.state.wheel.centerY,DeepTapeGame.cave.config.marker.wheelOuterRadius)[0]');
  const waistBefore=await evaluate('({x:DeepTapeGame.player.x,y:DeepTapeGame.player.y,vx:DeepTapeGame.player.vx,vy:DeepTapeGame.player.vy,input:DeepTapeGame.input.move})');
  await touch('touchMove',self);await wait(450);const waistAfter=await evaluate('({x:DeepTapeGame.player.x,y:DeepTapeGame.player.y,vx:DeepTapeGame.player.vx,vy:DeepTapeGame.player.vy,input:DeepTapeGame.input.move,progress:DeepTapeGame.interactions.wheel.getRopeSelfProgress(),open:DeepTapeGame.state.wheel.open,active:DeepTapeGame.state.rope.active,bump:DeepTapeGame.state.fishBump.stunTimer})');assert.equal(await evaluate('DeepTapeGame.interactions.wheel.getRopeWheelAim()?.target?.kind'),'self',JSON.stringify({waistBefore,waistAfter}));await touch('touchEnd');report.self=await trace('06-self');
  assert.equal(await evaluate('DeepTapeGame.interactions.rope.getPlayerRopeEnds().length'),1);

  await evaluate('DeepTapeGame.interactions.near("net")');await gesture('a.fishGeometry.fishNetHandlePoint(g.state.fishEnemies[0])');
  const preview=await evaluate('(()=>{const g=DeepTapeGame,t=g.state.interaction.aim?.target;return{kind:t?.kind,removed:t?.removal?new Set(t.removal.removed.map(s=>s.rope)).size:0,ropes:g.state.rope.ropes.length,point:t?g.interactions.targets.actionTargetPoint(t):null}})()');
  assert.equal(preview.kind,'net',JSON.stringify(preview));assert.equal(preview.removed,preview.ropes,'Whole connected net is visibly selected');await shot('07-whole-net-preview');await touch('touchEnd');
  report.cut=await trace('08-cut');assert(report.cut.frames.some(f=>f.motion==='绷绳蓄力'&&!f.applied));
  assert(report.cut.frames.some(f=>f.applied&&f.progress<.8&&f.ropes===0&&f.impact==='cut'),'Whole net removed at the short impact, not after recovery');
  assert.equal(await evaluate('DeepTapeGame.state.rope.ropes.length'),0);assert(await evaluate('DeepTapeGame.state.rope.fading.length>0'),'A finite sinking animation remains');
  assert(await evaluate('DeepTapeGame.state.fishEnemies[0].bound'));assert.equal(await evaluate('DeepTapeGame.interactions.rope.getPlayerRopeEnds().length'),1);await shot('09-sinking-net');
  await wait(1000);assert.equal(await evaluate('DeepTapeGame.state.rope.fading.length'),0,'No permanent floating fragments');await shot('10-net-gone');

  await ready();const actionButton=await evaluate('DeepTapeGame.interactions.layout.getActionControlPosition()');await touch('touchStart',actionButton);
  const waist=await evaluate('(()=>{const a=DeepTapeGame.interactions,c=a.layout.getActionWheelCenter();return a.layout.getSelfSockets(c.x,c.y,DeepTapeGame.cave.config.fishInteraction.wheelRadius,1)[0]})()');
  await touch('touchMove',waist);assert.equal(await evaluate('DeepTapeGame.state.interaction.aim?.target?.kind'),'self');await touch('touchEnd');report.untie=await trace('11-untie');
  assert(report.untie.frames.some(f=>f.motion==='挑开绳环'));assert(report.untie.frames.some(f=>f.motion==='抽出绳尾'));
  assert.equal(await evaluate('DeepTapeGame.interactions.rope.getPlayerRopeEnds().length'),0);assert.equal(await evaluate('DeepTapeGame.state.rope.links.length'),0);assert(await evaluate('DeepTapeGame.state.fishEnemies[0].bound'));
  await ready();await touch('touchStart',actionButton);await touch('touchCancel');assert.equal(await evaluate('DeepTapeGame.state.interaction.gesture'),null);
  await touch('touchStart',actionButton);await evaluate('window.dispatchEvent(new Event("blur"))');await touch('touchCancel');assert.equal(await evaluate('DeepTapeGame.state.interaction.task'),null);
  report.cancel='原生触点取消和失焦均无副作用';

  // Real rock work: point selection is direction-only and the body must approach.
  const rock=await evaluate(`(()=>{const g=DeepTapeGame,m=g.state.mazeRescue,r=m.caveRockRoom;g.interactions.work.resetInteractions();g.interactions.rope.cancelRopePlacement();g.state.rope.ropes=[];
   for(const s of r.sites)for(let dx=-25;dx<=25;dx+=10)for(let dy=-25;dy<=25;dy+=10){const p={x:r.x+s.player[0]+dx,y:r.y+s.player[1]+dy};if(g.cave.collision(p.x,p.y,m))continue;
    const near=g.cave.nearest(p.x,p.y,58);if(!near||near.dist<35)continue;const q=g.cave.geometry.closestRockPoint(near.wall,p.x,p.y);const a={x:q.x+(p.x-q.x)/near.dist*.3,y:q.y+(p.y-q.y)/near.dist*.3};
    if(!g.cave.geometry.rockSegmentClear(m.mazeWalls,p,a))continue;Object.assign(g.player,{x:p.x,y:p.y,vx:0,vy:0,angle:Math.atan2(a.y-p.y,a.x-p.x)});g.player.targetAngle=g.player.angle;return{p,anchor:a};}return null})()`);
  assert(rock);await gesture(JSON.stringify(rock.anchor),'rope');assert.equal(await evaluate('DeepTapeGame.interactions.wheel.getRopeWheelAim()?.target?.kind'),'rock');await touch('touchEnd');
  report.rock=await trace('12-rock');const after=await evaluate('({x:DeepTapeGame.player.x,y:DeepTapeGame.player.y})');assert(Math.hypot(after.x-rock.p.x,after.y-rock.p.y)>5);
  assert(report.rock.frames.some(f=>f.motion==='绕两圈'));assert(await evaluate('DeepTapeGame.state.rope.active'));
  await evaluate('DeepTapeGame.menu()');assert.equal(await evaluate('JSON.stringify({storage:{...localStorage},ex:DeepTapeGame.state.extraction,story:DeepTapeGame.state.story2})'),before);
  assert.equal(await evaluate('DeepTapeGame.state.interaction.task'),null);assert.equal(await evaluate('DeepTapeGame.state.rope.fading.length'),0);
  report.errors=browser.errors;assert.equal(browser.errors.length,0);
  report.scope='真实游戏、原生触控、实际岩体与绳网，不暂停全场；逐帧检查前摇/冲击/后摇与有限整网淡出。桌面浏览器通过，微信真机仍需验收。';
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({scene:report.scene,stun:report.stun.feedback,cut:report.cut.feedback,bind:report.bind.feedback,untie:report.untie.feedback,errors:report.errors,scope:report.scope},null,2));
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
