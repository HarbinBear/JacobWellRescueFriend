// Actual game, isolated browser; comparison and verification output stay in ignored cache.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { openReviewBrowser } = require('../browser.cjs');
const ROOT = path.resolve(__dirname, '../../..'), OUT = path.join(ROOT, 'node_modules/.cache/drapery-study');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const b = await openReviewBrowser('http://127.0.0.1:60972/node_modules/.cache/karst-review/live/game.html?speleothems', 1440, 900);
    const ev = code => b.evaluate(code), report = { scope: 'Actual desktop game, review-only shape; not phone performance or art approval' };
    try {
        report.scene = await ev(`(() => {const g=DeepTapeGame;g.world.runtime.enterContinuousWorld(g.start,26110941);
            g.review.inspectDraperyStudy();g.world.geometry.world().hidden=true;g.cave.config.quality.auto=false;
            g.cave.config.quality.scale=1;g.cave.config.quality.rayCount=180;
            return {study:g.cave.terrain.getKarstTerrain(g.state.mazeRescue).volume.speleothemStudy,seed:g.state.mazeRescue.seed};})()`);
        async function settle() {
            for (let i = 0; i < 400; i++) { await wait(100); if (i > 4 && await ev('DeepTapeGame.cave.volume.karstVolumeStats().pending') === 0) return; }
            throw Error('Geometry did not settle');
        }
        async function shot(name) {
            await wait(250);
            const data = await ev('document.getElementById("game").toDataURL("image/png")');
            fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(data.split(',')[1], 'base64'));
            const jpeg = await ev('document.getElementById("game").toDataURL("image/jpeg",.86)');
            fs.writeFileSync(path.join(OUT, name + '.jpg'), Buffer.from(jpeg.split(',')[1], 'base64'));
        }
        for (const folds of [false, true]) {
            const label = folds ? 'folds' : 'before';
            await ev('DeepTapeGame.review.inspectDraperyStudy();DeepTapeGame.cave.volume.inspectKarstVolume(0)');
            assert(await ev(`DeepTapeGame.review.chooseSpeleothemProfile(${folds})`));
            await settle(); await shot(label + '-lit');
            report[label] = await ev('DeepTapeGame.cave.volume.karstVolumeStats()');
            assert.equal(report[label].droppedQuads, 0); assert(report[label].ready);
            await ev('DeepTapeGame.cave.volume.inspectKarstVolume(1)'); await shot(label + '-clay');
            await ev(`(()=>{const g=DeepTapeGame,s=g.cave.terrain.getKarstTerrain(g.state.mazeRescue).volume.speleothemStudy;
                Object.assign(g.state.camera,{x:s.x-48,y:s.y-100,zoom:1.55,targetZoom:1.55});})()`);
            await settle(); await shot(label + '-detail');
        }
        await ev('DeepTapeGame.review.inspectDraperyStudy();DeepTapeGame.cave.volume.inspectKarstVolume(0)'); await settle();
        const stationary = await ev('DeepTapeGame.cave.volume.karstVolumeStats()'); await wait(400);
        assert.equal(await ev('DeepTapeGame.cave.volume.karstVolumeStats().builds'), stationary.builds);
        for (const delta of [-.7, 1.3]) {
            await ev(`DeepTapeGame.review.rotateKarstLight(${delta})`); await shot(delta < 0 ? 'folds-light-left' : 'folds-light-right');
            assert.equal(await ev('DeepTapeGame.cave.volume.karstVolumeStats().builds'), stationary.builds);
        }
        await ev('DeepTapeGame.state.flashlightOn=false'); await shot('folds-light-off');
        await ev('DeepTapeGame.state.flashlightOn=true;DeepTapeGame.review.inspectSpeleothems()');
        const before = await ev('({x:DeepTapeGame.player.x,y:DeepTapeGame.player.y})');
        await ev('DeepTapeGame.world.geometry.world().hidden=false');
        await b.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
        await wait(1200);
        await b.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'd', code: 'KeyD', windowsVirtualKeyCode: 68 });
        await settle(); await shot('folds-swim');
        const after = await ev('({x:DeepTapeGame.player.x,y:DeepTapeGame.player.y,collision:DeepTapeGame.world.geometry.circleCollision(DeepTapeGame.player.x,DeepTapeGame.player.y,16)})');
        assert.equal(after.collision, false); assert(after.x - before.x > 15, 'Real rightward input must propel horizontally; buoyancy alone is insufficient');
        report.swim = { input: 'Real keyboard D down/up, default drive mode', before, after };
        await ev('DeepTapeGame.world.geometry.world().hidden=true');
        assert(await ev('DeepTapeGame.cave.volume.loseKarstVolumeContext()')); await wait(900); await settle();
        report.recovered = await ev('DeepTapeGame.cave.volume.karstVolumeStats()'); assert(report.recovered.ready);
        assert.equal(b.errors.length, 0); report.status = 'passed';
    } catch (error) { report.status = 'failed'; report.error = error.stack; process.exitCode = 1; }
    finally { fs.writeFileSync(path.join(OUT, 'browser-report.json'), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2)); await b.close(); }
})();
