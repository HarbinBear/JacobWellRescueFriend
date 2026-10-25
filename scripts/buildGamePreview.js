// Browser adapter around the real game entry, without replacing game logic or audio.
const fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),study=process.argv.includes('--sculpt');
const output=path.join(root,study?'node_modules/.cache/cave-sculpt-study/live':'design/deeptape');
const prefix=path.relative(output,root).split(path.sep).join('/')+'/';
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):e.name.endsWith('.ts')?[path.join(dir,e.name)]:[])}
const files=[path.join(root,'game.ts'),...walk(path.join(root,'src'))];
const factories=files.map(file=>{
  const id='/'+path.relative(root,file).replace(/\\/g,'/').slice(0,-3);
  let source=fs.readFileSync(file,'utf8');
  if(study&&id==='/src/world/CaveRockData')source='export const CAVE_ROCK_ROOM = '+fs.readFileSync(path.join(root,'design/cave-room/sculpt/assets/scene.json'),'utf8')+';';
  if(study&&id==='/src/render/RenderCaveRock')source=fs.readFileSync(path.join(root,'design/cave-room/sculpt/RenderCaveRock.ts'),'utf8').replaceAll('../../../src/','../');
  const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2016,module:ts.ModuleKind.CommonJS}}).outputText;
  return JSON.stringify(id)+':function(exports,require){'+code+'}';
}).join(',');
const bundle=`(()=>{const factories={${factories}},cache={};function load(id,from='/game'){if(id[0]==='.')id=from.slice(0,from.lastIndexOf('/')+1)+id;const parts=[];for(const p of id.split('/')){if(p==='..')parts.pop();else if(p&&p!=='.')parts.push(p)}id='/'+parts.join('/');if(!factories[id])id+='/index';if(!factories[id])throw Error('Missing game module '+id);if(!cache[id]){cache[id]={};factories[id](cache[id],name=>load(name,id))}return cache[id]}
const {CONFIG}=load('/src/core/config');CONFIG.audio.cloud.enabled=false;
load('/game');
const {state,player,input}=load('/src/core/state'),music=load('/src/audio/AdaptiveMusic');
window.DeepTapeGame={state,player,music,cave:{inspect:load('/src/render/RenderCaveRock').setCaveRockInspection,config:CONFIG,draw:load('/src/render/Render').draw,site(index=0){const m=state.mazeRescue;if(!m?.caveRockRoom||m.phase!=='play')return false;const r=m.caveRockRoom,s=r.sites[index];if(!s)return false;player.x=r.x+s.player[0];player.y=r.y+s.player[1];player.vx=player.vy=0;player.angle=player.targetAngle=input.targetAngle=Math.atan2(s.aim[1]-s.player[1],s.aim[0]-s.player[0]);load('/src/logic/CameraLogic').snapCameraToPlayer();return true;},aim(delta=0){const r=state.mazeRescue?.caveRockRoom;if(!r||state.mazeRescue.phase!=='play')return false;player.angle=player.targetAngle=input.targetAngle+=delta;return true;},wheelPos:load('/src/render/RenderWheel').getWheelBtnPos,stats:load('/src/render/RenderCaveRock').getCaveRockStats,collision:load('/src/logic/Collision').checkMazeCollision,nearest:load('/src/logic/Rope').findNearestWall,geometry:load('/src/world/RockGeometry'),path:load('/src/logic/Pathfinding').buildAvoidedPath},menu(){music.resetAdaptiveMusic();if(state.mazeRescue?.rockTrial)load('/src/logic/MazeLogic').exitCaveRockTrial();else state.screen='menu';},nearTarget(){
 if(!state.mazeRescue||state.mazeRescue.phase!=='play')return;
 const maze=state.mazeRescue,ts=maze.mazeTileSize,npc=state.npc;maze.npcRescued=false;maze.npcSecuredAt=0;npc.state='wait';
 let best=null,score=Infinity;for(let r=1;r<maze.mazeRows-1;r++)for(let c=1;c<maze.mazeCols-1;c++)if(maze.mazeMap[r][c]===0){const x=(c+.5)*ts,y=(r+.5)*ts,d=Math.hypot(x-npc.x,y-npc.y);if(d>45&&Math.abs(d-110)<score){best={x,y};score=Math.abs(d-110)}}
 const collision=load('/src/logic/Collision').checkMazeCollision;
 for(const [dx,dy] of [[-40,-45],[-60,0],[0,-60],[-40,40],[40,-40]])if(!collision(npc.x+dx,npc.y+dy,maze)){best={x:npc.x+dx,y:npc.y+dy};break}
 if(best){player.x=best.x;player.y=best.y;player.vx=player.vy=0;player.angle=player.targetAngle=input.targetAngle=Math.atan2(npc.y-player.y,npc.x-player.x);CONFIG.infiniteO2=true;player.o2=player.o2Max;maze.maxDepthAllowed=Math.max(maze.maxDepthAllowed,60);state.fishEnemies=[];maze.npcEncounterNoteAt=Date.now();load('/src/logic/BCDSystem').resetBCDSystem();load('/src/logic/CameraLogic').snapCameraToPlayer();}
}};})();`;
new Function(bundle);fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'game-runtime.js'),bundle);
let html=fs.readFileSync(path.join(__dirname,'gamePreview.html'),'utf8');
html=html.replaceAll("'../../'+value",JSON.stringify(prefix)+'+value').replaceAll("'../../'+v",JSON.stringify(prefix)+'+v');
if(study){
 html=html.replace(JSON.stringify(prefix)+'+value',JSON.stringify(prefix)+"+(value.startsWith('images/cave-rock/')?'design/cave-room/sculpt/assets/'+value.slice('images/cave-rock/'.length):value)");
 html=html.replace('href="index.html"','href="../index.html"').replace('磁带与分轨预览 ↗','回雕刻对照');
 html=html.replace('岩体版本已接入。','厚岩雕刻 · 独立实验').replace('主界面 → 倒带准备 → 入水 → 按下播放。<br>音乐响起，曲名短暂出现。','主菜单进入「岩体试跑」。<br>这是实验，不替换手机基线。');
 const controls='<section id="sculpt-controls"><p>实际游戏中观察，不暂停模拟。</p><button onclick="DeepTapeGame.cave.site(0)">看断冠</button><button onclick="DeepTapeGame.cave.site(1)">左侧岩壁</button><button onclick="DeepTapeGame.cave.site(2)">右侧岩壁</button><br><button onclick="DeepTapeGame.cave.aim(-.12)">向左转灯</button><button onclick="DeepTapeGame.cave.aim(.12)">向右转灯</button><br><button onclick="DeepTapeGame.cave.inspect(0)">正常材质</button><button onclick="DeepTapeGame.cave.inspect(2)">去掉纹理</button><button onclick="DeepTapeGame.cave.inspect(1)">法线诊断</button><p>去掉纹理仍应读出厚度；没有达到美术定稿。微信真机尚未验收。</p></section>';
 html=html.replace('<output id="phase"',controls+'<output id="phase"');
}
fs.writeFileSync(path.join(output,'game.html'),html);
console.log((study?'Isolated sculpt study, actual game':'Actual game browser preview')+': '+path.relative(root,path.join(output,'game.html'))+' ('+files.length+' source modules)');
