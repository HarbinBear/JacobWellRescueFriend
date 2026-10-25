const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {execFileSync}=require('child_process');
const root=path.resolve(__dirname,'..');
const archive=path.join(root,'node_modules/.cache/cave-versions');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'design/cave-room/versions.json'),'utf8'));
const git=(...args)=>execFileSync('git',args,{cwd:root,maxBuffer:80*1024*1024});
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function list(){return manifest.versions.map(v=>({...v,commit:git('rev-parse','--verify',v.ref+'^{commit}').toString().trim()}));}
function build(v){
 assert(/^[a-z0-9-]+$/.test(v.id));
 const dir=path.join(archive,v.id),source=path.join(dir,'source');
 fs.mkdirSync(dir,{recursive:true});
 const stamp=path.join(dir,'snapshot.json');
 if(fs.existsSync(stamp))assert.equal(JSON.parse(fs.readFileSync(stamp)).commit,v.commit,'Never overwrite an old version ID with different content');
 else {
  // Only related tracked runtime/study files, never personal configuration or .git.
  const paths=['game.ts','src','images','audio','scripts/buildGamePreview.js','scripts/gamePreview.html'];
  if(v.mode==='sculpt')paths.push('design/cave-room/sculpt');
  for(const p of paths)git('cat-file','-e',v.commit+':'+p);
  fs.mkdirSync(source,{recursive:true});
  const bytes=git('archive','--format=tar',v.commit,'--',...paths);
  execFileSync('tar',['-xf','-','-C',source],{input:bytes,maxBuffer:1024*1024});
  fs.writeFileSync(stamp,JSON.stringify({id:v.id,ref:v.ref,commit:v.commit,scope:'Related Git-tracked runtime/study only; no branch switch, working tree reset or personal config'},null,2));
 }
 const args=[path.join(source,'scripts/buildGamePreview.js')];
 if(v.mode==='sculpt')args.push('--sculpt');
 execFileSync(process.execPath,args,{cwd:source,stdio:'pipe'});
 const entry=path.join(source,v.mode==='sculpt'?'node_modules/.cache/cave-sculpt-study/live/game.html':'design/deeptape/game.html');
 let html=fs.readFileSync(entry,'utf8');
 const back=path.relative(path.dirname(entry),path.join(archive,'index.html')).split(path.sep).join('/');
 const banner='<div style="position:relative;z-index:9;padding:12px;background:#16282e;color:#dde0cb;font:14px -apple-system,sans-serif">'+escape(v.title)+' · '+escape(v.ref)+' · '+v.commit.slice(0,7)+' · <a style="color:#b3d5c5" href="'+escape(back)+'">版本目录</a></div>';
 html=html.replace(/<body([^>]*)>/,'<body$1>'+banner);
 fs.writeFileSync(entry,html);
 return {id:v.id,ref:v.ref,commit:v.commit,entry:path.relative(root,entry).split(path.sep).join('/')};
}
function board(versions){
 fs.mkdirSync(archive,{recursive:true});
 const cards=versions.map(v=>{
  const report=path.join(archive,v.id,'snapshot.json');
  const ready=fs.existsSync(report)&&JSON.parse(fs.readFileSync(report)).commit===v.commit;
  const entry=v.id+'/source/'+(v.mode==='sculpt'?'node_modules/.cache/cave-sculpt-study/live/game.html':'design/deeptape/game.html');
  return '<article><small>'+escape(v.ref)+' · '+v.commit.slice(0,7)+'</small><h2>'+escape(v.title)+'</h2><p>'+escape(v.note)+'</p>'+(ready?'<a href="'+entry+'">进入这一版实际游戏</a>':'<code>npm run cave:versions -- --build '+escape(v.id)+'</code>')+'</article>';
 }).join('');
 const html='<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>洞穴版本档案</title><style>*{box-sizing:border-box}body{background:#111c23;color:#dfdfd3;font:15px -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;line-height:1.7;margin:0}main{max-width:950px;margin:auto;padding:48px 24px}h1{font-size:30px}h2{font-size:21px}p,small{color:#aabcba}article{background:#192b32;padding:24px;border:1px solid #34505a;margin:20px 0;border-radius:5px}a{display:inline-block;color:#14302e;background:#b7cec1;padding:10px 16px;text-decoration:none;border-radius:3px}code{font:13px monospace;color:#c0cbaa}footer{margin-top:35px;color:#8da6a8;font-size:12px}</style></head><body><main><small>DEEPTAPE / PRESERVED CHECKPOINTS</small><h1>不同版本分别留住，随时回看。</h1><p>每版从命名Git回退点重建自己的源码、岩体资源和实际游戏入口。不是几个入口共用当前贴图，不切换当前工作分支，也不覆盖手机已跑通的基线。</p>'+cards+'<footer>这是本地版本档案，不自动推送远端。缓存可重建，固定Git标签才是正式回退锚点；手机性能与美术验收分开。</footer></main></body></html>';
 fs.writeFileSync(path.join(archive,'index.html'),html);
}
function main(){
 const versions=list(),args=process.argv.slice(2);
 let ids=[];
 if(args.includes('--all'))ids=versions.map(v=>v.id);
 else if(args.includes('--build')){const i=args.indexOf('--build');assert(args[i+1],'--build requires an ID');ids=[args[i+1]];}
 for(const id of ids){const v=versions.find(v=>v.id===id);assert(v,'Unknown version '+id);console.log(JSON.stringify(build(v),null,2));}
 board(versions);console.log(JSON.stringify({versions:versions.map(v=>({id:v.id,ref:v.ref,commit:v.commit})),index:'node_modules/.cache/cave-versions/index.html'},null,2));
}
if(require.main===module)main();
module.exports={list,build,board};
