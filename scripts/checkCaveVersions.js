const fs=require('fs'),path=require('path'),assert=require('assert/strict'),crypto=require('crypto');
const {execFileSync}=require('child_process');
const {list,build,board}=require('./buildCaveVersions');
const {openReviewBrowser}=require('../design/cave-room/browser.cjs');
const root=path.resolve(__dirname,'..'),wait=ms=>new Promise(r=>setTimeout(r,ms));
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
(async()=>{
 const before=execFileSync('git',['status','--porcelain'],{cwd:root}).toString();
 const versions=list(),reports=[];
 for(const v of versions){
  const output=build(v),source=path.join(root,'node_modules/.cache/cave-versions',v.id,'source');
  assert(!fs.existsSync(path.join(source,'project.private.config.json')));
  assert(!fs.existsSync(path.join(source,'.git')));
  const assetDir=v.mode==='sculpt'?'design/cave-room/sculpt/assets':'images/cave-rock';
  for(const file of ['room-albedo.png','room-normal.png','room-detail.png','room-back.png']){
   const expected=execFileSync('git',['show',v.commit+':'+assetDir+'/'+file],{cwd:root,maxBuffer:16*1024*1024});
   assert.equal(digest(fs.readFileSync(path.join(source,assetDir,file))),digest(expected),'Frozen assets must belong to '+v.ref);
  }
  const b=await openReviewBrowser('http://127.0.0.1:60972/'+output.entry,1000,920);
  try{
   await b.evaluate('Object.defineProperty(window,"performance",{value:undefined,configurable:true});true');
   await b.evaluate('(()=>{window.__CaveArchiveHUD=0;const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(...args){if(DeepTapeGame.state.mazeRescue?.phase==="play")__CaveArchiveHUD++;return original.apply(this,args)};return true})()');
   const rect=await b.evaluate('(()=>{const r=document.getElementById("game").getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height}})()');
   await b.click(rect.x+187.5/375*rect.w,rect.y+554/667*rect.h);
   for(let i=0;i<240;i++){if(await b.evaluate('DeepTapeGame.state.mazeRescue?.phase==="play"'))break;await wait(100);}
   assert.equal(await b.evaluate('DeepTapeGame.state.mazeRescue?.phase'),'play');
   await wait(500);
   const sample=()=>b.evaluate('({o2:DeepTapeGame.player.o2,anim:DeepTapeGame.player.animTime,rock:DeepTapeGame.cave.stats(),hud:__CaveArchiveHUD})');
   const first=await sample();let after=first;
   // O2 is consumed on exhale pulses, not continuously. Observe an actual full pulse.
   for(let i=0;i<40&&after.o2>=first.o2;i++){await wait(250);after=await sample();}
   assert(first.rock.loaded&&after.rock.loaded);assert.equal(after.rock.mode,'normal-map');
   assert(after.hud>first.hud&&after.hud>10,'HUD must continue after the rock render pass');
   assert(after.o2<first.o2&&after.anim>first.anim,JSON.stringify({id:v.id,first,after}));assert.equal(b.errors.length,0);
   await b.evaluate('DeepTapeGame.menu();true');await wait(100);
   const exit=await b.evaluate('({screen:DeepTapeGame.state.screen,rock:DeepTapeGame.cave.stats()})');
   assert.equal(exit.screen,'menu');assert(!exit.rock.loaded);assert.equal(exit.rock.textureBytes,0);
   reports.push({id:v.id,ref:v.ref,assetsFromOwnCommit:true,noPerformance:true,first,after,exit,errors:b.errors});
  }finally{await b.close();}
 }
 board(versions);
 assert.equal(execFileSync('git',['status','--porcelain'],{cwd:root}).toString(),before,'Historical builds must not modify working-tree files or branch');
 fs.writeFileSync(path.join(root,'node_modules/.cache/cave-versions/check-report.json'),JSON.stringify({reports,scope:'Independent historical actual-game desktop runs, not phone GPU acceptance'},null,2));
 console.log(JSON.stringify({versions:reports.map(r=>({id:r.id,ref:r.ref,assetsFromOwnCommit:true,play:true,HUD:true,exit:true})),workingTreeUnchanged:true},null,2));
})().catch(e=>{console.error(e);process.exitCode=1});
