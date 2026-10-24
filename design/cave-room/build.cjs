const fs=require('fs'),path=require('path'),ts=require('typescript'),crypto=require('crypto');
const root=path.resolve(__dirname,'../..');
const output=path.resolve(root,process.argv[2]||'node_modules/.cache/cave-room-preview');
if(!output.startsWith(root+path.sep))throw Error('Output must remain inside the workspace');
fs.mkdirSync(output,{recursive:true});
for(const name of fs.readdirSync(path.join(__dirname,'assets')))fs.copyFileSync(path.join(__dirname,'assets',name),path.join(output,name));
for(const name of ['room-comparison.png','moving-light.gif'])fs.copyFileSync(path.join(__dirname,'reference',name),path.join(output,name));
fs.copyFileSync(path.join(__dirname,'README.md'),path.join(output,'RESEARCH.md'));
const resourcePrefix=path.relative(output,root).split(path.sep).join('/')+'/';
const walk=dir=>fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):e.name.endsWith('.ts')?[path.join(dir,e.name)]:[]);
const files=[path.join(root,'game.ts'),...walk(path.join(root,'src'))];
const modules=new Map(files.map(f=>['/'+path.relative(root,f).replace(/\\/g,'/').slice(0,-3),fs.readFileSync(f,'utf8')]));
const original=new Map(modules);function edit(id,a,b){const s=modules.get(id);if(!s.includes(a))throw Error('Missing anchor '+id+' '+a.slice(0,70));modules.set(id,s.replace(a,b));}
modules.set('/src/render/ReviewCave',fs.readFileSync(path.join(__dirname,'ReviewCave.ts'),'utf8'));
modules.set('/src/render/Render',"import {isReviewActive,drawReviewCave} from './ReviewCave';\n"+modules.get('/src/render/Render'));
edit('/src/render/Render','    // 绘制实心内部填充（无缝，无网格边框）','    if(!isReviewActive()){\n    // 绘制实心内部填充（无缝，无网格边框）');
edit('/src/render/Render','    // 迷宫模式：绘制食人鱼聚集点附近的骷髅装饰（在出口标记之前、墙体之后）','    }\n    // 迷宫模式：绘制食人鱼聚集点附近的骷髅装饰（在出口标记之前、墙体之后）');
edit('/src/render/Render',"    profileEnd('draw.lighting');","    profileEnd('draw.lighting');\n    if(isReviewActive()){ctx.save();ctx.translate(logicW/2+shakeX,logicH/2+shakeY);ctx.scale(zoom,zoom);ctx.translate(-camX,-camY);drawReviewCave(ctx,viewL,viewR,viewT,viewB,zoom);ctx.restore();}");
modules.set('/src/render/RenderLight',"import {isReviewActive,reviewLightPolygon} from './ReviewCave';\n"+modules.get('/src/render/RenderLight'));
edit('/src/render/RenderLight','    let points: any[] = [];','    if(isReviewActive())return reviewLightPolygon(sx,sy,angle,maxDist,fovDeg);\n    let points: any[] = [];');
modules.set('/src/logic/Collision',"import {isReviewActive,reviewCollision} from '../render/ReviewCave';\n"+modules.get('/src/logic/Collision'));
edit('/src/logic/Collision','export function checkMazeCollision(x: number, y: number, maze: any): boolean {','export function checkMazeCollision(x: number, y: number, maze: any): boolean {\n    if(isReviewActive())return reviewCollision(x,y);');
modules.set('/src/logic/MazeLogic',"import {isReviewActive} from '../render/ReviewCave';\n"+modules.get('/src/logic/MazeLogic'));
edit('/src/logic/MazeLogic','export function updateMaze() {','export function updateMaze() {\n    if(isReviewActive())return;');
const distanceOld='    float texU = (t * u_polyCount + 0.5) / POLY_TEX_SIZE;\n    vec4 s = texture2D(u_polyTex, vec2(texU, 0.25));\n    return s.r * u_maxDist;';
const distanceNew='    float index=clamp(t,0.0,1.0)*max(0.0,u_polyCount-1.0);\n    float i=floor(index);\n    vec4 a=texture2D(u_polyTex,vec2((i+0.5)/POLY_TEX_SIZE,0.25));\n    vec4 b=texture2D(u_polyTex,vec2((min(u_polyCount-1.0,i+1.0)+0.5)/POLY_TEX_SIZE,0.25));\n    return mix(a.r,b.r,fract(index))*u_maxDist;';
for(const name of ['maskFrag','volumetricFrag']){
 let shader=fs.readFileSync(path.join(root,'src/render/shaders/'+name+'.glsl'),'utf8');if(!shader.includes(distanceOld))throw Error('Shader distance anchor '+name);shader=shader.replace(distanceOld,distanceNew);
 if(name==='maskFrag'){
  const a=shader.indexOf('    // 被墙壁截断处的羽化'),b=shader.indexOf('    // 径向衰减',a);if(a<0||b<a)throw Error('Mask feather anchor');
  shader=shader.slice(0,a)+'    // Continuous at the blocker; no abrupt 1.0 -> 0.5 brightness jump.\n    float occFade=1.0-smoothstep(occDist-1.0,occDist+featherDist,dist);\n    \n'+shader.slice(b);
 }
 const exported=name==='maskFrag'?'MASK_FRAG_SRC':'VOLUMETRIC_FRAG_SRC';
 modules.set('/src/render/shaders/'+name+'.glsl','export const '+exported+'='+JSON.stringify(shader)+';');
}
const factories=[...modules].map(([id,code])=>JSON.stringify(id)+':function(exports,require){'+ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2016,module:ts.ModuleKind.CommonJS}}).outputText+'}').join(',');
const boot=`(()=>{const factories={${factories}},cache={};function load(id,from='/game'){if(id[0]==='.')id=from.slice(0,from.lastIndexOf('/')+1)+id;const parts=[];for(const p of id.split('/')){if(p==='..')parts.pop();else if(p&&p!=='.')parts.push(p)}id='/'+parts.join('/');if(!factories[id])id+='/index';if(!factories[id])throw Error('Missing module '+id);if(!cache[id]){cache[id]={};factories[id](cache[id],name=>load(name,id))}return cache[id]}
const {CONFIG}=load('/src/core/config');CONFIG.audio.cloud.enabled=false;load('/game');const {state,player}=load('/src/core/state'),r=load('/src/render/ReviewCave'),quality=load('/src/render/QualityManager');
window.DeepTapeGame={state,player};window.CaveReview={state,player,config:CONFIG,quality,stats:r.reviewStats,check:r.geometryCheck,aim:r.reviewAim,normals:r.setReviewInspection,collision:r.setReviewCollision,fallback:r.setReviewFallback,contextLoss:r.reviewContextLoss,aa:r.setReviewAA,draw:load('/src/render/Render').draw,collides:load('/src/logic/Collision').checkMazeCollision,lightPolygon:load('/src/render/RenderLight').getLightPolygon,lightStatus:load('/src/render/WebGLLight').isWebGLAvailable,move:r.reviewMove,site:r.reviewSite,surfaceOcclusion:r.setSurfaceOcclusion};
CaveReview.sampling=mode=>{r.setReviewSampling(mode);quality.setAuto(false);quality.setPreset(mode==='economy'?'medium':mode==='sharp'?'ultra':'high');CONFIG.quality.skipOcclusion=false;CONFIG.quality.vplMax=24;return mode;};
CaveReview.ready=(async()=>{const data=await fetch('scenes.json').then(r=>r.json());window.__CAVE_REVIEW=true;load('/src/logic/Logic').resetMazeLogic();CaveReview.sampling('balanced');const m=state.mazeRescue;m.phase='play';m.briefingShown=true;m.npcFound=false;m.startTime=Date.now();m.tapeNowPlayingAt=0;m.maxDepthAllowed=300;m.oxygenTanks=[];m.relics=[];m.fishDens=[];state.fishEnemies=[];state.npc.active=false;state.npc.x=state.npc.y=11000;state.flashlightOn=true;player.o2=player.o2Max;state.muted=true;
CaveReview.data=data;CaveReview.scene=async(index)=>{CaveReview.sceneIndex=index;return r.selectReviewScene(data,index,data.scenes[index].variant);};await CaveReview.scene(0);state.alertMsg='';return true;})();})();`;
new Function(boot);fs.writeFileSync(path.join(output,'game-runtime.js'),boot);

const template=fs.readFileSync(path.join(root,'scripts/gamePreview.html'),'utf8');
let adapter=template.slice(template.indexOf('<script>')+8,template.indexOf('</script>')).replaceAll("'../../'+value",JSON.stringify(resourcePrefix)+'+value').replaceAll("'../../'+v",JSON.stringify(resourcePrefix)+'+v');adapter=adapter.replace(/getStorageSync:key=>.*?onTouchStart:fn=>/s,"getStorageSync:()=>'',setStorageSync:()=>{},removeStorageSync:()=>{},onTouchStart:fn=>");
let html=fs.readFileSync(path.join(__dirname,'review.html'),'utf8').replace('ADAPTER_SCRIPT',adapter);for(const m of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new Function(m[1]);fs.writeFileSync(path.join(output,'game.html'),html);
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify({baseCommit:require('child_process').execFileSync('git',['rev-parse','--short','HEAD'],{cwd:root,encoding:'utf8'}).trim(),sourceHashes:Object.fromEntries(files.map(f=>[path.relative(root,f),crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex')])),newArt:'Single sculpted chamber with projected front/side faces, contact AO, dynamic normals, three near-surface visibility samples; no 3D density volume',scope:'Study only, same actual game runtime and paused gameplay; isolated collision movement demo, not full rope or phone acceptance'},null,2));
console.log('Built single-room study',modules.size,'modules');
