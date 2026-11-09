const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {openReviewBrowser}=require('../design/cave-room/browser.cjs');
const OUT=path.resolve(__dirname,'../node_modules/.cache/continuous-gameplay/entry');
const URL=process.env.JWR_PREVIEW_URL||'http://127.0.0.1:60972/node_modules/.cache/continuous-gameplay/game.html';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{fs.mkdirSync(OUT,{recursive:true});const b=await openReviewBrowser(URL,1400,850),report={};
 try{const ev=s=>b.evaluate(s);async function until(s){const start=Date.now();while(!await ev(s)){if(Date.now()-start>8000)throw Error('超时 '+s);await wait(80);}}
  async function tap(rect){const p=await ev(`(()=>{const r=document.getElementById('game').getBoundingClientRect(),c=DeepTapeGame.cave.config,b=${JSON.stringify(rect)};return{x:r.x+(b.x+b.w/2)/c.screenWidth*r.width,y:r.y+(b.y+b.h/2)/c.screenHeight*r.height,id:1}})()`);await b.command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await b.command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  await until('!!window.DeepTapeGame');assert.equal(await ev('DeepTapeGame.state.screen'),'menu');
  await tap(await ev('DeepTapeGame.ui.menu().find(b=>b.id==="continue")'));await until('DeepTapeGame.world.render.assetsReady()');await wait(150);
  assert.equal(await ev('DeepTapeGame.world.render.worldGraphicsStats().character'),'original');assert.equal(await ev('DeepTapeGame.world.render.worldGraphicsStats().rocks'),'continuous-karst');
  await ev('DeepTapeGame.world.geometry.world().hidden=true;DeepTapeGame.world.runtime.setupTowReview(3)');
  const before=await ev('DeepTapeGame.world.save.captureWorld()');await ev('DeepTapeGame.menu()');assert.equal(await ev('DeepTapeGame.state.screen'),'menu');await tap(await ev('DeepTapeGame.ui.menu().find(b=>b.id==="continue")'));
  await until('!!DeepTapeGame.world.save.getLastRestoreSnapshot()');const after=await ev('DeepTapeGame.world.save.getLastRestoreSnapshot()');assert.equal(after.player.x,before.player.x);assert.equal(after.player.y,before.player.y);assert.deepEqual(after.links,before.links);report.returnFromMenu='真实点击继续，位置和三鱼绳端保持';
  await ev('DeepTapeGame.menu()');await tap(await ev('DeepTapeGame.ui.menu().find(b=>b.id==="newGame")'));assert(await ev('DeepTapeGame.state._menuConfirmNewGame'));await tap(await ev('DeepTapeGame.ui.menuConfirm().confirm'));
  await until('DeepTapeGame.world.geometry.world()?.elapsed<1');assert.equal(await ev('DeepTapeGame.state.rope.links.length'),0);assert.equal(await ev('DeepTapeGame.state.fishEnemies.filter(f=>f.reviewTow).length'),0);report.newGame='原生确认清除本章节测试进度，不迁移旧档';
  await ev('(()=>{const g=DeepTapeGame,w=g.world.geometry.world();g.cave.config.infiniteO2=false;Object.assign(g.player,{x:w.originX,y:w.surfaceY+95,o2:0,vx:0,vy:0});Object.assign(w,{grounded:false,landBlend:0,headWet:true})})()');await until('DeepTapeGame.player.o2>0 && DeepTapeGame.world.geometry.world().grounded && !DeepTapeGame.world.geometry.world().headWet');
  assert.equal(await ev('DeepTapeGame.state.rope.links.length'),0);assert.equal(await ev('DeepTapeGame.world.geometry.world().panel'),null);report.depleted='水下耗尽气量自动返回岸上出生点，不重开章节';
  const image=await ev('document.getElementById("game").toDataURL("image/png")');fs.writeFileSync(path.join(OUT,'camp.png'),Buffer.from(image.split(',')[1],'base64'));
  report.errors=b.errors;assert.equal(b.errors.length,0);report.status='passed';fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await b.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
