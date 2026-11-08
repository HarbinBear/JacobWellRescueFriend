const fs=require('fs'),path=require('path'),ts=require('typescript'),cp=require('child_process');
const ROOT=path.resolve(__dirname,'..'),DESIGN='design/continuous-world';
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):e.name.endsWith('.ts')?[path.relative(ROOT,path.join(dir,e.name)).split(path.sep).join('/')]:[]);}
function build(ref=null){
 if(ref&&!/^[A-Za-z0-9_./-]+$/.test(ref))throw Error('Invalid version ref');
 const tree=ref?cp.execFileSync('git',['-C',ROOT,'ls-tree','-r','--name-only',ref],{encoding:'utf8'}).trim().split('\n'):null;
 const tracked=tree?new Set(tree):null;
 const blobs=new Map();
 function read(relative,binary=false){
  if(!ref)return fs.readFileSync(path.join(ROOT,relative),binary?undefined:'utf8');
  if(!tracked.has(relative))throw Error('Version does not contain '+relative);
  if(!blobs.has(relative))blobs.set(relative,cp.execFileSync('git',['-C',ROOT,'show',ref+':'+relative],{maxBuffer:20*1024*1024}));
  const value=blobs.get(relative);return binary?value:value.toString('utf8');
 }
 const integrationModule={exports:{}};
 new Function('module','exports','require',read(DESIGN+'/Integration.cjs'))(integrationModule,integrationModule.exports,require);
 const {integrate}=integrationModule.exports;
 const files=ref?tree.filter(f=>f==='game.ts'||f.startsWith('src/')&&f.endsWith('.ts')||f.startsWith('typings/')&&f.endsWith('.ts')||f.startsWith(DESIGN+'/')&&f.endsWith('.ts')&&!f.slice(DESIGN.length+1).includes('/')):
  ['game.ts',...walk(path.join(ROOT,'src')),...walk(path.join(ROOT,'typings')),...fs.readdirSync(path.join(ROOT,DESIGN)).filter(f=>f.endsWith('.ts')).map(f=>DESIGN+'/'+f)];
 const rawSources=new Map(files.map(f=>[f,read(f)]));
 const shaders=ref?tree.filter(f=>f.startsWith('src/render/shaders/')&&f.endsWith('.glsl')):fs.readdirSync(path.join(ROOT,'src/render/shaders')).filter(f=>f.endsWith('.glsl')).map(f=>'src/render/shaders/'+f);
 // Rebuild the shader strings from this version's authoritative GLSL, entirely in
 // memory. Never borrow a current generated shader for a historical version.
 for(const f of shaders){const name=path.basename(f,'.glsl').replace(/([a-z])([A-Z])/g,'$1_$2').toUpperCase()+'_SRC',body=read(f).replaceAll('`','\\`').replaceAll('${','\\${');rawSources.set(f+'.ts','export const '+name+' = `\n'+body+'`;\n');}
 const jsonFiles=[DESIGN+'/layout.json',DESIGN+'/assets/manifest.json'];
 const sources=new Map([...rawSources].map(([f,s])=>[path.join(ROOT,f),f.startsWith('typings/')?s:integrate('/'+f.slice(0,-3),s)]));
 const virtual=new Map(sources);for(const f of jsonFiles)virtual.set(path.join(ROOT,f),read(f));
 const options={target:ts.ScriptTarget.ES2016,module:ts.ModuleKind.CommonJS,moduleResolution:ts.ModuleResolutionKind.NodeJs,noEmit:true,skipLibCheck:true,strict:false,esModuleInterop:true,resolveJsonModule:true,lib:['lib.es2016.d.ts','lib.dom.d.ts']};
 const host=ts.createCompilerHost(options),baseRead=host.readFile.bind(host),baseExists=host.fileExists.bind(host);
 host.readFile=file=>virtual.get(path.resolve(file))??baseRead(file);host.fileExists=file=>virtual.has(path.resolve(file))||baseExists(file);
 const baseDirectory=host.directoryExists.bind(host);host.directoryExists=dir=>[...virtual.keys()].some(file=>file.startsWith(path.resolve(dir)+path.sep))||baseDirectory(dir);
 const program=ts.createProgram([...sources.keys()],options,host),diagnostics=ts.getPreEmitDiagnostics(program);
 if(diagnostics.length){console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCurrentDirectory:()=>ROOT,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));throw Error('Integrated real-game TypeScript check failed');}
 const factories=[];
 for(const [file,source]of sources){if(file.includes('/typings/'))continue;const id='/'+path.relative(ROOT,file).split(path.sep).join('/').slice(0,-3),code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2016,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;factories.push(JSON.stringify(id)+':function(module,exports,require){'+code+'}');}
 for(const f of jsonFiles)factories.push(JSON.stringify('/'+f)+':function(module,exports,require){module.exports='+read(f)+';}');
 const bundle=`(()=>{const factories={${factories.join(',')}},cache=new Map();function load(id,from='/game'){if(id[0]==='.')id=from.slice(0,from.lastIndexOf('/')+1)+id;const parts=[];for(const p of id.split('/')){if(p==='..')parts.pop();else if(p&&p!=='.')parts.push(p)}id='/'+parts.join('/');if(!factories[id])id+='/index';if(!factories[id])throw Error('Missing module '+id);if(!cache.has(id)){const module={exports:{}};cache.set(id,module);factories[id](module,module.exports,name=>load(name,id))}return cache.get(id).exports;}
 const {CONFIG}=load('/src/core/config');CONFIG.audio.cloud.enabled=false;
 load('/game');
 const core=load('/src/core/state'),runtime=load('/design/continuous-world/Runtime'),geometry=load('/design/continuous-world/Geometry'),save=load('/design/continuous-world/WorldSave'),render=load('/design/continuous-world/RenderWorld'),hud=load('/design/continuous-world/WorldHUD');
 window.DeepTapeGame={...core,music:load('/src/audio/AdaptiveMusic'),world:{runtime,geometry,save,render,hud,layout:geometry.layout},cave:{config:CONFIG,collision:load('/src/logic/Collision').checkMazeCollision,geometry:load('/src/world/RockGeometry')},ui:{inventory:load('/src/extraction/render/InventoryHUD'),bagPage:load('/src/extraction/render/BagFullPage'),layout:load('/src/core/UILayout').getUILayout,orientation:load('/src/render/RenderOrientation').getScreenOrientationButton,bcdRuntime:load('/src/logic/BCDSystem').getBCDRuntime,decoRuntime:load('/src/logic/DecompressionSystem').getDecoRuntime},interactions:{rope:load('/src/logic/Rope'),wheel:load('/src/logic/RopeWheel'),targets:load('/src/logic/ActionTargets'),work:load('/src/logic/Interaction'),fishGeometry:load('/src/logic/FishGeometry'),layout:load('/src/logic/InteractionLayout')},menu:runtime.exitContinuousWorld,start:()=>load('/src/logic/MazeLogic').resetMazeLogic()};
 window.DeepTapeGame.start();
 })();`;
 new Function(bundle);
 const safe=ref?ref.replace(/[^A-Za-z0-9_-]/g,'-'):null;
 const output=path.join(ROOT,'node_modules/.cache/continuous-world',ref?'versions/'+safe:'');fs.mkdirSync(output,{recursive:true});
 fs.writeFileSync(path.join(output,'game-runtime.js'),bundle);
 if(ref){for(const f of tree){if(!(f.startsWith('images/')||f.startsWith('audio/')||f.startsWith(DESIGN+'/assets/')))continue;const target=path.join(output,'assets-root',f);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,read(f,true));}}
 const prefix=ref?'./assets-root/':path.relative(output,ROOT).split(path.sep).join('/')+'/';
 let html=read(DESIGN+'/preview.html').replaceAll('__ROOT_PREFIX__',prefix);
 if(ref)html=html.replaceAll('shore-world-review/','shore-world-review/'+safe+'/');
 fs.writeFileSync(path.join(output,'game.html'),html);
 const report={version:1,ref:ref||'working-tree',sourceModules:sources.size,source:'Current or named Git version game.ts + src modules, checked in-memory adapters, independent continuous-world modules',integratedTypecheck:true,mobileRuntimeSourceChanged:false,packageBytes:require('./checkPackageBudget').audit().bytes,entry:path.relative(ROOT,path.join(output,'game.html')),assetsFrozen:!!ref,storageNamespace:ref?'shore-world-review/'+safe+'/':'shore-world-review/'};
 fs.writeFileSync(path.join(output,'build.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));return report;
}
if(require.main===module){const index=process.argv.indexOf('--ref');if(index>=0&&!process.argv[index+1])throw Error('--ref requires a saved version');build(index>=0?process.argv[index+1]:null);}module.exports={build};
