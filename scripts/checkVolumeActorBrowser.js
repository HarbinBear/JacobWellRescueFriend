// Optional actor interface regression only: one tiny triangle, no character assets.
// Run npm run karst:preview and serve the repo, then node scripts/checkVolumeActorBrowser.js.
const fs = require('fs'), path = require('path'), assert = require('assert/strict');
const { openReviewBrowser } = require('../design/cave-room/browser.cjs');
const OUT = path.resolve(__dirname, '../node_modules/.cache/karst-review/volume-actor');
const URL = process.env.JWR_PREVIEW_URL || 'http://127.0.0.1:60972/node_modules/.cache/karst-review/live/game.html';
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    const report = { scope: 'Optional actor API with a tiny test triangle; no character assets or art review; desktop Chrome only' };
    let browser;
    try {
        browser = await openReviewBrowser(URL, 1000, 800);
        const ev = source => browser.evaluate(source);
        async function settle() {
            for (let i = 0; i < 160 && await ev('DeepTapeGame.cave.volume.karstVolumeStats().pending'); i++) await wait(80);
            assert.equal(await ev('DeepTapeGame.cave.volume.karstVolumeStats().pending'), 0, 'Cave chunks did not settle');
        }
        await ev(`(()=>{const g=DeepTapeGame;g.cave.config.quality.auto=false;g.cave.config.quality.scale=.5;
            g.review.inspectVolumeSite(0);g.world.geometry.world().hidden=true;g.state.fishEnemies=[];g.input.move=0;g.cave.draw();})()`);
        await settle();
        assert.equal(await ev('DeepTapeGame.cave.volume.isVolumePlayerDrawn()'), false);

        // The fixture lives only in this isolated test tab. Positions are already in world space.
        await ev(`window.__actor={create:0,dispose:0,prepare:0,shadow:0,color:0,revision:1,mode:'ok'};
            window.__actorFactory=gl=>{
                const c=window.__actor;c.create++;if(c.mode==='factory')throw Error('test factory');
                const buffers=Array.from({length:4},()=>gl.createBuffer());let pose='',count=0,revision=0;
                return {get count(){return count;},get revision(){return revision;},matte:1,triangles:1,bytes:114,
                    prepare(p){
                        c.prepare++;if(c.mode==='prepare')throw Error('test prepare');count=p.enabled&&c.mode!=='disabled'?1:0;
                        const next=[p.x,p.y,p.angle,c.revision,count].join('/');if(pose===next)return;pose=next;revision++;
                        const positions=new Float32Array([-4,-4,-2,4,-4,-2,0,4,-2]);
                        for(let i=0;i<positions.length;i+=3){positions[i]+=p.x;positions[i+1]+=p.y;}
                        [positions,new Float32Array([0,0,-1,0,0,-1,0,0,-1]),
                            new Float32Array([.2,.5,.3,.2,.5,.3,.2,.5,.3]),new Uint16Array([0,2,1])].forEach((data,i)=>{
                                const target=i===3?gl.ELEMENT_ARRAY_BUFFER:gl.ARRAY_BUFFER;
                                gl.bindBuffer(target,buffers[i]);gl.bufferData(target,data,gl.STATIC_DRAW);
                            });
                    },
                    draw(shadow){
                        if(c.mode==='draw')throw Error('test draw');if(c.mode==='false')return false;
                        if(shadow)c.shadow++;else c.color++;
                        for(let i=0;i<(shadow?1:3);i++){
                            gl.enableVertexAttribArray(i);gl.bindBuffer(gl.ARRAY_BUFFER,buffers[i]);gl.vertexAttribPointer(i,3,gl.FLOAT,false,0,0);
                        }
                        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,buffers[3]);
                        gl.drawElements(gl.TRIANGLES,c.mode==='glerror'?600:3,gl.UNSIGNED_SHORT,0);
                        gl.disableVertexAttribArray(2);return true;
                    },
                    dispose(){c.dispose++;buffers.forEach(buffer=>gl.deleteBuffer(buffer));}
                };
            };
            DeepTapeGame.cave.volume.setVolumeActorPassFactory(window.__actorFactory);DeepTapeGame.cave.draw();`);
        report.active = await ev('({stats:DeepTapeGame.cave.volume.karstVolumeStats(),calls:{...__actor}})');
        assert.equal(report.active.stats.actorCount, 1);
        assert.equal(report.active.stats.actorFailure, '');
        assert(report.active.calls.shadow > 0 && report.active.calls.color > 0);
        report.glState = await ev(`(()=>{const factory=window.__actorFactory;
            DeepTapeGame.cave.volume.setVolumeActorPassFactory(gl=>{const p=factory(gl),draw=p.draw;
                return {...p,get count(){return p.count;},get revision(){return p.revision;},draw(shadow){
                    if(!shadow)window.__actorGLState={depth:gl.isEnabled(gl.DEPTH_TEST),framebuffer:gl.getParameter(gl.FRAMEBUFFER_BINDING)===null,
                        matte:gl.getUniform(gl.getParameter(gl.CURRENT_PROGRAM),gl.getUniformLocation(gl.getParameter(gl.CURRENT_PROGRAM),'matte'))};
                    return draw(shadow);
                }};
            });DeepTapeGame.cave.draw();return window.__actorGLState;})()`);
        assert.deepEqual(report.glState, { depth: true, framebuffer: true, matte: 1 });

        report.cached = await ev(`(()=>{const g=DeepTapeGame;g.cave.volume.setVolumeActorPassFactory(__actorFactory);g.cave.draw();
            const before=__actor.color;for(let i=0;i<5;i++)g.cave.draw();return{before,after:__actor.color,shown:g.cave.volume.isVolumePlayerDrawn()};})()`);
        assert(report.cached.shown);
        assert.equal(report.cached.before, report.cached.after);
        report.revision = await ev(`(()=>{const g=DeepTapeGame,before=__actor.color;__actor.revision++;g.cave.draw();return{before,after:__actor.color};})()`);
        assert(report.revision.after > report.revision.before);
        await ev(`__actor.mode='disabled';DeepTapeGame.cave.draw()`);
        assert.equal(await ev('DeepTapeGame.cave.volume.isVolumePlayerDrawn()'), false);
        await ev(`__actor.mode='ok';DeepTapeGame.cave.draw()`);
        assert.equal(await ev('DeepTapeGame.cave.volume.isVolumePlayerDrawn()'), true);
        report.frameReset = await ev(`(()=>{const v=DeepTapeGame.cave.volume;v.beginKarstVolumeFrame();return v.isVolumePlayerDrawn();})()`);
        assert.equal(report.frameReset, false);

        // A failed optional pass must keep the cave alive and must not retry on every frame.
        for (const mode of ['factory', 'prepare', 'draw', 'glerror', 'false']) {
            report[mode] = await ev(`(()=>{__actor.mode='${mode}';const g=DeepTapeGame,v=g.cave.volume;
                v.setVolumeActorPassFactory(__actorFactory);g.cave.draw();const before=__actor.create;for(let i=0;i<3;i++)g.cave.draw();
                return{before,after:__actor.create,shown:v.isVolumePlayerDrawn(),stats:v.karstVolumeStats()};})()`);
            assert.equal(report[mode].shown, false);
            assert.equal(report[mode].stats.ready, true);
            assert.equal(report[mode].before, report[mode].after);
            if (mode !== 'false') assert(report[mode].stats.actorFailure);
            else assert.equal(report[mode].stats.actorFailure, '');
        }
        await ev(`__actor.mode='ok';DeepTapeGame.cave.volume.setVolumeActorPassFactory(__actorFactory);DeepTapeGame.cave.draw()`);
        report.beforeRestore = await ev('__actor.create');
        assert(await ev('DeepTapeGame.cave.volume.loseKarstVolumeContext()'));
        await wait(500); await settle();
        report.restored = await ev('({created:__actor.create,shown:DeepTapeGame.cave.volume.isVolumePlayerDrawn(),stats:DeepTapeGame.cave.volume.karstVolumeStats()})');
        assert(report.restored.created > report.beforeRestore && report.restored.shown);
        assert.equal(report.restored.stats.actorFailure, '');
        report.nonVolume = await ev(`(()=>{const g=DeepTapeGame;g.review.chooseKarstVersion('E01');g.cave.draw();return g.cave.volume.isVolumePlayerDrawn();})()`);
        assert.equal(report.nonVolume, false);
        await ev(`DeepTapeGame.review.chooseKarstVersion('S03');DeepTapeGame.cave.draw();DeepTapeGame.cave.volume.setVolumeActorPassFactory(null);DeepTapeGame.cave.draw()`);
        report.removed = await ev('DeepTapeGame.cave.volume.karstVolumeStats()');
        assert.equal(report.removed.actorCount, 0);
        assert.equal(await ev('DeepTapeGame.cave.volume.isVolumePlayerDrawn()'), false);
        report.errors = browser.errors;
        assert.equal(browser.errors.length, 0);
        report.status = 'passed';
    } catch (error) {
        report.status = 'failed'; report.failure = String(error.stack || error); process.exitCode = 1;
    } finally {
        fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify({ status: report.status, failure: report.failure, active: report.active?.calls,
            glState: report.glState, cached: report.cached, restored: report.restored?.shown, errors: report.errors,
            report: path.relative(path.resolve(__dirname, '..'), path.join(OUT, 'report.json')) }, null, 2));
        if (browser) await browser.close();
    }
})();
