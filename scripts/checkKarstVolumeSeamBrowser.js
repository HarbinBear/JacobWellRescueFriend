// Actual game at the known seed7391 seam; artifacts stay in ignored cache.
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const ROOT=path.resolve(__dirname,'..'),{openReviewBrowser}=require(path.join(ROOT,'design/cave-room/browser.cjs'));
const out=path.join(ROOT,'node_modules/.cache/karst-seam/after');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 fs.mkdirSync(out,{recursive:true});const b=await openReviewBrowser(process.env.JWR_PREVIEW_URL||'http://127.0.0.1:60972/node_modules/.cache/karst-review/live/game.html',1280,820);
 try{
 const ev=s=>b.evaluate(s);
 await ev(`(()=>{const g=DeepTapeGame;g.cave.config.karst.geometryMode='volume';g.world.runtime.enterContinuousWorld(g.start,7391);const w=g.world.geometry.world();w.hidden=true;w.wet=1;w.headWet=true;w.landBlend=0;w.notice='';w.noticeUntil=0;g.cave.config.quality.auto=false;g.cave.config.quality.scale=.85;g.cave.config.quality.rayCount=180;g.cave.config.infiniteO2=true;})()`);
 const scene=await ev(`(()=>{const g=DeepTapeGame,t=g.cave.terrain.getKarstTerrain(g.state.mazeRescue),tx=7356,ty=5532;let chosen=null;
 for(const r of [65,90,120,160,220,300]){for(let i=0;i<32;i++){const a=i*Math.PI/16,x=tx+Math.cos(a)*r,y=ty+Math.sin(a)*r;if(!g.world.geometry.circleCollision(x,y,26)){chosen={x,y};break;}}if(chosen)break;}
 if(!chosen)throw Error('no player placement');Object.assign(g.player,chosen,{vx:0,vy:0});g.player.angle=g.player.targetAngle=g.input.targetAngle=Math.atan2(ty-chosen.y,tx-chosen.x);g.input.move=0;g.camera.snapCameraToPlayer();Object.assign(g.state.camera,{x:tx,y:ty,zoom:1.25,targetZoom:1.25});
 return{seed:g.state.mazeRescue.seed,point:{x:tx,y:ty,z:32},player:chosen,terrain:{x:t.x,y:t.y,step:t.step,cols:t.cols,rows:t.rows}};})()`);
 async function settle(){for(let n=0;n<400;n++){await wait(100);if(n>3&&await ev('DeepTapeGame.cave.volume.karstVolumeStats().pending')===0)return;}throw Error('chunks timeout');}
 async function shot(name){await wait(200);const data=await ev("document.getElementById('game').toDataURL('image/png')");fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(data.split(',')[1],'base64'));}
 await settle();await shot('lit');const litStats=await ev('DeepTapeGame.cave.volume.karstVolumeStats()');
 assert.equal(scene.seed,7391);assert(litStats.ready&&litStats.chunks>0);assert.equal(litStats.pending,0);assert.equal(litStats.droppedQuads,0);
 await wait(450);const stationary=await ev('DeepTapeGame.cave.volume.karstVolumeStats()');
 assert.equal(stationary.builds,litStats.builds,'Still camera must reuse completed chunks');assert.equal(stationary.cpuProbeBytes,litStats.cpuProbeBytes);
 await ev('DeepTapeGame.review.rotateKarstLight(.2)');await wait(250);
 const turned=await ev('DeepTapeGame.cave.volume.karstVolumeStats()');assert.equal(turned.builds,litStats.builds,'Turning a light must not rebuild geometry');
 await ev('DeepTapeGame.review.rotateKarstLight(-.2)');
 await ev('DeepTapeGame.cave.volume.inspectKarstVolume(1)');await settle();await shot('clay');
 const clayStats=await ev('DeepTapeGame.cave.volume.karstVolumeStats()');assert.equal(clayStats.pending,0);assert.equal(clayStats.droppedQuads,0);assert.equal(b.errors.length,0);
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({scope:'Desktop actual game rendering, not phone timing or art approval',status:'passed',scene,litStats,stationary,turned,clayStats,errors:b.errors},null,2));console.log(JSON.stringify({status:'passed',out,scene,litStats,errors:b.errors}));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
