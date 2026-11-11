const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'..'),MAX=4*1024*1024,RESERVE=128*1024;
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
function collect(config,root=ROOT){
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
 walk(root);return files;
}
function audit(config=JSON.parse(fs.readFileSync(path.join(ROOT,'project.config.json'),'utf8')),root=ROOT){
 const files=collect(config,root),bytes=files.reduce((sum,f)=>sum+f.bytes,0);
 const groups={};for(const f of files){const root=f.path.split('/')[0];groups[root]=(groups[root]||0)+f.bytes;}
 return{bytes,MiB:bytes/1048576,limit:MAX,reserve:RESERVE,headroom:MAX-bytes,files:files.length,groups,largest:files.slice().sort((a,b)=>b.bytes-a.bytes).slice(0,12),scope:'Pre-compiler file estimate only. Official IDE preview info is authoritative; this does not simulate phone performance.'};
}
function run(){
 const development=audit(),root=require('./buildWechatRelease').build();
 const config=JSON.parse(fs.readFileSync(path.join(root,'project.config.json'),'utf8')),report=audit(config,root);
 const files=collect(config,root);
 for(const file of files)assert(/\.(?:js|json)$/.test(file.path),'Non-code asset entered release: '+file.path);
 for(const file of ['game.js','game.json','src/assets/AssetCatalog.js','src/assets/AssetStorage.js','src/render/RenderKarstVolume.js','src/world/continuous/WorldAssets.js','src/render/shaders/volumetricFrag.glsl.js'])assert(fs.existsSync(path.join(root,file)),'Required release file missing: '+file);
 const catalog=require(path.join(root,'src/assets/AssetCatalog.js'));
 assert.equal(catalog.ASSET_STORAGE.mode,'cloud','Release must not request excluded local assets');
 assert.equal(config.setting.urlCheck,true,'Do not bypass platform domain validation');
 assert.equal(config.compileType,'game');
 assert(!fs.existsSync(path.join(root,'images'))&&!fs.existsSync(path.join(root,'audio')),'Assets must stay out of release');
 assert.equal(Object.keys(catalog.ASSET_CATALOG).length,20,'Update inventory assertion when adding reviewed assets');
 console.log(JSON.stringify({release:report,development:{bytes:development.bytes,overMainPackageLimit:development.bytes>MAX,note:'Local authoring project includes assets; upload only the separate cloud release after server verification.'},cloudDeployment:'PENDING: generated fileIDs are not proof of upload'},null,2));
 if(report.bytes>MAX-RESERVE)throw Error('Release exceeds 4 MiB main-package safe budget: '+report.MiB.toFixed(3)+' MiB; keep '+RESERVE+' bytes spare.');
 console.log('Code-only candidate budget passed; official IDE compiled size and cloud download verification still required.');
}
if(require.main===module)run();
module.exports={audit,included,matches};
