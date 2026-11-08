const fs=require('fs'),path=require('path');
const {openReviewBrowser}=require('../design/cave-room/browser.cjs');
const OUT=path.resolve(__dirname,'../node_modules/.cache/continuous-world/review-captures');
const URL=process.env.JWR_PREVIEW_URL||'http://127.0.0.1:60972/node_modules/.cache/continuous-world/game.html';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{fs.mkdirSync(OUT,{recursive:true});const b=await openReviewBrowser(URL,1400,850);
 try{const ev=s=>b.evaluate(s);await wait(1200);
  async function shot(name){const image=await ev('document.getElementById("game").toDataURL("image/png")');fs.writeFileSync(path.join(OUT,name+'.png'),Buffer.from(image.split(',')[1],'base64'));}
  const set=async(x,y,angle=-Math.PI/2)=>{await ev(`(()=>{const g=DeepTapeGame,w=g.world.geometry.world();g.interactions.work.cancelInteractionInput();g.state.rope.links=[];g.state.fishEnemies=[];g.state.npc.active=false;const x=w.originX+${x},y=${y===null?'g.world.geometry.groundAt(x)-43':y};Object.assign(g.player,{x,y,vx:0,vy:0,angle:${angle},targetAngle:${angle}});Object.assign(g.input,{move:0,targetAngle:${angle}});Object.assign(w,{grounded:${y===null},landBlend:${y===null?1:0},hidden:false,panel:null,overview:false,noticeUntil:0});g.cave.config.infiniteO2=true;g.state.camera.x=x;g.state.camera.y=y-${y===null?64:0};g.state.camera.zoom=g.cave.config.screenWidth>g.cave.config.screenHeight?.76:.82;})()`);await wait(550);};
  await set(-680,null);await shot('shore-normal-camera');
  await ev('DeepTapeGame.world.runtime.toggleOverview()');await wait(1500);await shot('shore-to-cave-overview');
  await set(20,1180,.3);await shot('underwater-limestone');
  await ev('DeepTapeGame.world.surface.inspectTerrain(1)');await wait(180);await shot('underwater-no-texture');await ev('DeepTapeGame.world.surface.inspectTerrain(0)');
  await set(80,1680,.12);await shot('deep-vestibule');
  await set(-850,null);await ev('wx.setDeviceOrientation({value:"portrait",success(){}})');await wait(550);await set(-850,null);await shot('portrait-normal-camera');
  const report={scope:'当前实际游戏渲染，明确布置镜头用于效果留存；功能验收由真实输入和压力脚本承担',graphics:await ev('DeepTapeGame.world.render.worldGraphicsStats()'),coverage:await ev('DeepTapeGame.world.surface.terrainCoverageDiagnostics()'),errors:b.errors};fs.writeFileSync(path.join(OUT,'capture.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
