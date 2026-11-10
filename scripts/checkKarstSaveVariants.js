const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const {openReviewBrowser} = require('../design/cave-room/browser.cjs');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'node_modules/.cache/karst-iterations/save-report.json');
const URL = 'http://127.0.0.1:60972/node_modules/.cache/karst-review/live/game.html?legacy';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
    const b = await openReviewBrowser(URL, 1440, 880), report = {scope:'浏览器隔离存档，使用实际手机版存取逻辑；不更改用户实际存档'};
    try {
        const ev = s => b.evaluate(s);
        for (let i = 0; i < 100 && !await ev('!!DeepTapeGame.cave.terrain.getKarstTerrain(DeepTapeGame.state.mazeRescue)'); i++) await wait(70);
        assert.equal(await ev('DeepTapeGame.cave.terrain.karstStats(DeepTapeGame.state.mazeRescue).generation'),'legacy');
        const old = await ev('(()=>{const g=DeepTapeGame,s=g.world.save.captureWorld();delete s.config.karstGeneration;delete s.config.karstSurface;delete s.config.karstStyle;return s})()');
        await ev('DeepTapeGame.menu()');
        await ev('(()=>{const g=DeepTapeGame;wx.setStorageSync("continuous_gameplay_mobile_v1",JSON.stringify(' + JSON.stringify(old) + '));g.cave.config.karst.geometryMode="chambers";g.world.runtime.resumeContinuousWorld()})()');
        report.oldSave = await ev('({generation:DeepTapeGame.cave.terrain.karstStats(DeepTapeGame.state.mazeRescue).generation,position:DeepTapeGame.world.save.getLastRestoreSnapshot().player})');
        assert.equal(report.oldSave.generation, 'legacy');
        assert(Math.hypot(report.oldSave.position.x-old.player.x, report.oldSave.position.y-old.player.y)<.01);
        await ev('DeepTapeGame.review.chooseKarstVersion("E02",false)');
        report.selected = await ev('DeepTapeGame.cave.terrain.karstStats(DeepTapeGame.state.mazeRescue).generation'); assert.equal(report.selected, 'chambers');
        await ev('(()=>{const g=DeepTapeGame;g.state.rope.ropes.push({});window.__ropeBefore=g.cave.terrain.getKarstTerrain(g.state.mazeRescue)})()');
        assert.equal(await ev('DeepTapeGame.review.chooseKarstVersion("E01")'),false);
        assert(await ev('DeepTapeGame.cave.terrain.getKarstTerrain(DeepTapeGame.state.mazeRescue)===window.__ropeBefore'));
        await ev('DeepTapeGame.state.rope.ropes.pop()');
        assert(await ev('DeepTapeGame.world.save.saveWorldProgress()'));
        const saved = await ev('DeepTapeGame.world.save.captureWorld()'); assert.equal(saved.config.karstGeneration,'chambers');
        await ev('DeepTapeGame.menu();DeepTapeGame.cave.config.karst.geometryMode="legacy";DeepTapeGame.world.runtime.resumeContinuousWorld()');
        report.newSave = await ev('({generation:DeepTapeGame.cave.terrain.karstStats(DeepTapeGame.state.mazeRescue).generation,position:DeepTapeGame.world.save.getLastRestoreSnapshot().player})');
        assert.equal(report.newSave.generation,'chambers');
        assert(Math.hypot(report.newSave.position.x-saved.player.x,report.newSave.position.y-saved.player.y)<.01);
        report.protectedRopes = true; report.errors=b.errors; assert.equal(report.errors.length,0,JSON.stringify(report.errors)); report.status='passed';
        fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
    }catch(error){report.status='failed';report.error=String(error);report.errors=b.errors;fs.mkdirSync(path.dirname(OUT),{recursive:true});fs.writeFileSync(OUT,JSON.stringify(report,null,2));throw error;}
    finally{await b.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
