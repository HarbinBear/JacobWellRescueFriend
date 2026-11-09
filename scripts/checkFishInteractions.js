const assert=require('assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.resolve(__dirname,'../src'),cache=new Map(),storage=new Map(),noop=()=>0;
function load(file){
 if(file==='world/continuous/Runtime')return{stepAirFish:()=>false,moveContinuousFish:()=>null,isBootingWorld:()=>false};
 if(file==='audio/AudioManager')return{playSFX:noop};if(file==='logic/BreathSystem')return{spawnImpactBurst:noop};
 if(file==='render/Canvas')return{ctx:{},logicW:375,logicH:667};
 if(file==='core/SaveStorage')return{saveJSON:(k,v)=>{storage.set(k,JSON.parse(JSON.stringify(v)));return true},loadJSON:k=>storage.get(k),removeKey:k=>storage.delete(k)};
 if(cache.has(file))return cache.get(file);if(!fs.existsSync(path.join(root,file+'.ts')))file+='/index';
 const out={};cache.set(file,out);const code=ts.transpileModule(fs.readFileSync(path.join(root,file+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2016,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('exports','require',code)(out,n=>load(path.posix.normalize(path.posix.join(path.posix.dirname(file),n))));return out;
}
const core=load('core/state'),{state,player,input}=core,{CONFIG}=load('core/config');
CONFIG.continuousWorld=false;
const fishLogic=load('logic/FishEnemy'),handling=load('logic/FishHandling'),geometry=load('logic/FishGeometry'),rope=load('logic/Rope');
const actions=load('logic/ActionWheel'),targets=load('logic/ActionTargets'),work=load('logic/Interaction'),wheel=load('logic/RopeWheel');
const layout=load('logic/InteractionLayout'),rocks=load('world/RockGeometry'),topology=load('logic/RopeTopology'),net=load('logic/RopeNet');
const pose=load('render/InteractionPose'),render=load('render/RenderInteraction'),tethers=load('logic/RopeTether');
const originalNow=Date.now;let now=100000;Date.now=()=>now;
const point=(x,y)=>({x,y});
const strand=(a,b)=>({start:a,end:b,path:[a,b],startWall:null,endWall:null,slackFactor:0,mode:'tight'});
function setup(){
 state.screen='mazeRescue';state.rope=core.createRopeState();state.interaction=core.createInteractionState();state.fishBump=core.createFishBumpState();
 state.fishEnemies=[];state.fishBite=null;state.flashlightOn=false;
 state.mazeRescue={seed:128473,phase:'play',mazeCols:100,mazeRows:100,mazeTileSize:120,mazeMap:Array.from({length:100},()=>Array(100).fill(0)),
  mazeWalls:[],mazeExplored:[],diveHistory:[],caveRockRoom:{x:0,y:0,width:1200,height:1200}};
 Object.assign(player,{x:450,y:550,vx:0,vy:0,angle:0,targetAngle:0,o2:100});input.move=0;input.speedUp=false;state.manualDrive.activeTouches={};
 return state.mazeRescue;
}
function mesh(x=450,y=610){return[...[-30,-15,0,15,30].map(d=>strand(point(x-150,y+d),point(x+150,y+d))),...[-40,-20,0,20,40].map(d=>strand(point(x+d,y-75),point(x+d,y+65)))];}
function caught(kind='rammer',x=450,y=610){
 const fish=fishLogic.createFishEnemy(x-1,y-59,x,y,200,kind);state.fishEnemies.push(fish);Object.assign(fish,{angle:Math.PI/2,vx:0,vy:4.5});
 for(let i=0;i<48;i++){
  rope.updateRopeMotion();const from=point(fish.x,fish.y);fish.vx=0;fish.vy=4.5;fish.y+=4.5;
  rope.resolveWovenRopeContact(fish,from,CONFIG.fishEnemy.size*(kind==='shoal'?.18:kind==='provoked'?.64:kind==='rammer'?.48:.38),point(0,4.5),()=>true);
  if(rope.getRopeContact(fish)?.kind==='snag'){fish.vx=fish.vy=0;return fish;}
 }throw Error('Capture failed: '+kind);
}
function near(p,distance=21){Object.assign(player,{x:p.x-distance,y:p.y,vx:0,vy:0,angle:0,targetAngle:0});}
function tick(count=1,fps=60,updateFish=true){for(let i=0;i<count;i++){
 now+=1000/fps;work.updateInteractionMovement(now);
 const next=point(player.x+player.vx,player.y+player.vy);
 if(!state.mazeRescue.mazeWalls.some(w=>rocks.circleHitsRock(w,next.x,next.y,CONFIG.maze.playerRadius))){player.x=next.x;player.y=next.y;}
 rope.updateRopeSystem();rope.updateRopeMotion();if(updateFish)fishLogic.updateAllFishEnemies(1);
}}
function finishTask(limit=220){for(let i=0;i<limit&&state.interaction.task;i++)tick();assert.equal(state.interaction.task,null,'Task must end');}
function aimAt(p,id=41,radius=60){const b=layout.getActionControlPosition(),c=layout.getActionWheelCenter(),a=Math.atan2(p.y-player.y,p.x-player.x);
 assert(actions.startActionGesture(id,b.x,b.y));const pointer={x:c.x+Math.cos(a)*radius,y:c.y+Math.sin(a)*radius};actions.moveActionGesture(id,pointer.x,pointer.y);return{id,pointer};}
try{
 setup();core.touches.joystickId=77;input.move=1;
 let controlButton=layout.getActionControlPosition();assert(actions.startActionGesture(78,controlButton.x,controlButton.y));
 assert.equal(core.touches.joystickId,77);assert.equal(input.move,1);assert.equal(work.updateInteractionMovement(now),false,'Right-hand aiming must not take over movement');
 actions.finishActionGesture(78,controlButton.x,controlButton.y,true);
 controlButton=layout.getRopeControlPosition();assert(wheel.startRopeWheelGesture(78,controlButton.x,controlButton.y,controlButton.x,controlButton.y));
 assert.equal(core.touches.joystickId,77);assert.equal(work.updateInteractionMovement(now),false);
 wheel.finishRopeWheelGesture(78,controlButton.x,controlButton.y,true);core.touches.joystickId=null;input.move=0;
 setup();const front=strand(point(476,500),point(476,620)),back=strand(point(508,500),point(508,620));state.rope.ropes=[front,back];
 for(const fakeLength of [1,8,25,63,1000]){assert.equal(wheel.aimRopeAnchor(0,fakeLength).target.anchor.rope,front);assert.equal(targets.pickActionTarget(0,fakeLength).target.rope,front);}
 let gesture=aimAt(point(476,550),1,32);assert.equal(state.interaction.aim.target.rope,front);actions.moveActionGesture(1,layout.getActionWheelCenter().x+78,layout.getActionWheelCenter().y);assert.equal(state.interaction.aim.target.rope,front);
 actions.finishActionGesture(1,layout.getActionWheelCenter().x+78,layout.getActionWheelCenter().y,true);
 state.mazeRescue.mazeWalls=[{x:468,y:550,r:5}];assert.equal(wheel.aimRopeAnchor(0).target.kind,'rock');assert.equal(targets.pickActionTarget(0).target,null);
 console.log('通过：两套工具只选方向，拖近拖远结果一致，前面的绳/岩石阻挡后面目标。');

 setup();state.rope.ropes=[strand(point(469,510),point(469,610))];
 const entity=fishLogic.createFishEnemy(492,550,undefined,undefined,undefined,'curious');entity.angle=0;state.fishEnemies=[entity];
 assert.equal(targets.pickActionTarget(0).target.fish,entity,'A fish overrides the front net');
 assert.equal(wheel.aimRopeAnchor(0).target,null,'Awake fish cannot be bound; a front net is not substituted');
 handling.stunFish(entity);assert.equal(wheel.aimRopeAnchor(0).target.anchor.fish,entity);
 const nearer=fishLogic.createFishEnemy(482,550);nearer.angle=0;state.fishEnemies.push(nearer);assert.equal(targets.pickActionTarget(0).target.fish,nearer,'Nearest important entity wins');
 state.fishEnemies=[entity];entity.x=514;state.mazeRescue.mazeWalls=[{x:480,y:550,r:5}];
 assert.equal(targets.pickActionTarget(0,undefined,true).target,null,'Fish priority cannot pass through rock');
 assert.equal(targets.pickActionTarget(0).target.rope,state.rope.ropes[0],'The visible front rope remains selectable');
 console.log('通过：实体优先于前方网线，但不穿岩石、不越过前面的另一条鱼。');

 for(const kind of ['curious','piranha','rammer','provoked','shoal']){
  setup();const fish=fishLogic.createFishEnemy(484,550,undefined,undefined,undefined,kind);fish.angle=Math.PI;fish.vx=fish.vy=0;state.fishEnemies=[fish];
  const target=targets.pickActionTarget(0,undefined,true).target;assert(target&&target.fish===fish);
  assert(work.beginActionInteraction(target));assert.equal(fish.stunFrames,0);finishTask();
  assert(handling.isFishStunned(fish),JSON.stringify({kind,feedback:state.interaction.feedback}));assert(!fish.dead);
 }
 console.log('通过：五类未晕且没有入网的鱼，实际碰到均可敲晕；动画命中而非状态门槛。');

 for(const kind of ['curious','rammer','piranha','provoked','shoal']){
  setup();state.rope.ropes=mesh();const fish=caught(kind);near(geometry.fishHeadPoint(fish));
  gesture=aimAt(geometry.fishHeadPoint(fish));assert.equal(state.interaction.aim?.target?.fish,fish);
  assert.equal(fish.stunFrames,0);assert.equal(state.rope.ropes.length,10,'Preview has no effect');
  assert(actions.finishActionGesture(gesture.id,gesture.pointer.x,gesture.pointer.y,false));finishTask();
  assert(handling.isFishStunned(fish));assert.equal(state.rope.ropes.length,10,'Stunning does not dismantle the net');
 }
 console.log('通过：五类入网鱼均可方向预选并敲晕，预览与敲击不会误拆绳网。');

 setup();const original=fishLogic.createFishEnemy(482,550);original.angle=0;state.fishEnemies=[original];
 gesture=aimAt(point(482,550));const substitute=fishLogic.createFishEnemy(482,550);substitute.angle=0;state.fishEnemies=[substitute];tick(3);
 assert.equal(state.interaction.aim,null);assert.equal(actions.finishActionGesture(gesture.id,gesture.pointer.x,gesture.pointer.y,false),false);assert.equal(substitute.stunFrames,0);
 state.fishEnemies=[original];gesture=aimAt(point(482,550),42);const c=layout.getActionWheelCenter();actions.moveActionGesture(42,c.x,c.y);assert.equal(actions.finishActionGesture(42,c.x,c.y,false),false);
 console.log('通过：失去目标不自动换对象，中心取消和系统取消无副作用。');

 for(const fps of [30,60,120]){setup();const fish=fishLogic.createFishEnemy(600,700);fish.bound=true;state.fishEnemies=[fish];handling.stunFish(fish);
  for(let i=0;i<fps*4;i++){now+=1000/fps;fishLogic.updateFishEnemy(fish,1)}assert(Math.abs(fish.stunFrames-240)<.01);
  for(let i=0;i<=fps*4;i++){now+=1000/fps;fishLogic.updateFishEnemy(fish,1)}assert.equal(fish.state,'bound');assert(!fish.dead);
 }
 console.log('通过：30/60/120Hz 约八秒暂时眩晕，醒来与绑缚独立。');
 setup();const impactFish=fishLogic.createFishEnemy(484,550,undefined,undefined,undefined,'curious');impactFish.angle=Math.PI;state.fishEnemies=[impactFish];
 assert(work.beginActionInteraction(targets.pickActionTarget(0,undefined,true).target));tick(12);assert.equal(impactFish.stunFrames,0,'Windup is not an immediate stun');
 while(state.interaction.task&&!state.interaction.task.applied)tick();
 assert(state.interaction.task?.applied&&impactFish.stunFrames>0,'Stun occurs during output, before recovery ends');
 assert.equal(state.interaction.impact.kind,'stun');assert(state.fx.shake>=6);const frozenTime=state.interaction.task.time;tick(2);
 assert.equal(state.interaction.task.time,frozenTime,'The impact has a short local hold');finishTask();
 setup();const impactRope=strand(point(476,500),point(476,620));state.rope.ropes=[impactRope];near(point(476,550));
 assert(work.beginActionInteraction(targets.pickActionTarget(0).target));tick(18);assert.equal(state.rope.ropes.length,1,'Cut windup preserves structure');
 while(state.interaction.task&&!state.interaction.task.applied)tick();
 assert(state.interaction.task?.applied);assert.equal(state.rope.ropes.length,0,'The whole strand disappears from physics at the snap, not after recovery');
 assert.equal(state.interaction.impact.kind,'cut');assert(state.fx.shake>=5);assert.equal(state.rope.fading.length,1);
 finishTask();assert.equal(state.rope.fading.length,1,'Recovery cannot apply the effect twice');
 assert(CONFIG.fishInteraction.strikeFrames/60*.12<.1&&CONFIG.fishInteraction.cutFrames/60*.09<.1,'Output bursts stay under one tenth of a second');
 console.log('通过：前摇不提前生效，敲击/合剪在瞬时输出帧结算，强震屏与50ms局部顿挫，后摇不重复拆除。');

 setup();state.rope.ropes=mesh().concat(mesh(850));const fish=caught('rammer'),other=caught('curious',850);handling.stunFish(fish);near(geometry.fishKnotPoint(fish));
 const bind=wheel.aimRopeAnchor(0).target;assert.equal(bind.kind,'fish');assert(work.beginRopeInteraction(bind.anchor));tick(30);assert(!fish.bound&&!state.rope.active);finishTask();assert(fish.bound&&state.rope.active);
 assert(work.beginRopeInteraction({point:rope.playerRopePoint(),self:true}));finishTask();const link=state.rope.links[0];assert.equal(rope.getPlayerRopeEnds().length,1);
 const cuts=rope.fishPocketCuts(fish),removal=rope.getRopeRemoval(cuts);assert.equal(new Set(removal.removed.map(s=>s.rope)).size,10,'Preview includes whole connected net');
 const untouched=state.rope.ropes.slice(10),paths=untouched.map(r=>JSON.stringify(r.path));near(geometry.fishNetHandlePoint(fish));state.interaction.cooldown=0;
 assert(work.beginActionInteraction({kind:'net',fish,cuts,removal,point:geometry.fishNetHandlePoint(fish)}));finishTask();
 assert.equal(state.rope.ropes.length,10);assert.equal(rope.getRopeContact(fish),null);assert.equal(rope.getRopeContact(other)?.kind,'snag');assert(fish.bound&&state.rope.links.includes(link));
 untouched.forEach((r,i)=>{assert(state.rope.ropes.includes(r));assert.equal(JSON.stringify(r.path),paths[i]);assert(!r.startLoose&&!r.endLoose)});
 assert.equal(state.rope.fading.length,10);assert(state.rope.fading.every(f=>f.path.length>=2));tick(100);assert.equal(state.rope.fading.length,0,'Removed rope visuals end, never persist as loose strands');
 const extra={...link,id:99,start:{kind:'rock',point:point(player.x-100,player.y)},end:{kind:'player',point:rope.playerRopePoint()},path:[point(player.x-100,player.y),rope.playerRopePoint()]};state.rope.links.push(extra);state.interaction.cooldown=0;
 assert(work.beginActionInteraction({kind:'self',link,end:'end',point:rope.playerRopePoint()}));finishTask();
 assert(!state.rope.links.includes(link)&&state.rope.links.includes(extra));assert.equal(rope.getPlayerRopeEnds().length,1);assert(fish.bound);assert.equal(link.end.kind,'player','Removed link is not left as a permanent loose tail');
 state.interaction.cooldown=0;near(geometry.fishKnotPoint(fish));assert(work.beginActionInteraction({kind:'fishKnot',fish,point:geometry.fishKnotPoint(fish)}));finishTask();assert(!fish.bound);
 console.log('通过：绑鱼、系自己、整张连通网淡出、独立网保持受力、单根腰绳解除，不留断头或悬空节点。');

 setup();const a=strand(point(300,600),point(600,600)),b=strand(point(550,500),point(550,700)),independent=strand(point(900,500),point(900,700));state.rope.ropes=[a,b,independent];near(point(450,600));
 const plan=rope.getRopeRemoval([{rope:a,point:point(450,600)}]);assert.equal(new Set(plan.removed.map(s=>s.rope)).size,2);assert(rope.applyRopeRemoval(plan));
 assert.deepEqual(state.rope.ropes,[independent]);assert.equal(net.getRopeNet(state.rope.ropes).knots.length,0);assert.equal(state.rope.fading.length,2);
 assert.equal(rope.traceWovenRopes(point(450,550),point(450,650),10),null,'Removed net is immediately absent from physics');
 const save=load('logic/MazeSave');state.mazeRescue.caveRockRoom=undefined;assert(save.saveMazeProgress());assert(save.loadMazeProgress());assert.equal(state.rope.ropes.length,1);assert(!state.rope.ropes.some(r=>r.startLoose||r.endLoose));
 console.log('通过：节点相连整网一次移除，独立绳原样保留，碰撞立即释放，存档不产生挖空或悬空断端。');
 setup();const parent=strand(point(300,600),point(600,600)),cross=strand(point(500,500),point(500,700));state.rope.ropes=[parent,cross];
 const dependent={id:7,start:{kind:'rope',rope:parent,point:point(450,600)},end:{kind:'player',point:rope.playerRopePoint()},path:[point(450,600),rope.playerRopePoint()],length:72,tension:0,age:0};state.rope.links=[dependent];
 const dependencyPlan=rope.getRopeRemoval([{rope:parent,point:point(450,600)}]);assert(dependencyPlan.links.includes(dependent),'Preview includes links losing their anchor');
 assert(rope.applyRopeRemoval(dependencyPlan));assert.equal(state.rope.links.length,0);assert.equal(state.rope.fading.length,3);
 console.log('通过：预览包含随网失去锚点的连接，整网与依赖绳一起有限淡出，不留下半空绳端。');

 for(const destination of ['rock','rope']){setup();const fish=fishLogic.createFishEnemy(450,600);state.fishEnemies=[fish];handling.stunFish(fish);near(geometry.fishKnotPoint(fish));
  assert(work.beginRopeInteraction({point:geometry.fishKnotPoint(fish),fish}));finishTask();let anchor;
  if(destination==='rock'){const wall={x:600,y:600,r:35};state.mazeRescue.mazeWalls=[wall];anchor={point:point(564.75,600),wall};}
  else{const parent=strand(point(530,640),point(650,640));state.rope.ropes=[parent];anchor={point:point(580,640),onRope:true,rope:parent};}
  near(anchor.point);assert(work.beginRopeInteraction(anchor));finishTask();assert.equal(state.rope.links[0].end.kind,destination);
 }
 setup();const wall={x:600,y:600,r:35};state.mazeRescue.mazeWalls=[wall];const anchor={point:point(564.75,600),wall};Object.assign(player,{x:520,y:600});
 assert(work.beginRopeInteraction(anchor));const initial=player.x;tick(6);assert(player.x>initial&&!state.rope.active);finishTask();assert(state.rope.active);
 rope.cancelRopePlacement();near(anchor.point);assert(work.beginRopeInteraction(anchor));input.move=1;tick();assert.equal(state.interaction.task,null);assert(!state.rope.active);input.move=0;
 assert(work.beginRopeInteraction(anchor));state.fishBump.stunTimer=10;tick();assert.equal(state.interaction.task,null);assert(!state.rope.active);
 console.log('通过：岩石、旧绳、鱼共用真实接近与动画提交，移动和撞晕仍可取消。');

 const signatures=new Set();
 for(const kind of ['tie','untie','cut','stun']){
  const samples=[0,.2,.45,.55,.595,.67,.85,1].map(progress=>pose.sampleWorkMotion({kind,progress,x:22,y:0}));
  signatures.add(JSON.stringify(samples));assert(new Set(samples.map(s=>s.phase)).size>=3);assert(samples.every(s=>[s.left.x,s.left.y,s.right.x,s.right.y,s.roll].every(Number.isFinite)));
 }
 assert.equal(signatures.size,4,'Four actions have different trajectories, elbows, tools and weight shifts');
 const stunMotion=pose.sampleWorkMotion({kind:'stun',progress:.4,x:22,y:0});assert(stunMotion.right.x<0&&stunMotion.right.y>15,'A bonk visibly retracts its elbow first');
 const tieMotion=pose.sampleWorkMotion({kind:'tie',progress:.9,x:22,y:0});assert(tieMotion.left.y<0&&tieMotion.right.y>0,'Tie ends with two hands pulling apart');
 for(const [width,height] of [[320,568],[375,667],[393,852],[768,1024]]){CONFIG.screenWidth=width;CONFIG.screenHeight=height;const box=render.getInteractionStatusRect();assert(box.y+box.height<height/2-65,'Status stays off the actor/action area');}
 CONFIG.screenWidth=375;CONFIG.screenHeight=667;
 console.log('通过：绕绳拉结、挑环抽绳、剪切、收肘挥击有明确不同动作，提示区在小屏和大屏均不遮挡人物。');

 setup();const bound=fishLogic.createFishEnemy(450,610);bound.bound=true;state.fishEnemies=[bound];const tether={id:1,start:{kind:'fish',fish:bound,point:point(450,610)},end:{kind:'player',point:rope.playerRopePoint()},path:[point(450,610),rope.playerRopePoint()],length:72,tension:0,age:0};state.rope.links=[tether];Object.assign(player,{x:760,y:610});tethers.updateRopeTethers();assert(player.vx<0&&bound.vx>0);
 for(let i=0;i<1800;i++){now+=1000/60;player.vx+=i%120<60?.2:-.2;player.x+=player.vx;player.y+=player.vy;fishLogic.updateAllFishEnemies(1);player.vx*=.92;player.vy*=.92;assert([player.x,player.y,bound.x,bound.y,tether.tension].every(Number.isFinite));}
 assert(Math.hypot(bound.x-player.x,bound.y-player.y)<180);work.resetInteractions();assert.equal(state.rope.links.length,0);assert.equal(state.rope.fading.length,0);
 console.log('通过：牵引受力稳定，拆除视觉与运行态跨下潜清理。');
}finally{Date.now=originalNow}
