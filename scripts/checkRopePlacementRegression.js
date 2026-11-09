const assert=require('assert/strict'),fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.resolve(__dirname,'../src'),cache=new Map();
function load(file){
 if(file==='world/continuous/Runtime')return{stepAirFish:()=>false,moveContinuousFish:()=>null,isBootingWorld:()=>false};
 if(file==='audio/AudioManager')return{playSFX:()=>{}};
 if(cache.has(file))return cache.get(file);
 if(!fs.existsSync(path.join(root,file+'.ts')))file+='/index';
 const out={};cache.set(file,out);const code=ts.transpileModule(fs.readFileSync(path.join(root,file+'.ts'),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2016,module:ts.ModuleKind.CommonJS}}).outputText;
 new Function('exports','require',code)(out,n=>load(path.posix.normalize(path.posix.join(path.posix.dirname(file),n))));return out;
}
const core=load('core/state'),{state,player,input}=core,{CONFIG}=load('core/config');
const rope=load('logic/Rope'),wheel=load('logic/RopeWheel'),work=load('logic/Interaction'),layout=load('logic/InteractionLayout');
const originalNow=Date.now;let now=100000;Date.now=()=>now;
function setup(){
 CONFIG.continuousWorld=false;CONFIG.screenWidth=375;CONFIG.screenHeight=667;
 state.screen='mazeRescue';state.rope=core.createRopeState();state.interaction=core.createInteractionState();state.fishBump=core.createFishBumpState();state.fishEnemies=[];state.fishBite=null;
 state.mazeRescue={phase:'play',mazeCols:30,mazeRows:30,mazeTileSize:120,mazeMap:Array.from({length:30},()=>Array(30).fill(0)),mazeWalls:[],caveRockRoom:{x:0,y:0,width:3600,height:3600}};
 Object.assign(player,{x:450,y:550,vx:0,vy:0,angle:0,targetAngle:0,o2:100});input.move=0;state.manualDrive.activeTouches={};
 const a={x:430,y:550,r:10},b={x:600,y:550,r:10};state.mazeRescue.mazeWalls=[a,b];
 assert(rope.placeRopeAt({point:{x:440.3,y:550},wall:a}));player.x=500;rope.updateRopeSystem();return{a,b,current:state.rope.current};
}
function tick(){now+=1000/60;work.updateInteractionMovement(now);rope.updateRopeSystem();}
function finish(){for(let i=0;i<180&&state.interaction.task;i++)tick();assert.equal(state.interaction.task,null);}
try{
 let scene=setup(),c=layout.getRopeControlPosition();
 assert(wheel.startRopeWheelGesture(1,c.x,c.y,c.x,c.y));wheel.moveRopeWheelGesture(1,c.x,c.y-65);assert.equal(wheel.getRopeWheelAim().target,null);wheel.finishRopeWheelGesture(1,c.x,c.y-65,false);
 assert.equal(state.rope.current,scene.current);assert(state.rope.active);assert.equal(state.rope.links.length,0);
 Object.assign(player,{x:570,y:550});assert(work.beginRopeInteraction({point:{x:589.7,y:550},wall:scene.b}));tick();input.move=1;tick();input.move=0;
 assert.equal(state.interaction.task,null);assert.equal(state.rope.current,scene.current);assert(state.rope.active);
 player.x=566;rope.updateRopeSystem();assert(work.beginRopeInteraction({point:{x:589.7,y:550},wall:scene.b}));finish();
 assert(!state.rope.active);assert.equal(state.rope.ropes.length,1);assert.equal(state.rope.links.length,0);assert.equal(state.rope.ropes[0].startWall,scene.a);assert.equal(state.rope.ropes[0].endWall,scene.b);
 console.log('通过：终点落空、绑结被移动中断后保留原起点，再绑完成同一根岩壁绳。');
 scene=setup();c=layout.getRopeControlPosition();assert(wheel.startRopeWheelGesture(2,c.x,c.y,c.x,c.y));const socket=layout.getSelfSockets(c.x,c.y,CONFIG.marker.wheelOuterRadius)[0];
 wheel.moveRopeWheelGesture(2,socket.x,socket.y);wheel.finishRopeWheelGesture(2,socket.x,socket.y,false);finish();
 assert(state.rope.active,'方向拖动误滑腰扣不能把未完成绳提交为人体牵引');assert.equal(state.rope.current,scene.current);assert.equal(state.rope.links.length,0);
 console.log('通过：方向盘误滑过腰扣不会自动挂在人身上，不会把下次绑绳变成另一根起点。');
 assert(wheel.startRopeWheelGesture(3,c.x,c.y,c.x,c.y));wheel.moveRopeWheelGesture(3,socket.x,socket.y);now+=400;wheel.refreshRopeWheelAim();
 assert.equal(wheel.getRopeWheelAim().target.kind,'self');assert(wheel.finishRopeWheelGesture(3,socket.x,socket.y,false));finish();assert(!state.rope.active);assert.equal(rope.getPlayerRopeEnds().length,1);
 console.log('通过：明确停留确认腰扣仍能正常系到自己，不删除已有玩法。');
 scene=setup();assert(wheel.startRopeWheelGesture(4,c.x,c.y,c.x,c.y));wheel.moveRopeWheelGesture(4,socket.x,socket.y);player.x+=15;input.move=1;now+=500;wheel.refreshRopeWheelAim();wheel.finishRopeWheelGesture(4,socket.x,socket.y,false);input.move=0;finish();
 assert(state.rope.active);assert.equal(state.rope.links.length,0);
 console.log('通过：确认途中主动移动会撤销腰扣确认，未完成绳仍可接终点。');
}finally{Date.now=originalNow;}
