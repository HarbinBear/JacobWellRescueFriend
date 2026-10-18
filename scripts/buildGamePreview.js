// Browser adapter around the real game entry, without replacing game logic or audio.
const fs=require('fs'),path=require('path'),ts=require('typescript');
const root=path.resolve(__dirname,'..');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):e.name.endsWith('.ts')?[path.join(dir,e.name)]:[])}
const files=[path.join(root,'game.ts'),...walk(path.join(root,'src'))];
const factories=files.map(file=>{
  const id='/'+path.relative(root,file).replace(/\\/g,'/').slice(0,-3);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2016,module:ts.ModuleKind.CommonJS}}).outputText;
  return JSON.stringify(id)+':function(exports,require){'+code+'}';
}).join(',');
const bundle=`(()=>{const factories={${factories}},cache={};function load(id,from='/game'){if(id[0]==='.')id=from.slice(0,from.lastIndexOf('/')+1)+id;const parts=[];for(const p of id.split('/')){if(p==='..')parts.pop();else if(p&&p!=='.')parts.push(p)}id='/'+parts.join('/');if(!factories[id])id+='/index';if(!factories[id])throw Error('Missing game module '+id);if(!cache[id]){cache[id]={};factories[id](cache[id],name=>load(name,id))}return cache[id]}
const {CONFIG}=load('/src/core/config');CONFIG.audio.cloud.enabled=false;
load('/game');
const {state,player,input}=load('/src/core/state'),music=load('/src/audio/AdaptiveMusic');
window.DeepTapeGame={state,player,music,menu(){music.resetAdaptiveMusic();state.screen='menu';},nearTarget(){
 if(!state.mazeRescue||state.mazeRescue.phase!=='play')return;
 const maze=state.mazeRescue,ts=maze.mazeTileSize,npc=state.npc;maze.npcRescued=false;maze.npcSecuredAt=0;npc.state='wait';
 let best=null,score=Infinity;for(let r=1;r<maze.mazeRows-1;r++)for(let c=1;c<maze.mazeCols-1;c++)if(maze.mazeMap[r][c]===0){const x=(c+.5)*ts,y=(r+.5)*ts,d=Math.hypot(x-npc.x,y-npc.y);if(d>45&&Math.abs(d-110)<score){best={x,y};score=Math.abs(d-110)}}
 const collision=load('/src/logic/Collision').checkMazeCollision;
 for(const [dx,dy] of [[-40,-45],[-60,0],[0,-60],[-40,40],[40,-40]])if(!collision(npc.x+dx,npc.y+dy,maze)){best={x:npc.x+dx,y:npc.y+dy};break}
 if(best){player.x=best.x;player.y=best.y;player.vx=player.vy=0;player.angle=player.targetAngle=input.targetAngle=Math.atan2(npc.y-player.y,npc.x-player.x);CONFIG.infiniteO2=true;player.o2=player.o2Max;maze.maxDepthAllowed=Math.max(maze.maxDepthAllowed,60);state.fishEnemies=[];maze.npcEncounterNoteAt=Date.now();load('/src/logic/BCDSystem').resetBCDSystem();load('/src/logic/CameraLogic').snapCameraToPlayer();}
}};})();`;
new Function(bundle);
const output=path.join(root,'design/deeptape');fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'game-runtime.js'),bundle);
fs.writeFileSync(path.join(output,'game.html'),fs.readFileSync(path.join(__dirname,'gamePreview.html'),'utf8'));
console.log('Actual game browser preview: design/deeptape/game.html ('+files.length+' source modules)');
