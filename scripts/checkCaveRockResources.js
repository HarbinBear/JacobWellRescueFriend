const fs=require('fs'),path=require('path'),assert=require('assert/strict'),ts=require('typescript'),vm=require('vm');
const root=path.resolve(__dirname,'../src'),cache=new Map(),requests=[],calls={},handlers={};
const state={screen:'menu',mazeRescue:null,camera:{x:500,y:6500},fx:{shake:0},flashlightOn:true};
const player={x:500,y:6500,angle:-1.2};
const CONFIG={quality:{scale:.6,rayCount:128},lightRange:650,fov:80,selfGlowRadius:80,selfGlowIntensity:.2,ambientPerceptionRadius:220,ambientPerceptionIntensity:.1};
let contextLost=false;
const gl=new Proxy({}, {get(_,name){
 if(name==='isContextLost')return()=>contextLost;
 if(name==='getExtension')return()=>null;
 if(name==='getShaderParameter'||name==='getProgramParameter')return()=>true;
 if(String(name)===String(name).toUpperCase())return 1;
 return (...args)=>{calls[name]=(calls[name]||0)+1;if(name.startsWith('create')||name==='getUniformLocation')return {name,id:calls[name]};return 0;};
}});
global.wx={
 createImage(){const im={width:864,height:1344,onload:null,onerror:null};Object.defineProperty(im,'src',{set(value){requests.push(value);if(im.onload)im.onload()}});return im;},
 createCanvas(){return {width:1,height:1,addEventListener:(name,fn)=>handlers[name]=fn,getContext:()=>gl};},
};
const overrides={
 'core/config':{CONFIG},'core/state':{state,player},'render/Canvas':{logicW:375,logicH:667},
 'render/RenderLight':{getLightPolygon:(x,y,a,range)=>[{dist:range*.55},{dist:range*.6},{dist:range*.7}]},
};
const phone=vm.createContext({wx:global.wx,console});
assert.equal(vm.runInContext('typeof performance',phone),'undefined');
function load(file){
 if(file in overrides)return overrides[file];if(cache.has(file))return cache.get(file);
 const out={};cache.set(file,out);let source=fs.readFileSync(path.join(root,file+'.ts'),'utf8');
 if(process.argv.includes('--sculpt')&&file==='render/RenderCaveRock')source=fs.readFileSync(path.join(root,'../design/cave-room/sculpt/RenderCaveRock.ts'),'utf8').replaceAll('../../../src/','../');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2016,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInContext('(function(exports,require){'+code+'})',phone)(out,n=>load(path.posix.normalize(path.posix.join(path.posix.dirname(file),n))));return out;
}
const budget=load('render/CaveSurfaceBudget'),renderer=load('render/RenderCaveRock'),assets=load('render/ImageAssets');
for(const zoom of [.7,1,1.3])for(const res of [1,1.5,2]){
 const l=82.25,r=590.8,t=650.25,b=1329.7,w=Math.ceil((r-l)*zoom*res),h=Math.ceil((b-t)*zoom*res);
 const cut=budget.cropCaveSurface(l,r,t,b,zoom,res,200,700,170,310);assert(cut);assert(cut.width<=w&&cut.height<=h);
 const sx=(r-l)/w,sy=(b-t)/h,x0=(cut.l-l)/sx,y0=(cut.t-t)/sy;
 assert(Math.abs(x0-Math.round(x0))<1e-8&&Math.abs(y0-Math.round(y0))<1e-8);
 assert(Math.abs((cut.r-cut.l)/cut.width-sx)<1e-10);assert(Math.abs((cut.b-cut.t)/cut.height-sy)<1e-10);
 for(const pixel of [0,Math.floor(cut.width/2),cut.width-1])assert(Math.abs(cut.l+(pixel+.5)*sx-(l+(x0+pixel+.5)*sx))<1e-10);
}
assert.equal(budget.cropCaveSurface(0,100,0,100,1,1,200,200,30,30),null);
renderer.updateCaveRockResources();assert.equal(requests.length,0,'Menu should not decode cave textures');
state.screen='mazeRescue';state.mazeRescue={seed:1,caveRockRoom:{x:200,y:6000,width:720,height:1120,player:[358,772],shapes:[]}};
if(process.argv.includes('--sculpt'))state.mazeRescue.caveRockRoom={...JSON.parse(fs.readFileSync(path.join(root,'../design/cave-room/sculpt/assets/scene.json'),'utf8')),x:200,y:6000};
renderer.updateCaveRockResources();renderer.updateCaveRockResources();assert.equal(requests.length,4);
const ctx=new Proxy({},{get:(_,key)=>key==='createRadialGradient'?()=>({addColorStop(){}}):()=>0});
function draw(){renderer.drawCaveRock(ctx,0,1000,5900,7400,1);}
draw();assert.equal(renderer.getCaveRockStats().mode,'normal-map');assert.equal(renderer.getCaveRockStats().textureBytes,864*1344*4*3);
const submitted=calls.drawArrays;draw();assert.equal(calls.drawArrays,submitted,'Identical light and viewport should reuse surface');
for(const perf of [null,{}, {now:0}, {now(){throw Error('Unsupported host timer')}}, {now(){return NaN}}]){phone.performance=perf;player.angle+=.01;assert.doesNotThrow(draw);assert(Number.isFinite(renderer.getCaveRockStats().surfaceCPUms));}
delete phone.performance;const afterTimerChecks=calls.drawArrays;
player.angle+=.1;draw();assert.equal(calls.drawArrays,afterTimerChecks+1);
state.flashlightOn=false;draw();assert.equal(calls.drawArrays,afterTimerChecks+2);state.flashlightOn=true;
contextLost=true;handlers.webglcontextlost({preventDefault(){}});draw();assert.equal(renderer.getCaveRockStats().mode,'fallback');
contextLost=false;handlers.webglcontextrestored();draw();assert.equal(renderer.getCaveRockStats().mode,'normal-map');
assets.registerImage('home-keep','images/home/living_room_night.png');const keep=assets.getImage('home-keep');
state.screen='menu';renderer.updateCaveRockResources();assert.equal(renderer.getCaveRockStats().loaded,false);assert.equal(renderer.getCaveRockStats().textureBytes,0);assert.equal(renderer.getCaveRockStats().decodedImageBytes,0);assert.equal(renderer.getCaveRockStats().surfacePixels,0);
for(const name of ['albedo','normal','detail','back'])assert.equal(assets.getImage('cave-rock-'+name),null);
assert.equal(assets.getImage('home-keep'),keep,'Do not unload unrelated home artwork');assert(calls.deleteTexture>=4&&calls.deleteProgram>0&&calls.deleteBuffer>0);
state.screen='mazeRescue';renderer.updateCaveRockResources();draw();assert.equal(renderer.getCaveRockStats().mode,'normal-map');assert.equal(requests.filter(s=>s.includes('cave-rock')).length,8,'Re-entry should reload once, not reuse dangling images');
console.log('Cave resource budget passed: no browser performance, incomplete/throwing timers, same sample grid, lazy images, cached lighting, release/re-entry, context restoration and unchanged home cache.');
