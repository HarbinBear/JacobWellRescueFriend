const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const{openReviewBrowser}=require('./browser.cjs');
const output=path.resolve(__dirname,'../../',process.argv[2]||'node_modules/.cache/cave-room-preview');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const b=await openReviewBrowser(process.env.JWR_REVIEW_URL||'http://127.0.0.1:60972/'+path.relative(path.resolve(__dirname,'../..'),output).split(path.sep).join('/')+'/game.html',1100,940);
 try{
  await b.evaluate('CaveReview.ready');await wait(300);assert(await b.evaluate('CaveReview.lightStatus()'));
  async function shot(name){const s=await b.evaluate('document.getElementById("game").toDataURL("image/png")');fs.writeFileSync(path.join(output,name+'.png'),Buffer.from(s.split(',')[1],'base64'));return s;}
  const sites=[];
  for(let i=0;i<3;i++){
   const site=await b.evaluate('CaveReview.site('+i+')');assert.equal(site.blocked,false);await wait(350);await shot('site-'+i);
   const check=await b.evaluate('CaveReview.check()'),stats=await b.evaluate('CaveReview.stats()');assert.equal(check.mismatches,0);assert.equal(check.playerBlocked,false);assert(check.rayError<1e-6);assert.equal(stats.glError,0);sites.push({site,check,stats});
  }
  await b.evaluate('CaveReview.site(0)');const initial=await b.evaluate('({x:CaveReview.player.x,y:CaveReview.player.y,angle:CaveReview.player.angle})');
  const move=await b.evaluate('CaveReview.move(-500,0)');assert.equal(move.blocked,false);assert(move.x<initial.x);assert(move.x>initial.x-500);await shot('movement-stopped-at-wall');
  await b.evaluate('CaveReview.site(0)');const on=await shot('light-on');await b.evaluate('CaveReview.state.flashlightOn=false');await wait(200);const off=await shot('light-off');assert.notEqual(on,off);await b.evaluate('CaveReview.state.flashlightOn=true');
  await b.evaluate('CaveReview.normals(true)');await wait(200);await shot('normal-in-runtime');await b.evaluate('CaveReview.normals(false);CaveReview.surfaceOcclusion(false)');await wait(200);await shot('surface-shadow-off');await b.evaluate('CaveReview.surfaceOcclusion(true)');await wait(200);await shot('surface-shadow-on');
  const timing=[];
  for(let i=0;i<72;i++){
   const angle=initial.angle+Math.sin(i/12)*.36;
   const t=await b.evaluate('(()=>{CaveReview.player.angle=CaveReview.player.targetAngle='+angle+';const t=performance.now();CaveReview.draw();return{drawCPU:performance.now()-t,stats:CaveReview.stats()}})()');timing.push(t);
   if(i%6===0){await wait(60);await shot('motion-'+String(i/6).padStart(2,'0'));}
  }
  await b.evaluate('CaveReview.site(0);CaveReview.sampling("economy")');await wait(250);assert.equal(await b.evaluate('CaveReview.config.quality.skipOcclusion'),false);await shot('economy');await b.evaluate('CaveReview.sampling("balanced")');
  await b.evaluate('CaveReview.fallback(true)');await wait(250);await shot('fallback');assert.equal(await b.evaluate('CaveReview.stats().mode'),'albedo-fallback');await b.evaluate('CaveReview.fallback(false)');await wait(200);
  assert(await b.evaluate('CaveReview.contextLoss()'));await wait(300);await shot('context-loss');assert.equal(await b.evaluate('CaveReview.stats().mode'),'albedo-fallback');assert(await b.evaluate('CaveReview.contextLoss(true)'));await wait(500);await shot('context-restored');assert.equal(await b.evaluate('CaveReview.stats().mode'),'webgl1-normal');assert.equal(await b.evaluate('CaveReview.stats().glError'),0);
  const q=a=>{a.sort((x,y)=>x-y);return{count:a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],max:a[a.length-1]}};
  const gpu=timing.filter(t=>t.stats.gpuSurfaceMs!==null).map(t=>t.stats.gpuSurfaceMs);
  const report={sites,colliderMovement:move,aimingTimings:{drawCPU:q(timing.map(t=>t.drawCPU)),surfaceGPU:gpu.length?q(gpu):null},final:await b.evaluate('CaveReview.stats()'),errors:b.errors,scope:'actual game-source isolated single-room art experiment, same diver/HUD and light pipeline; art acceptance not claimed',notValidated:['Full gameplay and rope','WeChat/WebKit phone','Full procedural map and peak memory','Physically complete lighting; painted AO and coarse geometry normals differ at fine scale']};
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));await b.screenshot(path.join(output,'page.png'));assert.equal(b.errors.length,0);console.log(JSON.stringify({movement:move,timing:report.aimingTimings,errors:b.errors},null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
