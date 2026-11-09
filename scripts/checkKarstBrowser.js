const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { openReviewBrowser } = require('../design/cave-room/browser.cjs');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'node_modules/.cache/karst-review/validation');
const URL = process.env.JWR_PREVIEW_URL || 'http://127.0.0.1:60972/node_modules/.cache/karst-review/live/game.html';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const b = await openReviewBrowser(URL, 1440, 880), report = {
        scope: '当前手机版全部源码与正式材质；Chrome临时独立配置。非微信真机性能或主观美术验收。'
    };
    try {
        const ev = text => b.evaluate(text);
        async function until(text, timeout = 12000) {
            const start = Date.now();
            while (!await ev(text)) { if (Date.now() - start > timeout) throw Error('等待超时：' + text); await wait(80); }
        }
        async function shot(name) {
            const image = await ev('document.getElementById("game").toDataURL("image/png")');
            fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(image.split(',')[1], 'base64'));
        }
        await until('DeepTapeGame.cave.karst.karstSurfaceStats().ready');
        assert.equal(await ev('DeepTapeGame.source'), 'actual-mobile-src');
        await ev('(()=>{const g=DeepTapeGame,w=g.world.geometry.world();w.hidden=true;w.stationId=null;w.notice="";w.noticeUntil=0;g.input.move=0;g.cave.config.quality.auto=false;g.cave.config.quality.scale=.75;g.cave.config.quality.rayCount=180;g.review.inspectKarstSite(0);w.hidden=true;})()');
        await wait(160); report.geometry = await ev('DeepTapeGame.cave.terrain.karstStats(DeepTapeGame.state.mazeRescue)');
        report.sites = await ev('DeepTapeGame.review.karstReviewSites()'); assert(report.sites.length >= 3);
        for (let i = 0; i < 3; i++) {
            await ev('DeepTapeGame.review.inspectKarstSite(' + i + ');DeepTapeGame.world.geometry.world().hidden=true;DeepTapeGame.cave.karst.inspectKarst(0)');
            await wait(120); await shot('landscape-' + i);
            const coverage = await ev('DeepTapeGame.cave.karst.karstCoverageDiagnostics()');
            assert(coverage.samples > 300); assert.deepEqual(coverage.failures, []);
        }
        await ev('DeepTapeGame.review.inspectKarstSite(0);DeepTapeGame.world.geometry.world().hidden=true;window.__karstPose={angle:DeepTapeGame.player.angle};window.__karstPixels=document.getElementById("game").getContext("2d").getImageData(0,0,document.getElementById("game").width,document.getElementById("game").height).data');
        await ev('DeepTapeGame.review.rotateKarstLight(-.28)'); await wait(150); await shot('light-left');
        await ev('DeepTapeGame.review.rotateKarstLight(.56)'); await wait(150); await shot('light-right');
        report.turnLight = await ev(`(()=>{const c=document.getElementById('game'),a=window.__karstPixels,d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let changed=0;
            for(let y=Math.floor(c.height*.20);y<c.height*.76;y+=2)for(let x=Math.floor(c.width*.12);x<c.width*.83;x+=2){const i=(y*c.width+x)*4;if(Math.abs(a[i]-d[i])+Math.abs(a[i+1]-d[i+1])+Math.abs(a[i+2]-d[i+2])>35)changed++;}return {changedWorldSamples:changed};})()`);
        assert(report.turnLight.changedWorldSamples > 300, '转灯不能只是角色变动或固定贴图不动');
        await ev('DeepTapeGame.player.angle=DeepTapeGame.player.targetAngle=DeepTapeGame.input.targetAngle=window.__karstPose.angle;DeepTapeGame.cave.karst.inspectKarst(1)'); await wait(120); await shot('monochrome');
        await ev('DeepTapeGame.cave.karst.inspectKarst(0);DeepTapeGame.state.flashlightOn=false'); await wait(120); await shot('light-off');
        await ev('DeepTapeGame.state.flashlightOn=true');
        await ev('wx.setDeviceOrientation({value:"portrait",success(){}})'); await wait(180); await shot('portrait');
        report.portrait = await ev('({width:DeepTapeGame.cave.config.screenWidth,height:DeepTapeGame.cave.config.screenHeight,coverage:DeepTapeGame.cave.karst.karstCoverageDiagnostics(),surface:DeepTapeGame.cave.karst.karstSurfaceStats()})');
        assert.equal(report.portrait.width, 375); assert.equal(report.portrait.height, 667); assert.deepEqual(report.portrait.coverage.failures, []);
        assert(report.portrait.surface.surfacePixels <= 750000);
        await ev('wx.setDeviceOrientation({value:"landscape",success(){}})'); await wait(150);
        const before = await ev('DeepTapeGame.cave.karst.karstSurfaceStats()');
        assert(await ev('DeepTapeGame.cave.karst.loseKarstContext()'));
        await until('DeepTapeGame.cave.karst.karstSurfaceStats().ready && DeepTapeGame.cave.karst.karstSurfaceStats().generation>' + before.generation);
        report.contextRestore = await ev('DeepTapeGame.cave.karst.karstSurfaceStats()');
        assert(report.contextRestore.lostCount >= 1); assert.deepEqual((await ev('DeepTapeGame.cave.karst.karstCoverageDiagnostics()')).failures, []);
        report.renderPressure = await ev(`new Promise(resolve=>{const g=DeepTapeGame,w=g.world.geometry.world(),c=g.state.camera,times=[];let previous=0,count=0;
            w.hidden=true;g.cave.config.quality.auto=false;g.cave.config.quality.scale=.5;g.cave.config.quality.rayCount=60;
            const start=g.cave.karst.karstSurfaceStats().draws,angle=g.player.angle;
            function frame(now){if(previous&&count>20)times.push(now-previous);previous=now;
                g.player.angle=g.player.targetAngle=g.input.targetAngle=angle+Math.sin(count*.033)*.22;c.swayX=Math.sin(count*.025)*2.1;c.swayY=Math.cos(count*.025)*1.1;
                if(++count<200){requestAnimationFrame(frame);return;}times.sort((a,b)=>a-b);const mean=times.reduce((a,b)=>a+b,0)/times.length;
                resolve({scope:'桌面Chrome，动态转灯与视野偏移使缓存失效；中档渲染压力，不代表手机帧率',frames:count,meanFrameMs:mean,p95FrameMs:times[Math.floor(times.length*.95)],surfaceDraws:g.cave.karst.karstSurfaceStats().draws-start,surface:g.cave.karst.karstSurfaceStats()});}requestAnimationFrame(frame);})`);
        assert(report.renderPressure.surfaceDraws >= 170); assert(report.renderPressure.surface.surfacePixels <= 750000);
        await ev('Object.defineProperty(window,"performance",{value:undefined,configurable:true});DeepTapeGame.world.geometry.world().hidden=false;DeepTapeGame.input.move=0');
        const elapsed = await ev('DeepTapeGame.world.geometry.world().elapsed'); await wait(650);
        report.noPerformance = { elapsedAdvance: (await ev('DeepTapeGame.world.geometry.world().elapsed')) - elapsed,
            surface: await ev('DeepTapeGame.cave.karst.karstSurfaceStats()') };
        assert(report.noPerformance.elapsedAdvance > .15); assert(report.noPerformance.surface.ready);
        await ev('DeepTapeGame.world.geometry.world().hidden=true');
        const oldMazeStats = await ev('({seed:DeepTapeGame.state.mazeRescue.seed,position:{x:DeepTapeGame.player.x,y:DeepTapeGame.player.y}})');
        await ev('DeepTapeGame.menu()'); await wait(120);
        report.release = await ev('DeepTapeGame.cave.karst.karstSurfaceStats()'); assert.equal(report.release.gpuBytes, 0); assert.equal(report.release.decodedImageBytes, 0);
        assert(await ev('DeepTapeGame.cave.terrain.getKarstTerrain(DeepTapeGame.state.mazeRescue)===null'));
        await ev('DeepTapeGame.world.runtime.resumeContinuousWorld()'); await wait(350);
        const resumed = await ev('({seed:DeepTapeGame.state.mazeRescue.seed,position:{x:DeepTapeGame.player.x,y:DeepTapeGame.player.y},saved:DeepTapeGame.world.save.getLastRestoreSnapshot()?.player})');
        assert.equal(resumed.seed, oldMazeStats.seed);
        assert(Math.hypot(resumed.saved.x - oldMazeStats.position.x, resumed.saved.y - oldMazeStats.position.y) < 3,
            JSON.stringify({ previous: oldMazeStats, resumed }));
        report.resume = { seedSame: true, restoredSnapshotNearOriginalPosition: true,
            postResumeDisplacement: Math.hypot(resumed.position.x - resumed.saved.x, resumed.position.y - resumed.saved.y) };
        report.errors = b.errors; assert.equal(b.errors.length, 0, JSON.stringify(b.errors)); report.status = 'passed';
        fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
    } catch (error) {
        report.status = 'failed'; report.error = String(error); report.errors = b.errors;
        fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2)); throw error;
    } finally { await b.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
