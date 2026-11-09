const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {openReviewBrowser}=require('../design/cave-room/browser.cjs');
const OUT=path.resolve(__dirname,'../node_modules/.cache/continuous-gameplay/stress');
const URL=process.env.JWR_PREVIEW_URL||'http://127.0.0.1:60972/node_modules/.cache/continuous-gameplay/game.html';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{fs.mkdirSync(OUT,{recursive:true});const b=await openReviewBrowser(URL,1400,850),report={scope:'当前手机版 game.ts 与 src 原圆岩、原人物实际逻辑；深洞起点为明确测试布置'};
 try{const ev=s=>b.evaluate(s);await wait(600);assert.equal(await ev('DeepTapeGame.source'),'actual-mobile-src');await ev('DeepTapeGame.start()');await wait(350);
  const points=await ev(`(()=>{const g=DeepTapeGame,m=g.state.mazeRescue,w=g.world.geometry.world(),ts=m.mazeTileSize,out=[];
   for(const depth of [1980,3240,4560,6360,8280,10260]){let best=null;for(let r=Math.floor(depth/ts)-3;r<Math.floor(depth/ts)+4;r++)for(let c=2;c<m.mazeCols-2;c++){const x=(c+.5)*ts,y=(r+.5)*ts;if(m.mazeMap[r]?.[c]!==0||g.cave.collision(x,y,m))continue;const score=Math.abs(y-depth)+Math.abs(x-(w.originX-720))*.15;if(!best||score<best.score)best={x,y,score};}if(best)out.push(best);}return out;})()`);assert.equal(points.length,6);report.cases=[];
  for(let i=0;i<points.length;i++){
   const r=await ev(`new Promise(resolve=>{const g=DeepTapeGame,w=g.world.geometry.world(),p=${JSON.stringify(points[i])},originalNow=Date.now;let now=originalNow(),seed=${1013+i},frames=0,maxMove=0,violations=[];
    g.interactions.work.resetInteractions();g.state.rope.ropes=[];g.state.fishEnemies=[];g.state.npc.active=false;g.cave.config.infiniteO2=true;
    Object.assign(g.player,{x:p.x,y:p.y,vx:0,vy:0,angle:0,targetAngle:0});Object.assign(w,{grounded:false,landBlend:0,hidden:true,panel:null});Date.now=()=>now;
    function batch(){for(let j=0;j<100&&frames<1200;j++,frames++){if(frames%47===0){seed=(Math.imul(seed,1664525)+1013904223)>>>0;g.input.targetAngle=seed/4294967296*Math.PI*2;g.input.move=frames%141===0?0:1;g.state.semiAutoDrive.inputPower=frames%94===0?1:.45;g.input.speedUp=g.state.semiAutoDrive.inputPower===1;}
     const x=g.player.x,y=g.player.y;now+=1000/60;g.world.runtime.tickWorld();const d=Math.hypot(g.player.x-x,g.player.y-y);maxMove=Math.max(maxMove,d);if(!Number.isFinite(g.player.x+g.player.y)||d>18||g.world.geometry.circleCollision(g.player.x,g.player.y,16))if(violations.length<5)violations.push({frames,x:g.player.x,y:g.player.y,d});}
     if(frames<1200){setTimeout(batch,1);return;}Date.now=originalNow;w.hidden=false;g.input.move=0;resolve({start:p,end:{x:g.player.x,y:g.player.y},frames,maxMove,violations});}batch();})`);
   report.cases.push(r);assert.equal(r.violations.length,0,JSON.stringify(r));
  }
  report.frames=report.cases.reduce((n,r)=>n+r.frames,0);report.graphics=await ev('DeepTapeGame.world.render.worldGraphicsStats()');assert.equal(report.graphics.character,'original');assert.equal(report.graphics.rocks,'original-circles');
  report.errors=b.errors;assert.equal(b.errors.length,0);report.status='passed';fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }catch(e){report.status='failed';report.error=String(e);report.errors=b.errors;fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));throw e;}
 finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
