const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'..'),MAX=8*1024*1024,RESERVE=128*1024;
function matches(relative,rule){
 const value=String(rule.value).replace(/^\//,'').replace(/\/$/,'');
 switch(rule.type){
  case 'folder':return relative===value||relative.startsWith(value+'/');
  case 'file':return relative===value;
  case 'suffix':return relative.endsWith(value);
  case 'prefix':return relative.startsWith(value);
  case 'regexp':return new RegExp(value).test(relative);
  default:throw Error('Unsupported pack ignore rule '+rule.type);
 }
}
function included(relative,config){
 const p=config.packOptions||{};
 return !(p.ignore||[]).some(rule=>matches(relative,rule))||(p.include||[]).some(rule=>matches(relative,rule));
}
function collect(config){
 const files=[];
 function walk(dir,relative=''){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   const rel=(relative?relative+'/':'')+entry.name,full=path.join(dir,entry.name);
   if(entry.isDirectory()){
    if(!included(rel+'/',config)&&!(config.packOptions?.include||[]).some(r=>String(r.value).startsWith(rel+'/')))continue;
    walk(full,rel);
   }else if(entry.isFile()&&included(rel,config))files.push({path:rel,bytes:fs.statSync(full).size});
  }
 }
 walk(ROOT);return files;
}
function audit(config=JSON.parse(fs.readFileSync(path.join(ROOT,'project.config.json'),'utf8'))){
 const files=collect(config),bytes=files.reduce((sum,f)=>sum+f.bytes,0);
 const groups={};for(const f of files){const root=f.path.split('/')[0];groups[root]=(groups[root]||0)+f.bytes;}
 return{bytes,MiB:bytes/1048576,limit:MAX,reserve:RESERVE,headroom:MAX-bytes,files:files.length,groups,largest:files.slice().sort((a,b)=>b.bytes-a.bytes).slice(0,12),scope:'Pre-compiler file estimate only. Official IDE preview info is authoritative; this does not simulate phone performance.'};
}
function run(){
 const report=audit(),config=JSON.parse(fs.readFileSync(path.join(ROOT,'project.config.json'),'utf8'));
 for(const file of ['game.ts','game.json','src/render/RenderCaveRock.ts','src/render/shaders/maskFrag.glsl.ts','src/render/shaders/volumetricFrag.glsl.ts','images/cave-rock/room-albedo.png','images/cave-rock/room-normal.png','images/cave-rock/room-detail.png','images/cave-rock/room-back.png'])assert(included(file,config),'Required runtime file accidentally ignored: '+file);
 for(const file of ['texture/Well.png','design/cave-room/assets/room-albedo.png','node_modules/typescript/package.json','dist/game.js','project.private.config.json','src/render/shaders/maskFrag.glsl'])assert(!included(file,config),'Development resource should not enter package: '+file);
 for(const file of ['src/world/continuous/Runtime.ts','src/world/continuous/Geometry.ts','src/world/continuous/RenderWorld.ts','src/world/continuous/Routes.ts','src/world/continuous/Assets.ts','src/world/continuous/Layout.ts','images/shore/woodland-native.jpg','images/shore/woodland-sky-strip.png','images/shore/bank-left.jpg','images/shore/bank-right.jpg','images/home/living_room_night.jpg'])assert(included(file,config),'Required gameplay resource ignored: '+file);
 for(const file of ['src/world/KarstTerrain.ts','src/world/KarstNoise.ts','src/world/KarstChambers.ts','src/world/KarstSurface.ts','src/render/KarstBounce.ts','src/render/RenderKarst.ts','src/render/shaders/karstFrag.glsl.ts','src/render/shaders/karstLegacyFrag.glsl.ts','src/render/shaders/karstCoherentFrag.glsl.ts','images/karst/mineral-albedo.jpg','images/karst/mineral-relief.png'])assert(included(file,config)&&fs.existsSync(path.join(ROOT,file)),'Required karst runtime resource missing or ignored: '+file);
 for(const file of ['design/continuous-world/TerrainSurface.ts','design/continuous-world/ExpeditionDiver.ts','scripts/continuousGameplayFixtures.ts','scripts/karstReviewFixtures.ts','scripts/checkKarstSaveVariants.js','scripts/checkKarstVariants.js','scripts/bakeKarstMaterials.py','design/karst/requirements.txt','src/render/shaders/karstFrag.glsl','src/render/shaders/karstLegacyFrag.glsl','src/render/shaders/karstCoherentFrag.glsl','images/home/living_room_night.png'])assert(!included(file,config),'Experimental or source-only resource in mobile pack: '+file);
 console.log(JSON.stringify(report,null,2));
 if(report.bytes>MAX-RESERVE)throw Error('Package candidate exceeds safe budget: '+report.MiB.toFixed(3)+' MiB; keep at least '+RESERVE+' bytes spare before official compilation.');
 console.log('Package budget passed; run IDE preview for authoritative compiled size.');
}
if(require.main===module)run();
module.exports={audit,included,matches};
