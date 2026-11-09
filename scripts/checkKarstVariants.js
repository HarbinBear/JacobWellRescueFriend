const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { openReviewBrowser } = require('../design/cave-room/browser.cjs');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'node_modules/.cache/karst-iterations/variants');
const wait = ms => new Promise(r => setTimeout(r, ms));
const URL = 'http://127.0.0.1:60972/node_modules/.cache/karst-review/live/game.html';
(async () => {
    fs.mkdirSync(OUT, { recursive: true }); const b = await openReviewBrowser(URL, 1440, 880);
    const report = { scope: '实际手机版相同渲染器，可选生成与表面；浏览器自动测试不代表真机或美术定稿', rooms: [], versions: [] };
    try {
        const ev = s => b.evaluate(s);
        async function until(s) { const start = Date.now(); while (!await ev(s)) { if (Date.now() - start > 15000) throw Error('等待超时 ' + s); await wait(80); } }
        async function shot(name) { const image = await ev('document.getElementById("game").toDataURL("image/png")'); fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(image.split(',')[1], 'base64')); }
        await until('DeepTapeGame.cave.karst.karstSurfaceStats().ready');
        await ev('(()=>{const g=DeepTapeGame,w=g.world.geometry.world();w.hidden=true;g.cave.config.quality.auto=false;g.cave.config.quality.scale=.75;g.cave.config.quality.rayCount=180;g.cave.config.infiniteO2=true;g.state.npc.active=false;g.state.fishEnemies=[];g.input.move=0;g.state.flashlightOn=true;w.notice="";w.noticeUntil=0;w.elapsed=25;})()');
        await ev('DeepTapeGame.review.inspectKarstSite(0);DeepTapeGame.world.geometry.world().hidden=true');
        const originalPose = await ev('({x:DeepTapeGame.player.x,y:DeepTapeGame.player.y,angle:DeepTapeGame.player.angle})');
        for (const version of ['V01', 'E01']) {
            await ev('DeepTapeGame.review.chooseKarstVersion(' + JSON.stringify(version) + ');DeepTapeGame.world.geometry.world().hidden=true');
            await wait(180); await shot(version.toLowerCase());
            assert.deepEqual(await ev('({x:DeepTapeGame.player.x,y:DeepTapeGame.player.y,angle:DeepTapeGame.player.angle})'), originalPose);
            report.versions.push({ version, samePose: true, surface: await ev('DeepTapeGame.cave.karst.karstSurfaceStats()') });
        }
        await ev('DeepTapeGame.review.chooseKarstVersion("E02",false);DeepTapeGame.world.geometry.world().hidden=true');
        await until('DeepTapeGame.cave.karst.karstSurfaceStats().ready');
        const sites = await ev('DeepTapeGame.review.karstReviewSites()');
        assert.equal(new Set(sites.slice(0, 4).map(s => s.grammar)).size, 4, '四种语法必须能分别观察');
        report.chambers = await ev('DeepTapeGame.cave.terrain.karstStats(DeepTapeGame.state.mazeRescue)');
        for (let i = 0; i < 4; i++) {
            await ev('DeepTapeGame.review.inspectKarstSite(' + i + ');DeepTapeGame.world.geometry.world().hidden=true;DeepTapeGame.cave.karst.inspectKarst(0)');
            await wait(180); await shot('room-' + sites[i].grammar);
            const coverage = await ev('DeepTapeGame.cave.karst.karstCoverageDiagnostics()'); assert(coverage.samples > 300); assert.deepEqual(coverage.failures, []);
            report.rooms.push({ ...sites[i], coverage, surface: await ev('DeepTapeGame.cave.karst.karstSurfaceStats()') });
            await ev('DeepTapeGame.cave.karst.inspectKarst(1)'); await wait(100); await shot('clay-' + sites[i].grammar);
            await ev('DeepTapeGame.cave.karst.inspectKarst(0)');
        }
        await ev('DeepTapeGame.review.inspectKarstSite(0);DeepTapeGame.world.geometry.world().hidden=true;DeepTapeGame.cave.config.karst.bounceStrength=1'); await wait(140);
        await shot('bounce-on');
        await ev('window.__withBounce=document.getElementById("game").getContext("2d").getImageData(0,0,document.getElementById("game").width,document.getElementById("game").height).data;DeepTapeGame.cave.config.karst.bounceStrength=0'); await wait(140);
        await shot('bounce-off');
        report.bounce = await ev(`(()=>{const c=document.getElementById('game'),a=window.__withBounce,b=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let changed=0,energy=0;
            for(let y=c.height*.2|0;y<c.height*.78;y+=2)for(let x=c.width*.10|0;x<c.width*.80;x+=2){const i=(y*c.width+x)*4,d=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);if(d>8)changed++;energy+=d;}
            return{changedWorldSamples:changed,absolutePixelDifference:energy};})()`);
        assert(report.bounce.changedWorldSamples > 200, 'bounce必须改变实际岩壁/水体像素，而非只上传数据');
        await ev('DeepTapeGame.cave.config.karst.bounceStrength=1;wx.setDeviceOrientation({value:"portrait",success(){}})'); await wait(180); await shot('portrait-E02');
        assert.deepEqual((await ev('DeepTapeGame.cave.karst.karstCoverageDiagnostics()')).failures, []);
        await ev('wx.setDeviceOrientation({value:"landscape",success(){}})'); await wait(130);
        report.surface = await ev('DeepTapeGame.cave.karst.karstSurfaceStats()');
        report.errors = b.errors; assert.equal(b.errors.length, 0, JSON.stringify(b.errors)); report.status = 'passed';
        fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
    } catch (error) { report.status = 'failed'; report.error = String(error); report.errors = b.errors; fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2)); throw error; }
    finally { await b.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
