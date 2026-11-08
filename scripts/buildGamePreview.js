// Browser adapter around the real game entry, without replacing game logic or audio.
const fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.resolve(__dirname,'..'),study=process.argv.includes('--sculpt'),fish=process.argv.includes('--fish'),controls=process.argv.includes('--controls');
const output=path.join(root,controls?'node_modules/.cache/controls-layout':fish?'design/fish-handling':study?'node_modules/.cache/cave-sculpt-study/live':'design/deeptape');
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
const {state,player,input,touches}=load('/src/core/state'),music=load('/src/audio/AdaptiveMusic');
window.DeepTapeGame={state,player,input,touches,music,ui:{layout:load('/src/core/UILayout').getUILayout,trialExit:load('/src/render/CaveRockTrialUI').caveRockTrialExitRect,orientation:load('/src/render/RenderOrientation').getScreenOrientationButton,canvas:load('/src/render/Canvas'),bcd:load('/src/render/RenderBCD'),bcdRuntime:load('/src/logic/BCDSystem').getBCDRuntime,menu:load('/src/render/RenderMenu').getMenuButtonRects,glSize:load('/src/render/WebGLLight').getGLCanvasPixelSize,gm:load('/src/gm/GMPanel'),bag:load('/src/extraction/render/InventoryHUD'),bagPage:load('/src/extraction/render/BagFullPage'),metrics:load('/src/core/WindowMetrics')},cave:{inspect:load('/src/render/RenderCaveRock').setCaveRockInspection,config:CONFIG,draw:load('/src/render/Render').draw,site(index=0){const m=state.mazeRescue;if(!m?.caveRockRoom||m.phase!=='play')return false;const r=m.caveRockRoom,s=r.sites[index];if(!s)return false;player.x=r.x+s.player[0];player.y=r.y+s.player[1];player.vx=player.vy=0;player.angle=player.targetAngle=input.targetAngle=Math.atan2(s.aim[1]-s.player[1],s.aim[0]-s.player[0]);load('/src/logic/CameraLogic').snapCameraToPlayer();return true;},aim(delta=0){const r=state.mazeRescue?.caveRockRoom;if(!r||state.mazeRescue.phase!=='play')return false;player.angle=player.targetAngle=input.targetAngle+=delta;return true;},wheelPos:load('/src/render/RenderWheel').getWheelBtnPos,stats:load('/src/render/RenderCaveRock').getCaveRockStats,collision:load('/src/logic/Collision').checkMazeCollision,nearest:load('/src/logic/Rope').findNearestWall,geometry:load('/src/world/RockGeometry'),path:load('/src/logic/Pathfinding').buildAvoidedPath},menu(){music.resetAdaptiveMusic();if(state.mazeRescue?.rockTrial)load('/src/logic/MazeLogic').exitCaveRockTrial();else state.screen='menu';},nearTarget(){
 if(!state.mazeRescue||state.mazeRescue.phase!=='play')return;
 const maze=state.mazeRescue,ts=maze.mazeTileSize,npc=state.npc;maze.npcRescued=false;maze.npcSecuredAt=0;npc.state='wait';
 let best=null,score=Infinity;for(let r=1;r<maze.mazeRows-1;r++)for(let c=1;c<maze.mazeCols-1;c++)if(maze.mazeMap[r][c]===0){const x=(c+.5)*ts,y=(r+.5)*ts,d=Math.hypot(x-npc.x,y-npc.y);if(d>45&&Math.abs(d-110)<score){best={x,y};score=Math.abs(d-110)}}
 const collision=load('/src/logic/Collision').checkMazeCollision;
 for(const [dx,dy] of [[-40,-45],[-60,0],[0,-60],[-40,40],[40,-40]])if(!collision(npc.x+dx,npc.y+dy,maze)){best={x:npc.x+dx,y:npc.y+dy};break}
 if(best){player.x=best.x;player.y=best.y;player.vx=player.vy=0;player.angle=player.targetAngle=input.targetAngle=Math.atan2(npc.y-player.y,npc.x-player.x);CONFIG.infiniteO2=true;player.o2=player.o2Max;maze.maxDepthAllowed=Math.max(maze.maxDepthAllowed,60);state.fishEnemies=[];maze.npcEncounterNoteAt=Date.now();load('/src/logic/BCDSystem').resetBCDSystem();load('/src/logic/CameraLogic').snapCameraToPlayer();}
}};${fish || controls ? fs.readFileSync(path.join(__dirname,'fishReviewBridge.js'),'utf8') : ''}
})();`;
new Function(bundle);fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'game-runtime.js'),bundle);
let html=fs.readFileSync(path.join(__dirname,'gamePreview.html'),'utf8');
html=html.replaceAll("'../../'+value",JSON.stringify(prefix)+'+value').replaceAll("'../../'+v",JSON.stringify(prefix)+'+v');
if(study){
 html=html.replace(JSON.stringify(prefix)+'+value',JSON.stringify(prefix)+"+(value.startsWith('images/cave-rock/')?'design/cave-room/sculpt/assets/'+value.slice('images/cave-rock/'.length):value)");
 html=html.replace('href="index.html"','href="../index.html"').replace('磁带与分轨预览 ↗','回雕刻对照');
 html=html.replace('岩体版本已接入。','厚岩雕刻 · 独立实验').replace('主界面 → 短入水转场 → 自由探索。<br>音轨后台准备，接近救援对象才播放。','主菜单进入「岩体试跑」。<br>这是实验，不替换手机基线。');
 const controls='<section id="sculpt-controls"><p>实际游戏中观察，不暂停模拟。</p><button onclick="DeepTapeGame.cave.site(0)">看断冠</button><button onclick="DeepTapeGame.cave.site(1)">左侧岩壁</button><button onclick="DeepTapeGame.cave.site(2)">右侧岩壁</button><br><button onclick="DeepTapeGame.cave.aim(-.12)">向左转灯</button><button onclick="DeepTapeGame.cave.aim(.12)">向右转灯</button><br><button onclick="DeepTapeGame.cave.inspect(0)">正常材质</button><button onclick="DeepTapeGame.cave.inspect(2)">去掉纹理</button><button onclick="DeepTapeGame.cave.inspect(1)">法线诊断</button><p>去掉纹理仍应读出厚度；没有达到美术定稿。微信真机尚未验收。</p></section>';
 html=html.replace('<output id="phase"',controls+'<output id="phase"');
}
if(fish){
 const aside=`<aside><small>DEEPTAPE / FISH HANDLING</small><h1>只选方向，猛然出手。</h1><p>实际游戏代码，模拟持续运行。<br>按住「动作」，只选方向，不用拖远近。<br>鱼优先于前方网；拆绳预览整张连通网。</p><p>绳盘选鱼起绳，再拖到外侧「自己」系腰扣。<br>动作盘外侧可选具体腰绳解除。<br>移回中心取消预选；移动取消前摇。<br>气瓶猛砸、猛然合剪；整网下沉淡出。</p><button onclick="DeepTapeGame.interactions.setup('rammer',false)">布置诱捕场景</button><button onclick="DeepTapeGame.interactions.setup('rammer',true)">近身练习：已入网</button><button onclick="DeepTapeGame.interactions.near('head')">移到鱼头旁</button><button onclick="DeepTapeGame.interactions.near('knot')">移到绑绳位置</button><button onclick="DeepTapeGame.interactions.near('net')">移到缠网位置</button><button id="light" disabled>开启手电</button><button id="menu">退出试跑</button><button id="target" hidden></button><button id="link" hidden></button><output id="phase" role="status">主界面</output><p>场景布置按钮仅供此浏览器练习。<br>游戏内仍只有动作按钮和原绳盘。<br>WASD / 拖动游泳。真机性能待验收。</p></aside>`;
 html=html.replace(/<aside>[\s\S]*?<\/aside>/,aside).replace('<title>DEEPTAPE · 实装游戏</title>','<title>鱼交互 · 精确动作与绑绳试跑</title>');
}
if(controls){
 html=html.replace('<h1>岩体版本已接入。</h1>','<h1>双手操作，自由切屏。</h1>').replace('主界面 → 短入水转场 → 自由探索。<br>音轨后台准备，接近救援对象才播放。','左上角的横屏 / 竖屏按钮直接切换。<br>设置、随身听、手电均已移到左上。').replace('试新岩体请点击主菜单「岩体试跑」。<br>鼠标拖动 / WASD 游动，工具轮盘选择铺绳。<br>「一键下潜」仍进入原案件。','左侧隐形移动；右侧绳索与交互。<br>按住展开轮盘，BCD 独立常驻。<br>保留原图标，切屏不重开对局。').replace('<title>DEEPTAPE · 实装游戏</title>','<title>横竖屏与双手操作 · 实际游戏</title>');
}
fs.writeFileSync(path.join(output,'game.html'),html);
console.log((study?'Isolated sculpt study, actual game':'Actual game browser preview')+': '+path.relative(root,path.join(output,'game.html'))+' ('+files.length+' source modules)');
