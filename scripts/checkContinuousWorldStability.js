const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {openReviewBrowser}=require('../design/cave-room/browser.cjs');
const OUTPUT=path.resolve(__dirname,'../node_modules/.cache/continuous-world/stability');
const URL=process.env.JWR_PREVIEW_URL||'http://127.0.0.1:60972/node_modules/.cache/continuous-world/game.html';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 fs.mkdirSync(OUTPUT,{recursive:true});const b=await openReviewBrowser(URL,1300,840),report={};
 try{
  const ev=s=>b.evaluate(s);await wait(700);
  report.underBank=await ev(`new Promise(resolve=>{const g=DeepTapeGame,m=g.state.mazeRescue,w=g.world.geometry.world(),ts=m.mazeTileSize;let start=null;
   for(let r=Math.ceil(w.seamY/ts)+2;r<m.mazeRows-2&&!start;r++)for(let c=Math.floor((w.originX-1400)/ts);c<Math.floor((w.originX-600)/ts);c++){
    const x=(c+.5)*ts,y=(r+.5)*ts;if(m.mazeMap[r]?.[c]===0&&!g.cave.collision(x,y,m)&&!g.cave.collision(x+5,y,m)){start={x,y};break;}}
   if(!start){resolve({error:'No open under-bank test location'});return;}g.interactions.work.cancelInteractionInput();g.state.rope.links=[];g.state.fishEnemies=[];g.cave.config.infiniteO2=true;
   Object.assign(g.player,{...start,vx:.5,vy:0,angle:0,targetAngle:0});Object.assign(w,{grounded:false,landBlend:0,panel:null});Object.assign(g.input,{move:1,targetAngle:0,speedUp:false});g.state.semiAutoDrive.inputPower=.3;
   const time=w.elapsed,frames=[];function frame(){frames.push({t:w.elapsed,x:g.player.x,y:g.player.y,land:w.landBlend});if(w.elapsed-time<.18){requestAnimationFrame(frame);return;}g.input.move=0;resolve({start,frames,end:{x:g.player.x,y:g.player.y},verticalJump:Math.max(...frames.map(f=>start.y-f.y))});}requestAnimationFrame(frame);
  })`);
  report.errors=b.errors;fs.writeFileSync(path.join(OUTPUT,process.env.JWR_EXPECT_LEGACY_BUG==='1'?'legacy-under-bank.json':'under-bank.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  if(process.env.JWR_EXPECT_LEGACY_BUG==='1')assert(report.underBank.verticalJump>500,'旧版必须真实复现水下归岸问题');
  else assert(report.underBank.verticalJump<10,'水下不能因为横坐标在岸下就被投影回地面');
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
