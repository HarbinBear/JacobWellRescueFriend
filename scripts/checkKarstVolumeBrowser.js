// 三维洞腔的实机网页检查：用当前 game.ts + src 编译出的评审包，切到三维洞腔后在几个观察点截图并核对基本状态。
// 截图和报告写到被 Git 忽略的缓存目录。这是桌面浏览器检查，不是微信真机性能验收。
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { openReviewBrowser } = require('../design/cave-room/browser.cjs');
const ROOT = path.resolve(__dirname, '..'), OUT = path.join(ROOT, 'node_modules/.cache/karst-review/volume');
const URL = process.env.JWR_PREVIEW_URL || 'http://127.0.0.1:60972/node_modules/.cache/karst-review/live/game.html';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const b = await openReviewBrowser(URL, 1440, 880), report = { scope: '当前手机版全部源码；桌面 Chrome 无头模式。不是微信真机性能或主观美术验收。' };
    try {
        const ev = text => b.evaluate(text);
        async function shot(name) { const image = await ev('document.getElementById("game").toDataURL("image/jpeg",.9)'); fs.writeFileSync(path.join(OUT, name + '.jpg'), Buffer.from(image.split(',')[1], 'base64')); }
        async function settle() { await wait(200); for (let i = 0; i < 300 && await ev('DeepTapeGame.cave.volume.karstVolumeStats().pending') > 0; i++) await wait(100); await wait(250); }
        async function hallLight() {
            return ev(`(()=>{const c=document.getElementById("game"),ctx=c.getContext("2d"),w=c.width,h=c.height;
                function sample(x){const p=ctx.getImageData(Math.floor(w*x),Math.floor(h*.22),Math.floor(w*.21),Math.floor(h*.56)).data;
                    let luma=0,blue=0;for(let i=0;i<p.length;i+=4){luma+=.2126*p[i]+.7152*p[i+1]+.0722*p[i+2];blue+=p[i+2]-p[i];}
                    return {luma:luma*4/p.length,blue:blue*4/p.length};}
                return {rear:sample(.025),front:sample(.505)};})()`);
        }
        await wait(1500);
        await ev('(()=>{const g=DeepTapeGame,w=g.world.geometry.world();g.cave.config.quality.auto=false;g.cave.config.quality.scale=.75;g.cave.config.quality.rayCount=180;w.notice="";w.noticeUntil=0;g.input.move=0;})()');
        assert.equal(await ev('DeepTapeGame.review.chooseKarstVersion("S03",false)'), true);
        report.terrain = await ev('DeepTapeGame.cave.terrain.karstStats(DeepTapeGame.state.mazeRescue)'); assert.equal(report.terrain.generation, 'volume');
        report.sites = await ev('DeepTapeGame.review.volumeReviewSites()'); assert(report.sites.length >= 4);
        for (const [index, name] of [[0, 'hall'], [1, 'narrow'], [2, 'well'], [3, 'hall2']]) {
            await ev(`DeepTapeGame.review.inspectVolumeSite(${index});DeepTapeGame.world.geometry.world().hidden=true`); await settle(); await shot(name);
            if (index === 0 || index === 1) { await ev('DeepTapeGame.cave.volume.inspectKarstVolume(1)'); await wait(250); await shot(name + '-clay'); await ev('DeepTapeGame.cave.volume.inspectKarstVolume(0)'); }
        }
        // 有真实侧壁落点的裂隙机位用于回光检查；空大厅不再必须被虚构的全室光照亮。
        await ev('DeepTapeGame.review.inspectVolumeSite(6);DeepTapeGame.world.geometry.world().hidden=true'); await settle();
        const on = await hallLight(), onSources = await ev('({stats:DeepTapeGame.cave.volume.karstVolumeStats(),lights:Array.from(DeepTapeGame.cave.volume.getKarstVolumeBounceLights())})');
        const bounce = await ev('DeepTapeGame.cave.config.karst.bounceStrength');
        await ev('DeepTapeGame.cave.config.karst.bounceStrength=0'); await wait(250); const direct = await hallLight(); await shot('fracture-direct');
        assert.equal(await ev('DeepTapeGame.cave.volume.karstVolumeStats().bounceCount'), 0, '禁用回光时必须清除全部落点');
        await ev(`DeepTapeGame.cave.config.karst.bounceStrength=${bounce};DeepTapeGame.state.flashlightOn=false`);
        await wait(250); const off = await hallLight(); await shot('fracture-light-off');
        assert.equal(await ev('DeepTapeGame.cave.volume.karstVolumeStats().bounceCount'), 0, '关灯后不能留下上一帧回光');
        await ev('DeepTapeGame.state.flashlightOn=true;DeepTapeGame.review.rotateKarstLight(-Math.PI)');
        await wait(250); const turned = await hallLight(); await shot('fracture-turned');
        report.lighting = { on, direct, off, turned, onSources };
        assert(direct.front.luma > off.front.luma + 4, '关闭岩面回光后，空旷通道里的手电光柱仍应可见');
        assert(onSources.stats.bounceCount > 0 && onSources.stats.returnedLight > 0, '真实岩面命中必须提供回光');
        assert(on.front.luma > direct.front.luma + 1 && on.front.luma > off.front.luma + 4, '命中岩壁的机位应有可见回光');
        assert(on.front.blue > 5 && on.rear.luma < on.front.luma * .65, '回光应为蓝色，并给身后留下暗区');
        assert(turned.rear.luma > on.rear.luma + 4, '转灯后光柱与岩面落点应改变，不能固定在角色周围');
        await ev('DeepTapeGame.review.inspectVolumeSite(0);DeepTapeGame.state.flashlightOn=false'); await wait(300); await shot('hall-light-off'); await ev('DeepTapeGame.state.flashlightOn=true');
        report.volume = await ev('DeepTapeGame.cave.volume.karstVolumeStats()'); report.graphics = await ev('DeepTapeGame.world.render.worldGraphicsStats().rocks');
        assert(report.volume.ready && report.volume.chunks > 0 && report.volume.triangles > 1000, '三维洞腔必须已生成并绘制'); assert.equal(report.volume.droppedQuads, 0);
        // 游动一小段：人物不能穿进岩石，镜头经过的地方要能持续生成新分块。
        const before = await ev('({x:DeepTapeGame.player.x,y:DeepTapeGame.player.y})');
        await ev('(()=>{const g=DeepTapeGame,s=g.review.volumeReviewSites()[0];g.world.geometry.world().hidden=false;g.input.move=1;g.input.targetAngle=s.angle;})()'); await wait(2500); await ev('DeepTapeGame.input.move=0');
        const after = await ev('({x:DeepTapeGame.player.x,y:DeepTapeGame.player.y,blocked:DeepTapeGame.world.geometry.circleCollision(DeepTapeGame.player.x,DeepTapeGame.player.y,16)})');
        report.swim = { moved: Math.round(Math.hypot(after.x - before.x, after.y - before.y)), insideRock: after.blocked }; assert.equal(after.blocked, false, '游动后人物不得落在岩石里');
        await settle(); await shot('after-swim'); report.volumeAfterSwim = await ev('DeepTapeGame.cave.volume.karstVolumeStats()');
        // 存档：记住洞形，续档后仍是三维洞腔并回到原位，不受当前默认洞形影响。
        const saved = await ev('(()=>{const g=DeepTapeGame,s=g.world.save.captureWorld();g.menu();return s})()'); assert.equal(saved.config.karstGeneration, 'volume');
        await ev('DeepTapeGame.cave.config.karst.geometryMode="legacy";DeepTapeGame.world.runtime.resumeContinuousWorld()'); await wait(400);
        report.resume = await ev('({generation:DeepTapeGame.cave.terrain.karstStats(DeepTapeGame.state.mazeRescue).generation,position:DeepTapeGame.world.save.getLastRestoreSnapshot().player})');
        assert.equal(report.resume.generation, 'volume'); assert(Math.hypot(report.resume.position.x - saved.player.x, report.resume.position.y - saved.player.y) < .01, '续档必须回到原位');
        await ev('DeepTapeGame.cave.config.karst.geometryMode="volume"'); await settle();
        // 图形上下文丢失后要能自己恢复并重新生成洞壁。
        assert.equal(await ev('DeepTapeGame.cave.volume.loseKarstVolumeContext()'), true); await wait(900); await settle();
        report.recovered = await ev('DeepTapeGame.cave.volume.karstVolumeStats()'); assert(report.recovered.ready && report.recovered.chunks > 0 && report.recovered.lostCount >= 1, '上下文恢复后必须重新绘制');
        await shot('after-recover');
        report.errors = b.errors.map(e => e.exception?.description || e.text).slice(0, 5); assert.equal(report.errors.length, 0, '页面不得有脚本异常：' + report.errors[0]);
        report.status = 'passed';
    } catch (error) { report.status = 'failed'; report.failure = String(error && error.stack || error); process.exitCode = 1; }
    finally { fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 1)); await b.close(); }
})();
