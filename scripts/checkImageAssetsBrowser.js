// Actual game.ts + ImageAssets + AssetStorage in explicit local preview mode.
// Cloud download/integrity/cache behavior is covered separately by the native adapter test.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { openReviewBrowser } = require('../design/cave-room/browser.cjs');
const OUT = path.resolve(__dirname, '../node_modules/.cache/remote-assets/browser-images');
const URL = process.env.JWR_PREVIEW_URL || 'http://127.0.0.1:60972/node_modules/.cache/karst-review/live/game.html';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const report = { scope: 'Actual browser gameplay with local asset resolution; remote download and WeChat device behavior are not simulated here' };
    let browser;
    try {
        browser = await openReviewBrowser(URL, 1200, 850);
        const ev = source => browser.evaluate(source);
        async function until(source) {
            const deadline = Date.now() + 18000;
            while (!await ev(source)) { if (Date.now() >= deadline) throw Error('Timed out: ' + source); await wait(80); }
        }
        await until('!!DeepTapeGame.assets?.images && !!DeepTapeGame.world.geometry.world()');
        report.storage = await ev('DeepTapeGame.assets.storage.getAssetStorageStats()');
        assert.equal(report.storage.mode, 'local', 'Browser preview must explicitly select local resources');
        await until('DeepTapeGame.assets.images.getImageLoadStatus().loading===0');
        report.initial = await ev(`(()=>{const g=DeepTapeGame,im=g.assets.images;
            return{status:im.getImageLoadStatus(),world:g.world.render.worldGraphicsStats(),
                home:['home_bg_night','home_girl_stand','home_girl_talk','home_girl_playful'].map(key=>{
                    const image=im.getImage(key);return{key,width:image?.width,height:image?.height,source:image?.src};
                })};})()`);
        assert.equal(report.initial.status.failed, 0);
        assert.equal(report.initial.status.ready, 13, 'Four home images and nine shore images should decode');
        assert(report.initial.home.every(image => image.width > 0 && image.height > 0 && /\/images\/home\//.test(image.source)));
        assert.equal(await ev('DeepTapeGame.world.render.assetsReady()'), true);
        await ev('DeepTapeGame.world.geometry.world().hidden=true;DeepTapeGame.input.move=0');

        // Block one real local image after releasing its decoded instance. Network failure
        // must become a failed state after at most one fresh fetch, not a false ready image.
        await browser.command('Network.enable');
        await browser.command('Network.setCacheDisabled', { cacheDisabled: true });
        await browser.command('Network.setBlockedURLs', { urls: ['*images/shore/shop.png*'] });
        await ev(`(()=>{const im=DeepTapeGame.assets.images;window.__shopBefore=im.getImage('shore/shop.png');
            window.__imageCreates=0;window.__originalCreateImage=wx.createImage;
            wx.createImage=function(){__imageCreates++;return __originalCreateImage.apply(this,arguments);};
            im.releaseImages(['shore/shop.png']);im.registerImage('shore/shop.png','images/shore/shop.png');})()`);
        await until("DeepTapeGame.assets.images.isImageFailed('shore/shop.png')");
        report.failed = await ev(`({status:DeepTapeGame.assets.images.getImageLoadStatus(['shore/shop.png']),
            image:DeepTapeGame.assets.images.getImage('shore/shop.png'),creates:__imageCreates,ready:DeepTapeGame.world.render.assetsReady()})`);
        assert.deepEqual(report.failed.status, { ready: 0, loading: 0, failed: 1, total: 1 });
        assert.equal(report.failed.image, null); assert.equal(report.failed.creates, 2); assert.equal(report.failed.ready, false);

        // Enable only the cloud-mode gate after the local failure; no cloud request is
        // started here. Real keyboard/touch input must not advance an unseen world.
        const sample = `(()=>{const g=DeepTapeGame,w=g.world.geometry.world();return{x:g.player.x,y:g.player.y,o2:g.player.o2,elapsed:w.elapsed,hidden:w.hidden};})()`;
        await ev(`DeepTapeGame.assets.catalog.ASSET_STORAGE.mode='cloud';DeepTapeGame.world.geometry.world().hidden=false;
            DeepTapeGame.cave.config.infiniteO2=false;DeepTapeGame.player.o2=60;DeepTapeGame.cave.draw();`);
        report.gateBefore = await ev(sample);
        assert.equal(report.gateBefore.hidden, false, 'Gate verification must not use the review freeze');
        await browser.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
        const point = await ev(`(()=>{const r=document.getElementById('game').getBoundingClientRect();return{x:r.x+r.width*.15,y:r.y+r.height*.72,id:1};})()`);
        await browser.command('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
        await browser.command('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...point, x: point.x + 48, y: point.y + 12 }] });
        await wait(650);
        await browser.command('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await browser.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
        report.gateAfter = await ev(sample);
        assert.deepEqual(report.gateAfter, report.gateBefore, 'Loading gate must stop movement, simulation time and oxygen consumption');
        await browser.screenshot(path.join(OUT, 'failed-loading-gate.png'));
        await ev("DeepTapeGame.assets.catalog.ASSET_STORAGE.mode='local'");
        await browser.command('Network.setBlockedURLs', { urls: [] });
        await ev("DeepTapeGame.assets.images.retryImages(['shore/shop.png'])");
        report.retried = await ev(`(()=>{const im=DeepTapeGame.assets.images,image=im.getImage('shore/shop.png');
            return{status:im.getImageLoadStatus(['shore/shop.png']),width:image?.width,fresh:image!==__shopBefore,creates:__imageCreates};})()`);
        assert.deepEqual(report.retried.status, { ready: 1, loading: 0, failed: 0, total: 1 });
        assert(report.retried.width > 0 && report.retried.fresh); assert.equal(report.retried.creates, 3);
        await until('DeepTapeGame.world.geometry.world().elapsed>' + (report.gateBefore.elapsed + .03));
        report.resumed = await ev(sample);
        await ev('DeepTapeGame.world.geometry.world().hidden=true');
        await ev('wx.createImage=__originalCreateImage;DeepTapeGame.menu()');
        await until('DeepTapeGame.assets.images.getImageLoadStatus().total===4');
        report.menu = await ev('DeepTapeGame.assets.images.getImageLoadStatus()');
        assert.deepEqual(report.menu, { ready: 4, loading: 0, failed: 0, total: 4 });
        await ev('DeepTapeGame.start()'); await until('DeepTapeGame.world.render.assetsReady()');
        report.reentered = await ev('DeepTapeGame.assets.images.getImageLoadStatus()');
        assert.equal(report.reentered.ready, 13); assert.equal(report.reentered.failed, 0);
        await browser.screenshot(path.join(OUT, 'world-reentered.png'));

        // These decoded images are also uploaded into the real legacy WebGL material.
        await ev("DeepTapeGame.review.chooseKarstVersion('E01',false);DeepTapeGame.world.geometry.world().hidden=true");
        await until('DeepTapeGame.cave.karst.karstSurfaceStats().ready');
        report.material = await ev('({images:DeepTapeGame.assets.images.getImageLoadStatus(),surface:DeepTapeGame.cave.karst.karstSurfaceStats()})');
        assert.equal(report.material.images.ready, 15); assert.equal(report.material.images.failed, 0);
        assert.equal(report.material.surface.failure, ''); assert(report.material.surface.draws > 0);
        await browser.screenshot(path.join(OUT, 'legacy-material.png'));
        report.errors = browser.errors; assert.equal(browser.errors.length, 0);
        report.status = 'passed';
    } catch (error) {
        report.status = 'failed'; report.failure = String(error.stack || error); process.exitCode = 1;
    } finally {
        fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ status: report.status, failure: report.failure, initial: report.initial?.status,
            failed: report.failed?.status, retried: report.retried?.status, reentered: report.reentered,
            gate: report.gateAfter, resumed: report.resumed, material: report.material?.surface?.ready, errors: report.errors }, null, 2));
        if (browser) await browser.close();
    }
})();
